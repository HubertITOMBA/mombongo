import { AuthFlowError } from "@/lib/auth/rate-limit";

export const settlementStates = ["UNPAID", "PARTIALLY_PAID", "PAID", "CREDITED"] as const;
export type SettlementState = (typeof settlementStates)[number];

type CreditLike = { status?: string; ttcCents: number };
type PaymentLike = { status?: string; amountCents: number };

function issuedCredits(notes: CreditLike[] = []) {
  return notes.filter(note => !note.status || note.status === "SENT").reduce((sum, note) => sum + note.ttcCents, 0);
}

function confirmedPayments(payments: PaymentLike[] = []) {
  return payments.filter(payment => !payment.status || payment.status === "CONFIRMED").reduce((sum, payment) => sum + payment.amountCents, 0);
}

export function invoiceSettlement(input: {
  grossTtcCents: number;
  creditNotes?: CreditLike[];
  payments?: PaymentLike[];
}) {
  const grossTtcCents = input.grossTtcCents;
  const creditedTtcCents = issuedCredits(input.creditNotes);
  const netTtcCents = grossTtcCents - creditedTtcCents;
  const paidTtcCents = confirmedPayments(input.payments);
  const remainingTtcCents = netTtcCents - paidTtcCents;
  let settlementState: SettlementState = "UNPAID";
  if (netTtcCents === 0 && creditedTtcCents > 0 && paidTtcCents === 0) {
    settlementState = "CREDITED";
  } else if (netTtcCents > 0 && paidTtcCents === 0) {
    settlementState = "UNPAID";
  } else if (paidTtcCents > 0 && paidTtcCents < netTtcCents) {
    settlementState = "PARTIALLY_PAID";
  } else if (paidTtcCents === netTtcCents && netTtcCents > 0) {
    settlementState = "PAID";
  }
  return {
    grossTtcCents,
    creditedTtcCents,
    netTtcCents,
    paidTtcCents,
    remainingTtcCents,
    settlementState,
  };
}

export function assertInvoiceSettlement(settlement: ReturnType<typeof invoiceSettlement>) {
  if (settlement.grossTtcCents < 0 || settlement.creditedTtcCents < 0 || settlement.paidTtcCents < 0) {
    throw new AuthFlowError("Le solde de cette facture est incohérent.", 409);
  }
  if (settlement.creditedTtcCents > settlement.grossTtcCents) {
    throw new AuthFlowError("Les avoirs dépassent le total de la facture.", 409);
  }
  if (settlement.remainingTtcCents < 0 || settlement.paidTtcCents > settlement.netTtcCents) {
    throw new AuthFlowError("Les encaissements dépassent le net facturé.", 409);
  }
}

export function isInvoiceOverdue(remainingTtcCents: number, dueDate: Date | string | null, now = new Date()) {
  if (remainingTtcCents <= 0 || !dueDate) return false;
  return new Date(dueDate).getTime() < now.getTime();
}
