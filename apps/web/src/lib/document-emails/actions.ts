"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/access";
import { AuthFlowError, clientAddress } from "@/lib/auth/rate-limit";
import { sendDocumentEmail } from "./service";

export type DocumentEmailActionState = { error?: string; ok?: true };

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function fail(error: unknown): Promise<DocumentEmailActionState> {
  if (error instanceof AuthFlowError) return { error: error.message };
  console.error("Échec de l’envoi du document", error instanceof Error ? error.name : "UnknownError");
  return { error: "La demande n’a pas pu aboutir. Réessayez plus tard." };
}

export async function sendDocumentEmailAction(
  _prev: DocumentEmailActionState | undefined,
  formData: FormData,
): Promise<DocumentEmailActionState> {
  try {
    const { user, membership } = await requireMembership();
    const documentId = String(formData.get("documentId") ?? "");
    await sendDocumentEmail(
      membership.role,
      membership.organizationId,
      formObject(formData),
      user.id,
      clientAddress({ headers: await headers() }),
    );
    revalidatePath(`/espace/devis/${documentId}`);
    revalidatePath(`/espace/factures/${documentId}`);
    revalidatePath(`/espace/avoirs/${documentId}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
