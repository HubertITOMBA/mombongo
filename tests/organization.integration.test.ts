import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { acceptInvitation, inviteMember } from "../apps/web/src/lib/auth/team";
import { createCustomer, listCustomers } from "../apps/web/src/lib/customers/service";
import { listAccessibleOrganizations, resolveActiveOrganization, resolveOrganizationContext } from "../apps/web/src/lib/auth/organization";
import { requireMobileAccount, requireMobileOrganization, startMobileAuth, summarizeAccount, verifyMobileAuth } from "../apps/web/src/lib/auth/mobile";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `org-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}

async function register(organizationName: string) {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Compte test", accountType: "BUSINESS", organizationName }, `${tag}:${email}`);
  const user = await completeAuth(token, await codeFor(token.split(".")[0], 1), `${tag}:${email}`);
  assert.ok(user);
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: user.id }, include: { organization: true } });
  return { email, user, membership };
}

async function registerIndividual() {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Particulier", accountType: "INDIVIDUAL" }, `${tag}:${email}`);
  const user = await completeAuth(token, await codeFor(token.split(".")[0], 1), `${tag}:${email}`);
  assert.ok(user);
  return { email, user };
}

async function registerMobile(organizationName: string) {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const started = await startMobileAuth("register", {
    email, password, name: "Compte mobile", accountType: "BUSINESS", organizationName,
  }, `${tag}:${email}`);
  const tokens = await verifyMobileAuth({
    challengeToken: started.challengeToken,
    code: await codeFor(started.challengeToken.split(".")[0], 1),
  }, `${tag}:${email}`);
  return { email, tokens };
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
  const organizationIds = memberships.map(item => item.organizationId);
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("un membre de A uniquement ne peut pas demander B", async () => {
  const first = await register("Entreprise A");
  const second = await register("Entreprise B");
  await assert.rejects(
    () => resolveOrganizationContext(first.user.id, second.membership.organizationId),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  await assert.rejects(
    () => resolveActiveOrganization(first.user.id, second.membership.organizationId),
    error => error instanceof AuthFlowError && error.status === 403,
  );
});

test("un identifiant inexistant ou une organisation sans membership est refusé", async () => {
  const owner = await register("Entreprise seule");
  const stranger = await register("Entreprise étrangère");
  await assert.rejects(
    () => resolveOrganizationContext(owner.user.id, randomUUID()),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  await assert.rejects(
    () => resolveOrganizationContext(owner.user.id, "pas-un-identifiant"),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  await assert.rejects(
    () => resolveOrganizationContext(owner.user.id, stranger.membership.organizationId),
    error => error instanceof AuthFlowError && error.status === 403,
  );
});

test("une seule organisation reste sélectionnée sans action supplémentaire", async () => {
  const owner = await register("Entreprise unique");
  const resolved = await resolveActiveOrganization(owner.user.id, null);
  assert.equal(resolved.usedFallback, true);
  assert.equal(resolved.context.organization.id, owner.membership.organizationId);
  const dashboard = await summarizeAccount(owner.user.id);
  assert.equal(dashboard.organizationId, owner.membership.organizationId);
  assert.equal(dashboard.organizations.length, 1);
});

test("le basculement A → B → A isole les données", async () => {
  const first = await register("Atelier A");
  const second = await register("Atelier B");
  await getDb().membership.create({
    data: { userId: first.user.id, organizationId: second.membership.organizationId, role: "MEMBER" },
  });
  await createCustomer("OWNER", first.membership.organizationId, { displayName: "Client A", kind: "CLIENT" }, `${tag}-a`);
  await createCustomer("OWNER", second.membership.organizationId, { displayName: "Client B", kind: "CLIENT" }, `${tag}-b`);
  const activeA = await resolveOrganizationContext(first.user.id, first.membership.organizationId);
  const namesA = (await listCustomers(activeA.organization.id)).map(item => item.displayName);
  assert.deepEqual(namesA, ["Client A"]);
  const activeB = await resolveOrganizationContext(first.user.id, second.membership.organizationId);
  const namesB = (await listCustomers(activeB.organization.id)).map(item => item.displayName);
  assert.deepEqual(namesB, ["Client B"]);
  const backToA = await resolveOrganizationContext(first.user.id, first.membership.organizationId);
  const namesBack = (await listCustomers(backToA.organization.id)).map(item => item.displayName);
  assert.deepEqual(namesBack, ["Client A"]);
  const dashboardA = await summarizeAccount(first.user.id, first.membership.organizationId);
  const dashboardB = await summarizeAccount(first.user.id, second.membership.organizationId);
  assert.equal(dashboardA.customers.clients, 1);
  assert.equal(dashboardA.organizationName, "Atelier A");
  assert.equal(dashboardB.customers.clients, 1);
  assert.equal(dashboardB.organizationName, "Atelier B");
  assert.notEqual(dashboardA.organizationId, dashboardB.organizationId);
});

test("accepter une invitation ajoute B sans retirer A", async () => {
  const first = await register("Maison A");
  const second = await register("Maison B");
  await inviteMember(second.user.id, second.membership.organizationId, "OWNER", { email: first.email, role: "MEMBER" }, `${tag}-inv`);
  const token = await inviteLink(first.email);
  await acceptInvitation(token, { token }, `${tag}-acc`, { id: first.user.id, email: first.email });
  const organizations = await listAccessibleOrganizations(first.user.id);
  assert.equal(organizations.length, 2);
  assert.deepEqual(organizations.map(item => item.name).sort(), ["Maison A", "Maison B"]);
  assert.equal(organizations.filter(item => item.id === first.membership.organizationId).length, 1);
  assert.equal(organizations.filter(item => item.id === second.membership.organizationId).length, 1);
});

test("l’API mobile valide l’organisation demandée et n’utilise plus le premier membership implicitement", async () => {
  const first = await registerMobile("Mobile A");
  const second = await register("Mobile B");
  const account = await requireMobileAccount(`Bearer ${first.tokens.accessToken}`);
  await getDb().membership.create({
    data: { userId: account.user.id, organizationId: second.membership.organizationId, role: "MEMBER" },
  });
  await createCustomer("OWNER", account.user.memberships[0]!.organization.id, { displayName: "Prospect Mobile A", kind: "PROSPECT" }, `${tag}-ma`);
  await createCustomer("OWNER", second.membership.organizationId, { displayName: "Prospect Mobile B", kind: "PROSPECT" }, `${tag}-mb`);
  const orgA = account.user.memberships[0]!.organization.id;
  const orgB = second.membership.organizationId;
  const fallback = await requireMobileOrganization(`Bearer ${first.tokens.accessToken}`, null);
  const contextA = await requireMobileOrganization(`Bearer ${first.tokens.accessToken}`, orgA);
  const contextB = await requireMobileOrganization(`Bearer ${first.tokens.accessToken}`, orgB);
  assert.equal(fallback.organization.id, orgA);
  assert.equal(contextA.organization.id, orgA);
  assert.equal(contextB.organization.id, orgB);
  assert.equal((await summarizeAccount(account.user.id, contextA.organization.id)).customers.prospects, 1);
  assert.equal((await summarizeAccount(account.user.id, contextB.organization.id)).organizationName, "Mobile B");
  await assert.rejects(
    () => requireMobileOrganization(`Bearer ${first.tokens.accessToken}`, randomUUID()),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  const individual = await registerIndividual();
  const started = await startMobileAuth("login", { email: individual.email, password }, `${tag}:${individual.email}`);
  const tokens = await verifyMobileAuth({
    challengeToken: started.challengeToken,
    code: await codeFor(started.challengeToken.split(".")[0], 1),
  }, `${tag}:${individual.email}`);
  await assert.rejects(
    () => requireMobileOrganization(`Bearer ${tokens.accessToken}`, orgA),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  const personal = await summarizeAccount(individual.user.id, orgA);
  assert.equal(personal.accountType, "INDIVIDUAL");
  assert.equal(personal.organizationId, null);
  assert.equal(personal.customers.clients, 0);
});
