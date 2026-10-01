"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/access";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { cancelPayment, recordPayment } from "./service";

export type PaymentActionState = { error?: string; ok?: true };

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function fail(error: unknown): Promise<PaymentActionState> {
  if (error instanceof AuthFlowError) return { error: error.message };
  console.error("Échec du service paiements", error instanceof Error ? error.name : "UnknownError");
  return { error: "La demande n’a pas pu aboutir. Réessayez plus tard." };
}

function refreshPayment(invoiceId?: string | null, customerId?: string | null) {
  revalidatePath("/espace/factures");
  revalidatePath("/espace");
  if (invoiceId) revalidatePath(`/espace/factures/${invoiceId}`);
  if (customerId) revalidatePath(`/espace/clients/${customerId}`);
}

export async function recordPaymentAction(_prev: PaymentActionState | undefined, formData: FormData): Promise<PaymentActionState> {
  try {
    const { user, membership } = await requireMembership();
    const payment = await recordPayment(membership.role, membership.organizationId, formObject(formData), user.id);
    refreshPayment(payment.invoiceId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelPaymentAction(_prev: PaymentActionState | undefined, formData: FormData): Promise<PaymentActionState> {
  try {
    const { user, membership } = await requireMembership();
    const payment = await cancelPayment(membership.role, membership.organizationId, formObject(formData), user.id);
    refreshPayment(payment.invoiceId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
