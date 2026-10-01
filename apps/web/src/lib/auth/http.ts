import { NextRequest, NextResponse } from "next/server";
import { getAuthOrigin } from "@/lib/app-url";
import { CHALLENGE_COOKIE, LEGACY_CHALLENGE_COOKIE, challengeCookieOptions } from "./crypto";
import { AuthFlowError, clientAddress } from "./rate-limit";
import { beginAuth, resendCode } from "./service";
import { requestPasswordReset, resetPassword } from "./password-reset";
export function hasValidOrigin(request: Request) {
  try {
    return request.headers.get("origin") === getAuthOrigin();
  } catch {
    return false;
  }
}
export function allowMobileRequest(request: Request) {
  const origin = request.headers.get("origin");
  return origin ? hasValidOrigin(request) : true;
}
export async function readJsonBody(request: NextRequest, limit = 8192): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, response: NextResponse.json({ error: "Requête invalide." }, { status: 400 }) };
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      return { ok: false, response: NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 }) };
    }
    chunks.push(value);
  }
  try {
    return { ok: true, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Requête invalide." }, { status: 400 }) };
  }
}
export function authErrorResponse(error: unknown) {
  if (error instanceof AuthFlowError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Échec du service d’authentification", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "Le service de connexion est indisponible. Réessayez plus tard." }, { status: 503 });
}
export async function handleAuthRequest(request: NextRequest, kind: "register" | "login" | "resend" | "forgot-password" | "reset-password") {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  try {
    if (kind === "resend") {
      await resendCode(request.cookies.get(CHALLENGE_COOKIE)?.value || "", clientAddress(request));
      return NextResponse.json({ ok: true });
    }
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;
    if (kind === "forgot-password") {
      await requestPasswordReset(parsed.body, clientAddress(request));
      return NextResponse.json({ ok: true });
    }
    if (kind === "reset-password") {
      await resetPassword(parsed.body, clientAddress(request));
      const response = NextResponse.json({ ok: true });
      response.cookies.delete(CHALLENGE_COOKIE);
      response.cookies.delete(LEGACY_CHALLENGE_COOKIE);
      return response;
    }
    const token = await beginAuth(kind, parsed.body, clientAddress(request));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(CHALLENGE_COOKIE, token, challengeCookieOptions());
    response.cookies.delete(LEGACY_CHALLENGE_COOKIE);
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
