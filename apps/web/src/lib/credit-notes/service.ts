import { createCreditNoteSchema, documentIdInputSchema, formatMoney, updateCreditNoteSchema } from "@mombongo/contracts";
import { getDb } from "@/lib/db";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { canIssueCreditNotes } from "@/lib/auth/permissions";
import { computeOperationCategory, copyDocumentSnapshot, writableDocumentSnapshot } from "@/lib/documents/snapshot";
import { lineAmounts, quantityToMilli, sumLineTotals, vatBreakdown } from "@/lib/documents/money";
import { validateDocumentForIssue } from "@/lib/documents/validate";
import { invoiceSettlement, assertInvoiceSettlement } from "@/lib/invoices/settlement";
import { lockOrganizationDocuments } from "@/lib/documents/lock";
import { assertDocumentTransition } from "@/lib/documents/transitions";
import type { MemberRole } from "@/generated/prisma/client";

const missing = () => new AuthFlowError("Cet avoir est introuvable.", 404);
const forbidden = () => new AuthFlowError("Votre rôle ne permet pas d’émettre un avoir.", 403);
const overCredit = () => new AuthFlowError("Cet avoir dépasse le montant encore créditable sur la facture.", 409);
const paidConflict = () => new AuthFlowError("Cet avoir rendrait les encaissements supérieurs au net facturé. Un remboursement n’est pas encore disponible.", 409);
const locked = () => new AuthFlowError("Cet avoir n’est plus un brouillon.");

type InvoiceLine = {
  id: string;
  description: string;
  quantity: { toString(): string } | number;
  unit: string | null;
  unitCode: string | null;
  unitPriceCents: number;
  discountBps: number;
  vatBps: number;
  taxCategory: "STANDARD" | "ZERO_RATED" | "EXEMPT" | "REVERSE_CHARGE" | "OUT_OF_SCOPE" | null;
  taxExemptionReason: string | null;
  taxExemptionReasonCode: string | null;
  itemKind: "PRODUCT" | "SERVICE" | null;
};

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, body: unknown, message: string): T {
  const input = schema.safeParse(body);
  if (!input.success) throw new AuthFlowError(message);
  return input.data;
}

function assertIssuer(role: MemberRole) {
  if (!canIssueCreditNotes(role)) throw forbidden();
}

function money(cents: number, currency: string) {
  return formatMoney(cents, currency);
}

function parseQuantity(value: unknown) {
  if (value === "" || value === undefined || value === null) return 0;
  const normalized = String(value).trim().replace(",", ".");
  if (normalized === "0") return 0;
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) throw new AuthFlowError("Vérifiez les quantités à créditer.");
  const quantity = Number(normalized);
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 100_000) throw new AuthFlowError("Vérifiez les quantités à créditer.");
  return quantity;
}

export function issuedCreditTotals(notes: { status?: string; ttcCents: number; htCents?: number }[]) {
  const issued = notes.filter(note => !note.status || note.status === "SENT");
  return {
    creditedHtCents: issued.reduce((sum, note) => sum + (note.htCents ?? 0), 0),
    creditedTtcCents: issued.reduce((sum, note) => sum + note.ttcCents, 0),
  };
}

export function netAfterCredits(invoiceTtcCents: number, notes: { status?: string; ttcCents: number; htCents?: number }[]) {
  const { creditedHtCents } = issuedCreditTotals(notes);
  const settlement = invoiceSettlement({ grossTtcCents: invoiceTtcCents, creditNotes: notes });
  return {
    creditedHtCents,
    creditedTtcCents: settlement.creditedTtcCents,
    remainingTtcCents: settlement.netTtcCents,
  };
}

function snapshotIssueCustomer(invoice: {
  customerNameSnapshot: string | null;
  customerPartyKindSnapshot: string | null;
  customerFirstNameSnapshot: string | null;
  customerLastNameSnapshot: string | null;
  customerLegalNameSnapshot: string | null;
  customerTradeNameSnapshot: string | null;
  customer: {
    status: "ACTIVE" | "ARCHIVED";
    partyKind: "PERSON" | "COMPANY" | null;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    legalName: string | null;
    tradeName: string | null;
  };
}) {
  const party = invoice.customerPartyKindSnapshot;
  return {
    status: "ACTIVE" as const,
    partyKind: party === "PERSON" || party === "COMPANY" ? party : invoice.customer.partyKind,
    displayName: invoice.customerNameSnapshot || invoice.customer.displayName,
    firstName: invoice.customerFirstNameSnapshot ?? invoice.customer.firstName,
    lastName: invoice.customerLastNameSnapshot ?? invoice.customer.lastName,
    legalName: invoice.customerLegalNameSnapshot ?? invoice.customer.legalName,
    tradeName: invoice.customerTradeNameSnapshot ?? invoice.customer.tradeName,
  };
}

function assertCreditFitsPayments(
  invoice: { ttcCents: number; creditNotes: { id?: string; status?: string; ttcCents: number }[]; payments?: { status?: string; amountCents: number }[] },
  additionalTtcCents: number,
  excludeNoteId?: string,
) {
  const settlement = invoiceSettlement({
    grossTtcCents: invoice.ttcCents,
    creditNotes: invoice.creditNotes.filter(note => note.id !== excludeNoteId),
    payments: invoice.payments,
  });
  if (additionalTtcCents > settlement.remainingTtcCents) throw paidConflict();
  assertInvoiceSettlement(invoiceSettlement({
    grossTtcCents: invoice.ttcCents,
    creditNotes: [...invoice.creditNotes.filter(note => note.id !== excludeNoteId), { status: "SENT", ttcCents: additionalTtcCents }],
    payments: invoice.payments,
  }));
}

export function remainingMilliByLine(invoiceLines: InvoiceLine[], issuedNotes: { status: string; lines: { sourceInvoiceLineId: string | null; quantity: { toString(): string } | number }[] }[]) {
  const remaining = new Map<string, number>();
  for (const line of invoiceLines) remaining.set(line.id, quantityToMilli(line.quantity));
  for (const note of issuedNotes) {
    if (note.status !== "SENT") continue;
    for (const line of note.lines) {
      if (!line.sourceInvoiceLineId) continue;
      remaining.set(line.sourceInvoiceLineId, (remaining.get(line.sourceInvoiceLineId) ?? 0) - quantityToMilli(line.quantity));
    }
  }
  return remaining;
}

function creditLinesFromInvoice(
  organizationId: string,
  invoiceLines: InvoiceLine[],
  remaining: Map<string, number>,
  requested: Map<string, number>,
) {
  const lines: Array<{
    organizationId: string;
    sourceInvoiceLineId: string;
    description: string;
    quantity: number;
    unit: string;
    unitCode: string | null;
    unitPriceCents: number;
    discountBps: number;
    vatBps: number;
    taxCategory: InvoiceLine["taxCategory"];
    taxExemptionReason: string | null;
    taxExemptionReasonCode: string | null;
    itemKind: "PRODUCT" | "SERVICE" | null;
    htCents: number;
    vatCents: number;
    ttcCents: number;
    position: number;
  }> = [];
  for (const source of invoiceLines) {
    const quantity = requested.get(source.id) ?? 0;
    if (quantity <= 0) continue;
    const available = remaining.get(source.id) ?? 0;
    if (quantityToMilli(quantity) > available) throw overCredit();
    const amounts = lineAmounts({
      quantity,
      unitPriceCents: source.unitPriceCents,
      vatBps: source.vatBps,
      discountBps: source.discountBps,
    });
    lines.push({
      organizationId,
      sourceInvoiceLineId: source.id,
      description: source.description,
      quantity,
      unit: source.unit ?? "unité",
      unitCode: source.unitCode,
      unitPriceCents: source.unitPriceCents,
      discountBps: source.discountBps,
      vatBps: source.vatBps,
      taxCategory: source.taxCategory,
      taxExemptionReason: source.taxExemptionReason,
      taxExemptionReasonCode: source.taxExemptionReasonCode,
      itemKind: source.itemKind,
      ...amounts,
      position: lines.length,
    });
  }
  if (lines.length === 0) throw new AuthFlowError("Choisissez au moins une ligne à créditer.");
  return lines;
}

function requestedQuantities(mode: "TOTAL" | "PARTIAL", invoiceLines: InvoiceLine[], remaining: Map<string, number>, body: Record<string, unknown>) {
  const requested = new Map<string, number>();
  for (const line of invoiceLines) {
    if (mode === "TOTAL") {
      const milli = remaining.get(line.id) ?? 0;
      if (milli > 0) requested.set(line.id, milli / 1000);
      continue;
    }
    requested.set(line.id, parseQuantity(body[`quantity-${line.id}`]));
  }
  return requested;
}

async function invoiceForCredit(
  organizationId: string,
  invoiceId: string,
  tx: Pick<ReturnType<typeof getDb>, "document">,
) {
  const invoice = await tx.document.findFirst({
    where: { id: invoiceId, organizationId, kind: "INVOICE" },
    include: {
      customer: true,
      lines: { orderBy: { position: "asc" } },
      creditNotes: { include: { lines: true } },
      payments: { select: { status: true, amountCents: true } },
    },
  });
  if (!invoice) throw new AuthFlowError("Cette facture est introuvable.", 404);
  if (invoice.status !== "SENT") throw new AuthFlowError("Seule une facture émise peut recevoir un avoir.");
  return invoice;
}

async function creditNoteOf(organizationId: string, documentId: string, tx: Pick<ReturnType<typeof getDb>, "document"> = getDb()) {
  const document = await tx.document.findFirst({
    where: { id: documentId, organizationId, kind: "CREDIT_NOTE" },
    include: {
      customer: { select: { id: true, displayName: true } },
      creditedInvoice: { select: { id: true, number: true, title: true, ttcCents: true, status: true, issuedAt: true } },
      lines: { orderBy: { position: "asc" } },
    },
  });
  if (!document) throw missing();
  return document;
}

export async function listCreditNotes(organizationId: string) {
  return getDb().document.findMany({
    where: { organizationId, kind: "CREDIT_NOTE" },
    include: { customer: { select: { id: true, displayName: true } }, creditedInvoice: { select: { id: true, number: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 80,
  });
}

export async function getCreditNote(organizationId: string, documentId: string) {
  return creditNoteOf(organizationId, documentId);
}

export async function createCreditNote(role: MemberRole, organizationId: string, body: unknown, userId: string) {
  assertIssuer(role);
  const input = parse(createCreditNoteSchema, body, "Vérifiez la facture et les lignes à créditer.");
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const db = getDb();
  return db.$transaction(async tx => {
    await lockOrganizationDocuments(tx, organizationId);
    const invoice = await invoiceForCredit(organizationId, input.invoiceId, tx);
    const remaining = remainingMilliByLine(invoice.lines, invoice.creditNotes);
    const lines = creditLinesFromInvoice(organizationId, invoice.lines, remaining, requestedQuantities(input.mode, invoice.lines, remaining, raw));
    const totals = sumLineTotals(lines);
    const net = netAfterCredits(invoice.ttcCents, invoice.creditNotes);
    if (net.remainingTtcCents - totals.ttcCents < 0) throw overCredit();
    assertCreditFitsPayments(invoice, totals.ttcCents);
    const snapshot = copyDocumentSnapshot(invoice);
    snapshot.vatBreakdownSnapshot = vatBreakdown(lines);
    snapshot.operationCategory = computeOperationCategory(lines.map(line => line.itemKind));
    const note = await tx.document.create({
      data: {
        organizationId,
        customerId: invoice.customerId,
        createdById: userId,
        kind: "CREDIT_NOTE",
        status: "DRAFT",
        title: `Avoir — ${invoice.number ?? invoice.title}`,
        creditReason: input.creditReason ?? null,
        creditedInvoiceId: invoice.id,
        ...writableDocumentSnapshot(snapshot),
        ...totals,
        lines: { create: lines },
      },
      include: { customer: { select: { id: true, displayName: true } }, creditedInvoice: { select: { id: true, number: true } }, lines: true },
    });
    await tx.customerActivity.create({
      data: {
        organizationId,
        customerId: invoice.customerId,
        type: "CREDIT_NOTE",
        message: `Avoir brouillon lié à ${invoice.number} (${money(note.ttcCents, snapshot.issuerCurrencySnapshot ?? "EUR")} TTC).`,
        createdById: userId,
      },
    });
    return note;
  });
}

export async function updateCreditNoteDraft(role: MemberRole, organizationId: string, body: unknown) {
  assertIssuer(role);
  const input = parse(updateCreditNoteSchema, body, "Vérifiez les lignes à créditer.");
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const db = getDb();
  return db.$transaction(async tx => {
    await lockOrganizationDocuments(tx, organizationId);
    const current = await creditNoteOf(organizationId, input.documentId, tx);
    if (current.status !== "DRAFT") throw locked();
    if (!current.creditedInvoiceId) throw missing();
    const invoice = await invoiceForCredit(organizationId, current.creditedInvoiceId, tx);
    const remaining = remainingMilliByLine(invoice.lines, invoice.creditNotes.filter(note => note.id !== current.id));
    const lines = creditLinesFromInvoice(organizationId, invoice.lines, remaining, requestedQuantities(input.mode, invoice.lines, remaining, raw));
    const totals = sumLineTotals(lines);
    const net = netAfterCredits(invoice.ttcCents, invoice.creditNotes.filter(note => note.id !== current.id));
    if (net.remainingTtcCents - totals.ttcCents < 0) throw overCredit();
    assertCreditFitsPayments(invoice, totals.ttcCents, current.id);
    const snapshot = copyDocumentSnapshot(invoice);
    snapshot.vatBreakdownSnapshot = vatBreakdown(lines);
    snapshot.operationCategory = computeOperationCategory(lines.map(line => line.itemKind));
    await tx.documentLine.deleteMany({ where: { documentId: current.id, organizationId } });
    await tx.document.update({
      where: { id: current.id },
      data: {
        creditReason: input.creditReason ?? null,
        ...writableDocumentSnapshot(snapshot),
        ...totals,
        lines: { create: lines },
      },
    });
    return creditNoteOf(organizationId, current.id, tx);
  });
}

export async function issueCreditNote(role: MemberRole, organizationId: string, body: unknown, userId: string) {
  assertIssuer(role);
  const { documentId } = parse(documentIdInputSchema, body, "Cet avoir est introuvable.");
  const db = getDb();
  return db.$transaction(async tx => {
    await lockOrganizationDocuments(tx, organizationId);
    const note = await creditNoteOf(organizationId, documentId, tx);
    if (note.status !== "DRAFT") throw locked();
    assertDocumentTransition("CREDIT_NOTE", note.status, "SENT");
    if (!note.creditedInvoiceId) throw missing();
    const invoice = await invoiceForCredit(organizationId, note.creditedInvoiceId, tx);
    const remaining = remainingMilliByLine(invoice.lines, invoice.creditNotes.filter(item => item.id !== note.id));
    for (const line of note.lines) {
      if (!line.sourceInvoiceLineId) throw new AuthFlowError("Chaque ligne d’avoir doit correspondre à une ligne de facture.");
      if (quantityToMilli(line.quantity) > (remaining.get(line.sourceInvoiceLineId) ?? 0)) throw overCredit();
    }
    const net = netAfterCredits(invoice.ttcCents, invoice.creditNotes.filter(item => item.id !== note.id));
    if (net.remainingTtcCents - note.ttcCents < 0) throw overCredit();
    assertCreditFitsPayments(invoice, note.ttcCents, note.id);
    if (invoice.issuerCurrencySnapshot && note.issuerCurrencySnapshot && invoice.issuerCurrencySnapshot !== note.issuerCurrencySnapshot) {
      throw new AuthFlowError("L’avoir doit utiliser la même devise que la facture.");
    }
    validateDocumentForIssue({
      kind: "CREDIT_NOTE",
      customer: snapshotIssueCustomer(invoice),
      lines: note.lines,
      issuerName: invoice.issuerNameSnapshot || note.issuerNameSnapshot || "",
      skipLiveCustomer: true,
    });
    const year = new Date().getFullYear();
    const sequence = await tx.documentSequence.upsert({
      where: { organizationId_kind_year: { organizationId, kind: "CREDIT_NOTE", year } },
      create: { organizationId, kind: "CREDIT_NOTE", year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const number = `AV-${year}-${String(sequence.lastNumber).padStart(4, "0")}`;
    const snapshot = copyDocumentSnapshot(invoice);
    snapshot.vatBreakdownSnapshot = vatBreakdown(note.lines);
    snapshot.operationCategory = computeOperationCategory(note.lines.map(line => line.itemKind));
    const issued = await tx.document.update({
      where: { id: note.id },
      data: {
        status: "SENT",
        number,
        issuedAt: new Date(),
        dueDate: null,
        ...writableDocumentSnapshot(snapshot),
      },
      include: { customer: { select: { id: true, displayName: true } }, creditedInvoice: { select: { id: true, number: true } }, lines: { orderBy: { position: "asc" } } },
    });
    await tx.customerActivity.create({
      data: {
        organizationId,
        customerId: invoice.customerId,
        type: "CREDIT_NOTE",
        message: `Avoir ${number} émis sur ${invoice.number} (${money(issued.ttcCents, snapshot.issuerCurrencySnapshot ?? "EUR")} TTC).`,
        createdById: userId,
      },
    });
    return issued;
  });
}

export async function discardCreditNoteDraft(role: MemberRole, organizationId: string, body: unknown) {
  assertIssuer(role);
  const { documentId } = parse(documentIdInputSchema, body, "Cet avoir est introuvable.");
  const db = getDb();
  return db.$transaction(async tx => {
    await lockOrganizationDocuments(tx, organizationId);
    const note = await creditNoteOf(organizationId, documentId, tx);
    if (note.status !== "DRAFT") throw new AuthFlowError("Seul un brouillon d’avoir peut être abandonné.");
    await tx.document.delete({ where: { id: note.id } });
    return note;
  });
}
