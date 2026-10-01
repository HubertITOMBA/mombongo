"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/access";
import { AuthFlowError, clientAddress } from "@/lib/auth/rate-limit";
import { cancelAppointment, createAppointment } from "./service";

export type AppointmentActionState = { error?: string; ok?: true };

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function fail(error: unknown): Promise<AppointmentActionState> {
  if (error instanceof AuthFlowError) return { error: error.message };
  console.error("Échec du service agenda", error instanceof Error ? error.name : "UnknownError");
  return { error: "La demande n’a pas pu aboutir. Réessayez plus tard." };
}

function refreshAgenda(customerId?: string | null) {
  revalidatePath("/espace/agenda");
  revalidatePath("/espace");
  if (customerId) revalidatePath(`/espace/clients/${customerId}`);
}

export async function createAppointmentAction(_prev: AppointmentActionState | undefined, formData: FormData): Promise<AppointmentActionState> {
  try {
    const { user, membership } = await requireMembership();
    const appointment = await createAppointment(
      membership.role,
      membership.organizationId,
      formObject(formData),
      clientAddress({ headers: await headers() }),
      user.id,
    );
    refreshAgenda(appointment.customerId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelAppointmentAction(_prev: AppointmentActionState | undefined, formData: FormData): Promise<AppointmentActionState> {
  try {
    const { membership } = await requireMembership();
    const appointment = await cancelAppointment(membership.role, membership.organizationId, formObject(formData));
    refreshAgenda(appointment.customerId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
