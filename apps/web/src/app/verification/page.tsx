import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerificationForm } from "@/components/auth/verification-form";
import { Alert } from "@/components/ui/alert";
import { CHALLENGE_COOKIE } from "@/lib/auth/crypto";
export default async function VerificationPage() {
  if (!(await cookies()).has(CHALLENGE_COOKIE)) redirect("/connexion");
  const local = process.env.MAIL_TRANSPORT === "local" && process.env.NODE_ENV !== "production";
  return (
    <AuthShell title="Vérifions que c’est bien vous" description="Si votre demande est éligible, un code a été envoyé à votre adresse. Vérifiez également les courriers indésirables.">
      {local && <Alert variant="warning" className="mb-5">Mode local : aucun email réel n’est envoyé. Retrouvez le code dans la boîte mail du projet avec <code>npm run mail:local</code> dans votre terminal.</Alert>}
      <VerificationForm />
    </AuthShell>
  );
}
