import { getDb } from "@/lib/db";

export async function lockOrganizationDocuments(
  tx: { $executeRaw: ReturnType<typeof getDb>["$executeRaw"] },
  organizationId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`docs:${organizationId}`}))`;
}
