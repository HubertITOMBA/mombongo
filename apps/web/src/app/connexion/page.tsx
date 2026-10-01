import { AuthShell } from "@/components/auth/auth-shell";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { Alert } from "@/components/ui/alert";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const invited = (await searchParams).invite === "1";
  return (
    <AuthShell title="Heureux de vous retrouver" description="Saisissez vos identifiants. Un code à six chiffres vous permettra ensuite de valider votre connexion.">
      {invited && <Alert variant="success" className="mb-5 rounded-xl p-4">Votre accès a été créé. Connectez-vous avec votre mot de passe, puis validez le code email.</Alert>}
      <CredentialsForm />
    </AuthShell>
  );
}
