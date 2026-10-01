import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { extractText } from "unpdf";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { addAddress, createCustomer, updateCustomer } from "../apps/web/src/lib/customers/service";
import { createCatalogItem, updateCatalogItem } from "../apps/web/src/lib/catalog/service";
import { acceptQuote, addQuoteLine, createQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { convertQuoteToInvoice, getInvoice } from "../apps/web/src/lib/invoices/service";
import { createCreditNote, issueCreditNote } from "../apps/web/src/lib/credit-notes/service";
import { recordPayment } from "../apps/web/src/lib/payments/service";
import { addOrganizationAddress, updateOrganizationIdentity } from "../apps/web/src/lib/organizations/service";
import { formatQuantity } from "../apps/web/src/lib/documents/money";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
import { buildDocumentPrintModel } from "../apps/web/src/lib/pdf/model";
import { documentPdfFilename } from "../apps/web/src/lib/pdf/format";
import { buildOrganizationDocumentPdf, getPrintableDocument } from "../apps/web/src/lib/pdf/service";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `pdf-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Entreprise PDF") {
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

function compact(text: string) {
  return text.replace(/\u00a0|\u202f/g, " ").replace(/\s+/g, " ");
}

async function pdfOf(organizationId: string, documentId: string) {
  const result = await buildOrganizationDocumentPdf(organizationId, documentId);
  assert.match(result.pdf.subarray(0, 5).toString("latin1"), /^%PDF-/);
  const extracted = await extractText(new Uint8Array(result.pdf), { mergePages: true });
  return { ...result, pages: extracted.totalPages, text: compact(extracted.text) };
}

async function invoiceFrom(owner: Awaited<ReturnType<typeof register>>, customerId: string, input: {
  title: string;
  description: string;
  quantity?: number;
  unit?: string;
  unitPriceCents: number;
  vatBps: number;
  extraLines?: Array<{ description: string; quantity: number; unit?: string; unitPriceCents: number; vatBps: number }>;
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
  for (const line of input.extraLines ?? []) {
    await addQuoteLine("OWNER", owner.membership.organizationId, {
      documentId: quote.id,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      vatBps: line.vatBps,
    });
  }
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  return getInvoice(owner.membership.organizationId, invoice.id);
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
  await db.address.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("les quantités et noms de fichiers PDF restent lisibles", () => {
  assert.equal(formatQuantity(1), "1");
  assert.equal(formatQuantity(1.5), "1,5");
  assert.equal(formatQuantity(2.75), "2,75");
  assert.equal(formatQuantity("2.750"), "2,75");
  assert.equal(documentPdfFilename("QUOTE", "DEV-2026-0001", false), "devis-DEV-2026-0001.pdf");
  assert.equal(documentPdfFilename("INVOICE", "FA-2026-0001", false), "facture-FA-2026-0001.pdf");
  assert.equal(documentPdfFilename("CREDIT_NOTE", "AV-2026-0001", false), "avoir-AV-2026-0001.pdf");
  assert.equal(documentPdfFilename("QUOTE", "DEV-2026-0001", true), "devis-brouillon.pdf");
  assert.equal(documentPdfFilename("INVOICE", "FA 2026/0001", false), "facture-FA-2026-0001.pdf");
});

test("un brouillon de devis est identifiable et n’invente pas de numéro", async () => {
  const owner = await register("Brouillon PDF");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Client brouillon", kind: "CLIENT" }, `${tag}-draft-c`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Avant émission",
    description: "Ligne brouillon",
    quantity: 1,
    unitPriceCents: 1000,
    vatBps: 2000,
  }, `${tag}-draft-q`, owner.user.id);
  const pdf = await pdfOf(owner.membership.organizationId, quote.id);
  assert.match(pdf.text, /DEVIS/);
  assert.match(pdf.text, /BROUILLON/);
  assert.doesNotMatch(pdf.text, /DEV-\d{4}-/);
  assert.equal(pdf.model.filename, "devis-brouillon.pdf");
  assert.equal(pdf.model.numberLabel, "Brouillon");
});

test("le PDF d’une facture émise reste historique après modification live et paiement", async () => {
  const owner = await register("Société A");
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Société A",
    legalName: "Société A",
    tradeName: "Atelier A",
    siren: "123456789",
    siret: "12345678900014",
    vatNumber: "FR12345678901",
    paymentTerms: "Paiement à 30 jours.",
    latePaymentPenaltyTerms: "Pénalités de retard : taux légal.",
    recoveryFeeMention: "Indemnité forfaitaire de 40 €.",
    currency: "EUR",
  });
  await addOrganizationAddress("OWNER", owner.membership.organizationId, {
    type: "BILLING",
    label: "Siège A",
    line1: "10 rue A",
    postalCode: "75011",
    city: "Paris",
    countryCode: "FR",
  });
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Client A",
    tradeName: "Atelier Client A",
    siren: "111222333",
    siret: "11122233300011",
    vatNumber: "FR11122233300",
    kind: "CLIENT",
  }, `${tag}-hist-c`);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Facturation A",
    line1: "1 avenue Snapshot",
    postalCode: "69001",
    city: "Lyon",
    countryCode: "FR",
  });
  const catalog = await createCatalogItem("OWNER", owner.membership.organizationId, {
    itemKind: "SERVICE",
    name: "Service historique",
    unitPriceCents: 100,
    vatBps: 2000,
    unit: "heure",
  }, `${tag}-cat`);
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Mission historique",
    description: "Prestation câblée à l’œuvre",
    quantity: 1.5,
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 2000,
  });
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Société B",
    legalName: "Société B live",
    tradeName: "Atelier B",
    currency: "USD",
  });
  await updateCustomer("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    partyKind: "COMPANY",
    legalName: "Client B",
    tradeName: "Atelier Client B",
    kind: "CLIENT",
  });
  await updateCatalogItem("OWNER", owner.membership.organizationId, {
    catalogItemId: catalog.id,
    itemKind: "SERVICE",
    name: "Service live",
    unitPriceCents: 999,
    vatBps: 0,
    unit: "forfait",
  });
  const beforePay = await pdfOf(owner.membership.organizationId, invoice.id);
  assert.match(beforePay.text, /FACTURE/);
  assert.match(beforePay.text, /FA-\d{4}-0001/);
  assert.match(beforePay.text, /Atelier A|Société A/);
  assert.match(beforePay.text, /Atelier Client A|Client A/);
  assert.match(beforePay.text, /10 rue A/);
  assert.match(beforePay.text, /1 avenue Snapshot/);
  assert.match(beforePay.text, /1,5/);
  assert.match(beforePay.text, /Paiement à 30 jours/);
  assert.doesNotMatch(beforePay.text, /Société B live|Atelier B|Client B|Service live|Reste à payer/);
  assert.equal(beforePay.model.currency, "EUR");
  await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 50, method: "BANK_TRANSFER" }, owner.user.id);
  const afterPay = await pdfOf(owner.membership.organizationId, invoice.id);
  assert.equal(afterPay.model.totals.ttcLabel, beforePay.model.totals.ttcLabel);
  assert.doesNotMatch(afterPay.text, /Reste à payer/);
  assert.doesNotMatch(afterPay.text, /(?<![\d])50,00/);
});

test("un PDF B2C n’affiche pas de SIREN destinataire", async () => {
  const owner = await register("PDF B2C");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "PERSON",
    civility: "MRS",
    firstName: "Marie",
    lastName: "Dupont",
    kind: "CLIENT",
  }, `${tag}-b2c`);
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Cours particulier",
    description: "Heure de soutien",
    quantity: 2.75,
    unit: "heure",
    unitPriceCents: 40,
    vatBps: 2000,
  });
  const pdf = await pdfOf(owner.membership.organizationId, invoice.id);
  assert.match(pdf.text, /Marie Dupont/);
  assert.match(pdf.text, /2,75/);
  assert.doesNotMatch(pdf.text, /SIREN 111|SIRET 111|TVA FR111/);
  assert.equal(pdf.model.recipient.name.includes("Marie"), true);
});

test("un PDF B2B et un avoir conservent la fiscalité snapshotée", async () => {
  const owner = await register("PDF B2B");
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Émetteur B2B",
    legalName: "Émetteur B2B",
    siren: "123456789",
    siret: "12345678900014",
    vatNumber: "FR12345678901",
  });
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Dupont Conseil",
    tradeName: "Atelier Dupont",
    siren: "111222333",
    siret: "11122233300011",
    vatNumber: "FR11122233300",
    kind: "CLIENT",
  }, `${tag}-b2b`);
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Audit",
    description: "Conseil 20 %",
    quantity: 1,
    unitPriceCents: 100,
    vatBps: 2000,
    extraLines: [{ description: "Fourniture 10 %", quantity: 1, unitPriceCents: 50, vatBps: 1000 }],
  });
  const invoicePdf = await pdfOf(owner.membership.organizationId, invoice.id);
  assert.match(invoicePdf.text, /Atelier Dupont|Dupont Conseil/);
  assert.match(invoicePdf.text, /SIREN 111222333/);
  assert.match(invoicePdf.text, /20 %/);
  assert.match(invoicePdf.text, /10 %/);
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, {
    invoiceId: invoice.id,
    mode: "PARTIAL",
    creditReason: "Geste commercial",
    [`quantity-${invoice.lines[0]!.id}`]: "1",
  }, owner.user.id);
  const issued = await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  const creditPdf = await pdfOf(owner.membership.organizationId, issued.id);
  assert.match(creditPdf.text, /AVOIR/);
  assert.match(creditPdf.text, /AV-\d{4}-0001/);
  assert.match(creditPdf.text, /Facture concernée : FA-\d{4}-0001/);
  assert.match(creditPdf.text, /Geste commercial/);
  assert.match(creditPdf.text, /Total TTC crédité/);
  assert.doesNotMatch(creditPdf.text, /Reste à payer/);
  assert.equal(creditPdf.model.totals.ttcCaption, "Total TTC crédité");
  assert.match(creditPdf.model.totals.ttcLabel, /120,00/);
});

test("un document long produit plusieurs pages avec numéro et totaux", async () => {
  const owner = await register("Pagination PDF");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Client long", kind: "CLIENT" }, `${tag}-long-c`);
  const extraLines = Array.from({ length: 36 }, (_, index) => ({
    description: `Ligne de prestation ${index + 2} — suivi de chantier`,
    quantity: 1,
    unitPriceCents: 10,
    vatBps: 2000,
  }));
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Chantier paginé",
    description: "Ligne 1",
    unitPriceCents: 10,
    vatBps: 2000,
    extraLines,
  });
  const pdf = await pdfOf(owner.membership.organizationId, invoice.id);
  assert.ok(pdf.pages > 1);
  assert.match(pdf.text, /FA-\d{4}-0001/);
  assert.match(pdf.text, /Total TTC/);
  assert.match(pdf.text, /Page 1 \/ /);
});

test("un document legacy A2 sans snapshot A7 reste imprimable sans lecture live", async () => {
  const owner = await register("Legacy A2");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Client historique", kind: "CLIENT" }, `${tag}-leg-c`);
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Legacy",
    description: "Maintenance",
    unitPriceCents: 20,
    vatBps: 2000,
  });
  await getDb().document.update({
    where: { id: invoice.id },
    data: {
      issuerLegalNameSnapshot: null,
      issuerTradeNameSnapshot: null,
      issuerSirenSnapshot: null,
      issuerAddressJsonSnapshot: null,
      customerPartyKindSnapshot: null,
      customerFirstNameSnapshot: null,
      customerLastNameSnapshot: null,
      customerLegalNameSnapshot: null,
      customerSirenSnapshot: null,
      vatBreakdownSnapshot: null,
    },
  });
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, { name: "Nom live interdit" });
  const pdf = await pdfOf(owner.membership.organizationId, invoice.id);
  assert.match(pdf.text, /FACTURE/);
  assert.match(pdf.text, /Client historique/);
  assert.doesNotMatch(pdf.text, /Nom live interdit/);
  assert.equal(pdf.model.filename.startsWith("facture-FA-"), true);
});

test("l’isolation organisation refuse le PDF d’une autre entreprise", async () => {
  const ownerA = await register("Org PDF A");
  const ownerB = await register("Org PDF B");
  const customer = await createCustomer("OWNER", ownerA.membership.organizationId, { displayName: "Client A", kind: "CLIENT" }, `${tag}-iso-c`);
  const invoice = await invoiceFrom(ownerA, customer.id, {
    title: "Secret",
    description: "Confidentiel",
    unitPriceCents: 80,
    vatBps: 2000,
  });
  await assert.rejects(() => getPrintableDocument(ownerB.membership.organizationId, invoice.id), (error: unknown) => {
    assert.ok(error instanceof AuthFlowError);
    assert.equal(error.status, 404);
    return true;
  });
  const model = buildDocumentPrintModel(await getPrintableDocument(ownerA.membership.organizationId, invoice.id));
  assert.equal(model.kind, "INVOICE");
});
