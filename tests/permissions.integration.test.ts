import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { createCustomer } from "../apps/web/src/lib/customers/service";
import { createAppointment } from "../apps/web/src/lib/appointments/service";
import { acceptQuote, createQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { cancelInvoice, convertQuoteToInvoice } from "../apps/web/src/lib/invoices/service";
import { canCancelInvoices, canCancelPayments, canIssueCreditNotes, canIssueInvoices, canManageCatalog, canManageElectronicInvoicing, canManagePaymentIntegrations, canManageTeam, canRecordPayments, canSendDocuments, canSubmitElectronicInvoicing, canWriteAppointments, canWriteCustomers, canWriteQuotes } from "../apps/web/src/lib/auth/permissions";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
import type { MemberRole } from "../apps/web/src/generated/prisma/client";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `perm-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Entreprise droits") {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Compte test", accountType: "BUSINESS", organizationName }, `${tag}:${email}`);
  const user = await completeAuth(token, await codeFor(token.split(".")[0], 1), `${tag}:${email}`);
  assert.ok(user);
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: user.id } });
  return { email, user, membership };
}

async function colleague(organizationId: string, role: Exclude<MemberRole, "OWNER">) {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const user = await getDb().user.create({ data: { email, accountType: "BUSINESS", name: role } });
  await getDb().membership.create({ data: { userId: user.id, organizationId, role } });
  return user;
}

async function acceptedQuote(owner: Awaited<ReturnType<typeof register>>, suffix: string) {
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: `Client ${suffix}`, kind: "CLIENT" }, `${tag}-${suffix}-c`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Prestation",
    description: "Intervention",
    quantity: 1,
    unitPriceCents: 1000,
    vatBps: 2000,
  }, `${tag}-${suffix}-q`, owner.user.id);
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  return quote;
}

async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}

after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.payment.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, kind: "CREDIT_NOTE" } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, sourceDocumentId: { not: null } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.appointment.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("la matrice de permissions distingue émission et annulation de facture", async () => {
  assert.equal(canWriteCustomers("MEMBER"), true);
  assert.equal(canWriteCustomers("ACCOUNTANT"), false);
  assert.equal(canWriteAppointments("MEMBER"), true);
  assert.equal(canWriteAppointments("ACCOUNTANT"), false);
  assert.equal(canWriteQuotes("MEMBER"), true);
  assert.equal(canWriteQuotes("ACCOUNTANT"), false);
  assert.equal(canManageCatalog("MEMBER"), true);
  assert.equal(canManageCatalog("ACCOUNTANT"), false);
  assert.equal(canIssueInvoices("OWNER"), true);
  assert.equal(canIssueInvoices("ADMIN"), true);
  assert.equal(canIssueInvoices("MEMBER"), true);
  assert.equal(canIssueInvoices("ACCOUNTANT"), false);
  assert.equal(canCancelInvoices("OWNER"), true);
  assert.equal(canCancelInvoices("ADMIN"), true);
  assert.equal(canCancelInvoices("MEMBER"), false);
  assert.equal(canCancelInvoices("ACCOUNTANT"), false);
  assert.equal(canIssueCreditNotes("OWNER"), true);
  assert.equal(canIssueCreditNotes("ADMIN"), true);
  assert.equal(canIssueCreditNotes("MEMBER"), false);
  assert.equal(canIssueCreditNotes("ACCOUNTANT"), false);
  assert.equal(canRecordPayments("OWNER"), true);
  assert.equal(canRecordPayments("ADMIN"), true);
  assert.equal(canRecordPayments("MEMBER"), false);
  assert.equal(canRecordPayments("ACCOUNTANT"), true);
  assert.equal(canCancelPayments("OWNER"), true);
  assert.equal(canCancelPayments("ADMIN"), true);
  assert.equal(canCancelPayments("MEMBER"), false);
  assert.equal(canCancelPayments("ACCOUNTANT"), true);
  assert.equal(canManageTeam("ADMIN"), true);
  assert.equal(canManageTeam("MEMBER"), false);
  assert.equal(canManageElectronicInvoicing("OWNER"), true);
  assert.equal(canManageElectronicInvoicing("ADMIN"), true);
  assert.equal(canManageElectronicInvoicing("MEMBER"), false);
  assert.equal(canManageElectronicInvoicing("ACCOUNTANT"), false);
  assert.equal(canManagePaymentIntegrations("OWNER"), true);
  assert.equal(canManagePaymentIntegrations("ADMIN"), true);
  assert.equal(canManagePaymentIntegrations("MEMBER"), false);
  assert.equal(canManagePaymentIntegrations("ACCOUNTANT"), false);
  assert.equal(canRecordPayments("ACCOUNTANT"), true);
  assert.notEqual(canManagePaymentIntegrations("ACCOUNTANT"), canRecordPayments("ACCOUNTANT"));
  assert.equal(canSubmitElectronicInvoicing("OWNER"), true);
  assert.equal(canSubmitElectronicInvoicing("ADMIN"), true);
  assert.equal(canSubmitElectronicInvoicing("MEMBER"), false);
  assert.equal(canSubmitElectronicInvoicing("ACCOUNTANT"), false);
  assert.equal(canIssueInvoices("MEMBER"), true);
  assert.equal(canSendDocuments("OWNER"), true);
  assert.equal(canSendDocuments("ADMIN"), true);
  assert.equal(canSendDocuments("MEMBER"), true);
  assert.equal(canSendDocuments("ACCOUNTANT"), true);
});

test("une facture émise ne peut pas être annulée par statut, y compris par OWNER ou ADMIN", async () => {
  const owner = await register();
  const admin = await colleague(owner.membership.organizationId, "ADMIN");
  const member = await colleague(owner.membership.organizationId, "MEMBER");
  const accountant = await colleague(owner.membership.organizationId, "ACCOUNTANT");
  const quote = await acceptedQuote(owner, "cancel");
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await assert.rejects(
    () => cancelInvoice("MEMBER", owner.membership.organizationId, { documentId: invoice.id }, member.id),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  await assert.rejects(
    () => cancelInvoice("ACCOUNTANT", owner.membership.organizationId, { documentId: invoice.id }, accountant.id),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  await assert.rejects(
    () => cancelInvoice("ADMIN", owner.membership.organizationId, { documentId: invoice.id }, admin.id),
    error => error instanceof AuthFlowError && error.status === 409 && /avoir/.test(error.message),
  );
  await assert.rejects(
    () => cancelInvoice("OWNER", owner.membership.organizationId, { documentId: invoice.id }, owner.user.id),
    error => error instanceof AuthFlowError && error.status === 409 && /avoir/.test(error.message),
  );
  const stillIssued = await getDb().document.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(stillIssued.status, "SENT");
});

test("OWNER et ADMIN peuvent abandonner un brouillon de facture ; MEMBER non", async () => {
  const owner = await register("Brouillon facture");
  const admin = await colleague(owner.membership.organizationId, "ADMIN");
  const member = await colleague(owner.membership.organizationId, "MEMBER");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Client brouillon", kind: "CLIENT" }, `${tag}-draft-c`);
  const draft = await getDb().document.create({
    data: {
      organizationId: owner.membership.organizationId,
      customerId: customer.id,
      kind: "INVOICE",
      status: "DRAFT",
      title: "Brouillon facture",
    },
  });
  await assert.rejects(
    () => cancelInvoice("MEMBER", owner.membership.organizationId, { documentId: draft.id }, member.id),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  const cancelled = await cancelInvoice("ADMIN", owner.membership.organizationId, { documentId: draft.id }, admin.id);
  assert.equal(cancelled.status, "CANCELLED");
});

test("émission de facture : OWNER ADMIN MEMBER oui, ACCOUNTANT non", async () => {
  const owner = await register("Droits émission");
  const admin = await colleague(owner.membership.organizationId, "ADMIN");
  const member = await colleague(owner.membership.organizationId, "MEMBER");
  const accountant = await colleague(owner.membership.organizationId, "ACCOUNTANT");
  const forAdmin = await acceptedQuote(owner, "iss-admin");
  const forMember = await acceptedQuote(owner, "iss-member");
  const forAccountant = await acceptedQuote(owner, "iss-acc");
  const issuedAdmin = await convertQuoteToInvoice("ADMIN", owner.membership.organizationId, { documentId: forAdmin.id }, admin.id);
  const issuedMember = await convertQuoteToInvoice("MEMBER", owner.membership.organizationId, { documentId: forMember.id }, member.id);
  assert.match(issuedAdmin.number ?? "", /^FA-\d{4}-0001$/);
  assert.match(issuedMember.number ?? "", /^FA-\d{4}-0002$/);
  await assert.rejects(
    () => convertQuoteToInvoice("ACCOUNTANT", owner.membership.organizationId, { documentId: forAccountant.id }, accountant.id),
    error => error instanceof AuthFlowError && error.status === 403,
  );
});

test("écriture devis, CRM et agenda : MEMBER oui, ACCOUNTANT non", async () => {
  const owner = await register("Droits opérationnels");
  const member = await colleague(owner.membership.organizationId, "MEMBER");
  const accountant = await colleague(owner.membership.organizationId, "ACCOUNTANT");
  const customer = await createCustomer("MEMBER", owner.membership.organizationId, { displayName: "Fiche membre", kind: "CLIENT" }, `${tag}-crm`);
  await assert.rejects(
    () => createCustomer("ACCOUNTANT", owner.membership.organizationId, { displayName: "Interdit", kind: "CLIENT" }, `${tag}-crm-acc`),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  const quote = await createQuote("MEMBER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Devis membre",
    description: "Ligne",
    quantity: 1,
    unitPriceCents: 100,
    vatBps: 2000,
  }, `${tag}-qw`, member.id);
  assert.equal(quote.status, "DRAFT");
  await assert.rejects(
    () => createQuote("ACCOUNTANT", owner.membership.organizationId, {
      customerId: customer.id,
      title: "Devis interdit",
      description: "Ligne",
      quantity: 1,
      unitPriceCents: 100,
      vatBps: 2000,
    }, `${tag}-qw-acc`, accountant.id),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  const appointment = await createAppointment("MEMBER", owner.membership.organizationId, {
    title: "Point membre",
    startsAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
    durationMinutes: 30,
  }, `${tag}-rdv`, member.id);
  assert.equal(appointment.title, "Point membre");
  await assert.rejects(
    () => createAppointment("ACCOUNTANT", owner.membership.organizationId, {
      title: "Point interdit",
      startsAt: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
      durationMinutes: 30,
    }, `${tag}-rdv-acc`, accountant.id),
    error => error instanceof AuthFlowError && error.status === 403,
  );
});

test("les permissions ne remplacent pas l’isolation d’organisation", async () => {
  const first = await register("Entreprise A");
  const second = await register("Entreprise B");
  const quote = await acceptedQuote(first, "iso");
  const invoice = await convertQuoteToInvoice("OWNER", first.membership.organizationId, { documentId: quote.id }, first.user.id);
  await assert.rejects(
    () => cancelInvoice("OWNER", second.membership.organizationId, { documentId: invoice.id }, second.user.id),
    AuthFlowError,
  );
  await assert.rejects(
    () => convertQuoteToInvoice("OWNER", second.membership.organizationId, { documentId: quote.id }, second.user.id),
    AuthFlowError,
  );
});
