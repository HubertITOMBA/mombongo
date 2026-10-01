import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { addAddress, createCustomer } from "../apps/web/src/lib/customers/service";
import { acceptQuote, createQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { convertQuoteToInvoice, getInvoice } from "../apps/web/src/lib/invoices/service";
import { recordPayment } from "../apps/web/src/lib/payments/service";
import { addOrganizationAddress, updateOrganizationIdentity } from "../apps/web/src/lib/organizations/service";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
import { canManagePaymentIntegrations, canRecordPayments } from "../apps/web/src/lib/auth/permissions";
import {
  assertCapabilityImplemented,
  getConnectorDescriptor,
  listConnectorDescriptors,
  requireAvailableConnector,
  requireConnectorDescriptor,
} from "../apps/web/src/lib/integrations/registry";
import { assertNoSecretFields, issueCredentialRef, redactCredentialRef } from "../apps/web/src/lib/integrations/credentials";
import { getIntegrationsOverview } from "../apps/web/src/lib/integrations/service";
import {
  getDocumentElectronicTransmission,
  getElectronicInvoicingConnectionById,
  lookupElectronicDirectory,
  submitElectronicDocument,
  testElectronicInvoicingConnection,
  upsertElectronicInvoicingConnection,
} from "../apps/web/src/lib/einvoice-platform/service";
import { getEInvoiceAdapter, getEInvoiceAdapterForKey } from "../apps/web/src/lib/einvoice-platform/registry";
import { resetMockAdapterState, setMockSubmitBehavior } from "../apps/web/src/lib/einvoice-platform/mock-adapter";
import { getPaymentAdapter } from "../apps/web/src/lib/payments/registry";
import { getPaymentConnection, upsertPaymentConnection } from "../apps/web/src/lib/payments/connections";
import { paymentGateway } from "../apps/web/src/lib/payments/gateway";

config({ path: "apps/web/.env.local", quiet: true });
const tag = `intg-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Entreprise intégrations") {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Compte test", accountType: "BUSINESS", organizationName }, `${tag}:${email}`);
  const user = await completeAuth(token, await codeFor(token.split(".")[0], 1), `${tag}:${email}`);
  assert.ok(user);
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: user.id } });
  return { email, user, membership };
}

async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}

async function frenchIssuer(owner: Awaited<ReturnType<typeof register>>) {
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Société Intégrations",
    legalName: "Société Intégrations",
    tradeName: "Atelier Intégrations",
    siren: "123456789",
    siret: "12345678900014",
    vatNumber: "FR12345678901",
    countryCode: "FR",
    paymentTerms: "Paiement à 30 jours.",
    currency: "EUR",
  });
  await addOrganizationAddress("OWNER", owner.membership.organizationId, {
    type: "BILLING",
    label: "Siège",
    line1: "10 rue A",
    postalCode: "75011",
    city: "Paris",
    countryCode: "FR",
  });
}

async function invoiceFrom(owner: Awaited<ReturnType<typeof register>>, customerId: string) {
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId,
    title: "Mission intégrations",
    description: "Conseil",
    quantity: 1,
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 2000,
  }, `${tag}-quote`, owner.user.id);
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  return getInvoice(owner.membership.organizationId, invoice.id);
}

async function b2bCustomer(owner: Awaited<ReturnType<typeof register>>) {
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Client Intégrations",
    tradeName: "Atelier Client",
    siren: "111222333",
    siret: "11122233300011",
    vatNumber: "FR11122233300",
    taxablePerson: true,
    kind: "CLIENT",
  }, `${tag}-cust`);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Facturation",
    line1: "1 avenue Snapshot",
    postalCode: "69001",
    city: "Lyon",
    countryCode: "FR",
  });
  return customer;
}

function isFlow(error: unknown, status: number, pattern?: RegExp): error is AuthFlowError {
  return error instanceof AuthFlowError && error.status === status && (!pattern || pattern.test(error.message));
}

after(async () => {
  resetMockAdapterState();
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.electronicInboundDocument.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.electronicTransmission.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.electronicInvoicingConnection.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.paymentConnection.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.payment.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, kind: "CREDIT_NOTE" } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, sourceDocumentId: { not: null } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.address.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("le registre expose des descriptors uniques, valides et sans connecteur inventé", () => {
  const all = listConnectorDescriptors();
  const keys = all.map(item => item.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const descriptor of all) {
    assert.ok(descriptor.key.length >= 2);
    assert.ok(descriptor.displayName.length > 0);
    assert.ok(descriptor.environments.length > 0);
    assert.ok(["ELECTRONIC_INVOICING", "PAYMENT"].includes(descriptor.family));
    assert.ok(["available", "coming_soon"].includes(descriptor.availability));
  }
  const mock = getConnectorDescriptor("MOCK");
  assert.equal(mock?.displayName, "Connecteur interne de test");
  assert.equal(mock?.availability, "available");
  assert.deepEqual([...mock!.environments], ["TEST"]);
  assert.equal(mock?.capabilities.DIRECTORY_LOOKUP?.implementedByMombongo, false);
  assert.equal(getConnectorDescriptor("SAGE"), null);
  assert.throws(() => requireConnectorDescriptor("SAGE"), error => isFlow(error, 400));
  assert.throws(() => requireAvailableConnector("STRIPE", "PAYMENT"), error => isFlow(error, 409));
  assert.throws(() => requireAvailableConnector("STRIPE", "ELECTRONIC_INVOICING"), error => isFlow(error, 400));
});

test("la factory PA résout MOCK et refuse un connectorKey inconnu", () => {
  const adapter = getEInvoiceAdapterForKey("MOCK");
  assert.equal(adapter.provider, "MOCK");
  assert.equal(getEInvoiceAdapter("MOCK").provider, "MOCK");
  assert.throws(() => getEInvoiceAdapterForKey("UNKNOWN"), error => isFlow(error, 400));
  assert.throws(() => getPaymentAdapter("STRIPE"), error => isFlow(error, 409));
  assert.throws(() => getPaymentAdapter("UNKNOWN"), error => isFlow(error, 400));
});

test("une capacité seulement théorique ne peut pas être invoquée", async () => {
  const owner = await register("Capacités");
  await assert.rejects(
    () => lookupElectronicDirectory("OWNER", owner.membership.organizationId),
    error => isFlow(error, 409),
  );
  assert.throws(() => assertCapabilityImplemented("MOCK", "DIRECTORY_LOOKUP"), error => isFlow(error, 409));
  assert.throws(() => assertCapabilityImplemented("STRIPE", "CARD_PAYMENT"), error => isFlow(error, 409));
});

test("OWNER et ADMIN configurent les intégrations ; MEMBER et ACCOUNTANT non", async () => {
  const owner = await register("Droits intégrations");
  const payload = {
    connectorKey: "MOCK",
    provider: "MOCK",
    status: "READY",
    environment: "TEST",
    externalAccountId: `${tag}-rights`,
  };
  await upsertElectronicInvoicingConnection("ADMIN", owner.membership.organizationId, payload);
  await assert.rejects(
    () => upsertElectronicInvoicingConnection("MEMBER", owner.membership.organizationId, payload),
    error => isFlow(error, 403),
  );
  await assert.rejects(
    () => upsertElectronicInvoicingConnection("ACCOUNTANT", owner.membership.organizationId, payload),
    error => isFlow(error, 403),
  );
  await assert.rejects(
    () => upsertPaymentConnection("OWNER", owner.membership.organizationId, { connectorKey: "STRIPE" }),
    error => isFlow(error, 409),
  );
  await assert.rejects(
    () => upsertPaymentConnection("MEMBER", owner.membership.organizationId, { connectorKey: "STRIPE" }),
    error => isFlow(error, 403),
  );
  await assert.rejects(
    () => upsertPaymentConnection("ACCOUNTANT", owner.membership.organizationId, { connectorKey: "PAYPAL" }),
    error => isFlow(error, 403),
  );
  assert.equal(canManagePaymentIntegrations("OWNER"), true);
  assert.equal(canManagePaymentIntegrations("ADMIN"), true);
  assert.equal(canRecordPayments("ACCOUNTANT"), true);
  assert.equal(canManagePaymentIntegrations("ACCOUNTANT"), false);
});

test("l’isolation refuse un identifiant de connexion forgé", async () => {
  const first = await register("Org A intégrations");
  const second = await register("Org B intégrations");
  const connection = await upsertElectronicInvoicingConnection("OWNER", first.membership.organizationId, {
    connectorKey: "MOCK",
    provider: "MOCK",
    status: "READY",
    environment: "TEST",
    externalAccountId: `${tag}-iso-a`,
  });
  await assert.rejects(
    () => getElectronicInvoicingConnectionById(second.membership.organizationId, connection.id),
    error => isFlow(error, 404),
  );
  await upsertElectronicInvoicingConnection("OWNER", first.membership.organizationId, {
    connectorKey: "MOCK",
    provider: "MOCK",
    status: "READY",
    environment: "TEST",
    organizationId: second.membership.organizationId,
    connectionId: connection.id,
    externalAccountId: `${tag}-iso-ignored`,
  });
  const stillA = await getElectronicInvoicingConnectionById(first.membership.organizationId, connection.id);
  assert.equal(stillA.organizationId, first.membership.organizationId);
  assert.equal(stillA.externalAccountId, `${tag}-iso-ignored`);
  assert.equal(
    await getDb().electronicInvoicingConnection.count({ where: { organizationId: second.membership.organizationId } }),
    0,
  );
  await assert.rejects(
    () => getPaymentConnection(second.membership.organizationId, "ck_forged_id"),
    error => isFlow(error, 404),
  );
});

test("MOCK continue de transmettre via le registre ; changer la connexion n’écrase pas l’historique", async () => {
  const owner = await register("Historique MOCK");
  await frenchIssuer(owner);
  await upsertElectronicInvoicingConnection("OWNER", owner.membership.organizationId, {
    connectorKey: "MOCK",
    provider: "MOCK",
    status: "READY",
    environment: "TEST",
    externalAccountId: `${tag}-hist`,
  });
  const customer = await b2bCustomer(owner);
  const invoice = await invoiceFrom(owner, customer.id);
  setMockSubmitBehavior(owner.membership.organizationId, "success");
  const submitted = await submitElectronicDocument("OWNER", owner.membership.organizationId, { documentId: invoice.id });
  assert.equal(submitted.status, "ACCEPTED");
  const before = await getDocumentElectronicTransmission(owner.membership.organizationId, invoice.id);
  assert.equal(before?.provider, "MOCK");
  assert.equal(before?.connectorKey, "MOCK");
  await upsertElectronicInvoicingConnection("OWNER", owner.membership.organizationId, {
    connectorKey: "MOCK",
    provider: "MOCK",
    status: "DISABLED",
    environment: "TEST",
    externalAccountId: `${tag}-hist-renamed`,
  });
  const afterChange = await getDocumentElectronicTransmission(owner.membership.organizationId, invoice.id);
  assert.equal(afterChange?.id, before?.id);
  assert.equal(afterChange?.provider, "MOCK");
  assert.equal(afterChange?.connectorKey, "MOCK");
  assert.equal(afterChange?.status, "ACCEPTED");
  assert.equal(afterChange?.connectionId, before?.connectionId);
});

test("un paiement A10 n’est pas modifié par le registre ; PaymentMethod reste distinct", async () => {
  const owner = await register("Paiement A10");
  await frenchIssuer(owner);
  const customer = await b2bCustomer(owner);
  const invoice = await invoiceFrom(owner, customer.id);
  const payment = await recordPayment("OWNER", owner.membership.organizationId, {
    invoiceId: invoice.id,
    amountCents: 10,
    method: "BANK_TRANSFER",
    paidAt: "2026-09-25",
  }, owner.user.id);
  await assert.rejects(
    () => upsertPaymentConnection("OWNER", owner.membership.organizationId, { connectorKey: "STRIPE" }),
    error => isFlow(error, 409),
  );
  const unchanged = await getDb().payment.findUniqueOrThrow({ where: { id: payment.id } });
  assert.equal(unchanged.method, "BANK_TRANSFER");
  assert.equal(unchanged.provider, "MANUAL");
  assert.equal(unchanged.amountCents, 1000);
  await assert.rejects(
    () => paymentGateway.createPayment({
      organizationId: owner.membership.organizationId,
      invoiceId: invoice.id,
      amountCents: 10,
      currency: "EUR",
      connectorKey: "STRIPE",
    }),
    error => isFlow(error, 501),
  );
});

test("aucun secret n’est renvoyé par le DTO d’intégrations", async () => {
  const owner = await register("Secrets");
  const saved = await upsertElectronicInvoicingConnection("OWNER", owner.membership.organizationId, {
    connectorKey: "MOCK",
    provider: "MOCK",
    status: "INACTIVE",
    environment: "TEST",
    apiKey: "sk_live_should_fail",
  }).catch((error: unknown) => error);
  assert.ok(saved instanceof AuthFlowError && saved.status === 400);
  const connection = await upsertElectronicInvoicingConnection("OWNER", owner.membership.organizationId, {
    connectorKey: "MOCK",
    provider: "MOCK",
    status: "READY",
    environment: "TEST",
    externalAccountId: `${tag}-secret`,
  });
  await getDb().electronicInvoicingConnection.update({
    where: { id: connection.id },
    data: { credentialRef: issueCredentialRef(owner.membership.organizationId, "ELECTRONIC_INVOICING", "MOCK") },
  });
  const overview = await getIntegrationsOverview(owner.membership.organizationId);
  const serialized = JSON.stringify(overview);
  assert.equal(overview.electronicConnection?.credentialState, "configured");
  assert.doesNotMatch(serialized, /mombongo:ELECTRONIC_INVOICING/);
  assert.doesNotMatch(serialized, /apiKey|clientSecret|sk_live|password/i);
  assert.equal(redactCredentialRef("mombongo:PAYMENT:STRIPE:org:id"), "configured");
  assert.equal(redactCredentialRef(null), null);
  assert.throws(() => assertNoSecretFields({ webhookSecret: "whsec" }), error => isFlow(error, 400));
});

test("une configuration invalide et un environnement PRODUCTION MOCK sont refusés", async () => {
  const owner = await register("Config invalide");
  await assert.rejects(
    () => upsertElectronicInvoicingConnection("OWNER", owner.membership.organizationId, {
      connectorKey: "MOCK",
      provider: "MOCK",
      status: "READY",
      environment: "PRODUCTION",
    }),
    error => isFlow(error, 422),
  );
  await assert.rejects(
    () => upsertElectronicInvoicingConnection("OWNER", owner.membership.organizationId, {
      connectorKey: "INCONNU",
      provider: "MOCK",
      status: "READY",
      environment: "TEST",
    }),
    error => isFlow(error, 400),
  );
  const ready = await upsertElectronicInvoicingConnection("OWNER", owner.membership.organizationId, {
    connectorKey: "MOCK",
    provider: "MOCK",
    status: "READY",
    environment: "TEST",
    externalAccountId: `${tag}-env`,
  });
  assert.equal(ready.environment, "TEST");
  const checked = await testElectronicInvoicingConnection("OWNER", owner.membership.organizationId);
  assert.equal(checked.ok, true);
  const overview = await getIntegrationsOverview(owner.membership.organizationId);
  assert.equal(overview.electronicConnection?.lastCheckOk, true);
  assert.equal(overview.electronicConnection?.environment, "TEST");
});
