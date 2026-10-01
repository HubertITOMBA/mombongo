"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/access";
import { AuthFlowError, clientAddress } from "@/lib/auth/rate-limit";
import { acceptQuote, addQuoteLine, cancelQuote, createQuote, refuseQuote, sendQuote } from "./service";

export type QuoteActionState = { error?: string; ok?: true };

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function fail(error: unknown): Promise<QuoteActionState> {
  if (error instanceof AuthFlowError) return { error: error.message };
  console.error("Échec du service devis", error instanceof Error ? error.name : "UnknownError");
  return { error: "La demande n’a pas pu aboutir. Réessayez plus tard." };
}

function refreshQuote(documentId?: string, customerId?: string | null) {
  revalidatePath("/espace/devis");
  revalidatePath("/espace");
  if (documentId) revalidatePath(`/espace/devis/${documentId}`);
  if (customerId) revalidatePath(`/espace/clients/${customerId}`);
}

export async function createQuoteAction(_prev: QuoteActionState | undefined, formData: FormData): Promise<QuoteActionState> {
  let documentId: string;
  try {
    const { user, membership } = await requireMembership();
    const document = await createQuote(membership.role, membership.organizationId, formObject(formData), clientAddress({ headers: await headers() }), user.id);
    documentId = document.id;
    refreshQuote(document.id, document.customerId);
  } catch (error) {
    return fail(error);
  }
  redirect(`/espace/devis/${documentId}`);
}

export async function addQuoteLineAction(_prev: QuoteActionState | undefined, formData: FormData): Promise<QuoteActionState> {
  try {
    const { membership } = await requireMembership();
    const document = await addQuoteLine(membership.role, membership.organizationId, formObject(formData));
    refreshQuote(document.id, document.customerId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function sendQuoteAction(_prev: QuoteActionState | undefined, formData: FormData): Promise<QuoteActionState> {
  try {
    const { user, membership } = await requireMembership();
    const document = await sendQuote(membership.role, membership.organizationId, formObject(formData), user.id);
    refreshQuote(document.id, document.customerId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function acceptQuoteAction(_prev: QuoteActionState | undefined, formData: FormData): Promise<QuoteActionState> {
  try {
    const { user, membership } = await requireMembership();
    const document = await acceptQuote(membership.role, membership.organizationId, formObject(formData), user.id);
    refreshQuote(document.id, document.customerId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function refuseQuoteAction(_prev: QuoteActionState | undefined, formData: FormData): Promise<QuoteActionState> {
  try {
    const { user, membership } = await requireMembership();
    const document = await refuseQuote(membership.role, membership.organizationId, formObject(formData), user.id);
    refreshQuote(document.id, document.customerId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelQuoteAction(_prev: QuoteActionState | undefined, formData: FormData): Promise<QuoteActionState> {
  try {
    const { user, membership } = await requireMembership();
    const document = await cancelQuote(membership.role, membership.organizationId, formObject(formData), user.id);
    refreshQuote(document.id, document.customerId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
