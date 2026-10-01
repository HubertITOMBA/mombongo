"use client";

import { useActionState, useState } from "react";
import { documentEmailStatusLabels } from "@mombongo/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sendDocumentEmailAction } from "@/lib/document-emails/actions";

type Delivery = {
  id: string;
  toEmail: string;
  subject: string;
  status: "QUEUED" | "SENT" | "FAILED";
  errorMessage: string | null;
  createdAt: Date | string;
  sentAt: Date | string | null;
};

function newKey() {
  return crypto.randomUUID();
}

export function DocumentEmailPanel({
  documentId,
  defaultToEmail,
  subject,
  message,
  locked,
  deliveries,
}: {
  documentId: string;
  defaultToEmail: string;
  subject: string;
  message: string;
  locked?: boolean;
  deliveries: Delivery[];
}) {
  const [state, action, pending] = useActionState(sendDocumentEmailAction, undefined);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [acknowledgedOk, setAcknowledgedOk] = useState(false);
  if (state?.ok && !acknowledgedOk) {
    setAcknowledgedOk(true);
    setIdempotencyKey(newKey());
  }
  if (!state?.ok && acknowledgedOk) {
    setAcknowledgedOk(false);
  }
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Envoi par e-mail</CardTitle>
        <CardDescription>
          Le PDF historique est joint. Cet envoi ne change ni le statut du document, ni le solde, ni une transmission électronique.
          Accepté par le fournisseur d’e-mail ne signifie pas que le message a été délivré.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!locked && (
          <form action={action} className="grid gap-4">
            <input type="hidden" name="documentId" value={documentId} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <div className="space-y-2">
              <Label htmlFor="email-to">Destinataire</Label>
              <Input id="email-to" name="toEmail" type="email" required defaultValue={defaultToEmail} maxLength={254} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-subject">Sujet</Label>
              <Input id="email-subject" name="subject" required defaultValue={subject} maxLength={180} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-message">Message</Label>
              <textarea
                id="email-message"
                name="message"
                required
                defaultValue={message}
                maxLength={5000}
                rows={8}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div>
              <Button type="submit" disabled={pending}>{pending ? "Envoi…" : deliveries.length > 0 ? "Réenvoyer par e-mail" : "Envoyer par e-mail"}</Button>
            </div>
            {state?.ok && <Alert variant="success">E-mail accepté par le fournisseur. Le document n’a pas changé de statut.</Alert>}
            {state?.error && <Alert variant="destructive">{state.error}</Alert>}
          </form>
        )}
        {locked && <Alert>Votre rôle ne permet pas d’envoyer ce document par e-mail.</Alert>}
        <div>
          <h3 className="text-sm font-medium">Historique des envois</h3>
          {deliveries.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Aucun e-mail envoyé pour ce document.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {deliveries.map(item => (
                <li key={item.id} className="rounded-lg border border-border p-3">
                  <p>
                    {documentEmailStatusLabels[item.status]} · {item.toEmail}
                  </p>
                  <p className="text-muted-foreground">{item.subject}</p>
                  {item.errorMessage && <p className="text-red-700">{item.errorMessage}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
