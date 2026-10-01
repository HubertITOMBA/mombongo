import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { addAddress, addCustomerActivity, archiveCustomer, changePipelineStage, convertProspect, createCustomer, getCustomer, listCustomers, listPipeline, removeAddress, restoreCustomer, updateCustomer } from "../apps/web/src/lib/customers/service";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `cust-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";
async function register(organizationName = "Entreprise clients") {
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
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});
const address = {
  type: "BILLING" as const,
  label: "Siège",
  line1: "12 rue des Lilas",
  postalCode: "75011",
  city: "Paris",
  countryCode: "FR" as const,
};
test("le propriétaire crée une fiche, une adresse, puis convertit un prospect", async () => {
  const owner = await register();
  const customer = await createCustomer(owner.membership.role, owner.membership.organizationId, {
    displayName: "Atelier Dupont",
    email: `${tag}-dupont@client.test`,
    kind: "PROSPECT",
  }, tag);
  assert.equal(customer.kind, "PROSPECT");
  await addAddress("OWNER", owner.membership.organizationId, { customerId: customer.id, ...address });
  const loaded = await getCustomer(owner.membership.organizationId, customer.id);
  assert.equal(loaded.addresses.length, 1);
  assert.equal(loaded.addresses[0].city, "Paris");
  assert.equal(customer.stage, "NEW");
  assert.equal((await getCustomer(owner.membership.organizationId, customer.id)).activities.some(item => item.type === "CREATED"), true);
  await convertProspect("OWNER", owner.membership.organizationId, { customerId: customer.id });
  const converted = await getCustomer(owner.membership.organizationId, customer.id);
  assert.equal(converted.kind, "CLIENT");
  assert.equal(converted.stage, "WON");
  const listed = await listCustomers(owner.membership.organizationId, { query: "Dupont" });
  assert.equal(listed.length, 1);
});
test("un email actif est unique dans l’entreprise ; un pays inconnu est refusé", async () => {
  const owner = await register();
  const email = `${tag}-unique@client.test`;
  await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Premier", email, kind: "CLIENT" }, `${tag}-u1`);
  await assert.rejects(
    () => createCustomer("OWNER", owner.membership.organizationId, { displayName: "Second", email, kind: "CLIENT" }, `${tag}-u2`),
    AuthFlowError,
  );
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Sans email", kind: "CLIENT" }, `${tag}-u3`);
  await assert.rejects(
    () => addAddress("OWNER", owner.membership.organizationId, { customerId: customer.id, ...address, countryCode: "ZZ" }),
    AuthFlowError,
  );
});
test("l’isolation inter-entreprises et le rôle comptable sont respectés", async () => {
  const first = await register("Entreprise A");
  const second = await register("Entreprise B");
  const customer = await createCustomer("OWNER", first.membership.organizationId, { displayName: "Privé A", kind: "CLIENT" }, `${tag}-iso`);
  await assert.rejects(() => getCustomer(second.membership.organizationId, customer.id), AuthFlowError);
  await assert.rejects(
    () => updateCustomer("OWNER", second.membership.organizationId, { customerId: customer.id, displayName: "Intrus", kind: "CLIENT" }),
    AuthFlowError,
  );
  const accountantEmail = `${tag}-acc@example.test`;
  emails.push(accountantEmail);
  const accountant = await getDb().user.create({ data: { email: accountantEmail, accountType: "BUSINESS", name: "Comptable" } });
  await getDb().membership.create({ data: { userId: accountant.id, organizationId: first.membership.organizationId, role: "ACCOUNTANT" } });
  await assert.rejects(
    () => createCustomer("ACCOUNTANT", first.membership.organizationId, { displayName: "Interdit", kind: "CLIENT" }, `${tag}-acc`),
    AuthFlowError,
  );
  const visible = await listCustomers(first.membership.organizationId);
  assert.equal(visible.some(item => item.id === customer.id), true);
});
test("une fiche archivée n’est plus modifiable et peut être restaurée", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "À archiver", kind: "CLIENT" }, `${tag}-arc`);
  await archiveCustomer("OWNER", owner.membership.organizationId, { customerId: customer.id });
  await assert.rejects(
    () => addAddress("OWNER", owner.membership.organizationId, { customerId: customer.id, ...address }),
    AuthFlowError,
  );
  await restoreCustomer("OWNER", owner.membership.organizationId, { customerId: customer.id });
  const created = await addAddress("OWNER", owner.membership.organizationId, { customerId: customer.id, ...address, label: "Dépôt" });
  await removeAddress("OWNER", owner.membership.organizationId, { addressId: created.id });
  assert.equal((await getCustomer(owner.membership.organizationId, customer.id)).addresses.length, 0);
});
test("le pipeline déplace un prospect, journalise et convertit à l’étape gagné", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    displayName: "Prospect Kanban",
    kind: "PROSPECT",
    estimatedCents: "1500",
    source: "Salon",
  }, `${tag}-pipe`);
  await changePipelineStage("OWNER", owner.membership.organizationId, { customerId: customer.id, stage: "CONTACTED" });
  await addCustomerActivity("OWNER", owner.membership.organizationId, { customerId: customer.id, type: "CALL", message: "Appel de qualification" });
  const contacted = await getCustomer(owner.membership.organizationId, customer.id);
  assert.equal(contacted.stage, "CONTACTED");
  assert.equal(contacted.estimatedCents, 150000);
  assert.equal(contacted.activities.some(item => item.type === "CALL"), true);
  assert.equal((await listPipeline(owner.membership.organizationId)).CONTACTED.some(item => item.id === customer.id), true);
  await changePipelineStage("OWNER", owner.membership.organizationId, { customerId: customer.id, stage: "WON" });
  const won = await getCustomer(owner.membership.organizationId, customer.id);
  assert.equal(won.kind, "CLIENT");
  assert.equal(won.stage, "WON");
  assert.equal((await listPipeline(owner.membership.organizationId)).WON.length, 0);
});
