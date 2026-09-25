import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { Alert } from "@/components/ui/alert";
export default function ForgotPasswordPage() {
  const local = process.env.MAIL_TRANSPORT === "local" && process.env.NODE_ENV !== "production";
  return (
    <AuthShell title="Mot de passe oublié ?" description="Indiquez l’adresse email de votre compte pour recevoir un lien et choisir un nouveau mot de passe.">
      {local && <Alert variant="warning" className="mb-5">Mode local : retrouvez le lien avec <code>npm run mail:local</code> dans votre terminal. Aucun email réel n’est envoyé.</Alert>}
      <PasswordRecoveryForm />
    </AuthShell>
  );
}
