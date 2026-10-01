import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { createCustomer } from "../apps/web/src/lib/customers/service";
import { acceptQuote, createQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { cancelInvoice, convertQuoteToInvoice, listInvoices } from "../apps/web/src/lib/invoices/service";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `invoice-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Entreprise factures") {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Compte test", accountType: "BUSINESS", organizationName }, `${tag}:${email}`);
  const user = await completeAuth(token, await codeFor(token.split(".")[0], 1), `${tag}:${email}`);
  assert.ok(user);
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: user.id } });
  return { email, user, membership };
}

async function acceptedQuote(owner: Awaited<ReturnType<typeof register>>, displayName: string, suffix: string) {
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName, kind: "CLIENT" }, `${tag}-${suffix}-c`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Prestation",
    description: "Intervention",
    quantity: 1,
    unitPriceCents: 1000,
    vatBps: 2000,
  }, `${tag}-${suffix}-q`, owner.user.id);
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  return quote;
}

async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}

after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, sourceDocumentId: { not: null } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("un devis accepté devient une facture numérotée, une seule fois", async () => {
  const owner = await register();
  const quote = await acceptedQuote(owner, "Atelier Facture", "once");
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(invoice.kind, "INVOICE");
  assert.equal(invoice.status, "SENT");
  assert.equal(invoice.sourceDocumentId, quote.id);
  assert.equal(invoice.ttcCents, 120000);
  assert.match(invoice.number ?? "", /^FA-\d{4}-0001$/);
  const listed = await listInvoices(owner.membership.organizationId);
  assert.equal(listed.length, 1);
  await assert.rejects(
    () => convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id),
    AuthFlowError,
  );
  await assert.rejects(
    () => cancelInvoice("OWNER", owner.membership.organizationId, { documentId: invoice.id }, owner.user.id),
    error => error instanceof AuthFlowError && error.status === 409 && /avoir/.test(error.message),
  );
  const kept = await getDb().document.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(kept.status, "SENT");
});

test("la conversion refuse un brouillon, isole les entreprises et bloque le comptable", async () => {
  const first = await register("Entreprise A");
  const second = await register("Entreprise B");
  const customer = await createCustomer("OWNER", first.membership.organizationId, { displayName: "Client isolé", kind: "CLIENT" }, `${tag}-iso-c`);
  const draft = await createQuote("OWNER", first.membership.organizationId, {
    customerId: customer.id,
    title: "Brouillon",
    description: "Ligne",
    quantity: 1,
    unitPriceCents: 100,
    vatBps: 2000,
  }, `${tag}-draft`, first.user.id);
  await assert.rejects(
    () => convertQuoteToInvoice("OWNER", first.membership.organizationId, { documentId: draft.id }, first.user.id),
    AuthFlowError,
  );
  const quote = await acceptedQuote(first, "Client converti", "iso");
  await assert.rejects(
    () => convertQuoteToInvoice("OWNER", second.membership.organizationId, { documentId: quote.id }, second.user.id),
    AuthFlowError,
  );
  const accountantEmail = `${tag}-acc@example.test`;
  emails.push(accountantEmail);
  const accountant = await getDb().user.create({ data: { email: accountantEmail, accountType: "BUSINESS", name: "Comptable" } });
  await getDb().membership.create({ data: { userId: accountant.id, organizationId: first.membership.organizationId, role: "ACCOUNTANT" } });
  await assert.rejects(
    () => convertQuoteToInvoice("ACCOUNTANT", first.membership.organizationId, { documentId: quote.id }, accountant.id),
    AuthFlowError,
  );
  const invoice = await convertQuoteToInvoice("OWNER", first.membership.organizationId, { documentId: quote.id }, first.user.id);
  assert.match(invoice.number ?? "", /^FA-\d{4}-0001$/);
  const foreign = await listInvoices(second.membership.organizationId);
  assert.equal(foreign.length, 0);
});
