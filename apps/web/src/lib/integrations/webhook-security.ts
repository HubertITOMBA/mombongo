import { timingSafeEqual } from "node:crypto";

export function timestampsAreFresh(unixSeconds: string, maxAgeMs = 5 * 60_000) {
  if (!/^\d{10,12}$/.test(unixSeconds)) return false;
  return Math.abs(Date.now() - Number(unixSeconds) * 1000) <= maxAgeMs;
}

export function equalHex(left: string, right: string) {
  try {
    const a = Buffer.from(left, "hex");
    const b = Buffer.from(right, "hex");
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
