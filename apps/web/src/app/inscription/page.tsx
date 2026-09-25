import { AuthShell } from "@/components/auth/auth-shell";
import { CredentialsForm } from "@/components/auth/credentials-form";
export default function RegisterPage() {
  return <AuthShell title="Un espace qui vous ressemble" description="Choisissez Particulier ou Entreprise, puis confirmez votre adresse email pour accéder à votre espace."><CredentialsForm register /></AuthShell>;
}
