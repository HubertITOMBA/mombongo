"use client";
import { useActionState } from "react";
import { activityTypeLabels } from "@mombongo/contracts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { FieldSelect } from "@/components/ui/field-select";
import { addActivityAction } from "@/lib/customers/actions";

export function ActivityForm({ customerId }: { customerId: string }) {
  const [state, action, pending] = useActionState(addActivityAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
      <input type="hidden" name="customerId" value={customerId} />
      <div className="space-y-2">
        <Label htmlFor="activity-type">Type</Label>
        <FieldSelect id="activity-type" name="type" defaultValue="NOTE">
          {(["NOTE", "EMAIL", "CALL", "MEETING"] as const).map(type => <option key={type} value={type}>{activityTypeLabels[type]}</option>)}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="activity-message">Historique</Label>
        <textarea id="activity-message" name="message" required minLength={2} maxLength={2000} rows={2} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-emerald-100" />
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Ajout…" : "Ajouter"}</Button>
      {state?.ok && <Alert variant="success" className="sm:col-span-3">L’activité a été enregistrée.</Alert>}
      {state?.error && <Alert variant="destructive" className="sm:col-span-3">{state.error}</Alert>}
    </form>
  );
}
