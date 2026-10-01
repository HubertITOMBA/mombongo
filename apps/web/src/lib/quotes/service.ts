import { addQuoteLineSchema, createQuoteSchema, documentIdInputSchema, formatMoney } from "@mombongo/contracts";
import { getDb } from "@/lib/db";
import { AuthFlowError, rateLimit } from "@/lib/auth/rate-limit";
import { canWriteQuotes } from "@/lib/auth/permissions";
import { issuerDisplayName, loadPartySnapshot, writableDocumentSnapshot } from "@/lib/documents/snapshot";
import { lineAmounts, sumLineTotals } from "@/lib/documents/money";
import { validateDocumentForIssue } from "@/lib/documents/validate";
import { lockOrganizationDocuments } from "@/lib/documents/lock";
import { assertDocumentTransition } from "@/lib/documents/transitions";
import { resolveCatalogLine } from "@/lib/catalog/service";
import type { DocumentStatus, MemberRole } from "@/generated/prisma/client";

const forbidden = () => new AuthFlowError("Votre rôle ne permet pas de modifier les devis.", 403);
const missing = () => new AuthFlowError("Ce devis est introuvable.", 404);
const locked = () => new AuthFlowError("Ce devis n’est plus un brouillon.");

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, body: unknown, message: string): T {
  const input = schema.safeParse(body);
  if (!input.success) throw new AuthFlowError(message);
  return input.data;
}

function assertWriter(role: MemberRole) {
  if (!canWriteQuotes(role)) throw forbidden();
}

function money(cents: number, currency: string) {
  return formatMoney(cents, currency);
}

async function totalsOf(tx: Pick<ReturnType<typeof getDb>, "documentLine" | "document">, organizationId: string, documentId: string) {
  const lines = await tx.documentLine.findMany({ where: { documentId, organizationId } });
  return tx.document.update({
    where: { id: documentId },
    data: sumLineTotals(lines),
  });
}

async function quoteOf(organizationId: string, documentId: string, tx: Pick<ReturnType<typeof getDb>, "document"> = getDb()) {
  const document = await tx.document.findFirst({
    where: { id: documentId, organizationId, kind: "QUOTE" },
    include: { customer: { select: { id: true, displayName: true, kind: true, status: true } }, lines: { orderBy: { position: "asc" } }, derived: { select: { id: true, number: true } } },
  });
  if (!document) throw missing();
  return document;
}

export async function listQuotes(organizationId: string) {
  return getDb().document.findMany({
    where: { organizationId, kind: "QUOTE" },
    include: { customer: { select: { id: true, displayName: true } }, derived: { select: { id: true, number: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 80,
  });
}

export async function getQuote(organizationId: string, documentId: string) {
  return quoteOf(organizationId, documentId);
}

export async function countOpenQuotes(organizationId: string) {
  return getDb().document.count({
    where: { organizationId, kind: "QUOTE", status: { in: ["DRAFT", "SENT"] } },
  });
}

export async function createQuote(role: MemberRole, organizationId: string, body: unknown, address: string, userId: string) {
  assertWriter(role);
  await rateLimit("quote-create", address, 40);
  const input = parse(createQuoteSchema, body, "Vérifiez le destinataire, le titre et la première ligne du devis.");
  const db = getDb();
  const [customer, organization] = await Promise.all([
    db.customer.findFirst({ where: { id: input.customerId, organizationId } }),
    db.organization.findFirst({ where: { id: organizationId }, select: { currency: true } }),
  ]);
  if (!customer) throw new AuthFlowError("La fiche liée à ce devis est introuvable.", 404);
  if (customer.status === "ARCHIVED") throw new AuthFlowError("Cette fiche est archivée. Restaurez-la pour créer un devis.");
  return db.$transaction(async tx => {
    const line = await resolveCatalogLine(organizationId, input, tx);
    const amounts = lineAmounts({ ...input, ...line });
    const document = await tx.document.create({
      data: {
        organizationId,
        customerId: customer.id,
        createdById: userId,
        kind: "QUOTE",
        title: input.title,
        notes: input.notes ?? null,
        validUntil: input.validUntil ? new Date(`${input.validUntil}T12:00:00.000Z`) : null,
        supplyDate: input.supplyDate ? new Date(`${input.supplyDate}T12:00:00.000Z`) : null,
        customerOrderNumber: input.customerOrderNumber ?? null,
        htCents: amounts.htCents,
        vatCents: amounts.vatCents,
        ttcCents: amounts.ttcCents,
        lines: {
          create: {
            organizationId,
            description: line.description,
            quantity: input.quantity,
            unit: line.unit,
            unitCode: line.unitCode,
            unitPriceCents: line.unitPriceCents,
            discountBps: input.discountBps,
            vatBps: line.vatBps,
            taxCategory: line.taxCategory,
            taxExemptionReason: line.taxExemptionReason,
            taxExemptionReasonCode: line.taxExemptionReasonCode,
            itemKind: line.itemKind,
            ...amounts,
            position: 0,
          },
        },
      },
      include: { customer: { select: { id: true, displayName: true } }, lines: true },
    });
    await tx.customerActivity.create({
      data: {
        organizationId,
        customerId: customer.id,
        type: "QUOTE",
        message: `Devis brouillon « ${document.title} » (${money(document.ttcCents, organization?.currency ?? "EUR")} TTC).`,
        createdById: userId,
      },
    });
    return document;
  });
}

export async function addQuoteLine(role: MemberRole, organizationId: string, body: unknown) {
  assertWriter(role);
  const input = parse(addQuoteLineSchema, body, "Vérifiez la description, la quantité et le prix de la ligne.");
  const db = getDb();
  return db.$transaction(async tx => {
    const document = await quoteOf(organizationId, input.documentId, tx);
    if (document.status !== "DRAFT") throw locked();
    const line = await resolveCatalogLine(organizationId, input, tx);
    const amounts = lineAmounts({ ...input, ...line });
    await tx.documentLine.create({
      data: {
        organizationId,
        documentId: document.id,
        description: line.description,
        quantity: input.quantity,
        unit: line.unit,
        unitCode: line.unitCode,
        unitPriceCents: line.unitPriceCents,
        discountBps: input.discountBps,
        vatBps: line.vatBps,
        taxCategory: line.taxCategory,
        taxExemptionReason: line.taxExemptionReason,
        taxExemptionReasonCode: line.taxExemptionReasonCode,
        itemKind: line.itemKind,
        ...amounts,
        position: document.lines.length,
      },
    });
    await totalsOf(tx, organizationId, document.id);
    return quoteOf(organizationId, document.id, tx);
  });
}

export async function sendQuote(role: MemberRole, organizationId: string, body: unknown, userId: string) {
  assertWriter(role);
  const { documentId } = parse(documentIdInputSchema, body, "Ce devis est introuvable.");
  const db = getDb();
  return db.$transaction(async tx => {
    await lockOrganizationDocuments(tx, organizationId);
    const document = await quoteOf(organizationId, documentId, tx);
    if (document.status !== "DRAFT") throw locked();
    assertDocumentTransition("QUOTE", document.status, "SENT");
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const customer = await tx.customer.findFirstOrThrow({ where: { id: document.customerId, organizationId } });
    validateDocumentForIssue({
      kind: "QUOTE",
      customer,
      lines: document.lines,
      issuerName: issuerDisplayName(organization),
    });
    const year = new Date().getFullYear();
    const sequence = await tx.documentSequence.upsert({
      where: { organizationId_kind_year: { organizationId, kind: "QUOTE", year } },
      create: { organizationId, kind: "QUOTE", year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const number = `DEV-${year}-${String(sequence.lastNumber).padStart(4, "0")}`;
    const snapshot = await loadPartySnapshot(organizationId, document.customerId, tx, document.lines);
    const updated = await tx.document.update({
      where: { id: document.id },
      data: { status: "SENT", number, issuedAt: new Date(), ...writableDocumentSnapshot(snapshot) },
      include: { customer: { select: { id: true, displayName: true, kind: true } }, lines: { orderBy: { position: "asc" } } },
    });
    await tx.customerActivity.create({
      data: {
        organizationId,
        customerId: document.customerId,
        type: "QUOTE",
        message: `Devis ${number} envoyé (${money(document.ttcCents, snapshot.issuerCurrencySnapshot)} TTC).`,
        createdById: userId,
      },
    });
    return updated;
  });
}

export async function acceptQuote(role: MemberRole, organizationId: string, body: unknown, userId: string) {
  assertWriter(role);
  const { documentId } = parse(documentIdInputSchema, body, "Ce devis est introuvable.");
  const db = getDb();
  return db.$transaction(async tx => {
    await lockOrganizationDocuments(tx, organizationId);
    const document = await quoteOf(organizationId, documentId, tx);
    if (document.status !== "SENT") throw new AuthFlowError("Seuls les devis envoyés peuvent être acceptés.");
    assertDocumentTransition("QUOTE", document.status, "ACCEPTED");
    const updated = await tx.document.update({
      where: { id: document.id },
      data: { status: "ACCEPTED" },
      include: { customer: { select: { id: true, displayName: true, kind: true } }, lines: { orderBy: { position: "asc" } } },
    });
    if (document.customer.kind === "PROSPECT") {
      await tx.customer.update({
        where: { id: document.customerId },
        data: { kind: "CLIENT", stage: "WON" },
      });
      await tx.customerActivity.create({
        data: {
          organizationId,
          customerId: document.customerId,
          type: "CONVERTED",
          message: `Prospect converti en client après acceptation du devis ${document.number}.`,
          createdById: userId,
        },
      });
    }
    await tx.customerActivity.create({
      data: {
        organizationId,
        customerId: document.customerId,
        type: "QUOTE",
        message: `Devis ${document.number} accepté.`,
        createdById: userId,
      },
    });
    return updated;
  });
}

export async function refuseQuote(role: MemberRole, organizationId: string, body: unknown, userId: string) {
  return closeQuote(role, organizationId, body, userId, "REFUSED", "refusé");
}

export async function cancelQuote(role: MemberRole, organizationId: string, body: unknown, userId: string) {
  return closeQuote(role, organizationId, body, userId, "CANCELLED", "annulé");
}

async function closeQuote(role: MemberRole, organizationId: string, body: unknown, userId: string, status: Extract<DocumentStatus, "REFUSED" | "CANCELLED">, label: string) {
  assertWriter(role);
  const { documentId } = parse(documentIdInputSchema, body, "Ce devis est introuvable.");
  const db = getDb();
  return db.$transaction(async tx => {
    await lockOrganizationDocuments(tx, organizationId);
    const document = await quoteOf(organizationId, documentId, tx);
    if (document.status === "ACCEPTED" || document.status === "CANCELLED" || document.status === "REFUSED") {
      throw new AuthFlowError("Ce devis est déjà clos.");
    }
    assertDocumentTransition("QUOTE", document.status, status);
    const updated = await tx.document.update({
      where: { id: document.id },
      data: { status },
      include: { customer: { select: { id: true, displayName: true } }, lines: { orderBy: { position: "asc" } } },
    });
    await tx.customerActivity.create({
      data: {
        organizationId,
        customerId: document.customerId,
        type: "QUOTE",
        message: `Devis ${document.number ?? "brouillon"} ${label}.`,
        createdById: userId,
      },
    });
    return updated;
  });
}
