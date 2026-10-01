"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { roleLabels } from "@mombongo/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { PasswordInput } from "@/components/ui/password-input";
import { acceptInvitationAction, previewInvitationAction } from "@/lib/auth/team-actions";
import type { InvitationPreview } from "@/lib/auth/team";

let rememberedInviteToken: string | null = null;

export function InvitationForm() {
  const initialized = useRef(false);
  const [token, setToken] = useState(rememberedInviteToken ?? "");
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [state, action, pending] = useActionState(acceptInvitationAction, undefined);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const value = window.location.hash.slice(1);
    const next = /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(value) ? value : rememberedInviteToken ?? "";
    if (next) rememberedInviteToken = next;
    setToken(next);
    window.history.replaceState(null, "", window.location.pathname);
    if (!next) {
      setLoadError("Ouvrez le lien complet reçu par email.");
      setReady(true);
      return;
    }
    void previewInvitationAction(next).then(result => {
      if (result.preview) setPreview(result.preview);
      else setLoadError(result.error || "Cette invitation est invalide ou a expiré.");
      setReady(true);
    });
  }, []);
  if (!ready) return <p role="status" className="text-sm text-muted-foreground">Chargement de l’invitation…</p>;
  if (loadError || !preview) {
    return (
      <div className="space-y-5">
        <Alert variant="warning" className="p-4">{loadError || "Cette invitation est invalide ou a expiré."}</Alert>
        <Link href="/connexion" className="block text-center text-sm text-primary hover:underline">Aller à la connexion</Link>
      </div>
    );
  }
  if (preview.status === "member") {
    return (
      <div className="space-y-5">
        <Alert variant="success" className="rounded-xl p-4">Vous faites déjà partie de {preview.organizationName}.</Alert>
        <Link href="/espace" className="block text-center text-sm font-medium text-primary hover:underline">Ouvrir mon espace</Link>
      </div>
    );
  }
  if (preview.status === "login") {
    return (
      <div className="space-y-5">
        <Alert variant="warning" className="p-4">Un compte existe déjà pour {preview.email}. Connectez-vous, puis rouvrez le lien reçu par email pour rejoindre {preview.organizationName}.</Alert>
        <Link href="/connexion" className="block text-center text-sm font-medium text-primary hover:underline">Se connecter</Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <p className="rounded-xl bg-accent p-4 text-sm text-emerald-900">
        Invitation à rejoindre <strong>{preview.organizationName}</strong> en tant que {roleLabels[preview.role]}.
      </p>
      {preview.status === "signup" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="name">Votre nom</Label>
            <Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">Compte : {preview.email}</p>
          <PasswordInput label="Mot de passe" name="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} />
          <PasswordInput label="Confirmer le mot de passe" name="confirmation" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
        </>
      )}
      {state?.error && <Alert variant="destructive">{state.error}</Alert>}
      <Button type="submit" disabled={pending} className="w-full" size="lg">
        {pending ? "Validation…" : preview.status === "signup" ? "Créer mon compte et rejoindre" : "Rejoindre l’entreprise"}
      </Button>
      <Link href="/connexion" className="block text-center text-sm text-primary hover:underline">Retour à la connexion</Link>
    </form>
  );
}
