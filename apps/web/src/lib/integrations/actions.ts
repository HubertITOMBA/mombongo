"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/access";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { testElectronicInvoicingConnection, upsertElectronicInvoicingConnection } from "@/lib/einvoice-platform/service";
import { upsertPaymentConnection } from "@/lib/payments/connections";

export type IntegrationActionState = { error?: string; ok?: true; message?: string };

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function fail(error: unknown): Promise<IntegrationActionState> {
  if (error instanceof AuthFlowError) return { error: error.message };
  console.error("Échec du service d’intégrations", error instanceof Error ? error.name : "UnknownError");
  return { error: "La demande n’a pas pu aboutir. Réessayez plus tard." };
}

function refresh() {
  revalidatePath("/espace/integrations");
  revalidatePath("/espace/organisation");
}

export async function upsertElectronicInvoicingConnectionAction(
  _prev: IntegrationActionState | undefined,
  formData: FormData,
): Promise<IntegrationActionState> {
  try {
    const { membership } = await requireMembership();
    await upsertElectronicInvoicingConnection(membership.role, membership.organizationId, formObject(formData));
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function testElectronicInvoicingConnectionAction(
  _prev: IntegrationActionState | undefined,
  _formData: FormData,
): Promise<IntegrationActionState> {
  try {
    const { membership } = await requireMembership();
    const result = await testElectronicInvoicingConnection(membership.role, membership.organizationId);
    refresh();
    return { ok: true, message: result.message };
  } catch (error) {
    return fail(error);
  }
}

export async function upsertPaymentConnectionAction(
  _prev: IntegrationActionState | undefined,
  formData: FormData,
): Promise<IntegrationActionState> {
  try {
    const { membership } = await requireMembership();
    await upsertPaymentConnection(membership.role, membership.organizationId, formObject(formData));
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
