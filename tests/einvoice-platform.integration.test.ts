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
import { createCreditNote, issueCreditNote } from "../apps/web/src/lib/credit-notes/service";
import { recordPayment } from "../apps/web/src/lib/payments/service";
import { addOrganizationAddress, updateOrganizationIdentity } from "../apps/web/src/lib/organizations/service";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
import { canIssueInvoices, canManageElectronicInvoicing, canSubmitElectronicInvoicing } from "../apps/web/src/lib/auth/permissions";
import {
  getDocumentElectronicTransmission,
  preparePaymentElectronicReporting,
  submitElectronicDocument,
  upsertElectronicInvoicingConnection,
} from "../apps/web/src/lib/einvoice-platform/service";
import { handleElectronicInvoicingWebhook } from "../apps/web/src/lib/einvoice-platform/webhooks";
import { mockWebhookHeaders, resetMockAdapterState, setMockSubmitBehavior } from "../apps/web/src/lib/einvoice-platform/mock-adapter";
import type { MemberRole } from "../apps/web/src/generated/prisma/client";

config({ path: "apps/web/.env.local", quiet: true });
const tag = `einv-pa-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Entreprise PA") {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Compte test", accountType: "BUSINESS", organizationName }, `${tag}:${email}`);
  const user = await completeAuth(token, await codeFor(token.split(".")[0], 1), `${tag}:${email}`);
  assert.ok(user);
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: user.id } });
  return { email, user, membership };
}

async function colleague(organizationId: string, role: Exclude<MemberRole, "OWNER">) {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const user = await getDb().user.create({ data: { email, accountType: "BUSINESS", name: role } });
  await getDb().membership.create({ data: { userId: user.id, organizationId, role } });
  return user;
}

async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}

async function frenchIssuer(owner: Awaited<ReturnType<typeof register>>, extras: Record<string, unknown> = {}) {
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Société A",
    legalName: "Société A",
    tradeName: "Atelier A",
    siren: "123456789",
    siret: "12345678900014",
    vatNumber: "FR12345678901",
    countryCode: "FR",
    paymentTerms: "Paiement à 30 jours.",
    currency: "EUR",
    ...extras,
  });
  await addOrganizationAddress("OWNER", owner.membership.organizationId, {
    type: "BILLING",
    label: "Siège A",
    line1: "10 rue A",
    postalCode: "75011",
    city: "Paris",
    countryCode: "FR",
  });
}

async function invoiceFrom(owner: Awaited<ReturnType<typeof register>>, customerId: string, input: {
  title: string;
  description: string;
  quantity?: number;
  unit?: string;
  unitPriceCents: number;
  vatBps: number;
}) {
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId,
    title: input.title,
    description: input.description,
    quantity: input.quantity ?? 1,
    unit: input.unit,
    unitPriceCents: input.unitPriceCents,
    vatBps: input.vatBps,
  }, `${tag}-${input.title}`, owner.user.id);
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  return getInvoice(owner.membership.organizationId, invoice.id);
}

async function b2bCustomer(owner: Awaited<ReturnType<typeof register>>, suffix: string) {
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: `Client ${suffix}`,
    tradeName: `Atelier ${suffix}`,
    siren: "111222333",
    siret: "11122233300011",
    vatNumber: "FR11122233300",
    taxablePerson: true,
    kind: "CLIENT",
  }, `${tag}-${suffix}-c`);
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

async function readyConnection(owner: Awaited<ReturnType<typeof register>>, suffix = "acc") {
  return upsertElectronicInvoicingConnection("OWNER", owner.membership.organizationId, {
    provider: "MOCK",
    status: "READY",
    environment: "TEST",
    externalAccountId: `${tag}-${suffix}-${owner.membership.organizationId.slice(-8)}`,
  });
}

async function postWebhook(provider: string, headers: Record<string, string>, body: string) {
  const request = new Request(`http://localhost/api/v1/e-invoicing/webhooks/${provider}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
  return handleElectronicInvoicingWebhook(provider, request);
}

after(async () => {
  resetMockAdapterState();
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.electronicInboundDocument.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.electronicTransmission.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.electronicInvoicingConnection.deleteMany({ where: { organizationId: { in: organizationIds } } });
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

test("la configuration PA n’est pas déduite de l’émission de facture", () => {
  assert.equal(canIssueInvoices("MEMBER"), true);
  assert.equal(canSubmitElectronicInvoicing("MEMBER"), false);
  assert.equal(canManageElectronicInvoicing("MEMBER"), false);
  assert.equal(canSubmitElectronicInvoicing("OWNER"), true);
  assert.equal(canManageElectronicInvoicing("ADMIN"), true);
  assert.equal(canManageElectronicInvoicing("ACCOUNTANT"), false);
});

test("une facture B2B valide est transmise au MOCK avec un historique successif, sans dupliquer", async () => {
  const owner = await register("B2B PA");
  await frenchIssuer(owner);
  await readyConnection(owner, "b2b");
  const customer = await b2bCustomer(owner, "b2b");
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Mission B2B PA",
    description: "Conseil",
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 2000,
  });
  setMockSubmitBehavior(owner.membership.organizationId, "success");
  const first = await submitElectronicDocument("OWNER", owner.membership.organizationId, { documentId: invoice.id });
  const second = await submitElectronicDocument("OWNER", owner.membership.organizationId, { documentId: invoice.id });
  assert.equal(first.id, second.id);
  assert.equal(second.reused, true);
  const transmission = await getDocumentElectronicTransmission(owner.membership.organizationId, invoice.id);
  assert.ok(transmission);
  assert.equal(transmission.route, "E_INVOICING");
  assert.equal(transmission.operation, "SUBMIT_INVOICE");
  assert.equal(transmission.kind, "INVOICE");
  assert.equal(transmission.status, "ACCEPTED");
  assert.equal(transmission.provider, "MOCK");
  const types = transmission.events.map(item => item.type);
  assert.deepEqual(types.slice(0, 4), ["CREATED", "VALIDATED", "QUEUED", "SUBMITTED"]);
  assert.ok(types.includes("ACCEPTED"));
  const stillSent = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(stillSent.status, "SENT");
  const count = await getDb().electronicTransmission.count({
    where: { organizationId: owner.membership.organizationId, documentId: invoice.id, operation: "SUBMIT_INVOICE" },
  });
  assert.equal(count, 1);
});

test("un rejet MOCK laisse le document SENT et la transmission REJECTED", async () => {
  const owner = await register("Rejet PA");
  await frenchIssuer(owner);
  await readyConnection(owner, "rej");
  const customer = await b2bCustomer(owner, "rej");
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Mission rejet",
    description: "Conseil",
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 2000,
  });
  setMockSubmitBehavior(owner.membership.organizationId, "reject");
  const result = await submitElectronicDocument("OWNER", owner.membership.organizationId, { documentId: invoice.id });
  assert.equal(result.status, "REJECTED");
  const document = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(document.status, "SENT");
  const transmission = await getDocumentElectronicTransmission(owner.membership.organizationId, invoice.id);
  assert.equal(transmission?.status, "REJECTED");
  assert.equal(transmission?.lastErrorCode, "MOCK_REJECTED");
  assert.match(transmission?.lastErrorMessage ?? "", /rejet/i);
  assert.doesNotMatch(transmission?.lastErrorMessage ?? "", /stack|secret|token/i);
});

test("une erreur temporaire se rejoue sur la même clé d’idempotence", async () => {
  const owner = await register("Retry PA");
  await frenchIssuer(owner);
  await readyConnection(owner, "retry");
  const customer = await b2bCustomer(owner, "retry");
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Mission retry",
    description: "Conseil",
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 2000,
  });
  setMockSubmitBehavior(owner.membership.organizationId, "temporary-then-success");
  const first = await submitElectronicDocument("OWNER", owner.membership.organizationId, { documentId: invoice.id });
  assert.equal(first.status, "FAILED");
  const second = await submitElectronicDocument("OWNER", owner.membership.organizationId, { documentId: invoice.id });
  assert.equal(first.id, second.id);
  assert.equal(second.status, "ACCEPTED");
  const count = await getDb().electronicTransmission.count({
    where: { organizationId: owner.membership.organizationId, documentId: invoice.id },
  });
  assert.equal(count, 1);
});

test("une facture invalide A13.1 n’appelle pas le provider", async () => {
  const owner = await register("Invalide PA");
  await readyConnection(owner, "inv");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Client incomplet", kind: "CLIENT" }, `${tag}-inv-c`);
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Sans identité",
    description: "Ligne",
    unitPriceCents: 100,
    vatBps: 2000,
  });
  setMockSubmitBehavior(owner.membership.organizationId, "success");
  await assert.rejects(
    () => submitElectronicDocument("OWNER", owner.membership.organizationId, { documentId: invoice.id }),
    error => error instanceof AuthFlowError && error.status === 422,
  );
  const count = await getDb().electronicTransmission.count({
    where: { organizationId: owner.membership.organizationId, documentId: invoice.id },
  });
  assert.equal(count, 0);
});

test("un particulier suit E_REPORTING, pas l’e-invoicing B2B", async () => {
  const owner = await register("B2C PA");
  await frenchIssuer(owner);
  await readyConnection(owner, "b2c");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "PERSON",
    civility: "MRS",
    firstName: "Marie",
    lastName: "Dupont",
    kind: "CLIENT",
  }, `${tag}-b2c-c`);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Domicile",
    line1: "8 rue des Lilas",
    postalCode: "33000",
    city: "Bordeaux",
    countryCode: "FR",
  });
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Cours particulier PA",
    description: "Heure de soutien",
    quantity: 2,
    unit: "heure",
    unitPriceCents: 40,
    vatBps: 2000,
  });
  setMockSubmitBehavior(owner.membership.organizationId, "success");
  await submitElectronicDocument("OWNER", owner.membership.organizationId, { documentId: invoice.id });
  const transmission = await getDocumentElectronicTransmission(owner.membership.organizationId, invoice.id);
  assert.equal(transmission?.route, "E_REPORTING");
  assert.equal(transmission?.operation, "SUBMIT_E_REPORTING");
  assert.equal(transmission?.kind, "E_REPORTING");
  assert.notEqual(transmission?.operation, "SUBMIT_INVOICE");
});

test("un avoir admissible est préparé sur sa propre transmission", async () => {
  const owner = await register("Avoir PA");
  await frenchIssuer(owner);
  await readyConnection(owner, "av");
  const customer = await b2bCustomer(owner, "av");
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Audit PA",
    description: "Prestation",
    unit: "jour",
    unitPriceCents: 100,
    vatBps: 2000,
  });
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, {
    invoiceId: invoice.id,
    mode: "PARTIAL",
    creditReason: "Geste commercial",
    [`quantity-${invoice.lines[0]!.id}`]: "1",
  }, owner.user.id);
  const issued = await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  setMockSubmitBehavior(owner.membership.organizationId, "success");
  await submitElectronicDocument("OWNER", owner.membership.organizationId, { documentId: issued.id });
  const noteTx = await getDocumentElectronicTransmission(owner.membership.organizationId, issued.id);
  const invoiceTx = await getDocumentElectronicTransmission(owner.membership.organizationId, invoice.id);
  assert.equal(noteTx?.operation, "SUBMIT_CREDIT_NOTE");
  assert.equal(noteTx?.kind, "CREDIT_NOTE");
  assert.equal(noteTx?.documentId, issued.id);
  assert.equal(invoiceTx, null);
});

test("le reporting de paiement ne mélange pas PaymentProvider et PA", async () => {
  const owner = await register("Paiement PA");
  await frenchIssuer(owner);
  await readyConnection(owner, "pay");
  const customer = await b2bCustomer(owner, "pay");
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Mission payée",
    description: "Conseil",
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 2000,
  });
  const payment = await recordPayment("OWNER", owner.membership.organizationId, {
    invoiceId: invoice.id,
    amountCents: (invoice.ttcCents / 100).toFixed(2),
    method: "BANK_TRANSFER",
  }, owner.user.id);
  const prepared = await preparePaymentElectronicReporting("OWNER", owner.membership.organizationId, { paymentId: payment.id });
  const again = await preparePaymentElectronicReporting("OWNER", owner.membership.organizationId, { paymentId: payment.id });
  assert.equal(prepared.id, again.id);
  assert.equal(again.reused, true);
  const row = await getDb().electronicTransmission.findUniqueOrThrow({ where: { id: prepared.id } });
  assert.equal(payment.provider, "MANUAL");
  assert.equal(row.provider, "MOCK");
  assert.equal(row.kind, "PAYMENT_REPORTING");
  assert.equal(row.status, "PENDING");
  assert.equal(row.providerTransmissionId, null);
  assert.equal(row.paymentId, payment.id);
});

test("l’isolation empêche une organisation de voir ou soumettre les transmissions d’une autre", async () => {
  const first = await register("Org A PA");
  const second = await register("Org B PA");
  await frenchIssuer(first);
  await frenchIssuer(second);
  await readyConnection(first, "a");
  await readyConnection(second, "b");
  const customer = await b2bCustomer(first, "iso");
  const invoice = await invoiceFrom(first, customer.id, {
    title: "Mission A",
    description: "Conseil",
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 2000,
  });
  setMockSubmitBehavior(first.membership.organizationId, "success");
  const submitted = await submitElectronicDocument("OWNER", first.membership.organizationId, { documentId: invoice.id });
  await assert.rejects(
    () => submitElectronicDocument("OWNER", second.membership.organizationId, { documentId: invoice.id }),
    AuthFlowError,
  );
  const foreign = await getDocumentElectronicTransmission(second.membership.organizationId, invoice.id);
  assert.equal(foreign, null);
  const own = await getDb().electronicTransmission.findFirst({
    where: { id: submitted.id, organizationId: second.membership.organizationId },
  });
  assert.equal(own, null);
});

test("MEMBER peut émettre une facture mais ni configurer ni transmettre à une PA", async () => {
  const owner = await register("Droits PA");
  const member = await colleague(owner.membership.organizationId, "MEMBER");
  await frenchIssuer(owner);
  await readyConnection(owner, "rights");
  const customer = await b2bCustomer(owner, "rights");
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Mission membre",
    description: "Conseil",
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 2000,
  });
  await assert.rejects(
    () => upsertElectronicInvoicingConnection("MEMBER", owner.membership.organizationId, { provider: "MOCK", status: "READY" }),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  await assert.rejects(
    () => submitElectronicDocument("MEMBER", owner.membership.organizationId, { documentId: invoice.id }),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  assert.ok(member.id);
});

test("un webhook dupliqué n’est traité qu’une fois et ignore organizationId du payload", async () => {
  const owner = await register("Webhook PA");
  const other = await register("Webhook B");
  await frenchIssuer(owner);
  const connection = await readyConnection(owner, "wh");
  const customer = await b2bCustomer(owner, "wh");
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Mission webhook",
    description: "Conseil",
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 2000,
  });
  setMockSubmitBehavior(owner.membership.organizationId, "success");
  const submitted = await submitElectronicDocument("OWNER", owner.membership.organizationId, { documentId: invoice.id });
  const row = await getDb().electronicTransmission.findUniqueOrThrow({ where: { id: submitted.id } });
  const payload = JSON.stringify({
    eventId: `${tag}-evt-1`,
    type: "STATUS",
    providerTransmissionId: row.providerTransmissionId,
    status: "DELIVERED",
    organizationId: other.membership.organizationId,
  });
  const headers = mockWebhookHeaders(connection, payload);
  const first = await postWebhook("MOCK", headers, payload);
  const second = await postWebhook("MOCK", headers, payload);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await first.json()).duplicate, false);
  assert.equal((await second.json()).duplicate, true);
  const updated = await getDb().electronicTransmission.findUniqueOrThrow({ where: { id: submitted.id } });
  assert.equal(updated.organizationId, owner.membership.organizationId);
  assert.equal(updated.status, "DELIVERED");
  const events = await getDb().electronicTransmissionEvent.count({
    where: { organizationId: owner.membership.organizationId, providerEventId: `${tag}-evt-1` },
  });
  assert.equal(events, 1);
});

test("un webhook forgé ne choisit pas le tenant et un compte étranger ne met pas à jour une transmission", async () => {
  const owner = await register("Webhook forge");
  const other = await register("Webhook forge B");
  await frenchIssuer(owner);
  await frenchIssuer(other);
  const connectionA = await readyConnection(owner, "fa");
  const connectionB = await readyConnection(other, "fb");
  const customer = await b2bCustomer(owner, "forge");
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Mission forgée",
    description: "Conseil",
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 2000,
  });
  setMockSubmitBehavior(owner.membership.organizationId, "success");
  const submitted = await submitElectronicDocument("OWNER", owner.membership.organizationId, { documentId: invoice.id });
  const row = await getDb().electronicTransmission.findUniqueOrThrow({ where: { id: submitted.id } });
  const forgedBody = JSON.stringify({
    eventId: `${tag}-forged`,
    type: "STATUS",
    providerTransmissionId: row.providerTransmissionId,
    status: "REJECTED",
    organizationId: other.membership.organizationId,
  });
  const unsigned = await postWebhook("MOCK", {
    "x-mombongo-account": connectionA.externalAccountId!,
    "x-mombongo-timestamp": String(Math.floor(Date.now() / 1000)),
    "x-mombongo-signature": "0".repeat(64),
  }, forgedBody);
  assert.equal(unsigned.status, 401);
  const stolen = await postWebhook("MOCK", mockWebhookHeaders(connectionB, forgedBody), forgedBody);
  assert.equal(stolen.status, 404);
  const unchanged = await getDb().electronicTransmission.findUniqueOrThrow({ where: { id: submitted.id } });
  assert.equal(unchanged.status, "ACCEPTED");
  assert.equal(unchanged.organizationId, owner.membership.organizationId);
});

test("un inbound MOCK prépare une frontière fournisseur sans créer de facture client", async () => {
  const owner = await register("Inbound PA");
  const connection = await readyConnection(owner, "in");
  const body = JSON.stringify({
    eventId: `${tag}-in-1`,
    type: "INBOUND_INVOICE",
    providerDocumentId: `${tag}-sup-1`,
    supplierName: "Fournisseur Test",
    documentNumber: "F-99",
    currency: "EUR",
    ttcCents: 12000,
    organizationId: "should-be-ignored",
  });
  const response = await postWebhook("MOCK", mockWebhookHeaders(connection, body), body);
  assert.equal(response.status, 200);
  const inbound = await getDb().electronicInboundDocument.findFirst({
    where: { organizationId: owner.membership.organizationId, providerDocumentId: `${tag}-sup-1` },
  });
  assert.ok(inbound);
  assert.equal(inbound.supplierName, "Fournisseur Test");
  const invoices = await getDb().document.count({
    where: { organizationId: owner.membership.organizationId, kind: "INVOICE" },
  });
  assert.equal(invoices, 0);
  const transmission = await getDb().electronicTransmission.findUniqueOrThrow({ where: { id: inbound.transmissionId } });
  assert.equal(transmission.direction, "INBOUND");
  assert.equal(transmission.kind, "INBOUND_INVOICE");
  assert.equal(transmission.operation, "RECEIVE_INVOICE");
});
