"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/access";
import { AuthFlowError, clientAddress } from "@/lib/auth/rate-limit";
import { addAddress, addCustomerActivity, archiveCustomer, changePipelineStage, convertProspect, createCustomer, removeAddress, restoreCustomer, updateAddress, updateCustomer } from "./service";

export type CustomerActionState = { error?: string; ok?: true };

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function fail(error: unknown): Promise<CustomerActionState> {
  if (error instanceof AuthFlowError) return { error: error.message };
  console.error("Échec du service clients", error instanceof Error ? error.name : "UnknownError");
  return { error: "La demande n’a pas pu aboutir. Réessayez plus tard." };
}

function refreshCustomer(customerId?: string) {
  revalidatePath("/espace/clients");
  revalidatePath("/espace/pipeline");
  if (customerId) revalidatePath(`/espace/clients/${customerId}`);
}

export async function createCustomerAction(_prev: CustomerActionState | undefined, formData: FormData): Promise<CustomerActionState> {
  let customerId: string;
  try {
    const { user, membership } = await requireMembership();
    const customer = await createCustomer(membership.role, membership.organizationId, formObject(formData), clientAddress({ headers: await headers() }), user.id);
    customerId = customer.id;
    refreshCustomer(customer.id);
  } catch (error) {
    return fail(error);
  }
  redirect(`/espace/clients/${customerId}`);
}

export async function updateCustomerAction(_prev: CustomerActionState | undefined, formData: FormData): Promise<CustomerActionState> {
  try {
    const { user, membership } = await requireMembership();
    const customer = await updateCustomer(membership.role, membership.organizationId, formObject(formData), user.id);
    refreshCustomer(customer.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function archiveCustomerAction(_prev: CustomerActionState | undefined, formData: FormData): Promise<CustomerActionState> {
  try {
    const { membership } = await requireMembership();
    const customer = await archiveCustomer(membership.role, membership.organizationId, formObject(formData));
    refreshCustomer(customer.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function restoreCustomerAction(_prev: CustomerActionState | undefined, formData: FormData): Promise<CustomerActionState> {
  try {
    const { membership } = await requireMembership();
    const customer = await restoreCustomer(membership.role, membership.organizationId, formObject(formData));
    refreshCustomer(customer.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function convertProspectAction(_prev: CustomerActionState | undefined, formData: FormData): Promise<CustomerActionState> {
  try {
    const { user, membership } = await requireMembership();
    const customer = await convertProspect(membership.role, membership.organizationId, formObject(formData), user.id);
    refreshCustomer(customer.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function addAddressAction(_prev: CustomerActionState | undefined, formData: FormData): Promise<CustomerActionState> {
  try {
    const { membership } = await requireMembership();
    const address = await addAddress(membership.role, membership.organizationId, formObject(formData));
    if (address.customerId) refreshCustomer(address.customerId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function updateAddressAction(_prev: CustomerActionState | undefined, formData: FormData): Promise<CustomerActionState> {
  try {
    const { membership } = await requireMembership();
    const address = await updateAddress(membership.role, membership.organizationId, formObject(formData));
    if (address.customerId) refreshCustomer(address.customerId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function changeStageAction(_prev: CustomerActionState | undefined, formData: FormData): Promise<CustomerActionState> {
  try {
    const { user, membership } = await requireMembership();
    const customer = await changePipelineStage(membership.role, membership.organizationId, formObject(formData), user.id);
    refreshCustomer(customer.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function addActivityAction(_prev: CustomerActionState | undefined, formData: FormData): Promise<CustomerActionState> {
  try {
    const { user, membership } = await requireMembership();
    const customer = await addCustomerActivity(membership.role, membership.organizationId, formObject(formData), user.id);
    refreshCustomer(customer.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function removeAddressAction(_prev: CustomerActionState | undefined, formData: FormData): Promise<CustomerActionState> {
  try {
    const { membership } = await requireMembership();
    await removeAddress(membership.role, membership.organizationId, formObject(formData));
    refreshCustomer(String(formData.get("customerId") || ""));
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
