import { getDb } from "@/lib/db";
import { digest } from "./crypto";
export class AuthFlowError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
// PostgreSQL rend les compteurs atomiques et communs à toutes les instances web.
export async function rateLimit(scope: string, value: string, maximum: number, windowMs = 15 * 60_000) {
  const now = Date.now();
  const key = digest(`rate:${scope}:${value}:${Math.floor(now / windowMs)}`);
  const expiresAt = new Date((Math.floor(now / windowMs) + 1) * windowMs);
  const bucket = await getDb().authRateLimit.upsert({ where: { key }, create: { key, expiresAt }, update: { count: { increment: 1 } } });
  if (bucket.count > maximum) throw new AuthFlowError("Trop de tentatives. Réessayez dans 15 minutes.", 429);
}
export function clientAddress(source: { headers: Headers }) {
  // Activer uniquement derrière un proxy qui écrase cet en-tête, jamais à partir d’un X-Forwarded-For arbitraire.
  if (process.env.AUTH_TRUST_PROXY === "true") return source.headers.get("x-real-ip")?.slice(0, 100) || "unknown";
  return "shared-origin";
}
