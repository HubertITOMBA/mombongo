import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { getDb } from "../apps/web/src/lib/db";
import { DEMO_DATASET_KEY, DEMO_PASSWORD } from "../apps/web/src/lib/demo/guard";
import { inspectDemoDataset, seedDemoDataset } from "../apps/web/src/lib/demo/seed";
import { purgeDemoDataset } from "../apps/web/src/lib/demo/purge";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `demo-${randomUUID()}`;
const key = `mombongo-demo-test-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName: string) {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Compte hors demo", accountType: "BUSINESS", organizationName }, `${tag}:${email}`);
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
  await purgeDemoDataset(key).catch(() => undefined);
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.documentEmailDelivery.deleteMany({ where: { organizationId: { in: organizationIds } } });
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

test("seed et purge DEMO sont refusés en production", async () => {
  process.env.MOMBONGO_ENV = "production";
  await assert.rejects(() => seedDemoDataset(key), /interdites en production/);
  await assert.rejects(() => purgeDemoDataset(key), /interdites en production/);
  delete process.env.MOMBONGO_ENV;
  assert.notEqual(DEMO_DATASET_KEY, key);
  assert.equal(DEMO_PASSWORD, "motdepasse");
});

test("le seed DEMO produit un dataset cohérent, rejouable, sans e-mail automatique", async () => {
  const first = await seedDemoDataset(key);
  assert.equal(first.customers, 40);
  assert.equal(first.persons, 15);
  assert.equal(first.companies, 25);
  assert.ok(first.clients >= 1);
  assert.ok(first.prospects >= 1);
  assert.ok(first.quotes >= 5);
  assert.ok(first.invoices >= 5);
  assert.ok(first.creditNotes >= 2);
  assert.ok(first.payments >= 2);
  assert.equal(first.users.length, 4);
  const deliveries = await getDb().documentEmailDelivery.count({ where: { organizationId: first.organizationId } });
  assert.equal(deliveries, 0);
  const statuses = await getDb().document.groupBy({
    by: ["kind", "status"],
    where: { organizationId: first.organizationId },
    _count: true,
  });
  assert.ok(statuses.some(row => row.kind === "QUOTE" && row.status === "DRAFT"));
  assert.ok(statuses.some(row => row.kind === "QUOTE" && row.status === "SENT"));
  assert.ok(statuses.some(row => row.kind === "QUOTE" && row.status === "ACCEPTED"));
  assert.ok(statuses.some(row => row.kind === "QUOTE" && row.status === "REFUSED"));
  assert.ok(statuses.some(row => row.kind === "QUOTE" && row.status === "CANCELLED"));
  assert.ok(statuses.some(row => row.kind === "INVOICE" && row.status === "SENT"));
  assert.ok(statuses.some(row => row.kind === "CREDIT_NOTE" && row.status === "SENT"));
  const currencies = await getDb().document.findMany({
    where: { organizationId: first.organizationId, kind: "INVOICE" },
    select: { issuerCurrencySnapshot: true },
  });
  assert.ok(currencies.some(row => row.issuerCurrencySnapshot === "CHF"));
  const replay = await seedDemoDataset(key);
  assert.equal(replay.customers, first.customers);
  assert.equal(replay.persons, 15);
  assert.equal(replay.companies, 25);
  assert.equal(replay.quotes, first.quotes);
  assert.equal(replay.invoices, first.invoices);
  assert.equal(replay.creditNotes, first.creditNotes);
});

test("la purge retire uniquement le dataset DEMO et reste idempotente", async () => {
  const kept = await register("Organisation réelle");
  await seedDemoDataset(key);
  const demoOrgId = (await getDb().organization.findFirstOrThrow({ where: { demoDatasetKey: key } })).id;
  const firstPurge = await purgeDemoDataset(key);
  assert.equal(firstPurge.organizations, 1);
  assert.equal(firstPurge.users, 4);
  assert.equal(firstPurge.customers, 40);
  assert.equal(await getDb().organization.count({ where: { id: demoOrgId } }), 0);
  assert.equal(await getDb().organization.count({ where: { id: kept.membership.organizationId } }), 1);
  assert.equal(await getDb().user.count({ where: { email: kept.email } }), 1);
  const empty = await inspectDemoDataset(key);
  assert.equal(empty.organizations, 0);
  const second = await purgeDemoDataset(key);
  assert.equal(second.organizations, 0);
  assert.equal(second.users, 0);
});
