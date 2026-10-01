"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/access";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { cancelInvoice, convertQuoteToInvoice } from "./service";

export type InvoiceActionState = { error?: string; ok?: true };

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function fail(error: unknown): Promise<InvoiceActionState> {
  if (error instanceof AuthFlowError) return { error: error.message };
  console.error("Échec du service factures", error instanceof Error ? error.name : "UnknownError");
  return { error: "La demande n’a pas pu aboutir. Réessayez plus tard." };
}

function refreshInvoice(invoiceId?: string, quoteId?: string, customerId?: string | null) {
  revalidatePath("/espace/factures");
  revalidatePath("/espace/devis");
  revalidatePath("/espace");
  if (invoiceId) revalidatePath(`/espace/factures/${invoiceId}`);
  if (quoteId) revalidatePath(`/espace/devis/${quoteId}`);
  if (customerId) revalidatePath(`/espace/clients/${customerId}`);
}

export async function convertQuoteToInvoiceAction(_prev: InvoiceActionState | undefined, formData: FormData): Promise<InvoiceActionState> {
  let invoiceId: string;
  try {
    const { user, membership } = await requireMembership();
    const invoice = await convertQuoteToInvoice(membership.role, membership.organizationId, formObject(formData), user.id);
    invoiceId = invoice.id;
    refreshInvoice(invoice.id, invoice.sourceDocumentId ?? undefined, invoice.customerId);
  } catch (error) {
    return fail(error);
  }
  redirect(`/espace/factures/${invoiceId}`);
}

export async function cancelInvoiceAction(_prev: InvoiceActionState | undefined, formData: FormData): Promise<InvoiceActionState> {
  try {
    const { user, membership } = await requireMembership();
    const invoice = await cancelInvoice(membership.role, membership.organizationId, formObject(formData), user.id);
    refreshInvoice(invoice.id, invoice.sourceDocumentId ?? undefined, invoice.customerId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
