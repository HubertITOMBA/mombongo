import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { AuthFlowError } from "./rate-limit";
import { persistActiveOrganizationCookie, readActiveOrganizationCookie } from "./organization-cookie";
import { resolveActiveOrganization, resolveOrganizationContext } from "./organization";

export async function requireAccount() {
  const session = await auth();
  if (!session?.user?.id) redirect("/connexion");
  // Le type du compte est relu en base ; aucun champ du navigateur ne décide des accès.
  const user = await getDb().user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, accountType: true },
  });
  if (!user) redirect("/connexion");
  return user;
}

export async function requireMembership() {
  const user = await requireAccount();
  if (user.accountType !== "BUSINESS") redirect("/espace");
  const requested = await readActiveOrganizationCookie();
  try {
    const resolved = requested
      ? { context: await resolveOrganizationContext(user.id, requested), usedFallback: false }
      : await resolveActiveOrganization(user.id, null);
    if (resolved.usedFallback || requested !== resolved.context.organization.id) {
      await persistActiveOrganizationCookie(resolved.context.organization.id);
    }
    return { user, membership: resolved.context.membership, organization: resolved.context.organization, role: resolved.context.role };
  } catch {
    const fallback = await resolveActiveOrganization(user.id, null).catch(() => null);
    if (!fallback) redirect("/connexion?error=membership");
    await persistActiveOrganizationCookie(fallback.context.organization.id);
    return { user, membership: fallback.context.membership, organization: fallback.context.organization, role: fallback.context.role };
  }
}

export async function requireApiMembership() {
  const session = await auth();
  if (!session?.user?.id) throw new AuthFlowError("Authentification requise.", 401);
  const user = await getDb().user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, accountType: true },
  });
  if (!user) throw new AuthFlowError("Authentification requise.", 401);
  if (user.accountType !== "BUSINESS") throw new AuthFlowError("Cette fonction est réservée aux entreprises.", 403);
  const requested = await readActiveOrganizationCookie();
  try {
    const resolved = requested
      ? { context: await resolveOrganizationContext(user.id, requested), usedFallback: false }
      : await resolveActiveOrganization(user.id, null);
    return { user, membership: resolved.context.membership, organization: resolved.context.organization, role: resolved.context.role };
  } catch {
    throw new AuthFlowError("Organisation introuvable.", 403);
  }
}
