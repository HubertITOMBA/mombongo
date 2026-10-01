"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/access";
import { AuthFlowError, clientAddress } from "@/lib/auth/rate-limit";
import { createCatalogItem, deactivateCatalogItem, reactivateCatalogItem, updateCatalogItem } from "./service";

export type CatalogActionState = { error?: string; ok?: true };

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function fail(error: unknown): Promise<CatalogActionState> {
  if (error instanceof AuthFlowError) return { error: error.message };
  console.error("Échec du service catalogue", error instanceof Error ? error.name : "UnknownError");
  return { error: "La demande n’a pas pu aboutir. Réessayez plus tard." };
}

function refreshCatalog(catalogItemId?: string) {
  revalidatePath("/espace/catalogue");
  revalidatePath("/espace/devis");
  if (catalogItemId) revalidatePath(`/espace/catalogue/${catalogItemId}`);
}

export async function createCatalogItemAction(_prev: CatalogActionState | undefined, formData: FormData): Promise<CatalogActionState> {
  let catalogItemId: string;
  try {
    const { membership } = await requireMembership();
    const item = await createCatalogItem(membership.role, membership.organizationId, formObject(formData), clientAddress({ headers: await headers() }));
    catalogItemId = item.id;
    refreshCatalog(item.id);
  } catch (error) {
    return fail(error);
  }
  redirect(`/espace/catalogue/${catalogItemId}`);
}

export async function updateCatalogItemAction(_prev: CatalogActionState | undefined, formData: FormData): Promise<CatalogActionState> {
  try {
    const { membership } = await requireMembership();
    const item = await updateCatalogItem(membership.role, membership.organizationId, formObject(formData));
    refreshCatalog(item.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deactivateCatalogItemAction(_prev: CatalogActionState | undefined, formData: FormData): Promise<CatalogActionState> {
  try {
    const { membership } = await requireMembership();
    const item = await deactivateCatalogItem(membership.role, membership.organizationId, formObject(formData));
    refreshCatalog(item.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function reactivateCatalogItemAction(_prev: CatalogActionState | undefined, formData: FormData): Promise<CatalogActionState> {
  try {
    const { membership } = await requireMembership();
    const item = await reactivateCatalogItem(membership.role, membership.organizationId, formObject(formData));
    refreshCatalog(item.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
