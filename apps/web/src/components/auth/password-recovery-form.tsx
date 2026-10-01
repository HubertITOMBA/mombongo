"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { requestPasswordResetAction, resetPasswordAction } from "@/lib/auth/actions";
import { resetPasswordSchema } from "@mombongo/contracts";

let rememberedResetToken: string | null = null;

export function PasswordRecoveryForm({ reset = false }: { reset?: boolean }) {
  const initialized = useRef(false);
  const [token, setToken] = useState(rememberedResetToken ?? "");
  const [ready, setReady] = useState(!reset);
  const [clientError, setClientError] = useState("");
  const [state, action, pending] = useActionState(reset ? resetPasswordAction : requestPasswordResetAction, undefined);
  useEffect(() => {
    if (!reset) return;
    if (initialized.current) return;
    initialized.current = true;
    // Le fragment n’est jamais envoyé au serveur dans l’URL ni dans le Referer.
    const value = window.location.hash.slice(1);
    const next = /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(value) ? value : rememberedResetToken ?? "";
    if (next) rememberedResetToken = next;
    // Lecture unique du fragment d’URL, puis retrait pour qu’il ne reparte pas au serveur.
    setToken(next);
    setReady(true);
    window.history.replaceState(null, "", window.location.pathname);
  }, [reset]);
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    setClientError("");
    if (!reset) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = resetPasswordSchema.safeParse({ ...values, token });
    if (!parsed.success) {
      event.preventDefault();
      setClientError(parsed.error.issues[0].message);
    }
  }
  const error = clientError || state?.error;
  if (state?.ok) {
    return (
      <div className="space-y-5">
        <Alert variant="success" className="rounded-xl p-4">
          {reset
            ? "Votre mot de passe a été modifié. Vos anciennes sessions ont été déconnectées. Connectez-vous avec le nouveau mot de passe puis validez votre code à six chiffres."
            : "Si un compte correspond à cette adresse, vous recevrez un lien valable quinze minutes. Vérifiez aussi les courriers indésirables."}
        </Alert>
        <Link href="/connexion" className="block text-center text-sm font-medium text-primary hover:underline">Retour à la connexion</Link>
      </div>
    );
  }
  if (!ready) return <p role="status" className="text-sm text-muted-foreground">Chargement du lien…</p>;
  if (reset && !token) {
    return (
      <div className="space-y-5">
        <Alert variant="warning" className="p-4">Ouvrez le lien complet reçu par email. Si vous avez actualisé cette page, ouvrez à nouveau le lien.</Alert>
        <Link href="/mot-de-passe-oublie" className="block text-sm text-primary hover:underline">Demander un nouveau lien</Link>
      </div>
    );
  }
  return (
    <form action={action} onSubmit={onSubmit} className="space-y-5">
      {reset ? (
        <>
          <input type="hidden" name="token" value={token} />
          <PasswordInput label="Nouveau mot de passe" name="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="reset-password-help" />
          <p id="reset-password-help" className="text-xs text-muted-foreground">12 caractères minimum. Utilisez une phrase de passe unique.</p>
          <PasswordInput label="Confirmer le mot de passe" name="confirmation" autoComplete="new-password" required minLength={12} maxLength={128} />
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="email">Adresse email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="vous@exemple.fr" />
        </div>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button type="submit" disabled={pending} className="w-full" size="lg">
        {pending ? "Veuillez patienter…" : reset ? "Enregistrer le nouveau mot de passe" : "Recevoir le lien de réinitialisation"}
      </Button>
      <Link href={reset ? "/mot-de-passe-oublie" : "/connexion"} className="block text-center text-sm text-primary hover:underline">
        {reset ? "Demander un nouveau lien" : "Retour à la connexion"}
      </Link>
    </form>
  );
}
