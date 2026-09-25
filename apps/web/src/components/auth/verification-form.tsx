"use client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { resendCodeAction } from "@/lib/auth/actions";

export function VerificationForm() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [resendState, resend, resending] = useActionState(resendCodeAction, undefined);
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    setBusy(true);
    try {
      const result = await signIn("credentials", { code, redirect: false });
      if (result?.error || !result?.ok) setSubmitError("Code incorrect ou expiré. Vérifiez le dernier code reçu ou recommencez la connexion.");
      else {
        toast.success("Connexion validée.");
        router.replace("/espace");
        router.refresh();
      }
    } catch {
      setSubmitError("La connexion est indisponible. Veuillez réessayer.");
    } finally {
      setBusy(false);
    }
  }
  const pending = busy || resending;
  const error = submitError || resendState?.error;
  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-3">
          <Label htmlFor="code">Code de vérification</Label>
          <Input
            id="code"
            autoFocus
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            value={code}
            onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="h-14 text-center text-2xl tracking-[.5em]"
            placeholder="000000"
          />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">Le code expire après cinq minutes. Après cinq essais incorrects, recommencez la connexion.</p>
        {resendState?.ok && !error && <Alert variant="success">Un nouveau code a été envoyé.</Alert>}
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="submit" disabled={pending || code.length !== 6} className="w-full" size="lg">
          {busy ? "Veuillez patienter…" : "Valider et accéder à mon espace"}
        </Button>
      </form>
      <form action={resend}>
        <Button type="submit" variant="outline" disabled={pending} className="w-full">Renvoyer un code</Button>
      </form>
      <p className="text-center text-xs text-muted-foreground">Patientez une minute entre deux envois.</p>
      <Link href="/connexion" className="block text-center text-sm text-primary hover:underline">Recommencer la connexion</Link>
    </div>
  );
}
