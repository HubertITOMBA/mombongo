"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { discardCreditNoteDraftAction, issueCreditNoteAction } from "@/lib/credit-notes/actions";

export function IssueCreditNoteButton({ documentId }: { documentId: string }) {
  const [state, action, pending] = useActionState(issueCreditNoteAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="documentId" value={documentId} />
      <Button type="submit" disabled={pending}>{pending ? "Émission…" : "Émettre l’avoir"}</Button>
      {state?.error && <Alert variant="destructive">{state.error}</Alert>}
    </form>
  );
}

export function DiscardCreditNoteButton({ documentId }: { documentId: string }) {
  const [state, action, pending] = useActionState(discardCreditNoteDraftAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="documentId" value={documentId} />
      <Button type="submit" variant="outline" disabled={pending}>{pending ? "Abandon…" : "Abandonner le brouillon"}</Button>
      {state?.error && <Alert variant="destructive">{state.error}</Alert>}
    </form>
  );
}
