import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
export const metadata: Metadata = { title: "Nouveau mot de passe — Mombongo", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function ResetPasswordPage() {
  return <AuthShell title="Choisissez un nouveau mot de passe" description="Confirmez votre nouveau mot de passe. Cette modification déconnectera tous les appareils associés à votre compte."><PasswordRecoveryForm reset /></AuthShell>;
}
