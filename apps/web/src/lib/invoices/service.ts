import { documentIdInputSchema, formatMoney } from "@mombongo/contracts";
import { getDb } from "@/lib/db";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { canCancelInvoices, canIssueInvoices } from "@/lib/auth/permissions";
import { copyDocumentSnapshot, issuerDisplayName, writableDocumentSnapshot } from "@/lib/documents/snapshot";
import { addCalendarDays } from "@/lib/documents/money";
import { validateDocumentForIssue } from "@/lib/documents/validate";
import { lockOrganizationDocuments } from "@/lib/documents/lock";
import { assertDocumentTransition } from "@/lib/documents/transitions";
import type { MemberRole } from "@/generated/prisma/client";

const missing = () => new AuthFlowError("Cette facture est introuvable.", 404);

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, body: unknown, message: string): T {
  const input = schema.safeParse(body);
  if (!input.success) throw new AuthFlowError(message);
  return input.data;
}

function assertIssuer(role: MemberRole) {
  if (!canIssueInvoices(role)) throw new AuthFlowError("Votre rôle ne permet pas d’émettre une facture.", 403);
}

function assertCanceller(role: MemberRole) {
  if (!canCancelInvoices(role)) throw new AuthFlowError("Votre rôle ne permet pas d’annuler une facture.", 403);
}

export async function listInvoices(organizationId: string) {
  return getDb().document.findMany({
    where: { organizationId, kind: "INVOICE" },
    include: {
      customer: { select: { id: true, displayName: true } },
      source: { select: { id: true, number: true, title: true } },
      creditNotes: { where: { status: "SENT" }, select: { status: true, ttcCents: true, htCents: true } },
      payments: { select: { status: true, amountCents: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 80,
  });
}

export async function getInvoice(organizationId: string, documentId: string) {
  const document = await getDb().document.findFirst({
    where: { id: documentId, organizationId, kind: "INVOICE" },
    include: {
      customer: { select: { id: true, displayName: true } },
      source: { select: { id: true, number: true, title: true } },
      lines: { orderBy: { position: "asc" } },
      creditNotes: {
        orderBy: { createdAt: "desc" },
        include: { lines: { orderBy: { position: "asc" } } },
      },
      payments: { orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!document) throw missing();
  return document;
}

export async function convertQuoteToInvoice(role: MemberRole, organizationId: string, body: unknown, userId: string) {
  assertIssuer(role);
  const { documentId } = parse(documentIdInputSchema, body, "Ce devis est introuvable.");
  const db = getDb();
  return db.$transaction(async tx => {
    await lockOrganizationDocuments(tx, organizationId);
    const quote = await tx.document.findFirst({
      where: { id: documentId, organizationId, kind: "QUOTE" },
      include: { customer: true, lines: { orderBy: { position: "asc" } }, derived: { select: { id: true } } },
    });
    if (!quote) throw new AuthFlowError("Ce devis est introuvable.", 404);
    if (quote.status !== "ACCEPTED") throw new AuthFlowError("Seul un devis accepté peut devenir une facture.");
    if (quote.derived.length > 0) throw new AuthFlowError("Une facture existe déjà pour ce devis.");
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
    validateDocumentForIssue({
      kind: "INVOICE",
      customer: quote.customer,
      lines: quote.lines,
      issuerName: quote.issuerNameSnapshot || issuerDisplayName(organization),
    });
    const year = new Date().getFullYear();
    const sequence = await tx.documentSequence.upsert({
      where: { organizationId_kind_year: { organizationId, kind: "INVOICE", year } },
      create: { organizationId, kind: "INVOICE", year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const number = `FA-${year}-${String(sequence.lastNumber).padStart(4, "0")}`;
    const issuedAt = new Date();
    const dueDays = organization.invoiceDueDays ?? 30;
    const snapshot = copyDocumentSnapshot(quote);
    const invoice = await tx.document.create({
      data: {
        organizationId,
        customerId: quote.customerId,
        createdById: userId,
        kind: "INVOICE",
        status: "SENT",
        number,
        title: quote.title,
        notes: quote.notes,
        issuedAt,
        dueDate: addCalendarDays(issuedAt, dueDays),
        supplyDate: quote.supplyDate ?? issuedAt,
        customerOrderNumber: quote.customerOrderNumber,
        ...writableDocumentSnapshot(snapshot),
        htCents: quote.htCents,
        vatCents: quote.vatCents,
        ttcCents: quote.ttcCents,
        sourceDocumentId: quote.id,
        lines: {
          create: quote.lines.map(line => ({
            organizationId,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            unitCode: line.unitCode,
            unitPriceCents: line.unitPriceCents,
            discountBps: line.discountBps,
            vatBps: line.vatBps,
            taxCategory: line.taxCategory,
            taxExemptionReason: line.taxExemptionReason,
            taxExemptionReasonCode: line.taxExemptionReasonCode,
            htCents: line.htCents,
            vatCents: line.vatCents,
            ttcCents: line.ttcCents,
            itemKind: line.itemKind,
            position: line.position,
          })),
        },
      },
      include: { customer: { select: { id: true, displayName: true } }, source: { select: { id: true, number: true } } },
    });
    await tx.customerActivity.create({
      data: {
        organizationId,
        customerId: quote.customerId,
        type: "INVOICE",
        message: `Facture ${number} créée depuis le devis ${quote.number} (${formatMoney(invoice.ttcCents, snapshot.issuerCurrencySnapshot ?? organization.currency)} TTC).`,
        createdById: userId,
      },
    });
    return invoice;
  });
}

export async function cancelInvoice(role: MemberRole, organizationId: string, body: unknown, userId: string) {
  assertCanceller(role);
  const { documentId } = parse(documentIdInputSchema, body, "Cette facture est introuvable.");
  const db = getDb();
  return db.$transaction(async tx => {
    await lockOrganizationDocuments(tx, organizationId);
    const invoice = await tx.document.findFirst({ where: { id: documentId, organizationId, kind: "INVOICE" } });
    if (!invoice) throw missing();
    if (invoice.status === "CANCELLED") throw new AuthFlowError("Cette facture est déjà annulée.");
    assertDocumentTransition("INVOICE", invoice.status, "CANCELLED");
    const updated = await tx.document.update({
      where: { id: invoice.id },
      data: { status: "CANCELLED" },
      include: { customer: { select: { id: true, displayName: true } }, source: { select: { id: true, number: true } } },
    });
    await tx.customerActivity.create({
      data: {
        organizationId,
        customerId: invoice.customerId,
        type: "INVOICE",
        message: `Brouillon de facture ${invoice.number ?? invoice.title} abandonné.`,
        createdById: userId,
      },
    });
    return updated;
  });
}
