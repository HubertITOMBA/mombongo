"use client";
import { useActionState } from "react";
import { roleLabels } from "@mombongo/contracts";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { changeMemberRoleAction, removeMemberAction, revokeInvitationAction } from "@/lib/auth/team-actions";
import type { AssignableRole } from "@/lib/auth/permissions";

export function MemberRoleForm({ membershipId, role, options }: { membershipId: string; role: string; options: AssignableRole[] }) {
  const [state, action, pending] = useActionState(changeMemberRoleAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <select name="role" defaultValue={role} className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
        {options.map(option => <option key={option} value={option}>{roleLabels[option]}</option>)}
      </select>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>Enregistrer</Button>
      {state?.error && <Alert variant="destructive" className="w-full">{state.error}</Alert>}
    </form>
  );
}

export function RemoveMemberButton({ membershipId, name }: { membershipId: string; name: string }) {
  const [state, action, pending] = useActionState(removeMemberAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="membershipId" value={membershipId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`Retirer ${name}`}>{pending ? "Retrait…" : "Retirer"}</Button>
      {state?.error && <Alert variant="destructive" className="mt-2">{state.error}</Alert>}
    </form>
  );
}

export function RevokeInvitationButton({ invitationId, email }: { invitationId: string; email: string }) {
  const [state, action, pending] = useActionState(revokeInvitationAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`Annuler l’invitation de ${email}`}>{pending ? "Annulation…" : "Annuler"}</Button>
      {state?.error && <Alert variant="destructive" className="mt-2">{state.error}</Alert>}
    </form>
  );
}
