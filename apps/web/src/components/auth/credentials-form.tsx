"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { startAuthAction } from "@/lib/auth/actions";

export function CredentialsForm({ register = false }: { register?: boolean }) {
  const [accountType, setAccountType] = useState<"INDIVIDUAL" | "BUSINESS">("BUSINESS");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, action, pending] = useActionState(startAuthAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="kind" value={register ? "register" : "login"} />
      {register && (
        <fieldset disabled={pending} className="space-y-3">
          <legend className="mb-3 text-sm font-medium">Quel espace souhaitez-vous créer ?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {([{ value: "INDIVIDUAL", title: "Particulier", description: "Mes factures et mes paiements" }, { value: "BUSINESS", title: "Entreprise", description: "Mon activité et mes clients" }] as const).map(option => (
              <label key={option.value} className={`cursor-pointer rounded-xl border p-4 ${accountType === option.value ? "border-primary bg-accent" : "border-border hover:bg-muted"}`}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="accountType" value={option.value} checked={accountType === option.value} onChange={() => setAccountType(option.value)} className="accent-primary" />
                  <span className="text-sm font-semibold">{option.title}</span>
                </span>
                <span className="mt-2 block text-xs text-muted-foreground">{option.description}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {register && (
        <>
          <div className="space-y-2">
            <Label htmlFor="name">Votre nom</Label>
            <Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Camille Martin" value={name} onChange={event => setName(event.target.value)} />
          </div>
          {accountType === "BUSINESS" && (
            <div className="space-y-2">
              <Label htmlFor="organizationName">Nom de votre entreprise</Label>
              <Input id="organizationName" name="organizationName" autoComplete="organization" required minLength={2} maxLength={120} placeholder="Mon entreprise" value={organizationName} onChange={event => setOrganizationName(event.target.value)} />
            </div>
          )}
        </>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Adresse email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="vous@exemple.fr" value={email} onChange={event => setEmail(event.target.value)} />
      </div>
      <PasswordInput label="Mot de passe" name="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 12 : 1} maxLength={128} aria-describedby={register ? "password-help" : undefined} value={password} onChange={event => setPassword(event.target.value)} />
      {register && <span id="password-help" className="mt-2 block text-xs font-normal text-muted-foreground">12 caractères minimum. Privilégiez une phrase de passe unique.</span>}
      {!register && <Link href="/mot-de-passe-oublie" className="block text-right text-sm font-medium text-primary hover:underline">Mot de passe oublié ?</Link>}
      {state?.error && <Alert variant="destructive">{state.error}</Alert>}
      <Button disabled={pending} className="w-full" size="lg" type="submit">
        {pending ? <LoaderCircle className="animate-spin" size={17} /> : <ArrowRight size={17} />}
        {register ? "Créer mon espace" : "Continuer"}
      </Button>
      {register && <p className="text-xs leading-relaxed text-muted-foreground">L’inscription ne déclenche aucun abonnement ni paiement. Les modules métier sont en cours de développement.</p>}
      <p className="border-t border-border pt-5 text-center text-sm text-muted-foreground">
        {register ? "Déjà un compte ? " : "Vous découvrez Facturia ? "}
        <Link className="font-medium text-primary underline-offset-4 hover:underline" href={register ? "/connexion" : "/inscription"}>
          {register ? "Se connecter" : "Créer un compte"}
        </Link>
      </p>
    </form>
  );
}
