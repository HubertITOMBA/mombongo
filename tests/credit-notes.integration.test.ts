import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { createCustomer, updateCustomer } from "../apps/web/src/lib/customers/service";
import { acceptQuote, addQuoteLine, createQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { convertQuoteToInvoice, getInvoice } from "../apps/web/src/lib/invoices/service";
import { createCreditNote, getCreditNote, issueCreditNote, netAfterCredits, discardCreditNoteDraft } from "../apps/web/src/lib/credit-notes/service";
import { updateOrganizationIdentity } from "../apps/web/src/lib/organizations/service";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
import type { MemberRole } from "../apps/web/src/generated/prisma/client";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `credit-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Entreprise avoirs") {
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

async function issuedInvoice(
  owner: Awaited<ReturnType<typeof register>>,
  suffix: string,
  lines: Array<{ description: string; quantity: number; unitPriceCents: number; vatBps: number; itemKind?: "PRODUCT" | "SERVICE" }>,
) {
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: `Client ${suffix}`, kind: "CLIENT" }, `${tag}-${suffix}-c`);
  const [first, ...rest] = lines;
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: `Prestation ${suffix}`,
    description: first.description,
    quantity: first.quantity,
    unitPriceCents: first.unitPriceCents,
    vatBps: first.vatBps,
    itemKind: first.itemKind ?? "SERVICE",
  }, `${tag}-${suffix}-q`, owner.user.id);
  for (const line of rest) {
    await addQuoteLine("OWNER", owner.membership.organizationId, {
      documentId: quote.id,
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      vatBps: line.vatBps,
      itemKind: line.itemKind ?? "SERVICE",
    });
  }
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  const loaded = await getInvoice(owner.membership.organizationId, invoice.id);
  return { customer, invoice: loaded };
}

function quantities(invoice: Awaited<ReturnType<typeof getInvoice>>, amounts: Record<string, number>) {
  const body: Record<string, unknown> = {};
  for (const line of invoice.lines) {
    const quantity = amounts[line.description] ?? 0;
    body[`quantity-${line.id}`] = String(quantity);
  }
  return body;
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

test("un avoir total reprend la facture, conserve ses montants et ramène le net à zéro", async () => {
  const owner = await register();
  const { invoice } = await issuedInvoice(owner, "total", [{ description: "Prestation", quantity: 1, unitPriceCents: 1000, vatBps: 0 }]);
  assert.equal(invoice.ttcCents, 100_000);
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "TOTAL", creditReason: "Annulation prestation" }, owner.user.id);
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.number, null);
  assert.equal(draft.kind, "CREDIT_NOTE");
  assert.equal(draft.creditedInvoiceId, invoice.id);
  assert.equal(draft.ttcCents, 100_000);
  assert.equal(draft.lines[0]?.unitPriceCents, invoice.lines[0]?.unitPriceCents);
  assert.equal(Number(draft.lines[0]?.quantity), 1);
  const issued = await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  assert.match(issued.number ?? "", /^AV-\d{4}-0001$/);
  assert.equal(issued.status, "SENT");
  assert.equal(issued.dueDate, null);
  assert.ok(issued.issuedAt);
  const kept = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(kept.ttcCents, 100_000);
  assert.equal(kept.status, "SENT");
  assert.equal(kept.number, invoice.number);
  const net = netAfterCredits(kept.ttcCents, kept.creditNotes);
  assert.equal(net.creditedTtcCents, 100_000);
  assert.equal(net.remainingTtcCents, 0);
});

test("un avoir partiel et plusieurs avoirs réduisent le net sans payer la facture", async () => {
  const owner = await register("Avoirs partiels");
  const { invoice } = await issuedInvoice(owner, "partial", [
    { description: "Produit A", quantity: 6, unitPriceCents: 100, vatBps: 0, itemKind: "PRODUCT" },
    { description: "Service B", quantity: 4, unitPriceCents: 100, vatBps: 0, itemKind: "SERVICE" },
  ]);
  assert.equal(invoice.ttcCents, 100_000);
  const first = await createCreditNote("OWNER", owner.membership.organizationId, {
    invoiceId: invoice.id,
    mode: "PARTIAL",
    creditReason: "Retour produit",
    ...quantities(invoice, { "Produit A": 2 }),
  }, owner.user.id);
  assert.equal(first.ttcCents, 20_000);
  assert.equal(first.operationCategory, "GOODS");
  const issuedFirst = await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: first.id }, owner.user.id);
  assert.match(issuedFirst.number ?? "", /^AV-\d{4}-0001$/);
  let loaded = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(netAfterCredits(loaded.ttcCents, loaded.creditNotes).remainingTtcCents, 80_000);
  const second = await createCreditNote("OWNER", owner.membership.organizationId, {
    invoiceId: invoice.id,
    mode: "PARTIAL",
    ...quantities(loaded, { "Service B": 3 }),
  }, owner.user.id);
  assert.equal(second.ttcCents, 30_000);
  await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: second.id }, owner.user.id);
  loaded = await getInvoice(owner.membership.organizationId, invoice.id);
  const net = netAfterCredits(loaded.ttcCents, loaded.creditNotes);
  assert.equal(net.creditedTtcCents, 50_000);
  assert.equal(net.remainingTtcCents, 50_000);
  assert.equal(loaded.status, "SENT");
  assert.equal(loaded.creditNotes.filter(note => note.status === "SENT").length, 2);
});

test("le sur-crédit est refusé et ne consomme pas de numéro", async () => {
  const owner = await register("Sur-crédit");
  const { invoice } = await issuedInvoice(owner, "over", [{ description: "Prestation", quantity: 1, unitPriceCents: 1000, vatBps: 0 }]);
  const first = await createCreditNote("OWNER", owner.membership.organizationId, {
    invoiceId: invoice.id,
    mode: "PARTIAL",
    ...quantities(invoice, { Prestation: 0.7 }),
  }, owner.user.id);
  await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: first.id }, owner.user.id);
  await assert.rejects(
    () => createCreditNote("OWNER", owner.membership.organizationId, {
      invoiceId: invoice.id,
      mode: "PARTIAL",
      ...quantities(invoice, { Prestation: 0.4 }),
    }, owner.user.id),
    error => error instanceof AuthFlowError && error.status === 409,
  );
  const overlapping = await createCreditNote("OWNER", owner.membership.organizationId, {
    invoiceId: invoice.id,
    mode: "TOTAL",
  }, owner.user.id);
  const extra = await createCreditNote("OWNER", owner.membership.organizationId, {
    invoiceId: invoice.id,
    mode: "TOTAL",
  }, owner.user.id);
  await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: overlapping.id }, owner.user.id);
  await assert.rejects(
    () => issueCreditNote("OWNER", owner.membership.organizationId, { documentId: extra.id }, owner.user.id),
    error => error instanceof AuthFlowError && error.status === 409,
  );
  const year = new Date().getFullYear();
  const sequence = await getDb().documentSequence.findUniqueOrThrow({
    where: { organizationId_kind_year: { organizationId: owner.membership.organizationId, kind: "CREDIT_NOTE", year } },
  });
  assert.equal(sequence.lastNumber, 2);
  const issued = await getDb().document.findMany({
    where: { organizationId: owner.membership.organizationId, kind: "CREDIT_NOTE", status: "SENT" },
  });
  assert.equal(issued.length, 2);
  assert.ok(issued.every(note => note.number && /^AV-\d{4}-000[12]$/.test(note.number)));
  const leftover = await getCreditNote(owner.membership.organizationId, extra.id);
  assert.equal(leftover.status, "DRAFT");
  assert.equal(leftover.number, null);
});

test("un avoir émis ne peut pas être abandonné", async () => {
  const owner = await register("Avoir figé");
  const { invoice } = await issuedInvoice(owner, "locked", [{ description: "Figé", quantity: 1, unitPriceCents: 100, vatBps: 0 }]);
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "TOTAL" }, owner.user.id);
  const issued = await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  await assert.rejects(
    () => discardCreditNoteDraft("OWNER", owner.membership.organizationId, { documentId: issued.id }),
    AuthFlowError,
  );
  const kept = await getCreditNote(owner.membership.organizationId, issued.id);
  assert.equal(kept.status, "SENT");
  assert.match(kept.number ?? "", /^AV-\d{4}-0001$/);
});

test("l’avoir reprend le snapshot de la facture, pas les fiches live", async () => {
  const owner = await register("Snapshot Avoir");
  const { customer, invoice } = await issuedInvoice(owner, "snap", [{ description: "Conseil", quantity: 1, unitPriceCents: 100, vatBps: 2000 }]);
  assert.equal(invoice.customerNameSnapshot, "Client snap");
  await updateCustomer("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    displayName: "Client devenu B",
    kind: "CLIENT",
  });
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Organisation C",
    legalName: "Organisation C SAS",
    tradeName: "Marque C",
  });
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "TOTAL" }, owner.user.id);
  const issued = await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  assert.equal(issued.customerNameSnapshot, invoice.customerNameSnapshot);
  assert.equal(issued.issuerNameSnapshot, invoice.issuerNameSnapshot);
  assert.notEqual(issued.customerNameSnapshot, "Client devenu B");
  assert.notEqual(issued.issuerNameSnapshot, "Marque C");
  assert.equal(issued.issuerCurrencySnapshot, invoice.issuerCurrencySnapshot);
});

test("la TVA de l’avoir est ventilée sur ses propres lignes", async () => {
  const owner = await register("TVA avoir");
  const { invoice } = await issuedInvoice(owner, "vat", [
    { description: "Service 20 %", quantity: 1, unitPriceCents: 100, vatBps: 2000, itemKind: "SERVICE" },
    { description: "Bien 10 %", quantity: 1, unitPriceCents: 200, vatBps: 1000, itemKind: "PRODUCT" },
  ]);
  assert.equal(invoice.htCents, 30_000);
  assert.equal(invoice.vatCents, 4_000);
  assert.equal(invoice.ttcCents, 34_000);
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, {
    invoiceId: invoice.id,
    mode: "PARTIAL",
    ...quantities(invoice, { "Service 20 %": 0.5, "Bien 10 %": 0.5 }),
  }, owner.user.id);
  assert.equal(draft.htCents, 15_000);
  assert.equal(draft.vatCents, 2_000);
  assert.equal(draft.ttcCents, 17_000);
  assert.equal(draft.operationCategory, "MIXED");
  const rates = draft.vatBreakdownSnapshot as { vatBps: number; htCents: number; vatCents: number }[];
  assert.deepEqual(rates, [
    { vatBps: 1000, htCents: 10_000, vatCents: 1_000 },
    { vatBps: 2000, htCents: 5_000, vatCents: 1_000 },
  ]);
  const issued = await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  assert.deepEqual(issued.vatBreakdownSnapshot, rates);
});

test("l’avoir conserve la devise de la facture, sans conversion", async () => {
  const owner = await register("Devise USD");
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, { name: "Devise USD", currency: "USD" });
  const { invoice } = await issuedInvoice(owner, "usd", [{ description: "Retainer", quantity: 1, unitPriceCents: 1000, vatBps: 0 }]);
  assert.equal(invoice.issuerCurrencySnapshot, "USD");
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "TOTAL" }, owner.user.id);
  const issued = await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  assert.equal(issued.issuerCurrencySnapshot, "USD");
  assert.equal(issued.ttcCents, invoice.ttcCents);
});

test("une facture d’une autre organisation ne peut pas servir à un avoir", async () => {
  const first = await register("Org A");
  const second = await register("Org B");
  const { invoice } = await issuedInvoice(first, "iso", [{ description: "Iso", quantity: 1, unitPriceCents: 100, vatBps: 0 }]);
  await assert.rejects(
    () => createCreditNote("OWNER", second.membership.organizationId, { invoiceId: invoice.id, mode: "TOTAL" }, second.user.id),
    error => error instanceof AuthFlowError && error.status === 404,
  );
});

test("OWNER et ADMIN émettent un avoir, MEMBER et ACCOUNTANT non", async () => {
  const owner = await register("Droits avoirs");
  const admin = await colleague(owner.membership.organizationId, "ADMIN");
  const member = await colleague(owner.membership.organizationId, "MEMBER");
  const accountant = await colleague(owner.membership.organizationId, "ACCOUNTANT");
  const forAdmin = await issuedInvoice(owner, "adm", [{ description: "Admin", quantity: 1, unitPriceCents: 100, vatBps: 0 }]);
  const forMember = await issuedInvoice(owner, "mem", [{ description: "Membre", quantity: 1, unitPriceCents: 100, vatBps: 0 }]);
  const forAccountant = await issuedInvoice(owner, "acc", [{ description: "Compta", quantity: 1, unitPriceCents: 100, vatBps: 0 }]);
  const forOwner = await issuedInvoice(owner, "own", [{ description: "Owner", quantity: 1, unitPriceCents: 100, vatBps: 0 }]);
  const byAdmin = await createCreditNote("ADMIN", owner.membership.organizationId, { invoiceId: forAdmin.invoice.id, mode: "TOTAL" }, admin.id);
  const issuedAdmin = await issueCreditNote("ADMIN", owner.membership.organizationId, { documentId: byAdmin.id }, admin.id);
  assert.match(issuedAdmin.number ?? "", /^AV-\d{4}-0001$/);
  const byOwner = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: forOwner.invoice.id, mode: "TOTAL" }, owner.user.id);
  const issuedOwner = await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: byOwner.id }, owner.user.id);
  assert.match(issuedOwner.number ?? "", /^AV-\d{4}-0002$/);
  await assert.rejects(
    () => createCreditNote("MEMBER", owner.membership.organizationId, { invoiceId: forMember.invoice.id, mode: "TOTAL" }, member.id),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  await assert.rejects(
    () => createCreditNote("ACCOUNTANT", owner.membership.organizationId, { invoiceId: forAccountant.invoice.id, mode: "TOTAL" }, accountant.id),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  const visible = await getInvoice(owner.membership.organizationId, forAdmin.invoice.id);
  assert.equal(visible.creditNotes.length, 1);
});
