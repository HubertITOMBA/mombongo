"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAccount } from "./access";
import { persistActiveOrganizationCookie } from "./organization-cookie";
import { resolveOrganizationContext } from "./organization";
import { AuthFlowError } from "./rate-limit";

export async function persistActiveOrganizationAction(organizationId: string) {
  const user = await requireAccount();
  if (user.accountType !== "BUSINESS") return;
  const context = await resolveOrganizationContext(user.id, organizationId);
  await persistActiveOrganizationCookie(context.organization.id);
}

export async function switchActiveOrganizationAction(formData: FormData) {
  const user = await requireAccount();
  if (user.accountType !== "BUSINESS") redirect("/espace");
  try {
    const context = await resolveOrganizationContext(user.id, String(formData.get("organizationId") || ""));
    await persistActiveOrganizationCookie(context.organization.id);
  } catch (error) {
    if (error instanceof AuthFlowError) redirect("/espace?error=organization");
    throw error;
  }
  revalidatePath("/espace", "layout");
  redirect("/espace");
}
