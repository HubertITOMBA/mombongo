import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { createCustomer, getCustomer } from "../apps/web/src/lib/customers/service";
import { acceptQuote, addQuoteLine, createQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `quote-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Entreprise devis") {
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

after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("un devis brouillon calcule HT, TVA et TTC, puis reçoit un numéro à l’envoi", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Atelier Devis", kind: "CLIENT" }, `${tag}-c`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Site vitrine",
    description: "Conception",
    quantity: 1,
    unitPriceCents: 1000,
    vatBps: 2000,
  }, `${tag}-q1`, owner.user.id);
  assert.equal(quote.status, "DRAFT");
  assert.equal(quote.htCents, 100000);
  assert.equal(quote.vatCents, 20000);
  assert.equal(quote.ttcCents, 120000);
  await addQuoteLine("OWNER", owner.membership.organizationId, {
    documentId: quote.id,
    description: "Hébergement",
    quantity: 1,
    unitPriceCents: 100,
    vatBps: 2000,
  });
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(sent.status, "SENT");
  assert.match(sent.number ?? "", /^DEV-\d{4}-0001$/);
  const second = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Second",
    description: "Ligne",
    quantity: 1,
    unitPriceCents: 50,
    vatBps: 2000,
  }, `${tag}-q2`, owner.user.id);
  const sentSecond = await sendQuote("OWNER", owner.membership.organizationId, { documentId: second.id }, owner.user.id);
  assert.match(sentSecond.number ?? "", /^DEV-\d{4}-0002$/);
});

test("l’acceptation d’un devis convertit le prospect et isole les entreprises", async () => {
  const first = await register("Entreprise A");
  const second = await register("Entreprise B");
  const prospect = await createCustomer("OWNER", first.membership.organizationId, { displayName: "Prospect Devis", kind: "PROSPECT" }, `${tag}-p`);
  const quote = await createQuote("OWNER", first.membership.organizationId, {
    customerId: prospect.id,
    title: "Offre",
    description: "Prestation",
    quantity: 2,
    unitPriceCents: 200,
    vatBps: 2000,
  }, `${tag}-iso`, first.user.id);
  await sendQuote("OWNER", first.membership.organizationId, { documentId: quote.id }, first.user.id);
  await acceptQuote("OWNER", first.membership.organizationId, { documentId: quote.id }, first.user.id);
  const converted = await getCustomer(first.membership.organizationId, prospect.id);
  assert.equal(converted.kind, "CLIENT");
  assert.equal(converted.stage, "WON");
  await assert.rejects(
    () => sendQuote("OWNER", second.membership.organizationId, { documentId: quote.id }, second.user.id),
    AuthFlowError,
  );
  const accountantEmail = `${tag}-acc@example.test`;
  emails.push(accountantEmail);
  const accountant = await getDb().user.create({ data: { email: accountantEmail, accountType: "BUSINESS", name: "Comptable" } });
  await getDb().membership.create({ data: { userId: accountant.id, organizationId: first.membership.organizationId, role: "ACCOUNTANT" } });
  await assert.rejects(
    () => createQuote("ACCOUNTANT", first.membership.organizationId, {
      customerId: prospect.id,
      title: "Interdit",
      description: "Ligne",
      quantity: 1,
      unitPriceCents: 10,
      vatBps: 2000,
    }, `${tag}-acc`, accountant.id),
    AuthFlowError,
  );
});
