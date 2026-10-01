"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { CHALLENGE_COOKIE, LEGACY_CHALLENGE_COOKIE, challengeCookieOptions } from "./crypto";
import { AuthFlowError, clientAddress } from "./rate-limit";
import { beginAuth, resendCode } from "./service";
import { requestPasswordReset, resetPassword } from "./password-reset";

export type AuthActionState = { error?: string; ok?: true };

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function fail(error: unknown): Promise<AuthActionState> {
  if (error instanceof AuthFlowError) return { error: error.message };
  console.error("Échec du service d’authentification", error instanceof Error ? error.name : "UnknownError");
  return { error: "Le service de connexion est indisponible. Réessayez plus tard." };
}

export async function startAuthAction(_prev: AuthActionState | undefined, formData: FormData): Promise<AuthActionState> {
  const kind = formData.get("kind") === "register" ? "register" : "login";
  const body = formObject(formData);
  delete body.kind;
  try {
    const token = await beginAuth(kind, body, clientAddress({ headers: await headers() }));
    const jar = await cookies();
    jar.set(CHALLENGE_COOKIE, token, challengeCookieOptions());
    jar.delete(LEGACY_CHALLENGE_COOKIE);
  } catch (error) {
    return fail(error);
  }
  redirect("/verification");
}

export async function resendCodeAction(_prev: AuthActionState | undefined, _formData: FormData): Promise<AuthActionState> {
  try {
    await resendCode((await cookies()).get(CHALLENGE_COOKIE)?.value || "", clientAddress({ headers: await headers() }));
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function requestPasswordResetAction(_prev: AuthActionState | undefined, formData: FormData): Promise<AuthActionState> {
  try {
    await requestPasswordReset(formObject(formData), clientAddress({ headers: await headers() }));
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function resetPasswordAction(_prev: AuthActionState | undefined, formData: FormData): Promise<AuthActionState> {
  try {
    await resetPassword(formObject(formData), clientAddress({ headers: await headers() }));
    const jar = await cookies();
    jar.delete(CHALLENGE_COOKIE);
    jar.delete(LEGACY_CHALLENGE_COOKIE);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
