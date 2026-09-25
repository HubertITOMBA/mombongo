import { AuthShell } from "@/components/auth/auth-shell";
import { CredentialsForm } from "@/components/auth/credentials-form";
export default function LoginPage() {
  return <AuthShell title="Heureux de vous retrouver" description="Saisissez vos identifiants. Un code à six chiffres vous permettra ensuite de valider votre connexion."><CredentialsForm /></AuthShell>;
}
