"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/access";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { submitElectronicDocument } from "./service";

export type ElectronicPlatformActionState = { error?: string; ok?: true };

async function fail(error: unknown): Promise<ElectronicPlatformActionState> {
  if (error instanceof AuthFlowError) return { error: error.message };
  console.error("Échec du service de facturation électronique", error instanceof Error ? error.name : "UnknownError");
  return { error: "La demande n’a pas pu aboutir. Réessayez plus tard." };
}

export async function submitElectronicDocumentAction(
  _prev: ElectronicPlatformActionState | undefined,
  formData: FormData,
): Promise<ElectronicPlatformActionState> {
  try {
    const { membership } = await requireMembership();
    const documentId = String(formData.get("documentId") ?? "");
    await submitElectronicDocument(membership.role, membership.organizationId, { documentId });
    revalidatePath(`/espace/factures/${documentId}`);
    revalidatePath(`/espace/avoirs/${documentId}`);
    revalidatePath("/espace/factures");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
