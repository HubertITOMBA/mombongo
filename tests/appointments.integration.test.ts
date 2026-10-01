import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { createCustomer, getCustomer } from "../apps/web/src/lib/customers/service";
import { cancelAppointment, countUpcomingAppointments, createAppointment, listAppointments } from "../apps/web/src/lib/appointments/service";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `rdv-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

function slot(hoursFromNow: number) {
  return new Date(Date.now() + hoursFromNow * 60 * 60_000).toISOString();
}

async function register(organizationName = "Entreprise agenda") {
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
  await db.appointment.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("un rendez-vous est créé, les chevauchements sont refusés et les créneaux adjacents restent possibles", async () => {
  const owner = await register();
  const startsAt = slot(2);
  const created = await createAppointment("OWNER", owner.membership.organizationId, {
    title: "Point commercial",
    startsAt,
    durationMinutes: 30,
  }, `${tag}-a`, owner.user.id);
  assert.equal(created.title, "Point commercial");
  await assert.rejects(
    () => createAppointment("OWNER", owner.membership.organizationId, {
      title: "Chevauchement",
      startsAt,
      durationMinutes: 30,
    }, `${tag}-b`, owner.user.id),
    AuthFlowError,
  );
  const adjacent = await createAppointment("OWNER", owner.membership.organizationId, {
    title: "Créneau suivant",
    startsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
    durationMinutes: 30,
  }, `${tag}-c`, owner.user.id);
  assert.equal(adjacent.title, "Créneau suivant");
  assert.equal(await countUpcomingAppointments(owner.membership.organizationId), 2);
  await cancelAppointment("OWNER", owner.membership.organizationId, { appointmentId: created.id });
  const reused = await createAppointment("OWNER", owner.membership.organizationId, {
    title: "Créneau libéré",
    startsAt,
    durationMinutes: 30,
  }, `${tag}-d`, owner.user.id);
  assert.equal(reused.title, "Créneau libéré");
});

test("un rendez-vous peut être lié à une fiche et reste isolé entre entreprises", async () => {
  const first = await register("Entreprise A");
  const second = await register("Entreprise B");
  const customer = await createCustomer("OWNER", first.membership.organizationId, { displayName: "Prospect RDV", kind: "PROSPECT" }, `${tag}-fiche`);
  const startsAt = slot(3);
  const appointment = await createAppointment("OWNER", first.membership.organizationId, {
    title: "Visite",
    startsAt,
    durationMinutes: 45,
    customerId: customer.id,
  }, `${tag}-link`, first.user.id);
  assert.equal(appointment.customer?.displayName, "Prospect RDV");
  const history = await getCustomer(first.membership.organizationId, customer.id);
  assert.equal(history.activities.some(item => item.type === "MEETING"), true);
  await createAppointment("OWNER", second.membership.organizationId, {
    title: "Même heure ailleurs",
    startsAt,
    durationMinutes: 45,
  }, `${tag}-iso`, second.user.id);
  const listed = await listAppointments(second.membership.organizationId);
  assert.equal(listed.some(item => item.id === appointment.id), false);
  const accountantEmail = `${tag}-acc@example.test`;
  emails.push(accountantEmail);
  const accountant = await getDb().user.create({ data: { email: accountantEmail, accountType: "BUSINESS", name: "Comptable" } });
  await getDb().membership.create({ data: { userId: accountant.id, organizationId: first.membership.organizationId, role: "ACCOUNTANT" } });
  await assert.rejects(
    () => createAppointment("ACCOUNTANT", first.membership.organizationId, {
      title: "Interdit",
      startsAt: slot(4),
      durationMinutes: 30,
    }, `${tag}-acc`, accountant.id),
    AuthFlowError,
  );
});
