"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/access";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { addOrganizationAddress, removeOrganizationAddress, updateOrganizationAddress, updateOrganizationIdentity } from "./service";

export type OrganizationActionState = { error?: string; ok?: true };

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function fail(error: unknown): Promise<OrganizationActionState> {
  if (error instanceof AuthFlowError) return { error: error.message };
  console.error("Échec du service d’identité d’organisation", error instanceof Error ? error.name : "UnknownError");
  return { error: "La demande n’a pas pu aboutir. Réessayez plus tard." };
}

function refreshOrganization() {
  revalidatePath("/espace/organisation");
  revalidatePath("/espace", "layout");
}

export async function updateOrganizationIdentityAction(_prev: OrganizationActionState | undefined, formData: FormData): Promise<OrganizationActionState> {
  try {
    const { membership } = await requireMembership();
    await updateOrganizationIdentity(membership.role, membership.organizationId, formObject(formData));
    refreshOrganization();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function addOrganizationAddressAction(_prev: OrganizationActionState | undefined, formData: FormData): Promise<OrganizationActionState> {
  try {
    const { membership } = await requireMembership();
    await addOrganizationAddress(membership.role, membership.organizationId, formObject(formData));
    refreshOrganization();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function updateOrganizationAddressAction(_prev: OrganizationActionState | undefined, formData: FormData): Promise<OrganizationActionState> {
  try {
    const { membership } = await requireMembership();
    await updateOrganizationAddress(membership.role, membership.organizationId, formObject(formData));
    refreshOrganization();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function removeOrganizationAddressAction(_prev: OrganizationActionState | undefined, formData: FormData): Promise<OrganizationActionState> {
  try {
    const { membership } = await requireMembership();
    await removeOrganizationAddress(membership.role, membership.organizationId, formObject(formData));
    refreshOrganization();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
