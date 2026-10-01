import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { acceptInvitation, changeMemberRole, inviteMember, listTeam, previewInvitation, removeMember, revokeInvitation } from "../apps/web/src/lib/auth/team";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `team-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";
async function register(accountType: "INDIVIDUAL" | "BUSINESS" = "BUSINESS") {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Compte test", accountType, ...(accountType === "BUSINESS" ? { organizationName: "Entreprise équipe" } : {}) }, `${tag}:${email}`);
  const user = await completeAuth(token, await codeFor(token.split(".")[0], 1), `${tag}:${email}`);
  assert.ok(user);
  return { email, user };
}
async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}
async function inviteLink(email: string) {
  const files = (await readdir(process.env.LOCAL_MAIL_DIR!)).filter(file => file.startsWith("invite-"));
  const mails = await Promise.all(files.map(async file => JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, file), "utf8"))));
  const latest = mails.filter(mail => mail.to === email).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return /#([0-9a-f-]{36}\.[A-Za-z0-9_-]{43})/.exec(latest.text)![1];
}
after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: memberships.map(item => item.organizationId) } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});
test("le propriétaire invite, l’invité crée un compte entreprise sans organisation propre", async () => {
  const owner = await register();
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: owner.user.id } });
  const invitedEmail = `${tag}-invite@example.test`;
  emails.push(invitedEmail);
  await inviteMember(owner.user.id, membership.organizationId, "OWNER", { email: invitedEmail, role: "MEMBER" }, tag);
  const token = await inviteLink(invitedEmail);
  const preview = await previewInvitation(token);
  assert.equal(preview.status, "signup");
  assert.equal(preview.role, "MEMBER");
  await acceptInvitation(token, { token, name: "Invité Test", password, confirmation: password }, tag);
  const invited = await getDb().user.findUniqueOrThrow({ where: { email: invitedEmail } });
  assert.equal(invited.accountType, "BUSINESS");
  assert.equal(await getDb().membership.count({ where: { userId: invited.id, organizationId: membership.organizationId, role: "MEMBER" } }), 1);
  assert.equal(await getDb().organization.count({ where: { memberships: { some: { userId: invited.id } }, id: { not: membership.organizationId } } }), 0);
  await assert.rejects(() => acceptInvitation(token, { token, name: "Invité Test", password, confirmation: password }, tag), AuthFlowError);
});
test("un particulier, un membre déjà présent et un rôle interdit sont refusés", async () => {
  const owner = await register();
  const individual = await register("INDIVIDUAL");
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: owner.user.id } });
  await assert.rejects(() => inviteMember(owner.user.id, membership.organizationId, "OWNER", { email: individual.email, role: "MEMBER" }, `${tag}-ind`), AuthFlowError);
  await assert.rejects(() => inviteMember(owner.user.id, membership.organizationId, "OWNER", { email: owner.email, role: "MEMBER" }, `${tag}-self`), AuthFlowError);
  await assert.rejects(() => inviteMember(owner.user.id, membership.organizationId, "ADMIN", { email: `${tag}-x@example.test`, role: "ADMIN" }, `${tag}-admin`), AuthFlowError);
});
test("une nouvelle invitation invalide la précédente ; un lien modifié est refusé", async () => {
  const owner = await register();
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: owner.user.id } });
  const invitedEmail = `${tag}-rotate@example.test`;
  emails.push(invitedEmail);
  await inviteMember(owner.user.id, membership.organizationId, "OWNER", { email: invitedEmail, role: "ADMIN" }, `${tag}-r1`);
  const first = await inviteLink(invitedEmail);
  await inviteMember(owner.user.id, membership.organizationId, "OWNER", { email: invitedEmail, role: "MEMBER" }, `${tag}-r2`);
  const second = await inviteLink(invitedEmail);
  assert.notEqual(first, second);
  await assert.rejects(() => previewInvitation(first), AuthFlowError);
  const preview = await previewInvitation(second);
  assert.equal(preview.role, "MEMBER");
  await assert.rejects(() => previewInvitation(`${second.slice(0, -1)}a`), AuthFlowError);
});
test("changement de rôle, révocation et retrait respectent la matrice", async () => {
  const owner = await register();
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: owner.user.id } });
  const invitedEmail = `${tag}-role@example.test`;
  emails.push(invitedEmail);
  await inviteMember(owner.user.id, membership.organizationId, "OWNER", { email: invitedEmail, role: "MEMBER" }, `${tag}-role`);
  const token = await inviteLink(invitedEmail);
  await acceptInvitation(token, { token, name: "Collaborateur", password, confirmation: password }, tag);
  const invited = await getDb().user.findUniqueOrThrow({ where: { email: invitedEmail } });
  const invitedMembership = await getDb().membership.findFirstOrThrow({ where: { userId: invited.id } });
  await changeMemberRole("OWNER", membership.organizationId, { membershipId: invitedMembership.id, role: "ACCOUNTANT" });
  assert.equal((await getDb().membership.findUniqueOrThrow({ where: { id: invitedMembership.id } })).role, "ACCOUNTANT");
  await assert.rejects(() => changeMemberRole("ADMIN", membership.organizationId, { membershipId: membership.id, role: "MEMBER" }), AuthFlowError);
  await assert.rejects(() => removeMember(owner.user.id, "OWNER", membership.organizationId, membership.id), AuthFlowError);
  await removeMember(owner.user.id, "OWNER", membership.organizationId, invitedMembership.id);
  assert.equal(await getDb().membership.count({ where: { id: invitedMembership.id } }), 0);
  await inviteMember(owner.user.id, membership.organizationId, "OWNER", { email: `${tag}-pending@example.test`, role: "MEMBER" }, `${tag}-pending`);
  emails.push(`${tag}-pending@example.test`);
  const pending = (await listTeam(membership.organizationId)).invitations[0];
  await revokeInvitation("OWNER", membership.organizationId, pending.id);
  assert.equal((await listTeam(membership.organizationId)).invitations.length, 0);
});
test("un compte existant doit être connecté pour accepter", async () => {
  const owner = await register();
  const other = await register();
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: owner.user.id } });
  await inviteMember(owner.user.id, membership.organizationId, "OWNER", { email: other.email, role: "MEMBER" }, `${tag}-exist`);
  const token = await inviteLink(other.email);
  assert.equal((await previewInvitation(token)).status, "login");
  await assert.rejects(() => acceptInvitation(token, { token }, tag), AuthFlowError);
  assert.equal((await previewInvitation(token, { id: other.user.id, email: other.email })).status, "join");
  await acceptInvitation(token, { token }, tag, { id: other.user.id, email: other.email });
  assert.equal(await getDb().membership.count({ where: { userId: other.user.id, organizationId: membership.organizationId } }), 1);
  assert.equal(await getDb().membership.count({ where: { userId: other.user.id } }), 2);
});
