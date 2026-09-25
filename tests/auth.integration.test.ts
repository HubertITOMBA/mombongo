import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth, resendCode } from "../apps/web/src/lib/auth/service";
import { requestPasswordReset, resetPassword } from "../apps/web/src/lib/auth/password-reset";
import { getDb } from "../apps/web/src/lib/db";
import { rateLimit } from "../apps/web/src/lib/auth/rate-limit";
import { assertMailConfigured } from "../apps/web/src/lib/auth/mail";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `test-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";
async function register(accountType: "INDIVIDUAL" | "BUSINESS" = "BUSINESS") {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Compte test", accountType, ...(accountType === "BUSINESS" ? { organizationName: "Entreprise test" } : {}) }, `${tag}:${email}`);
  const id = token.split(".")[0];
  return { email, token, id, code: await codeFor(id, 1) };
}
async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}
after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: memberships.map(m => m.organizationId) } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});
test("aucun compte ni session avant code ; un seul succès concurrent et une entreprise", async () => {
  const r = await register();
  assert.equal(await getDb().user.findUnique({ where: { email: r.email } }), null);
  const result = await Promise.all([completeAuth(r.token, r.code, tag), completeAuth(r.token, r.code, tag)]);
  assert.equal(result.filter(Boolean).length, 1);
  const user = result.find(Boolean)!;
  assert.equal(await getDb().authSession.count({ where: { userId: user.id } }), 1);
  assert.equal(await getDb().membership.count({ where: { userId: user.id, role: "OWNER" } }), 1);
  assert.equal(await completeAuth(r.token, r.code, tag), null);
  const stored = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
  assert.ok(stored.passwordHash?.startsWith("$argon2id$"));
  assert.ok(stored.emailVerified);
  assert.equal(stored.accountType, "BUSINESS");
});
test("cinq erreurs persistent et bloquent même le bon code", async () => {
  const r = await register();
  const wrong = r.code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal(await completeAuth(r.token, wrong, tag), null);
  assert.equal(await completeAuth(r.token, r.code, tag), null);
  assert.equal((await getDb().authChallenge.findUniqueOrThrow({ where: { id: r.id } })).attempts, 5);
});
test("un code expiré ou un autre navigateur ne valide pas la connexion", async () => {
  const r = await register();
  const foreignToken = `${r.id}.${"a".repeat(43)}`;
  assert.equal(await completeAuth(foreignToken, r.code, tag), null);
  await getDb().authChallenge.update({ where: { id: r.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await completeAuth(r.token, r.code, tag), null);
});
test("renvoi limité, rotation du code et conservation des tentatives", async () => {
  const r = await register();
  await assert.rejects(resendCode(r.token, tag), /minute/);
  await getDb().authChallenge.update({ where: { id: r.id }, data: { lastSentAt: new Date(Date.now() - 61_000), attempts: 2 } });
  await resendCode(r.token, tag);
  const next = await codeFor(r.id, 2);
  const challenge = await getDb().authChallenge.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(challenge.attempts, 2);
  if (next !== r.code) assert.equal(await completeAuth(r.token, r.code, tag), null);
  assert.ok(await completeAuth(r.token, next, tag));
});
test("nouvelle demande invalide le code précédent ; mauvais mot de passe refusé", async () => {
  const r = await register();
  const user = await completeAuth(r.token, r.code, tag);
  assert.ok(user);
  await assert.rejects(beginAuth("login", { email: r.email, password: "incorrect" }, tag), /incorrect/);
  const first = await beginAuth("login", { email: r.email, password }, tag);
  const second = await beginAuth("login", { email: r.email, password }, tag);
  assert.equal(await completeAuth(first, await codeFor(first.split(".")[0], 1), tag), null);
  assert.ok(await completeAuth(second, await codeFor(second.split(".")[0], 1), tag));
});
test("compteur PostgreSQL atomique sous requêtes concurrentes", async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => rateLimit("test", tag, 3)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 3);
});
test("la boîte mail locale est interdite en production", () => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try { assert.throws(assertMailConfigured, /Configurez Resend/); }
  finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; }
});

test("une réinscription ne remplace ni le compte ni son mot de passe", async () => {
  const r = await register();
  const user = await completeAuth(r.token, r.code, tag);
  assert.ok(user);
  const before = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
  const fakeToken = await beginAuth("register", { email: r.email, accountType: "BUSINESS", password: "Autre phrase de passe 123!", name: "Autre nom", organizationName: "Autre entreprise" }, tag);
  assert.equal(await getDb().authChallenge.findUnique({ where: { id: fakeToken.split(".")[0] } }), null);
  const after = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(after.passwordHash, before.passwordHash);
  assert.equal(after.name, before.name);
});
test("une adresse ne peut pas référencer un client d’une autre entreprise", async () => {
  const first = await register();
  const second = await register();
  const a = await completeAuth(first.token, first.code, tag);
  const b = await completeAuth(second.token, second.code, tag);
  const tenantA = await getDb().membership.findFirstOrThrow({ where: { userId: a!.id } });
  const tenantB = await getDb().membership.findFirstOrThrow({ where: { userId: b!.id } });
  await assert.rejects(getDb().$transaction(async tx => {
    const customer = await tx.customer.create({ data: { organizationId: tenantA.organizationId, displayName: "Client de test" } });
    await tx.address.create({ data: { customerId: customer.id, organizationId: tenantB.organizationId, type: "BILLING", label: "Facturation", line1: "1 rue Test", postalCode: "75001", city: "Paris", countryCode: "FR" } });
  }), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2003");
});

test("un particulier peut créer son compte sans entreprise et se reconnecter", async () => {
  const r = await register("INDIVIDUAL");
  const challenge = await getDb().authChallenge.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(challenge.accountType, "INDIVIDUAL");
  assert.equal(challenge.organizationName, null);
  assert.equal(await getDb().user.findUnique({ where: { email: r.email } }), null);
  const user = await completeAuth(r.token, r.code, tag);
  assert.ok(user);
  const stored = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(stored.accountType, "INDIVIDUAL");
  assert.equal(await getDb().membership.count({ where: { userId: user.id } }), 0);
  const login = await beginAuth("login", { email: r.email, password, accountType: "BUSINESS" }, tag);
  const session = await completeAuth(login, await codeFor(login.split(".")[0], 1), tag);
  assert.equal(session?.id, user.id);
  assert.equal((await getDb().user.findUniqueOrThrow({ where: { id: user.id } })).accountType, "INDIVIDUAL");
});
test("validation du type obligatoire et du nom d’entreprise côté serveur", async () => {
  const base = { email: `${tag}-validation@example.test`, password, name: "Compte test" };
  await assert.rejects(beginAuth("register", base, `${tag}:validation`), /Vérifiez/);
  await assert.rejects(beginAuth("register", { ...base, accountType: "ADMIN" }, `${tag}:validation`), /Vérifiez/);
  await assert.rejects(beginAuth("register", { ...base, accountType: "BUSINESS" }, `${tag}:validation`), /Vérifiez/);
});

async function resetLink(email: string) {
  await requestPasswordReset({ email }, tag);
  const files = (await readdir(process.env.LOCAL_MAIL_DIR!)).filter(f => f.startsWith("reset-"));
  const messages = await Promise.all(files.map(async f => JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, f), "utf8"))));
  const latest = messages.filter(m => m.to === email).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
  return new URL(/https?:\/\/\S+/.exec(latest.text)![0]).hash.slice(1);
}
const replacementPassword = "Ma nouvelle phrase de passe 456!";
const resetBody = (token: string) => ({ token, password: replacementPassword, confirmation: replacementPassword });
test("réinitialisation unique : sessions et codes supprimés, ancien mot de passe refusé", async () => {
  const r = await register("INDIVIDUAL");
  const user = await completeAuth(r.token, r.code, `${tag}:reset`);
  assert.ok(user);
  const pending = await beginAuth("login", { email: r.email, password }, tag);
  const token = await resetLink(r.email);
  const before = await getDb().passwordReset.findUniqueOrThrow({ where: { id: token.split(".")[0] } });
  assert.notEqual(before.tokenHash, token);
  assert.equal(await getDb().authSession.count({ where: { userId: user.id } }), 1);
  const outcomes = await Promise.allSettled([resetPassword(resetBody(token), tag), resetPassword(resetBody(token), tag)]);
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await getDb().authSession.count({ where: { userId: user.id } }), 0);
  assert.equal(await completeAuth(pending, await codeFor(pending.split(".")[0], 1), `${tag}:reset`), null);
  await assert.rejects(beginAuth("login", { email: r.email, password }, tag), /incorrect/);
  const login = await beginAuth("login", { email: r.email, password: replacementPassword }, tag);
  assert.ok(await completeAuth(login, await codeFor(login.split(".")[0], 1), `${tag}:reset`));
});
test("lien expiré, modifié, ancien ou mots de passe différents refusés", async () => {
  const r = await register();
  await completeAuth(r.token, r.code, `${tag}:reset`);
  const old = await resetLink(r.email);
  const token = await resetLink(r.email);
  await assert.rejects(resetPassword(resetBody(old), tag), /invalide/);
  await assert.rejects(resetPassword({ ...resetBody(token), confirmation: "Une autre phrase suffisamment longue" }, tag), /identiques/);
  const changed = `${token.split(".")[0]}.${"a".repeat(43)}`;
  await assert.rejects(resetPassword(resetBody(changed), tag), /invalide/);
  await getDb().passwordReset.update({ where: { id: token.split(".")[0] }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(resetPassword(resetBody(token), tag), /expiré/);
});
test("une adresse inconnue retourne le même résultat sans email ni compte créé", async () => {
  const before = (await readdir(process.env.LOCAL_MAIL_DIR!)).length;
  const email = `${tag}-unknown@example.test`;
  assert.equal(await requestPasswordReset({ email }, tag), undefined);
  assert.equal((await readdir(process.env.LOCAL_MAIL_DIR!)).length, before);
  assert.equal(await getDb().user.findUnique({ where: { email } }), null);
});
test("réinitialisation concurrente à un code valide ne laisse aucune session ancienne", async () => {
  const r = await register();
  const user = await completeAuth(r.token, r.code, `${tag}:reset`);
  const login = await beginAuth("login", { email: r.email, password }, tag);
  const token = await resetLink(r.email);
  await Promise.all([
    completeAuth(login, await codeFor(login.split(".")[0], 1), `${tag}:reset`),
    resetPassword(resetBody(token), tag),
  ]);
  assert.equal(await getDb().authSession.count({ where: { userId: user!.id } }), 0);
});
