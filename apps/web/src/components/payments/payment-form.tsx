"use client";

import { useActionState } from "react";
import { paymentMethodLabels } from "@mombongo/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { FieldSelect } from "@/components/ui/field-select";
import { cancelPaymentAction, recordPaymentAction } from "@/lib/payments/actions";

function eurosFromCents(cents: number) {
  const value = cents / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function RecordPaymentForm({
  invoiceId,
  remainingCents,
}: {
  invoiceId: string;
  remainingCents: number;
}) {
  const [state, action, pending] = useActionState(recordPaymentAction, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="space-y-2">
        <Label htmlFor="payment-amount">Montant TTC</Label>
        <Input id="payment-amount" name="amountCents" inputMode="decimal" required defaultValue={eurosFromCents(remainingCents)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="payment-date">Date d’encaissement</Label>
        <Input id="payment-date" name="paidAt" type="date" required defaultValue={todayIso()} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="payment-method">Moyen</Label>
        <FieldSelect id="payment-method" name="method" defaultValue="BANK_TRANSFER">
          {Object.entries(paymentMethodLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="payment-reference">Référence</Label>
        <Input id="payment-reference" name="reference" maxLength={120} placeholder="Virement, chèque…" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="payment-note">Note</Label>
        <Input id="payment-note" name="note" maxLength={500} />
      </div>
      {state?.error && <Alert variant="destructive" className="sm:col-span-2">{state.error}</Alert>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending || remainingCents <= 0}>{pending ? "Enregistrement…" : "Enregistrer le paiement"}</Button>
      </div>
    </form>
  );
}

export function CancelPaymentButton({ paymentId }: { paymentId: string }) {
  const [state, action, pending] = useActionState(cancelPaymentAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="paymentId" value={paymentId} />
      <Button type="submit" variant="outline" disabled={pending}>{pending ? "Annulation…" : "Annuler le paiement"}</Button>
      {state?.error && <Alert variant="destructive">{state.error}</Alert>}
    </form>
  );
}
