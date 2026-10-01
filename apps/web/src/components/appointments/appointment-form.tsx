"use client";

import { useActionState, useState } from "react";
import { appointmentDurations } from "@mombongo/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { FieldSelect } from "@/components/ui/field-select";
import { createAppointmentAction } from "@/lib/appointments/actions";

function nextSlot() {
  const date = new Date(Date.now() + 60 * 60_000);
  date.setMinutes(0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AppointmentForm({
  customers,
}: {
  customers: { id: string; displayName: string }[];
}) {
  const [state, action, pending] = useActionState(createAppointmentAction, undefined);
  const [title, setTitle] = useState("");
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="appointment-title">Titre</Label>
        <Input id="appointment-title" name="title" required minLength={2} maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="Point commercial, visite…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="appointment-start">Début</Label>
        <Input id="appointment-start" name="startsAt" type="datetime-local" required defaultValue={nextSlot()} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="appointment-duration">Durée</Label>
        <FieldSelect id="appointment-duration" name="durationMinutes" defaultValue="30">
          {appointmentDurations.map(minutes => (
            <option key={minutes} value={minutes}>{minutes} minutes</option>
          ))}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="appointment-customer">Fiche liée</Label>
        <FieldSelect id="appointment-customer" name="customerId" defaultValue="">
          <option value="">Sans fiche</option>
          {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="appointment-location">Lieu ou lien</Label>
        <Input id="appointment-location" name="location" maxLength={200} placeholder="Bureau, visio…" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="appointment-notes">Notes</Label>
        <Input id="appointment-notes" name="notes" maxLength={2000} />
      </div>
      {state?.error && <Alert variant="destructive" className="sm:col-span-2">{state.error}</Alert>}
      {state?.ok && <Alert variant="success" className="sm:col-span-2">Rendez-vous planifié.</Alert>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Planifier"}</Button>
      </div>
    </form>
  );
}
