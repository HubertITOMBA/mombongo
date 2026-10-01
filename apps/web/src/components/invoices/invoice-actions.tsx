"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cancelInvoiceAction, convertQuoteToInvoiceAction } from "@/lib/invoices/actions";

export function ConvertQuoteButton({ documentId }: { documentId: string }) {
  const [state, action, pending] = useActionState(convertQuoteToInvoiceAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="documentId" value={documentId} />
      <Button type="submit" disabled={pending}>{pending ? "Création…" : "Créer la facture"}</Button>
      {state?.error && <Alert variant="destructive">{state.error}</Alert>}
    </form>
  );
}

export function CancelInvoiceButton({ documentId }: { documentId: string }) {
  const [state, action, pending] = useActionState(cancelInvoiceAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="documentId" value={documentId} />
      <Button type="submit" variant="outline" disabled={pending}>{pending ? "Annulation…" : "Annuler la facture"}</Button>
      {state?.error && <Alert variant="destructive">{state.error}</Alert>}
    </form>
  );
}
