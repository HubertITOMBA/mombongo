"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cancelAppointmentAction } from "@/lib/appointments/actions";

export function CancelAppointmentButton({ appointmentId, title }: { appointmentId: string; title: string }) {
  const [state, action, pending] = useActionState(cancelAppointmentAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`Annuler ${title}`}>
        {pending ? "Annulation…" : "Annuler"}
      </Button>
      {state?.error && <Alert variant="destructive">{state.error}</Alert>}
    </form>
  );
}
