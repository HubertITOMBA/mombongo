import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE, LEGACY_ACTIVE_ORG_COOKIE, pickActiveOrganizationCookie } from "./organization";

export { ACTIVE_ORG_COOKIE, LEGACY_ACTIVE_ORG_COOKIE, pickActiveOrganizationCookie };

export function activeOrgCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}

export async function readActiveOrganizationCookie() {
  const jar = await cookies();
  const picked = pickActiveOrganizationCookie(jar.get(ACTIVE_ORG_COOKIE)?.value, jar.get(LEGACY_ACTIVE_ORG_COOKIE)?.value);
  if (picked.migrate && picked.organizationId) await persistActiveOrganizationCookie(picked.organizationId);
  return picked.organizationId;
}

export async function persistActiveOrganizationCookie(organizationId: string) {
  try {
    const jar = await cookies();
    jar.set(ACTIVE_ORG_COOKIE, organizationId, activeOrgCookieOptions());
    jar.delete(LEGACY_ACTIVE_ORG_COOKIE);
  } catch {
    // Un Server Component ne peut pas écrire de cookie ; le binder client le fera.
  }
}

export async function clearActiveOrganizationCookie() {
  try {
    const jar = await cookies();
    jar.delete(ACTIVE_ORG_COOKIE);
    jar.delete(LEGACY_ACTIVE_ORG_COOKIE);
  } catch {
    // Même limite d’écriture hors Server Action.
  }
}
