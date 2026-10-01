import { getDb } from "@/lib/db";
import { AuthFlowError } from "./rate-limit";
import type { MemberRole } from "@/generated/prisma/client";

export const ORGANIZATION_HEADER = "x-organization-id";
const ORGANIZATION_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|c[a-z0-9]{20,32})$/i;

export type OrganizationSummary = {
  id: string;
  name: string;
  role: MemberRole;
  membershipId: string;
};

export type OrganizationContext = {
  organization: { id: string; name: string };
  membership: {
    id: string;
    userId: string;
    organizationId: string;
    role: MemberRole;
    createdAt: Date;
    organization: { id: string; name: string } & Record<string, unknown>;
  };
  role: MemberRole;
};

export function normalizeOrganizationId(value?: string | null, mode: "strict" | "lenient" = "lenient") {
  const id = value?.trim() ?? "";
  if (!id) return null;
  if (!ORGANIZATION_ID.test(id)) {
    if (mode === "strict") throw new AuthFlowError("Organisation introuvable.", 403);
    return null;
  }
  return id;
}

export async function listAccessibleOrganizations(userId: string): Promise<OrganizationSummary[]> {
  const memberships = await getDb().membership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { id: true, name: true } } },
  });
  return memberships.map(item => ({
    id: item.organization.id,
    name: item.organization.name,
    role: item.role,
    membershipId: item.id,
  }));
}

export async function resolveOrganizationContext(userId: string, organizationId: string): Promise<OrganizationContext> {
  const id = normalizeOrganizationId(organizationId, "strict");
  if (!id) throw new AuthFlowError("Organisation introuvable.", 403);
  const membership = await getDb().membership.findFirst({
    where: { userId, organizationId: id },
    include: { organization: true },
  });
  if (!membership) throw new AuthFlowError("Vous n’appartenez pas à cette entreprise.", 403);
  return {
    organization: { id: membership.organization.id, name: membership.organization.name },
    membership,
    role: membership.role,
  };
}

export async function resolveFallbackOrganization(userId: string): Promise<OrganizationContext | null> {
  const membership = await getDb().membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { organization: true },
  });
  if (!membership) return null;
  return {
    organization: { id: membership.organization.id, name: membership.organization.name },
    membership,
    role: membership.role,
  };
}

export async function resolveActiveOrganization(userId: string, requestedOrganizationId?: string | null): Promise<{
  context: OrganizationContext;
  usedFallback: boolean;
}> {
  const requested = normalizeOrganizationId(requestedOrganizationId, requestedOrganizationId ? "strict" : "lenient");
  if (requested) {
    return { context: await resolveOrganizationContext(userId, requested), usedFallback: false };
  }
  const fallback = await resolveFallbackOrganization(userId);
  if (!fallback) throw new AuthFlowError("Aucun espace entreprise n’est disponible.", 403);
  return {
    context: fallback,
    usedFallback: true,
  };
}

export const ACTIVE_ORG_COOKIE = "mombongo-active-org";
export const LEGACY_ACTIVE_ORG_COOKIE = "facturia-active-org";

export function pickActiveOrganizationCookie(current?: string | null, legacy?: string | null) {
  const next = normalizeOrganizationId(current, "lenient");
  if (next) return { organizationId: next, migrate: false as const };
  const previous = normalizeOrganizationId(legacy, "lenient");
  if (previous) return { organizationId: previous, migrate: true as const };
  return { organizationId: null, migrate: false as const };
}
