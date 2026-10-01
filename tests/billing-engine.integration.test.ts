import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { createCustomer, updateCustomer } from "../apps/web/src/lib/customers/service";
import { createCatalogItem, updateCatalogItem } from "../apps/web/src/lib/catalog/service";
import { acceptQuote, addQuoteLine, createQuote, getQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { cancelInvoice, convertQuoteToInvoice, getInvoice } from "../apps/web/src/lib/invoices/service";
import { createCreditNote, getCreditNote, issueCreditNote } from "../apps/web/src/lib/credit-notes/service";
import { cancelPayment, recordPayment } from "../apps/web/src/lib/payments/service";
import { invoiceSettlement, isInvoiceOverdue } from "../apps/web/src/lib/invoices/settlement";
import { canTransitionDocument } from "../apps/web/src/lib/documents/transitions";
import { updateOrganizationIdentity } from "../apps/web/src/lib/organizations/service";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `engine-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Entreprise moteur") {
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

function settle(invoice: Awaited<ReturnType<typeof getInvoice>>) {
  return invoiceSettlement({
    grossTtcCents: invoice.ttcCents,
    creditNotes: invoice.creditNotes,
    payments: invoice.payments,
  });
}

after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.payment.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, kind: "CREDIT_NOTE" } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, sourceDocumentId: { not: null } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.catalogItem.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("les transitions documentaires interdites sont refusées", () => {
  assert.equal(canTransitionDocument("QUOTE", "DRAFT", "SENT"), true);
  assert.equal(canTransitionDocument("QUOTE", "SENT", "ACCEPTED"), true);
  assert.equal(canTransitionDocument("QUOTE", "ACCEPTED", "CANCELLED"), false);
  assert.equal(canTransitionDocument("INVOICE", "SENT", "CANCELLED"), false);
  assert.equal(canTransitionDocument("INVOICE", "DRAFT", "CANCELLED"), true);
  assert.equal(canTransitionDocument("CREDIT_NOTE", "DRAFT", "SENT"), true);
  assert.equal(canTransitionDocument("CREDIT_NOTE", "SENT", "CANCELLED"), false);
});

test("avoir 200 + paiement 500, annulation, puis nouvel encaissement", async () => {
  const owner = await register("Mixte solde");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Client mixte", kind: "CLIENT" }, `${tag}-mix-c`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Prestation mixte",
    description: "Forfait",
    quantity: 1,
    unitPriceCents: 1000,
    vatBps: 0,
  }, `${tag}-mix-q`, owner.user.id);
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  const issued = await getInvoice(owner.membership.organizationId, invoice.id);
  const unpaid = settle(issued);
  assert.equal(unpaid.settlementState, "UNPAID");
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "PARTIAL", [`quantity-${issued.lines[0]!.id}`]: "0.2" }, owner.user.id);
  await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  const payment = await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 500, method: "BANK_TRANSFER" }, owner.user.id);
  const mixed = settle(await getInvoice(owner.membership.organizationId, invoice.id));
  assert.equal(mixed.grossTtcCents, 100_000);
  assert.equal(mixed.creditedTtcCents, 20_000);
  assert.equal(mixed.netTtcCents, 80_000);
  assert.equal(mixed.paidTtcCents, 50_000);
  assert.equal(mixed.remainingTtcCents, 30_000);
  assert.equal(mixed.settlementState, "PARTIALLY_PAID");
  assert.ok(mixed.remainingTtcCents >= 0);
  await cancelPayment("OWNER", owner.membership.organizationId, { paymentId: payment.id }, owner.user.id);
  const afterCancel = settle(await getInvoice(owner.membership.organizationId, invoice.id));
  assert.equal(afterCancel.paidTtcCents, 0);
  assert.equal(afterCancel.remainingTtcCents, 80_000);
  await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 800, method: "CASH" }, owner.user.id);
  const paidNet = settle(await getInvoice(owner.membership.organizationId, invoice.id));
  assert.equal(paidNet.netTtcCents, 80_000);
  assert.equal(paidNet.paidTtcCents, 80_000);
  assert.equal(paidNet.remainingTtcCents, 0);
  assert.equal(paidNet.settlementState, "PAID");
  assert.equal(isInvoiceOverdue(paidNet.remainingTtcCents, invoice.dueDate), false);
});

test("facture totalement créditée = CREDITED, paiement intégral sans avoir = PAID", async () => {
  const owner = await register("États");
  const creditedCustomer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Créditée", kind: "CLIENT" }, `${tag}-cr-c`);
  const creditedQuote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: creditedCustomer.id,
    title: "Créditée",
    description: "Forfait",
    quantity: 1,
    unitPriceCents: 1000,
    vatBps: 0,
  }, `${tag}-cr-q`, owner.user.id);
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: creditedQuote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: creditedQuote.id }, owner.user.id);
  const creditedInvoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: creditedQuote.id }, owner.user.id);
  const total = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: creditedInvoice.id, mode: "TOTAL" }, owner.user.id);
  await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: total.id }, owner.user.id);
  const credited = settle(await getInvoice(owner.membership.organizationId, creditedInvoice.id));
  assert.equal(credited.settlementState, "CREDITED");
  assert.equal(credited.remainingTtcCents, 0);
  assert.notEqual(credited.settlementState, "PAID");

  const paidCustomer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Soldée", kind: "CLIENT" }, `${tag}-pd-c`);
  const paidQuote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: paidCustomer.id,
    title: "Soldée",
    description: "Forfait",
    quantity: 1,
    unitPriceCents: 1000,
    vatBps: 0,
  }, `${tag}-pd-q`, owner.user.id);
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: paidQuote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: paidQuote.id }, owner.user.id);
  const paidInvoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: paidQuote.id }, owner.user.id);
  await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: paidInvoice.id, amountCents: 1000, method: "BANK_TRANSFER" }, owner.user.id);
  const paid = settle(await getInvoice(owner.membership.organizationId, paidInvoice.id));
  assert.equal(paid.settlementState, "PAID");
  assert.equal(paid.creditedTtcCents, 0);
});

test("historique catalogue / client / organisation inchangé après devis → facture → avoir → paiement", async () => {
  const owner = await register("Historique");
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, { name: "Société A", legalName: "Société A SAS", tradeName: "Marque A", currency: "EUR" });
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Client A SARL",
    siren: "123456789",
    kind: "CLIENT",
  }, `${tag}-hist-c`);
  const item = await createCatalogItem("OWNER", owner.membership.organizationId, {
    itemKind: "SERVICE",
    name: "Conseil",
    description: "Audit initial",
    unit: "forfait",
    unitPriceCents: 100,
    vatBps: 0,
  }, `${tag}-hist-cat`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Mission A",
    catalogItemId: item.id,
    description: "Audit initial",
    quantity: 1,
    unit: "forfait",
    unitPriceCents: 100,
    vatBps: 0,
    itemKind: "SERVICE",
  }, `${tag}-hist-q`, owner.user.id);
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await assert.rejects(
    () => addQuoteLine("OWNER", owner.membership.organizationId, {
      documentId: quote.id,
      description: "Interdit",
      quantity: 1,
      unitPriceCents: 10,
      vatBps: 0,
    }),
    AuthFlowError,
  );
  await updateCustomer("OWNER", owner.membership.organizationId, { customerId: customer.id, partyKind: "COMPANY", legalName: "Client B SARL", siren: "987654321", kind: "CLIENT" });
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, { name: "Société B", legalName: "Société B SAS", tradeName: "Marque B" });
  await updateCatalogItem("OWNER", owner.membership.organizationId, {
    catalogItemId: item.id,
    itemKind: "SERVICE",
    name: "Conseil modifié",
    description: "Audit révisé",
    unit: "jour",
    unitPriceCents: 250,
    vatBps: 2000,
  });
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: sent.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: sent.id }, owner.user.id);
  const loadedQuote = await getQuote(owner.membership.organizationId, sent.id);
  const loadedInvoice = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(loadedQuote.customerLegalNameSnapshot, "Client A SARL");
  assert.equal(loadedQuote.issuerTradeNameSnapshot, "Marque A");
  assert.equal(loadedQuote.lines[0]?.description, "Audit initial");
  assert.equal(loadedQuote.lines[0]?.unitPriceCents, 10_000);
  assert.equal(loadedInvoice.customerLegalNameSnapshot, "Client A SARL");
  assert.equal(loadedInvoice.issuerTradeNameSnapshot, "Marque A");
  assert.equal(loadedInvoice.lines[0]?.description, "Audit initial");
  assert.equal(loadedInvoice.ttcCents, 10_000);
  const noteDraft = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "PARTIAL", [`quantity-${loadedInvoice.lines[0]!.id}`]: "0.2" }, owner.user.id);
  const issuedNote = await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: noteDraft.id }, owner.user.id);
  await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 40, method: "CASH" }, owner.user.id);
  await updateCustomer("OWNER", owner.membership.organizationId, { customerId: customer.id, partyKind: "COMPANY", legalName: "Client C", kind: "CLIENT" });
  const note = await getCreditNote(owner.membership.organizationId, issuedNote.id);
  const afterLive = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(note.customerLegalNameSnapshot, "Client A SARL");
  assert.equal(afterLive.customerLegalNameSnapshot, "Client A SARL");
  assert.equal(afterLive.lines[0]?.unitPriceCents, 10_000);
  const settlement = settle(afterLive);
  assert.equal(settlement.netTtcCents, 8_000);
  assert.equal(settlement.paidTtcCents, 4_000);
  assert.equal(settlement.remainingTtcCents, 4_000);
  await assert.rejects(
    () => cancelInvoice("OWNER", owner.membership.organizationId, { documentId: invoice.id }, owner.user.id),
    error => error instanceof AuthFlowError && error.status === 409,
  );
});

test("parcours B2C PERSON sans SIREN jusqu’au paiement", async () => {
  const owner = await register("B2C");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "PERSON",
    firstName: "Léa",
    lastName: "Martin",
    kind: "CLIENT",
  }, `${tag}-b2c-c`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Cours",
    description: "Séance",
    quantity: 1,
    unitPriceCents: 80,
    vatBps: 0,
  }, `${tag}-b2c-q`, owner.user.id);
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(invoice.customerPartyKindSnapshot, "PERSON");
  assert.equal(invoice.customerSirenSnapshot, null);
  await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 80, method: "CASH" }, owner.user.id);
  assert.equal(settle(await getInvoice(owner.membership.organizationId, invoice.id)).settlementState, "PAID");
});

test("parcours B2B COMPANY avec snapshots légaux, avoir et paiement", async () => {
  const owner = await register("B2B");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Atelier Nord SAS",
    siren: "111222333",
    vatNumber: "FR111222333",
    kind: "CLIENT",
  }, `${tag}-b2b-c`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Prestation B2B",
    description: "Audit",
    quantity: 1,
    unitPriceCents: 1000,
    vatBps: 0,
  }, `${tag}-b2b-q`, owner.user.id);
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(sent.customerLegalNameSnapshot, "Atelier Nord SAS");
  assert.equal(sent.customerSirenSnapshot, "111222333");
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: sent.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: sent.id }, owner.user.id);
  const issued = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(issued.customerSirenSnapshot, "111222333");
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "PARTIAL", [`quantity-${issued.lines[0]!.id}`]: "0.1" }, owner.user.id);
  await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 900, method: "BANK_TRANSFER" }, owner.user.id);
  const settlement = settle(await getInvoice(owner.membership.organizationId, invoice.id));
  assert.equal(settlement.netTtcCents, 90_000);
  assert.equal(settlement.paidTtcCents, 90_000);
  assert.equal(settlement.settlementState, "PAID");
});

test("organisations A et B isolent documents, catalogue, avoirs et paiements", async () => {
  const first = await register("Org A moteur");
  const second = await register("Org B moteur");
  const item = await createCatalogItem("OWNER", first.membership.organizationId, {
    itemKind: "SERVICE",
    name: "Secret A",
    description: "Interne",
    unitPriceCents: 50,
    vatBps: 0,
  }, `${tag}-iso-cat`);
  const customer = await createCustomer("OWNER", first.membership.organizationId, { displayName: "Client A", kind: "CLIENT" }, `${tag}-iso-c`);
  const quote = await createQuote("OWNER", first.membership.organizationId, {
    customerId: customer.id,
    title: "Devis A",
    catalogItemId: item.id,
    description: "Interne",
    quantity: 1,
    unitPriceCents: 50,
    vatBps: 0,
  }, `${tag}-iso-q`, first.user.id);
  await sendQuote("OWNER", first.membership.organizationId, { documentId: quote.id }, first.user.id);
  await acceptQuote("OWNER", first.membership.organizationId, { documentId: quote.id }, first.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", first.membership.organizationId, { documentId: quote.id }, first.user.id);
  await assert.rejects(
    () => createQuote("OWNER", second.membership.organizationId, {
      customerId: customer.id,
      title: "Intrus",
      catalogItemId: item.id,
      description: "Interne",
      quantity: 1,
      unitPriceCents: 50,
      vatBps: 0,
    }, `${tag}-iso-bad`, second.user.id),
    error => error instanceof AuthFlowError && error.status === 404,
  );
  await assert.rejects(
    () => recordPayment("OWNER", second.membership.organizationId, { invoiceId: invoice.id, amountCents: 50, method: "CASH" }, second.user.id),
    error => error instanceof AuthFlowError && error.status === 404,
  );
  await assert.rejects(
    () => createCreditNote("OWNER", second.membership.organizationId, { invoiceId: invoice.id, mode: "TOTAL" }, second.user.id),
    error => error instanceof AuthFlowError && error.status === 404,
  );
});

test("DEV / FA / AV ont des séquences indépendantes et une nouvelle année reprend à 0001", async () => {
  const owner = await register("Séquences");
  const previousYear = new Date().getFullYear() - 1;
  const year = new Date().getFullYear();
  const db = getDb();
  await db.documentSequence.createMany({
    data: [
      { organizationId: owner.membership.organizationId, kind: "QUOTE", year: previousYear, lastNumber: 40 },
      { organizationId: owner.membership.organizationId, kind: "INVOICE", year: previousYear, lastNumber: 12 },
      { organizationId: owner.membership.organizationId, kind: "CREDIT_NOTE", year: previousYear, lastNumber: 7 },
    ],
  });
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Client année", kind: "CLIENT" }, `${tag}-yr-c`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Année",
    description: "Forfait",
    quantity: 1,
    unitPriceCents: 100,
    vatBps: 0,
  }, `${tag}-yr-q`, owner.user.id);
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: sent.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: sent.id }, owner.user.id);
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "TOTAL" }, owner.user.id);
  const note = await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  assert.equal(sent.number, `DEV-${year}-0001`);
  assert.equal(invoice.number, `FA-${year}-0001`);
  assert.equal(note.number, `AV-${year}-0001`);
});
