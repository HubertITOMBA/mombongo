"use client";
import { useActionState, useState } from "react";
import { roleLabels } from "@mombongo/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { inviteMemberAction } from "@/lib/auth/team-actions";

const roles = ["ADMIN", "MEMBER", "ACCOUNTANT"] as const;

export function InviteForm({ allowedRoles }: { allowedRoles: string[] }) {
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState(inviteMemberAction, undefined);
  const choices = roles.filter(role => allowedRoles.includes(role));
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="invite-email">Adresse email</Label>
        <Input id="invite-email" name="email" type="email" required maxLength={254} placeholder="collaborateur@exemple.fr" value={email} onChange={event => setEmail(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-role">Rôle</Label>
        <select id="invite-role" name="role" defaultValue="MEMBER" className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-emerald-100">
          {choices.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}
        </select>
      </div>
      <Button type="submit" disabled={pending || choices.length === 0} size="lg">{pending ? "Envoi…" : "Envoyer l’invitation"}</Button>
      {state?.ok && <Alert variant="success" className="sm:col-span-3">L’invitation a été envoyée. Le lien est valable sept jours.</Alert>}
      {state?.error && <Alert variant="destructive" className="sm:col-span-3">{state.error}</Alert>}
    </form>
  );
}
