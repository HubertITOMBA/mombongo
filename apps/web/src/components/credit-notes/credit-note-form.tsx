"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { FieldSelect } from "@/components/ui/field-select";
import { createCreditNoteAction } from "@/lib/credit-notes/actions";

export type CreditLineChoice = {
  id: string;
  description: string;
  quantity: number;
  remaining: number;
  unit: string | null;
  unitPriceLabel: string;
};

export function CreditNoteForm({
  invoiceId,
  lines,
}: {
  invoiceId: string;
  lines: CreditLineChoice[];
}) {
  const [state, action, pending] = useActionState(createCreditNoteAction, undefined);
  const [mode, setMode] = useState<"TOTAL" | "PARTIAL">("TOTAL");
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="space-y-2">
        <Label htmlFor="credit-mode">Type d’avoir</Label>
        <FieldSelect id="credit-mode" name="mode" value={mode} onChange={event => setMode(event.target.value as "TOTAL" | "PARTIAL")}>
          <option value="TOTAL">Avoir total (reste créditable)</option>
          <option value="PARTIAL">Avoir partiel</option>
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="credit-reason">Motif</Label>
        <Input id="credit-reason" name="creditReason" maxLength={500} placeholder="Retour, erreur de quantité, remise…" />
      </div>
      {mode === "PARTIAL" && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 font-medium">Ligne</th>
              <th className="py-2 font-medium">Reste</th>
              <th className="py-2 font-medium">Quantité à créditer</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(line => (
              <tr key={line.id} className="border-b border-border">
                <td className="py-3">
                  {line.description}
                  <span className="mt-1 block text-xs text-muted-foreground">{line.unitPriceLabel}</span>
                </td>
                <td className="py-3">{line.remaining} {line.unit ?? ""}</td>
                <td className="py-3">
                  <Label htmlFor={`quantity-${line.id}`}>Quantité à créditer — {line.description}</Label>
                  <Input id={`quantity-${line.id}`} name={`quantity-${line.id}`} inputMode="decimal" defaultValue="0" className="mt-1" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {state?.error && <Alert variant="destructive">{state.error}</Alert>}
      <div>
        <Button type="submit" disabled={pending || lines.every(line => line.remaining <= 0)}>
          {pending ? "Création…" : "Créer le brouillon"}
        </Button>
      </div>
    </form>
  );
}
