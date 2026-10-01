import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { addAddress, createCustomer, updateAddress, updateCustomer } from "../apps/web/src/lib/customers/service";
import { acceptQuote, createQuote, getQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { convertQuoteToInvoice, getInvoice } from "../apps/web/src/lib/invoices/service";
import { backfillIssuedDocumentSnapshots, documentCustomerLabel } from "../apps/web/src/lib/documents/snapshot";
import { getDb } from "../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `snap-${randomUUID()}`;
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

const addressA = {
  type: "BILLING" as const,
  label: "Siège",
  line1: "10 rue A",
  postalCode: "75011",
  city: "Paris",
  countryCode: "FR" as const,
};

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

test("le devis émis conserve le nom client après modification de la fiche", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Dupont SARL", kind: "CLIENT" }, `${tag}-name`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Mission",
    description: "Conseil",
    quantity: 1,
    unitPriceCents: 1000,
    vatBps: 2000,
  }, `${tag}-qn`, owner.user.id);
  assert.equal(quote.customerNameSnapshot, null);
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(sent.customerNameSnapshot, "Dupont SARL");
  await updateCustomer("OWNER", owner.membership.organizationId, { customerId: customer.id, displayName: "Dupont Conseil", kind: "CLIENT" });
  const loaded = await getQuote(owner.membership.organizationId, quote.id);
  assert.equal(loaded.customerNameSnapshot, "Dupont SARL");
  assert.equal(documentCustomerLabel(loaded), "Dupont SARL");
  assert.equal(loaded.customer.displayName, "Dupont Conseil");
});

test("l’adresse snapshotée reste celle de l’émission", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Atelier Adresse", kind: "CLIENT" }, `${tag}-addr`);
  const created = await addAddress("OWNER", owner.membership.organizationId, { customerId: customer.id, ...addressA });
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Adresse",
    description: "Ligne",
    quantity: 1,
    unitPriceCents: 100,
    vatBps: 2000,
  }, `${tag}-qa`, owner.user.id);
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.match(sent.customerAddressSnapshot ?? "", /10 rue A/);
  await updateAddress("OWNER", owner.membership.organizationId, {
    addressId: created.id,
    type: "BILLING",
    label: "Siège",
    line1: "20 rue B",
    postalCode: "69001",
    city: "Lyon",
    countryCode: "FR",
  });
  const loaded = await getQuote(owner.membership.organizationId, quote.id);
  assert.match(loaded.customerAddressSnapshot ?? "", /10 rue A/);
  assert.doesNotMatch(loaded.customerAddressSnapshot ?? "", /20 rue B/);
});

test("la facture copie le snapshot du devis, pas la fiche actuelle", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Dupont SARL", kind: "CLIENT" }, `${tag}-inv`);
  await addAddress("OWNER", owner.membership.organizationId, { customerId: customer.id, ...addressA });
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Prestation",
    description: "Intervention historique",
    quantity: 2,
    unitPriceCents: 500,
    vatBps: 2000,
  }, `${tag}-qi`, owner.user.id);
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await updateCustomer("OWNER", owner.membership.organizationId, { customerId: customer.id, displayName: "Dupont Holding", kind: "CLIENT" });
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(invoice.customerNameSnapshot, "Dupont SARL");
  assert.match(invoice.customerAddressSnapshot ?? "", /10 rue A/);
  const loaded = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(documentCustomerLabel(loaded), "Dupont SARL");
  assert.equal(loaded.customer.displayName, "Dupont Holding");
  assert.deepEqual(loaded.lines.map(line => ({
    description: line.description,
    quantity: Number(line.quantity),
    unitPriceCents: line.unitPriceCents,
    vatBps: line.vatBps,
    htCents: line.htCents,
    ttcCents: line.ttcCents,
  })), [{
    description: "Intervention historique",
    quantity: 2,
    unitPriceCents: 50000,
    vatBps: 2000,
    htCents: 100000,
    ttcCents: 120000,
  }]);
});

test("l’émetteur snapshoté reste celui de l’émission", async () => {
  const owner = await register("Société A");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Client", kind: "CLIENT" }, `${tag}-org`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Émetteur",
    description: "Ligne",
    quantity: 1,
    unitPriceCents: 100,
    vatBps: 2000,
  }, `${tag}-qo`, owner.user.id);
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(sent.issuerNameSnapshot, "Société A");
  await getDb().organization.update({ where: { id: owner.membership.organizationId }, data: { name: "Société B" } });
  const loaded = await getQuote(owner.membership.organizationId, quote.id);
  assert.equal(loaded.issuerNameSnapshot, "Société A");
});

test("un document legacy émis reçoit un backfill depuis l’état actuel, sans prétendre à l’historique", async () => {
  const owner = await register("Legacy Org");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Nom actuel", kind: "CLIENT" }, `${tag}-leg`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Ancien",
    description: "Ligne",
    quantity: 1,
    unitPriceCents: 100,
    vatBps: 2000,
  }, `${tag}-ql`, owner.user.id);
  await getDb().document.update({
    where: { id: quote.id },
    data: { status: "SENT", number: "DEV-2026-0099", issuedAt: new Date() },
  });
  const before = await getQuote(owner.membership.organizationId, quote.id);
  assert.equal(before.customerNameSnapshot, null);
  assert.equal(documentCustomerLabel(before), "Nom actuel");
  const filled = await backfillIssuedDocumentSnapshots();
  assert.ok(filled >= 1);
  const after = await getQuote(owner.membership.organizationId, quote.id);
  assert.equal(after.customerNameSnapshot, "Nom actuel");
  assert.equal(after.issuerNameSnapshot, "Legacy Org");
});
