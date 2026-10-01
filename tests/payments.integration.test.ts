import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { createCustomer } from "../apps/web/src/lib/customers/service";
import { acceptQuote, createQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { convertQuoteToInvoice, getInvoice } from "../apps/web/src/lib/invoices/service";
import { createCreditNote, issueCreditNote } from "../apps/web/src/lib/credit-notes/service";
import { cancelPayment, recordPayment } from "../apps/web/src/lib/payments/service";
import { invoiceSettlement } from "../apps/web/src/lib/invoices/settlement";
import { updateOrganizationIdentity } from "../apps/web/src/lib/organizations/service";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
import type { MemberRole } from "../apps/web/src/generated/prisma/client";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `pay-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Entreprise paiements") {
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

async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}

async function issuedInvoice(owner: Awaited<ReturnType<typeof register>>, suffix: string, unitPrice = 1000) {
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: `Client ${suffix}`, kind: "CLIENT" }, `${tag}-${suffix}-c`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: `Prestation ${suffix}`,
    description: "Forfait",
    quantity: 1,
    unitPriceCents: unitPrice,
    vatBps: 0,
  }, `${tag}-${suffix}-q`, owner.user.id);
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  return getInvoice(owner.membership.organizationId, invoice.id);
}

function settle(invoice: Awaited<ReturnType<typeof getInvoice>>) {
  return invoiceSettlement({
    grossTtcCents: invoice.ttcCents,
    creditNotes: invoice.creditNotes,
    payments: invoice.payments,
  });
}

after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.payment.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, kind: "CREDIT_NOTE" } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, sourceDocumentId: { not: null } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("un paiement total solde la facture sans changer Document.status", async () => {
  const owner = await register();
  const invoice = await issuedInvoice(owner, "total");
  assert.equal(invoice.ttcCents, 100_000);
  const payment = await recordPayment("OWNER", owner.membership.organizationId, {
    invoiceId: invoice.id,
    amountCents: 1000,
    method: "BANK_TRANSFER",
    paidAt: "2026-09-25",
    reference: "VIR-25",
  }, owner.user.id);
  assert.equal(payment.status, "CONFIRMED");
  assert.equal(payment.provider, "MANUAL");
  assert.equal(payment.amountCents, 100_000);
  assert.equal(payment.currency, "EUR");
  assert.equal(payment.providerPaymentId, null);
  const loaded = await getInvoice(owner.membership.organizationId, invoice.id);
  const settlement = settle(loaded);
  assert.equal(settlement.paidTtcCents, 100_000);
  assert.equal(settlement.remainingTtcCents, 0);
  assert.equal(settlement.settlementState, "PAID");
  assert.equal(loaded.status, "SENT");
});

test("des paiements partiels accumulent l’encaissé", async () => {
  const owner = await register("Partiels");
  const invoice = await issuedInvoice(owner, "partial");
  await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 300, method: "CASH" }, owner.user.id);
  await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 400, method: "CHECK", reference: "CHQ-12" }, owner.user.id);
  const loaded = await getInvoice(owner.membership.organizationId, invoice.id);
  const settlement = settle(loaded);
  assert.equal(settlement.paidTtcCents, 70_000);
  assert.equal(settlement.remainingTtcCents, 30_000);
  assert.equal(settlement.settlementState, "PARTIALLY_PAID");
  await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 300, method: "CARD" }, owner.user.id);
  const paid = settle(await getInvoice(owner.membership.organizationId, invoice.id));
  assert.equal(paid.remainingTtcCents, 0);
  assert.equal(paid.settlementState, "PAID");
});

test("avoir puis paiement calculent net, encaissé et reste", async () => {
  const owner = await register("Mixte");
  const invoice = await issuedInvoice(owner, "mix");
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "PARTIAL", [`quantity-${invoice.lines[0]!.id}`]: "0.2" }, owner.user.id);
  await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 500, method: "BANK_TRANSFER" }, owner.user.id);
  const settlement = settle(await getInvoice(owner.membership.organizationId, invoice.id));
  assert.equal(settlement.grossTtcCents, 100_000);
  assert.equal(settlement.creditedTtcCents, 20_000);
  assert.equal(settlement.netTtcCents, 80_000);
  assert.equal(settlement.paidTtcCents, 50_000);
  assert.equal(settlement.remainingTtcCents, 30_000);
  assert.equal(settlement.settlementState, "PARTIALLY_PAID");
});

test("une facture totalement créditée est CREDITED, pas PAID, et refuse un paiement", async () => {
  const owner = await register("Créditée");
  const invoice = await issuedInvoice(owner, "credited");
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "TOTAL" }, owner.user.id);
  await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  const settlement = settle(await getInvoice(owner.membership.organizationId, invoice.id));
  assert.equal(settlement.netTtcCents, 0);
  assert.equal(settlement.paidTtcCents, 0);
  assert.equal(settlement.remainingTtcCents, 0);
  assert.equal(settlement.settlementState, "CREDITED");
  await assert.rejects(
    () => recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 10, method: "CASH" }, owner.user.id),
    error => error instanceof AuthFlowError && error.status === 409,
  );
});

test("le surpaiement est refusé et n’ajoute aucun paiement confirmé", async () => {
  const owner = await register("Surpaye");
  const invoice = await issuedInvoice(owner, "over");
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "PARTIAL", [`quantity-${invoice.lines[0]!.id}`]: "0.2" }, owner.user.id);
  await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 600, method: "BANK_TRANSFER" }, owner.user.id);
  await assert.rejects(
    () => recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 300, method: "CASH" }, owner.user.id),
    error => error instanceof AuthFlowError && error.status === 409,
  );
  const loaded = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(loaded.payments.filter(item => item.status === "CONFIRMED").length, 1);
  assert.equal(settle(loaded).paidTtcCents, 60_000);
});

test("deux paiements concurrents ne peuvent pas surpayer", async () => {
  const owner = await register("Concurrent");
  const invoice = await issuedInvoice(owner, "race", 100);
  const results = await Promise.allSettled([
    recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 80, method: "CASH" }, owner.user.id),
    recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 80, method: "CARD" }, owner.user.id),
  ]);
  const ok = results.filter(item => item.status === "fulfilled");
  const failed = results.filter(item => item.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(failed.length, 1);
  assert.ok(failed[0] && failed[0].status === "rejected" && failed[0].reason instanceof AuthFlowError && failed[0].reason.status === 409);
  const settlement = settle(await getInvoice(owner.membership.organizationId, invoice.id));
  assert.equal(settlement.paidTtcCents, 8_000);
  assert.ok(settlement.remainingTtcCents >= 0);
  assert.ok(settlement.paidTtcCents <= settlement.netTtcCents);
});

test("l’annulation d’un paiement le conserve et rétablit le reste", async () => {
  const owner = await register("Annulation");
  const invoice = await issuedInvoice(owner, "cancel");
  const payment = await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 1000, method: "BANK_TRANSFER" }, owner.user.id);
  assert.equal(settle(await getInvoice(owner.membership.organizationId, invoice.id)).remainingTtcCents, 0);
  const cancelled = await cancelPayment("OWNER", owner.membership.organizationId, { paymentId: payment.id }, owner.user.id);
  assert.equal(cancelled.status, "CANCELLED");
  const loaded = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(loaded.payments.length, 1);
  assert.equal(loaded.payments[0]?.status, "CANCELLED");
  const settlement = settle(loaded);
  assert.equal(settlement.paidTtcCents, 0);
  assert.equal(settlement.remainingTtcCents, 100_000);
  assert.equal(settlement.settlementState, "UNPAID");
});

test("un avoir qui ferait paid > net est refusé", async () => {
  const owner = await register("Avoir après paiement");
  const invoice = await issuedInvoice(owner, "after-pay");
  await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 900, method: "BANK_TRANSFER" }, owner.user.id);
  await assert.rejects(
    () => createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "PARTIAL", [`quantity-${invoice.lines[0]!.id}`]: "0.2" }, owner.user.id),
    error => error instanceof AuthFlowError && error.status === 409 && /remboursement/.test(error.message),
  );
  await assert.rejects(
    () => createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "TOTAL" }, owner.user.id),
    error => error instanceof AuthFlowError && error.status === 409,
  );
});

test("une facture d’une autre organisation refuse le paiement", async () => {
  const first = await register("Org A");
  const second = await register("Org B");
  const invoice = await issuedInvoice(first, "iso");
  await assert.rejects(
    () => recordPayment("OWNER", second.membership.organizationId, { invoiceId: invoice.id, amountCents: 100, method: "CASH" }, second.user.id),
    error => error instanceof AuthFlowError && error.status === 404,
  );
});

test("OWNER ADMIN ACCOUNTANT enregistrent et annulent ; MEMBER est refusé", async () => {
  const owner = await register("Droits paiement");
  const admin = await colleague(owner.membership.organizationId, "ADMIN");
  const member = await colleague(owner.membership.organizationId, "MEMBER");
  const accountant = await colleague(owner.membership.organizationId, "ACCOUNTANT");
  const forAdmin = await issuedInvoice(owner, "adm");
  const forAccountant = await issuedInvoice(owner, "acc");
  const forMember = await issuedInvoice(owner, "mem");
  const forOwner = await issuedInvoice(owner, "own");
  const byAdmin = await recordPayment("ADMIN", owner.membership.organizationId, { invoiceId: forAdmin.id, amountCents: 100, method: "CASH" }, admin.id);
  const byAccountant = await recordPayment("ACCOUNTANT", owner.membership.organizationId, { invoiceId: forAccountant.id, amountCents: 100, method: "CASH" }, accountant.id);
  const byOwner = await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: forOwner.id, amountCents: 1000, method: "BANK_TRANSFER" }, owner.user.id);
  await assert.rejects(
    () => recordPayment("MEMBER", owner.membership.organizationId, { invoiceId: forMember.id, amountCents: 100, method: "CASH" }, member.id),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  await cancelPayment("ADMIN", owner.membership.organizationId, { paymentId: byAdmin.id }, admin.id);
  await cancelPayment("ACCOUNTANT", owner.membership.organizationId, { paymentId: byAccountant.id }, accountant.id);
  await cancelPayment("OWNER", owner.membership.organizationId, { paymentId: byOwner.id }, owner.user.id);
  await assert.rejects(
    () => cancelPayment("MEMBER", owner.membership.organizationId, { paymentId: byOwner.id }, member.id),
    error => error instanceof AuthFlowError && error.status === 403,
  );
});

test("un paiement reprend la devise de la facture, sans conversion", async () => {
  const owner = await register("USD pay");
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, { name: "USD pay", currency: "USD" });
  const invoice = await issuedInvoice(owner, "usd");
  const payment = await recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 1000, method: "BANK_TRANSFER" }, owner.user.id);
  assert.equal(payment.currency, "USD");
  assert.equal(invoice.issuerCurrencySnapshot, "USD");
});

test("une facture CANCELLED héritée refuse un nouveau paiement", async () => {
  const owner = await register("Annulée");
  const invoice = await issuedInvoice(owner, "cancelled-inv");
  await getDb().document.update({ where: { id: invoice.id }, data: { status: "CANCELLED" } });
  await assert.rejects(
    () => recordPayment("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, amountCents: 100, method: "CASH" }, owner.user.id),
    AuthFlowError,
  );
});
