import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { addAddress, createCustomer, updateAddress, updateCustomer } from "../apps/web/src/lib/customers/service";
import { acceptQuote, addQuoteLine, createQuote, getQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { convertQuoteToInvoice, getInvoice } from "../apps/web/src/lib/invoices/service";
import { addOrganizationAddress, updateOrganizationIdentity } from "../apps/web/src/lib/organizations/service";
import { documentCustomerLabel } from "../apps/web/src/lib/documents/snapshot";
import { lineAmounts, quantityNumber, vatBreakdown } from "../apps/web/src/lib/documents/money";
import { formatMoney } from "@mombongo/contracts";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `billv2-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Société A") {
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

const billingA = {
  type: "BILLING" as const,
  label: "Facturation",
  line1: "10 rue Facture",
  postalCode: "75011",
  city: "Paris",
  countryCode: "FR" as const,
};
const shippingB = {
  type: "SHIPPING" as const,
  label: "Livraison",
  line1: "20 rue Livraison",
  postalCode: "69001",
  city: "Lyon",
  countryCode: "FR" as const,
};

after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
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

test("les arrondis monétaires utilisent des milli-quantités et un arrondi half-up", () => {
  assert.deepEqual(lineAmounts({ quantity: 1.5, unitPriceCents: 10_000, vatBps: 2000 }), { htCents: 15_000, vatCents: 3_000, ttcCents: 18_000 });
  assert.deepEqual(lineAmounts({ quantity: 2.75, unitPriceCents: 1_000, vatBps: 1000 }), { htCents: 2_750, vatCents: 275, ttcCents: 3_025 });
  assert.deepEqual(lineAmounts({ quantity: 1, unitPriceCents: 111, vatBps: 2000 }), { htCents: 111, vatCents: 22, ttcCents: 133 });
  assert.deepEqual(vatBreakdown([
    { vatBps: 2000, htCents: 10_000, vatCents: 2_000 },
    { vatBps: 1000, htCents: 5_000, vatCents: 500 },
    { vatBps: 2000, htCents: 1_000, vatCents: 200 },
  ]), [
    { vatBps: 1000, htCents: 5_000, vatCents: 500 },
    { vatBps: 2000, htCents: 11_000, vatCents: 2_200 },
  ]);
  const usd = formatMoney(120_000, "USD");
  assert.match(usd, /\$US|USD/);
  assert.doesNotMatch(usd, /€/);
});

test("l’émetteur snapshoté reste celui de l’émission après modification live", async () => {
  const owner = await register("Société A");
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Société A",
    legalName: "Société A SAS",
    tradeName: "Marque A",
    siren: "123456789",
    siret: "12345678900014",
    vatNumber: "FR12345678901",
    currency: "USD",
    vatOnDebits: true,
    invoiceDueDays: 15,
    paymentTerms: "Paiement à 15 jours",
    countryCode: "FR",
  });
  await addOrganizationAddress("OWNER", owner.membership.organizationId, {
    type: "BILLING",
    label: "Siège A",
    line1: "1 rue Émetteur",
    postalCode: "75001",
    city: "Paris",
    countryCode: "FR",
  });
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Client A",
    kind: "CLIENT",
  }, `${tag}-iss`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Émetteur",
    description: "Conseil",
    quantity: 1,
    unitPriceCents: 100,
    vatBps: 2000,
    itemKind: "SERVICE",
  }, `${tag}-iss-q`, owner.user.id);
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(sent.issuerNameSnapshot, "Marque A");
  assert.equal(sent.issuerLegalNameSnapshot, "Société A SAS");
  assert.equal(sent.issuerSirenSnapshot, "123456789");
  assert.equal(sent.issuerCurrencySnapshot, "USD");
  assert.equal(sent.issuerVatOnDebitsSnapshot, true);
  assert.equal(sent.paymentTermsSnapshot, "Paiement à 15 jours");
  assert.match(sent.issuerAddressSnapshot ?? "", /1 rue Émetteur/);
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Société B",
    legalName: "Société B SAS",
    tradeName: "Marque B",
    currency: "EUR",
    vatOnDebits: false,
    paymentTerms: "Comptant",
  });
  const loaded = await getQuote(owner.membership.organizationId, quote.id);
  assert.equal(loaded.issuerNameSnapshot, "Marque A");
  assert.equal(loaded.issuerLegalNameSnapshot, "Société A SAS");
  assert.equal(loaded.issuerCurrencySnapshot, "USD");
  assert.equal(loaded.issuerVatOnDebitsSnapshot, true);
  assert.match(loaded.issuerAddressSnapshot ?? "", /1 rue Émetteur/);
  assert.doesNotMatch(loaded.issuerAddressSnapshot ?? "", /Société B/);
});

test("un client COMPANY snapshoté conserve l’identité A après passage à B", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Dupont Conseil",
    tradeName: "Atelier A",
    siren: "123456789",
    siret: "12345678900014",
    vatNumber: "FR12345678901",
    kind: "CLIENT",
  }, `${tag}-co`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "B2B",
    description: "Mission",
    quantity: 1,
    unitPriceCents: 200,
    vatBps: 2000,
  }, `${tag}-co-q`, owner.user.id);
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(sent.customerNameSnapshot, "Atelier A");
  assert.equal(sent.customerPartyKindSnapshot, "COMPANY");
  assert.equal(sent.customerLegalNameSnapshot, "Dupont Conseil");
  assert.equal(sent.customerSirenSnapshot, "123456789");
  await updateCustomer("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    partyKind: "COMPANY",
    legalName: "Dupont Holding",
    tradeName: "Atelier B",
    siren: "123456789",
    siret: "12345678900014",
    vatNumber: "FR12345678901",
    kind: "CLIENT",
  });
  const loaded = await getQuote(owner.membership.organizationId, quote.id);
  assert.equal(loaded.customerNameSnapshot, "Atelier A");
  assert.equal(loaded.customerLegalNameSnapshot, "Dupont Conseil");
  assert.equal(documentCustomerLabel(loaded), "Atelier A");
  assert.equal(loaded.customer.displayName, "Atelier B");
});

test("un particulier PERSON snapshoté conserve Marie Dupont après modification de la fiche", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "PERSON",
    firstName: "Marie",
    lastName: "Dupont",
    kind: "CLIENT",
  }, `${tag}-pe`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "B2C",
    description: "Cours",
    quantity: 1,
    unitPriceCents: 80,
    vatBps: 2000,
  }, `${tag}-pe-q`, owner.user.id);
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(sent.customerNameSnapshot, "Marie Dupont");
  assert.equal(sent.customerPartyKindSnapshot, "PERSON");
  assert.equal(sent.customerFirstNameSnapshot, "Marie");
  assert.equal(sent.customerLastNameSnapshot, "Dupont");
  assert.equal(sent.customerSirenSnapshot, null);
  await updateCustomer("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    partyKind: "PERSON",
    firstName: "Marie",
    lastName: "Martin",
    kind: "CLIENT",
  });
  const loaded = await getQuote(owner.membership.organizationId, quote.id);
  assert.equal(loaded.customerNameSnapshot, "Marie Dupont");
  assert.equal(loaded.customerLastNameSnapshot, "Dupont");
  assert.equal(documentCustomerLabel(loaded), "Marie Dupont");
});

test("facturation et livraison sont snapshotées séparément et restent immuables", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Atelier Adresses",
    kind: "CLIENT",
  }, `${tag}-ad`);
  const billing = await addAddress("OWNER", owner.membership.organizationId, { customerId: customer.id, ...billingA });
  const shipping = await addAddress("OWNER", owner.membership.organizationId, { customerId: customer.id, ...shippingB });
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Adresses",
    description: "Livraison",
    quantity: 1,
    unitPriceCents: 50,
    vatBps: 2000,
    itemKind: "PRODUCT",
  }, `${tag}-ad-q`, owner.user.id);
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.match(sent.customerAddressSnapshot ?? "", /10 rue Facture/);
  assert.match(sent.customerDeliveryAddressSnapshot ?? "", /20 rue Livraison/);
  assert.equal(sent.operationCategory, "GOODS");
  assert.notEqual(sent.customerAddressSnapshot, sent.customerDeliveryAddressSnapshot);
  await updateAddress("OWNER", owner.membership.organizationId, { addressId: billing.id, ...billingA, line1: "99 rue Nouvelle facture" });
  await updateAddress("OWNER", owner.membership.organizationId, { addressId: shipping.id, ...shippingB, line1: "88 rue Nouvelle livraison" });
  const loaded = await getQuote(owner.membership.organizationId, quote.id);
  assert.match(loaded.customerAddressSnapshot ?? "", /10 rue Facture/);
  assert.match(loaded.customerDeliveryAddressSnapshot ?? "", /20 rue Livraison/);
  assert.doesNotMatch(loaded.customerAddressSnapshot ?? "", /99 rue/);
  assert.doesNotMatch(loaded.customerDeliveryAddressSnapshot ?? "", /88 rue/);
});

test("la facture copie le snapshot A7 du devis malgré des données live B", async () => {
  const owner = await register("Société A");
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Société A",
    legalName: "Société A SAS",
    tradeName: "Marque A",
    currency: "USD",
    invoiceDueDays: 15,
    paymentTerms: "Net 15",
  });
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "PERSON",
    firstName: "Marie",
    lastName: "Dupont",
    kind: "CLIENT",
  }, `${tag}-cv`);
  await addAddress("OWNER", owner.membership.organizationId, { customerId: customer.id, ...billingA });
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Conversion",
    description: "Heures",
    quantity: 1.5,
    unit: "heure",
    unitPriceCents: 80,
    vatBps: 2000,
  }, `${tag}-cv-q`, owner.user.id);
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Société B",
    legalName: "Société B SAS",
    tradeName: "Marque B",
    currency: "EUR",
    paymentTerms: "Comptant",
  });
  await updateCustomer("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    partyKind: "PERSON",
    firstName: "Marie",
    lastName: "Martin",
    kind: "CLIENT",
  });
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(invoice.issuerNameSnapshot, "Marque A");
  assert.equal(invoice.issuerCurrencySnapshot, "USD");
  assert.equal(invoice.customerNameSnapshot, "Marie Dupont");
  assert.equal(invoice.paymentTermsSnapshot, "Net 15");
  assert.ok(invoice.dueDate);
  const loaded = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(loaded.customerNameSnapshot, "Marie Dupont");
  assert.equal(Number(loaded.lines[0]?.quantity), 1.5);
  assert.equal(loaded.lines[0]?.unit, "heure");
  assert.equal(loaded.htCents, 12_000);
  assert.equal(loaded.issuerCurrencySnapshot, "USD");
});

test("plusieurs taux de TVA et une quantité décimale sont totaux côté serveur", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Atelier TVA",
    kind: "CLIENT",
  }, `${tag}-vat`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "TVA mixte",
    description: "Service 20 %",
    quantity: 1,
    unitPriceCents: 100,
    vatBps: 2000,
    itemKind: "SERVICE",
  }, `${tag}-vat-q`, owner.user.id);
  await addQuoteLine("OWNER", owner.membership.organizationId, {
    documentId: quote.id,
    description: "Bien 10 %",
    quantity: 2.75,
    unit: "kg",
    unitPriceCents: 10,
    vatBps: 1000,
    itemKind: "PRODUCT",
  });
  await addQuoteLine("OWNER", owner.membership.organizationId, {
    documentId: quote.id,
    description: "Réduit 5,5 %",
    quantity: 1,
    unitPriceCents: 200,
    vatBps: 550,
    itemKind: "SERVICE",
  });
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(sent.htCents, 32_750);
  assert.equal(sent.vatCents, 3_375);
  assert.equal(sent.ttcCents, 36_125);
  assert.equal(sent.operationCategory, "MIXED");
  const rates = sent.vatBreakdownSnapshot as { vatBps: number; htCents: number; vatCents: number }[];
  assert.deepEqual(rates.map(rate => rate.vatBps), [550, 1000, 2000]);
  assert.equal(quantityNumber(sent.lines.find(line => line.vatBps === 1000)?.quantity ?? 0), 2.75);
});

test("un document A2 sans snapshots A7 reste lisible, sans faux backfill", async () => {
  const owner = await register("Legacy Org");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Nom actuel", kind: "CLIENT" }, `${tag}-leg`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Ancien",
    description: "Ligne",
    quantity: 1,
    unitPriceCents: 100,
    vatBps: 2000,
  }, `${tag}-leg-q`, owner.user.id);
  await getDb().document.update({
    where: { id: quote.id },
    data: {
      status: "SENT",
      number: "DEV-2026-0199",
      issuedAt: new Date(),
      issuerNameSnapshot: "Legacy Org",
      issuerCurrencySnapshot: "EUR",
      customerNameSnapshot: "Nom historique",
    },
  });
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Legacy Org",
    legalName: "Ne doit pas backfiller",
    tradeName: "Live B",
  });
  const loaded = await getQuote(owner.membership.organizationId, quote.id);
  assert.equal(loaded.customerNameSnapshot, "Nom historique");
  assert.equal(loaded.issuerNameSnapshot, "Legacy Org");
  assert.equal(loaded.issuerLegalNameSnapshot, null);
  assert.equal(loaded.issuerTradeNameSnapshot, null);
  assert.equal(loaded.customerPartyKindSnapshot, null);
  assert.equal(loaded.customerAddressJsonSnapshot, null);
  assert.equal(loaded.vatBreakdownSnapshot, null);
  assert.equal(documentCustomerLabel(loaded), "Nom historique");
});

test("une organisation ne lit pas les documents d’une autre", async () => {
  const first = await register("Entreprise A");
  const second = await register("Entreprise B");
  const customer = await createCustomer("OWNER", first.membership.organizationId, {
    partyKind: "PERSON",
    firstName: "Marie",
    lastName: "Dupont",
    kind: "CLIENT",
  }, `${tag}-iso`);
  const quote = await createQuote("OWNER", first.membership.organizationId, {
    customerId: customer.id,
    title: "Isolé",
    description: "Ligne",
    quantity: 1,
    unitPriceCents: 40,
    vatBps: 2000,
  }, `${tag}-iso-q`, first.user.id);
  await sendQuote("OWNER", first.membership.organizationId, { documentId: quote.id }, first.user.id);
  await acceptQuote("OWNER", first.membership.organizationId, { documentId: quote.id }, first.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", first.membership.organizationId, { documentId: quote.id }, first.user.id);
  await assert.rejects(() => getQuote(second.membership.organizationId, quote.id), AuthFlowError);
  await assert.rejects(() => getInvoice(second.membership.organizationId, invoice.id), AuthFlowError);
  await assert.rejects(
    () => sendQuote("OWNER", second.membership.organizationId, { documentId: quote.id }, second.user.id),
    AuthFlowError,
  );
});
