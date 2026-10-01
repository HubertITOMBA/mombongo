"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/access";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { createCreditNote, discardCreditNoteDraft, issueCreditNote, updateCreditNoteDraft } from "./service";

export type CreditNoteActionState = { error?: string; ok?: true };

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function fail(error: unknown): Promise<CreditNoteActionState> {
  if (error instanceof AuthFlowError) return { error: error.message };
  console.error("Échec du service avoirs", error instanceof Error ? error.name : "UnknownError");
  return { error: "La demande n’a pas pu aboutir. Réessayez plus tard." };
}

function refreshCreditNote(noteId?: string, invoiceId?: string | null, customerId?: string | null) {
  revalidatePath("/espace/factures");
  revalidatePath("/espace");
  if (noteId) revalidatePath(`/espace/avoirs/${noteId}`);
  if (invoiceId) {
    revalidatePath(`/espace/factures/${invoiceId}`);
    revalidatePath(`/espace/factures/${invoiceId}/avoir`);
  }
  if (customerId) revalidatePath(`/espace/clients/${customerId}`);
}

export async function createCreditNoteAction(_prev: CreditNoteActionState | undefined, formData: FormData): Promise<CreditNoteActionState> {
  let noteId: string;
  try {
    const { user, membership } = await requireMembership();
    const note = await createCreditNote(membership.role, membership.organizationId, formObject(formData), user.id);
    noteId = note.id;
    refreshCreditNote(note.id, note.creditedInvoiceId, note.customerId);
  } catch (error) {
    return fail(error);
  }
  redirect(`/espace/avoirs/${noteId}`);
}

export async function updateCreditNoteDraftAction(_prev: CreditNoteActionState | undefined, formData: FormData): Promise<CreditNoteActionState> {
  try {
    const { membership } = await requireMembership();
    const note = await updateCreditNoteDraft(membership.role, membership.organizationId, formObject(formData));
    refreshCreditNote(note.id, note.creditedInvoiceId, note.customerId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function issueCreditNoteAction(_prev: CreditNoteActionState | undefined, formData: FormData): Promise<CreditNoteActionState> {
  try {
    const { user, membership } = await requireMembership();
    const note = await issueCreditNote(membership.role, membership.organizationId, formObject(formData), user.id);
    refreshCreditNote(note.id, note.creditedInvoiceId, note.customerId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function discardCreditNoteDraftAction(_prev: CreditNoteActionState | undefined, formData: FormData): Promise<CreditNoteActionState> {
  let invoiceId: string | null = null;
  try {
    const { membership } = await requireMembership();
    const note = await discardCreditNoteDraft(membership.role, membership.organizationId, formObject(formData));
    invoiceId = note.creditedInvoiceId;
    refreshCreditNote(undefined, note.creditedInvoiceId, note.customerId);
  } catch (error) {
    return fail(error);
  }
  if (invoiceId) redirect(`/espace/factures/${invoiceId}`);
  redirect("/espace/factures");
}
