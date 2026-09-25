import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
export function digest(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET doit contenir au moins 32 caractères.");
  return createHmac("sha256", secret).update(value).digest("hex");
}
export function matches(value: string, hash: string) {
  const expected = Buffer.from(digest(value), "hex");
  const actual = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function generateCode() { return randomInt(0, 1_000_000).toString().padStart(6, "0"); }
export const CHALLENGE_COOKIE = "facturia-challenge";
export const CODE_TTL_MS = 5 * 60_000;
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export function challengeCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 15 * 60 };
}
export function parseChallengeToken(token: string) {
  const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);
  return match ? { id: match[1], binding: match[2] } : null;
}
