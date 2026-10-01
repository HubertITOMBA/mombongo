"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { acceptQuoteAction, cancelQuoteAction, refuseQuoteAction, sendQuoteAction } from "@/lib/quotes/actions";

function QuoteButton({
  documentId,
  action,
  label,
  pendingLabel,
  variant = "default",
}: {
  documentId: string;
  action: typeof sendQuoteAction;
  label: string;
  pendingLabel: string;
  variant?: "default" | "outline";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="documentId" value={documentId} />
      <Button type="submit" variant={variant} disabled={pending}>{pending ? pendingLabel : label}</Button>
      {state?.error && <Alert variant="destructive">{state.error}</Alert>}
    </form>
  );
}

export function SendQuoteButton({ documentId }: { documentId: string }) {
  return <QuoteButton documentId={documentId} action={sendQuoteAction} label="Envoyer le devis" pendingLabel="Envoi…" />;
}

export function AcceptQuoteButton({ documentId }: { documentId: string }) {
  return <QuoteButton documentId={documentId} action={acceptQuoteAction} label="Marquer accepté" pendingLabel="Enregistrement…" />;
}

export function RefuseQuoteButton({ documentId }: { documentId: string }) {
  return <QuoteButton documentId={documentId} action={refuseQuoteAction} label="Refuser" pendingLabel="Enregistrement…" variant="outline" />;
}

export function CancelQuoteButton({ documentId }: { documentId: string }) {
  return <QuoteButton documentId={documentId} action={cancelQuoteAction} label="Annuler" pendingLabel="Annulation…" variant="outline" />;
}
