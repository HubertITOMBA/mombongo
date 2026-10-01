"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireMembership } from "./access";
import { AuthFlowError, clientAddress } from "./rate-limit";
import { acceptInvitation, changeMemberRole, inviteMember, previewInvitation, removeMember, revokeInvitation, type InvitationPreview } from "./team";

export type TeamActionState = { error?: string; ok?: true };

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function fail(error: unknown): Promise<TeamActionState> {
  if (error instanceof AuthFlowError) return { error: error.message };
  console.error("Échec du service d’équipe", error instanceof Error ? error.name : "UnknownError");
  return { error: "La demande n’a pas pu aboutir. Réessayez plus tard." };
}

async function sessionUser() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;
  return { id: session.user.id, email: session.user.email };
}

export async function previewInvitationAction(token: string): Promise<{ preview?: InvitationPreview; error?: string }> {
  try {
    return { preview: await previewInvitation(token, await sessionUser()) };
  } catch (error) {
    if (error instanceof AuthFlowError) return { error: error.message };
    return { error: "Cette invitation est invalide ou a expiré." };
  }
}

export async function acceptInvitationAction(_prev: TeamActionState | undefined, formData: FormData): Promise<TeamActionState> {
  const token = String(formData.get("token") || "");
  try {
    await acceptInvitation(token, formObject(formData), clientAddress({ headers: await headers() }), await sessionUser());
  } catch (error) {
    return fail(error);
  }
  redirect("/connexion?invite=1");
}

export async function inviteMemberAction(_prev: TeamActionState | undefined, formData: FormData): Promise<TeamActionState> {
  try {
    const { user, membership } = await requireMembership();
    await inviteMember(user.id, membership.organizationId, membership.role, formObject(formData), clientAddress({ headers: await headers() }));
    revalidatePath("/espace/equipe");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function changeMemberRoleAction(_prev: TeamActionState | undefined, formData: FormData): Promise<TeamActionState> {
  try {
    const { membership } = await requireMembership();
    await changeMemberRole(membership.role, membership.organizationId, formObject(formData));
    revalidatePath("/espace/equipe");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function removeMemberAction(_prev: TeamActionState | undefined, formData: FormData): Promise<TeamActionState> {
  try {
    const { user, membership } = await requireMembership();
    await removeMember(user.id, membership.role, membership.organizationId, String(formData.get("membershipId") || ""));
    revalidatePath("/espace/equipe");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function revokeInvitationAction(_prev: TeamActionState | undefined, formData: FormData): Promise<TeamActionState> {
  try {
    const { membership } = await requireMembership();
    await revokeInvitation(membership.role, membership.organizationId, String(formData.get("invitationId") || ""));
    revalidatePath("/espace/equipe");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
