import { NextRequest, NextResponse } from "next/server";
import { CHALLENGE_COOKIE, challengeCookieOptions } from "./crypto";
import { AuthFlowError, clientAddress } from "./rate-limit";
import { beginAuth, resendCode } from "./service";
import { requestPasswordReset, resetPassword } from "./password-reset";
export function hasValidOrigin(request: Request) {
  const configured = process.env.AUTH_URL;
  return Boolean(configured && request.headers.get("origin") === new URL(configured).origin);
}
export async function handleAuthRequest(request: NextRequest, kind: "register" | "login" | "resend" | "forgot-password" | "reset-password") {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  try {
    if (kind === "resend") {
      await resendCode(request.cookies.get(CHALLENGE_COOKIE)?.value || "", clientAddress(request));
      return NextResponse.json({ ok: true });
    }
    // Limite avant parsing, y compris si Content-Length manque ou est incorrect.
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8192) {
        await reader.cancel();
        return NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 });
      }
      chunks.push(value);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }
    if (kind === "forgot-password") {
      await requestPasswordReset(body, clientAddress(request));
      return NextResponse.json({ ok: true });
    }
    if (kind === "reset-password") {
      await resetPassword(body, clientAddress(request));
      const response = NextResponse.json({ ok: true });
      response.cookies.delete(CHALLENGE_COOKIE);
      return response;
    }
    const token = await beginAuth(kind, body, clientAddress(request));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(CHALLENGE_COOKIE, token, challengeCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof AuthFlowError) return NextResponse.json({ error: error.message }, { status: error.status });
    // Ne pas journaliser les credentials, les codes ou les erreurs fournisseur complètes.
    console.error("Échec du service d’authentification", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Le service de connexion est indisponible. Réessayez plus tard." }, { status: 503 });
  }
}
