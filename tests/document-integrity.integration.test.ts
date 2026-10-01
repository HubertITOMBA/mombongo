import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { createCustomer } from "../apps/web/src/lib/customers/service";
import { acceptQuote, cancelQuote, createQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { cancelInvoice, convertQuoteToInvoice } from "../apps/web/src/lib/invoices/service";
import { createCreditNote, issueCreditNote } from "../apps/web/src/lib/credit-notes/service";
import { cancelPayment, recordPayment } from "../apps/web/src/lib/payments/service";
import { getDb } from "../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `integrity-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

type ForeignKeyRow = { conname: string; table_name: string; refs: string; def: string };

async function register(organizationName = "Entreprise intégrité") {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Compte test", accountType: "BUSINESS", organizationName }, `${tag}:${email}`);
  const user = await completeAuth(token, await codeFor(token.split(".")[0], 1), `${tag}:${email}`);
  assert.ok(user);
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: user.id } });
  return { email, user, membership };
}

async function sentQuote(owner: Awaited<ReturnType<typeof register>>, suffix: string, kind: "CLIENT" | "PROSPECT" = "CLIENT") {
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: `Client ${suffix}`, kind }, `${tag}-${suffix}-c`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: `Prestation ${suffix}`,
    description: "Intervention",
    quantity: 1,
    unitPriceCents: 2500,
    vatBps: 2000,
  }, `${tag}-${suffix}-q`, owner.user.id);
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  return { customer, quote: sent };
}

async function issuedInvoice(owner: Awaited<ReturnType<typeof register>>, suffix: string) {
  const { customer, quote } = await sentQuote(owner, suffix);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  return { customer, quote, invoice };
}

async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}

async function expectDeleteRefused(task: () => Promise<unknown>) {
  await assert.rejects(task);
}

after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.payment.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, kind: "CREDIT_NOTE" } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, sourceDocumentId: { not: null } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("PostgreSQL refuse la suppression d’une organisation qui a une facture émise", async () => {
  const owner = await register("Org facture");
  const { invoice } = await issuedInvoice(owner, "org-inv");
  const db = getDb();
  await expectDeleteRefused(() => db.organization.delete({ where: { id: owner.membership.organizationId } }));
  const kept = await db.document.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(kept.kind, "INVOICE");
  assert.equal(kept.status, "SENT");
  assert.equal(kept.number, invoice.number);
});

test("PostgreSQL refuse la suppression d’une organisation qui a un devis émis", async () => {
  const owner = await register("Org devis");
  const { quote } = await sentQuote(owner, "org-quote");
  const db = getDb();
  await expectDeleteRefused(() => db.organization.delete({ where: { id: owner.membership.organizationId } }));
  const kept = await db.document.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(kept.kind, "QUOTE");
  assert.equal(kept.status, "SENT");
  assert.match(kept.number ?? "", /^DEV-\d{4}-0001$/);
});

test("un client lié à un document ne peut pas être supprimé physiquement", async () => {
  const owner = await register("Org client");
  const { customer, quote } = await sentQuote(owner, "cust");
  const db = getDb();
  await expectDeleteRefused(() => db.customer.delete({ where: { id: customer.id } }));
  const keptCustomer = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
  const keptQuote = await db.document.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(keptCustomer.status, "ACTIVE");
  assert.equal(keptQuote.customerId, customer.id);
});

test("annuler une facture émise est refusé ; le document et le snapshot restent SENT", async () => {
  const owner = await register("Org annulée");
  const { invoice } = await issuedInvoice(owner, "cancel");
  const db = getDb();
  const before = await db.document.findUniqueOrThrow({
    where: { id: invoice.id },
    include: { lines: true },
  });
  assert.equal(before.status, "SENT");
  assert.ok(before.customerNameSnapshot);
  assert.ok(before.issuerNameSnapshot);
  assert.equal(before.lines.length, 1);
  await assert.rejects(
    () => cancelInvoice("OWNER", owner.membership.organizationId, { documentId: invoice.id }, owner.user.id),
    error => error instanceof Error && /avoir/.test(error.message),
  );
  const after = await db.document.findUniqueOrThrow({
    where: { id: invoice.id },
    include: { lines: true },
  });
  assert.equal(after.status, "SENT");
  assert.equal(after.number, before.number);
  assert.equal(after.customerNameSnapshot, before.customerNameSnapshot);
  assert.equal(after.issuerNameSnapshot, before.issuerNameSnapshot);
  assert.equal(after.customerAddressSnapshot, before.customerAddressSnapshot);
  assert.equal(after.htCents, before.htCents);
  assert.equal(after.lines.length, 1);
  assert.equal(after.lines[0].description, before.lines[0].description);
  assert.equal(after.lines[0].ttcCents, before.lines[0].ttcCents);
});

test("annuler un devis change le statut et ne supprime pas la ligne", async () => {
  const owner = await register("Org devis annulé");
  const { quote } = await sentQuote(owner, "q-cancel");
  const cancelled = await cancelQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(cancelled.status, "CANCELLED");
  const kept = await getDb().document.findUniqueOrThrow({
    where: { id: quote.id },
    include: { lines: true },
  });
  assert.equal(kept.status, "CANCELLED");
  assert.match(kept.number ?? "", /^DEV-\d{4}-0001$/);
  assert.equal(kept.lines.length, 1);
});

test("supprimer un devis source ne fait pas disparaître sa facture", async () => {
  const owner = await register("Org source");
  const { quote, invoice } = await issuedInvoice(owner, "src");
  const db = getDb();
  await expectDeleteRefused(() => db.document.delete({ where: { id: quote.id } }));
  const keptInvoice = await db.document.findUniqueOrThrow({ where: { id: invoice.id } });
  const keptQuote = await db.document.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(keptInvoice.kind, "INVOICE");
  assert.equal(keptInvoice.sourceDocumentId, quote.id);
  assert.equal(keptQuote.kind, "QUOTE");
});

test("la numérotation DEV / FA reste séquentielle après les protections FK", async () => {
  const owner = await register("Org numéros");
  const first = await issuedInvoice(owner, "num-1");
  const second = await issuedInvoice(owner, "num-2");
  assert.match(first.quote.number ?? "", /^DEV-\d{4}-0001$/);
  assert.match(first.invoice.number ?? "", /^FA-\d{4}-0001$/);
  assert.match(second.quote.number ?? "", /^DEV-\d{4}-0002$/);
  assert.match(second.invoice.number ?? "", /^FA-\d{4}-0002$/);
});

test("les FK documentaires PostgreSQL sont restrictives sauf pour les lignes", async () => {
  const rows = await getDb().$queryRaw<ForeignKeyRow[]>`
    SELECT
      c.conname,
      c.conrelid::regclass::text AS table_name,
      c.confrelid::regclass::text AS refs,
      pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conname IN (
        'Document_organizationId_fkey',
        'Document_customerId_organizationId_fkey',
        'Document_sourceDocumentId_fkey',
        'Document_creditedInvoiceId_organizationId_fkey',
        'DocumentLine_documentId_fkey',
        'DocumentLine_sourceInvoiceLineId_fkey',
        'DocumentSequence_organizationId_fkey',
        'Payment_organizationId_fkey',
        'Payment_invoiceId_organizationId_fkey'
      )
    ORDER BY c.conname
  `;
  const byName = Object.fromEntries(rows.map(row => [row.conname, row]));
  assert.match(byName.Document_organizationId_fkey.def, /ON DELETE RESTRICT/);
  assert.match(byName.Document_customerId_organizationId_fkey.def, /ON DELETE RESTRICT/);
  assert.match(byName.Document_sourceDocumentId_fkey.def, /ON DELETE RESTRICT/);
  assert.match(byName.Document_creditedInvoiceId_organizationId_fkey.def, /ON DELETE RESTRICT/);
  assert.match(byName.DocumentLine_documentId_fkey.def, /ON DELETE CASCADE/);
  assert.match(byName.DocumentLine_sourceInvoiceLineId_fkey.def, /ON DELETE RESTRICT/);
  assert.match(byName.DocumentSequence_organizationId_fkey.def, /ON DELETE CASCADE/);
  assert.match(byName.Payment_organizationId_fkey.def, /ON DELETE RESTRICT/);
  assert.match(byName.Payment_invoiceId_organizationId_fkey.def, /ON DELETE RESTRICT/);
});

test("une facture liée à un avoir ne peut pas être supprimée physiquement", async () => {
  const owner = await register("Org avoir FK");
  const { invoice } = await issuedInvoice(owner, "credit-fk");
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "TOTAL" }, owner.user.id);
  const issued = await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  const db = getDb();
  await expectDeleteRefused(() => db.document.delete({ where: { id: invoice.id } }));
  const keptInvoice = await db.document.findUniqueOrThrow({ where: { id: invoice.id } });
  const keptNote = await db.document.findUniqueOrThrow({ where: { id: issued.id } });
  assert.equal(keptInvoice.kind, "INVOICE");
  assert.equal(keptInvoice.status, "SENT");
  assert.equal(keptNote.kind, "CREDIT_NOTE");
  assert.equal(keptNote.status, "SENT");
  assert.match(keptNote.number ?? "", /^AV-\d{4}-0001$/);
});

test("une facture liée à un paiement ne peut pas être supprimée ; l’annulation conserve le paiement", async () => {
  const owner = await register("Org paiement FK");
  const { invoice } = await issuedInvoice(owner, "pay-fk");
  const payment = await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 100, method: "CASH" }, owner.user.id);
  const db = getDb();
  await expectDeleteRefused(() => db.document.delete({ where: { id: invoice.id } }));
  const cancelled = await cancelPayment("OWNER", owner.membership.organizationId, { paymentId: payment.id }, owner.user.id);
  assert.equal(cancelled.status, "CANCELLED");
  const keptPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
  const keptInvoice = await db.document.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(keptPayment.status, "CANCELLED");
  assert.equal(keptPayment.amountCents, payment.amountCents);
  assert.equal(keptInvoice.id, invoice.id);
  await expectDeleteRefused(() => db.document.delete({ where: { id: invoice.id } }));
});
