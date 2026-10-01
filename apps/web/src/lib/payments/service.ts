import { formatMoney, paymentIdInputSchema, recordPaymentSchema } from "@mombongo/contracts";
import { getDb } from "@/lib/db";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { canCancelPayments, canRecordPayments } from "@/lib/auth/permissions";
import { documentCurrency } from "@/lib/documents/snapshot";
import { invoiceSettlement, assertInvoiceSettlement } from "@/lib/invoices/settlement";
import { lockOrganizationDocuments } from "@/lib/documents/lock";
import type { MemberRole, PaymentMethod } from "@/generated/prisma/client";

const missingInvoice = () => new AuthFlowError("Cette facture est introuvable.", 404);
const missingPayment = () => new AuthFlowError("Ce paiement est introuvable.", 404);
const overpay = () => new AuthFlowError("Ce paiement dépasse le reste à payer.", 409);

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, body: unknown, message: string): T {
  const input = schema.safeParse(body);
  if (!input.success) throw new AuthFlowError(message);
  return input.data;
}

function paidAtFrom(value: string | undefined) {
  if (!value) return new Date();
  return new Date(`${value}T12:00:00.000Z`);
}

async function invoiceForPayment(organizationId: string, invoiceId: string, tx: Pick<ReturnType<typeof getDb>, "document">) {
  const invoice = await tx.document.findFirst({
    where: { id: invoiceId, organizationId, kind: "INVOICE" },
    include: {
      creditNotes: { where: { status: "SENT" }, select: { status: true, ttcCents: true } },
      payments: { select: { status: true, amountCents: true } },
    },
  });
  if (!invoice) throw missingInvoice();
  return invoice;
}

export function settlementOf(invoice: {
  ttcCents: number;
  creditNotes?: { status?: string; ttcCents: number }[];
  payments?: { status?: string; amountCents: number }[];
}) {
  return invoiceSettlement({
    grossTtcCents: invoice.ttcCents,
    creditNotes: invoice.creditNotes,
    payments: invoice.payments,
  });
}

export async function listInvoicePayments(organizationId: string, invoiceId: string) {
  const invoice = await getDb().document.findFirst({
    where: { id: invoiceId, organizationId, kind: "INVOICE" },
    select: { id: true },
  });
  if (!invoice) throw missingInvoice();
  return getDb().payment.findMany({
    where: { organizationId, invoiceId },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function recordPayment(role: MemberRole, organizationId: string, body: unknown, userId: string) {
  if (!canRecordPayments(role)) throw new AuthFlowError("Votre rôle ne permet pas d’enregistrer un paiement.", 403);
  const input = parse(recordPaymentSchema, body, "Vérifiez le montant, la date et le moyen de paiement.");
  const db = getDb();
  return db.$transaction(async tx => {
    await lockOrganizationDocuments(tx, organizationId);
    const invoice = await invoiceForPayment(organizationId, input.invoiceId, tx);
    if (invoice.status !== "SENT") throw new AuthFlowError("Seule une facture émise peut recevoir un paiement.");
    const settlement = settlementOf(invoice);
    assertInvoiceSettlement(settlement);
    if (settlement.remainingTtcCents <= 0) throw overpay();
    if (input.amountCents > settlement.remainingTtcCents) throw overpay();
    assertInvoiceSettlement(invoiceSettlement({
      grossTtcCents: invoice.ttcCents,
      creditNotes: invoice.creditNotes,
      payments: [...invoice.payments, { status: "CONFIRMED", amountCents: input.amountCents }],
    }));
    const currency = documentCurrency(invoice, "EUR");
    const payment = await tx.payment.create({
      data: {
        organizationId,
        invoiceId: invoice.id,
        amountCents: input.amountCents,
        currency,
        paidAt: paidAtFrom(input.paidAt),
        method: input.method as PaymentMethod,
        reference: input.reference ?? null,
        note: input.note ?? null,
        status: "CONFIRMED",
        provider: "MANUAL",
        createdById: userId,
      },
    });
    await tx.customerActivity.create({
      data: {
        organizationId,
        customerId: invoice.customerId,
        type: "PAYMENT",
        message: `Paiement de ${formatMoney(payment.amountCents, currency)} enregistré sur ${invoice.number}.`,
        createdById: userId,
      },
    });
    return payment;
  });
}

export async function cancelPayment(role: MemberRole, organizationId: string, body: unknown, userId: string) {
  if (!canCancelPayments(role)) throw new AuthFlowError("Votre rôle ne permet pas d’annuler un paiement.", 403);
  const { paymentId } = parse(paymentIdInputSchema, body, "Ce paiement est introuvable.");
  const db = getDb();
  return db.$transaction(async tx => {
    await lockOrganizationDocuments(tx, organizationId);
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, organizationId },
      include: { invoice: { select: { id: true, number: true, customerId: true, kind: true } } },
    });
    if (!payment) throw missingPayment();
    if (payment.status === "CANCELLED") throw new AuthFlowError("Ce paiement est déjà annulé.");
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { status: "CANCELLED" },
    });
    await tx.customerActivity.create({
      data: {
        organizationId,
        customerId: payment.invoice.customerId,
        type: "PAYMENT",
        message: `Paiement de ${formatMoney(payment.amountCents, payment.currency)} annulé sur ${payment.invoice.number}.`,
        createdById: userId,
      },
    });
    return updated;
  });
}
