import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { createCustomer } from "../apps/web/src/lib/customers/service";
import { refreshMobileAuth, requireMobileAccount, revokeMobileAuth, startMobileAuth, summarizeAccount, verifyMobileAuth } from "../apps/web/src/lib/auth/mobile";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `mobile-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";
async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}
async function registerMobile() {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const started = await startMobileAuth("register", {
    email, password, name: "Compte mobile", accountType: "BUSINESS", organizationName: "Atelier Mobile",
  }, `${tag}:${email}`);
  const tokens = await verifyMobileAuth({
    challengeToken: started.challengeToken,
    code: await codeFor(started.challengeToken.split(".")[0], 1),
  }, `${tag}:${email}`);
  return { email, tokens };
}
after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});
test("inscription mobile : code, jetons, profil et tableau de bord", async () => {
  const { tokens } = await registerMobile();
  assert.ok(tokens.accessToken);
  assert.ok(tokens.refreshToken);
  const account = await requireMobileAccount(`Bearer ${tokens.accessToken}`);
  assert.equal(account.user.accountType, "BUSINESS");
  await createCustomer("OWNER", account.user.memberships[0]!.organization.id, { displayName: "Prospect Mobile", kind: "PROSPECT" }, tag);
  const dashboard = await summarizeAccount(account.user.id);
  assert.equal(dashboard.customers.prospects, 1);
  assert.equal(dashboard.invoices.pending, 0);
});
test("le rafraîchissement tourne ; la réutilisation révoque la famille", async () => {
  const { tokens } = await registerMobile();
  const next = await refreshMobileAuth({ refreshToken: tokens.refreshToken }, `${tag}-r1`);
  assert.notEqual(next.refreshToken, tokens.refreshToken);
  await requireMobileAccount(`Bearer ${next.accessToken}`);
  await assert.rejects(() => refreshMobileAuth({ refreshToken: tokens.refreshToken }, `${tag}-r2`), AuthFlowError);
  await assert.rejects(() => refreshMobileAuth({ refreshToken: next.refreshToken }, `${tag}-r3`), AuthFlowError);
});
test("la déconnexion invalide l’accès et le refresh", async () => {
  const { tokens } = await registerMobile();
  const account = await requireMobileAccount(`Bearer ${tokens.accessToken}`);
  await revokeMobileAuth(account.user.id, account.sessionId, tokens.refreshToken);
  await assert.rejects(() => requireMobileAccount(`Bearer ${tokens.accessToken}`), AuthFlowError);
  await assert.rejects(() => refreshMobileAuth({ refreshToken: tokens.refreshToken }, `${tag}-out`), AuthFlowError);
});
