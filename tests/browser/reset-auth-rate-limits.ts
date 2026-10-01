import { config } from "dotenv";
import { getDb } from "../../apps/web/src/lib/db";

config({ path: "apps/web/.env.local", quiet: true });

/** Vide uniquement `AuthRateLimit` (buckets hachés). Aucune donnée métier. */
export async function resetE2eAuthRateLimits(options: { disconnect?: boolean } = {}) {
  const db = getDb();
  await db.authRateLimit.deleteMany();
  if (options.disconnect) await db.$disconnect();
}
