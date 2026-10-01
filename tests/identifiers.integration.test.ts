import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { ACTIVE_ORG_COOKIE, LEGACY_ACTIVE_ORG_COOKIE, pickActiveOrganizationCookie, resolveOrganizationContext } from "../apps/web/src/lib/auth/organization";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { GET as health } from "../apps/web/src/app/api/v1/health/route";
import { CHALLENGE_COOKIE, LEGACY_CHALLENGE_COOKIE } from "../apps/web/src/lib/auth/crypto";
import { clearMigrated, legacySessionKeys, readWithMigration, sessionKeys, writeMigrated, type TokenStore } from "../apps/mobile/src/migrate-store";
import { getDb } from "../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `ids-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

function memoryStore(initial: Record<string, string> = {}): TokenStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async getItemAsync(key) { return data.get(key) ?? null; },
    async setItemAsync(key, value) { data.set(key, value); },
    async deleteItemAsync(key) { data.delete(key); },
  };
}

async function register(organizationName = "Entreprise identifiants") {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Compte test", accountType: "BUSINESS", organizationName }, `${tag}:${email}`);
  const user = await completeAuth(token, await codeFor(token.split(".")[0], 1), `${tag}:${email}`);
  assert.ok(user);
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: user.id } });
  return { user, membership };
}

async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}

after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("le cookie d’organisation legacy est lu, puis migré vers le nom Mombongo", async () => {
  assert.equal(ACTIVE_ORG_COOKIE, "mombongo-active-org");
  assert.equal(LEGACY_ACTIVE_ORG_COOKIE, "facturia-active-org");
  const owner = await register();
  const id = owner.membership.organizationId;
  const fromLegacy = pickActiveOrganizationCookie(null, id);
  assert.equal(fromLegacy.organizationId, id);
  assert.equal(fromLegacy.migrate, true);
  const context = await resolveOrganizationContext(owner.user.id, fromLegacy.organizationId!);
  assert.equal(context.organization.id, id);
  const current = pickActiveOrganizationCookie(id, "c" + "b".repeat(24));
  assert.equal(current.organizationId, id);
  assert.equal(current.migrate, false);
});

test("le cookie d’organisation n’autorise pas une entreprise sans Membership", async () => {
  const first = await register("Entreprise cookie A");
  const second = await register("Entreprise cookie B");
  const picked = pickActiveOrganizationCookie(null, second.membership.organizationId);
  assert.equal(picked.migrate, true);
  await assert.rejects(
    () => resolveOrganizationContext(first.user.id, picked.organizationId!),
    AuthFlowError,
  );
});

test("SecureStore reprend les clés facturia.* vers mombongo.*", async () => {
  const store = memoryStore({
    [legacySessionKeys.access]: "access-legacy",
    [legacySessionKeys.refresh]: "refresh-legacy",
    [legacySessionKeys.organization]: "org-legacy",
  });
  assert.equal(await readWithMigration(store, sessionKeys.access, legacySessionKeys.access), "access-legacy");
  assert.equal(store.data.get(sessionKeys.access), "access-legacy");
  assert.equal(store.data.has(legacySessionKeys.access), false);
  assert.equal(await readWithMigration(store, sessionKeys.refresh, legacySessionKeys.refresh), "refresh-legacy");
  assert.equal(await readWithMigration(store, sessionKeys.organization, legacySessionKeys.organization), "org-legacy");
  store.data.set(legacySessionKeys.access, "ne-pas-reprendre");
  assert.equal(await readWithMigration(store, sessionKeys.access, legacySessionKeys.access), "access-legacy");
  await writeMigrated(store, sessionKeys.refresh, legacySessionKeys.refresh, "refresh-new");
  assert.equal(store.data.get(sessionKeys.refresh), "refresh-new");
  assert.equal(store.data.has(legacySessionKeys.refresh), false);
  await clearMigrated(store, sessionKeys.organization, legacySessionKeys.organization);
  assert.equal(store.data.has(sessionKeys.organization), false);
  assert.equal(store.data.has(legacySessionKeys.organization), false);
});

test("l’API health expose le service mombongo", async () => {
  const body = await health().json();
  assert.equal(body.service, "mombongo");
  assert.equal(body.status, "ok");
  assert.equal(CHALLENGE_COOKIE, "mombongo-challenge");
  assert.equal(LEGACY_CHALLENGE_COOKIE, "facturia-challenge");
});

test("les packages actifs sont @mombongo/*", async () => {
  const root = JSON.parse(await readFile("package.json", "utf8"));
  const web = JSON.parse(await readFile("apps/web/package.json", "utf8"));
  const mobile = JSON.parse(await readFile("apps/mobile/package.json", "utf8"));
  const contracts = JSON.parse(await readFile("packages/contracts/package.json", "utf8"));
  assert.equal(root.name, "mombongo");
  assert.equal(web.name, "@mombongo/web");
  assert.equal(mobile.name, "@mombongo/mobile");
  assert.equal(contracts.name, "@mombongo/contracts");
  assert.equal(web.dependencies["@mombongo/contracts"], "*");
  assert.equal(mobile.dependencies["@mombongo/contracts"], "*");
  const service = await readFile("apps/web/src/lib/customers/service.ts", "utf8");
  assert.doesNotMatch(service, /@facturia\//);
});
