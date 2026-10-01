"use client";

import { useActionState } from "react";
import { electronicTransmissionStatusLabels } from "@mombongo/contracts";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { submitElectronicDocumentAction } from "@/lib/einvoice-platform/actions";

const documentAxisLabels: Record<string, string> = {
  DRAFT: "Brouillon",
  SENT: "Émise",
  CANCELLED: "Annulée",
  ACCEPTED: "Acceptée",
  REFUSED: "Refusée",
};

function documentAxisLabel(kind: "INVOICE" | "CREDIT_NOTE", status: string) {
  if (kind === "CREDIT_NOTE" && status === "SENT") return "Émis";
  if (kind === "CREDIT_NOTE" && status === "CANCELLED") return "Annulé";
  return documentAxisLabels[status] ?? status;
}

type Transmission = {
  status: keyof typeof electronicTransmissionStatusLabels;
  route: string;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  provider?: string;
};

export function DocumentLifecyclePanel({
  documentStatus,
  settlementLabel,
  transmission,
  documentId,
  canSubmit,
  kind,
}: {
  documentStatus: string;
  settlementLabel: string;
  transmission: Transmission | null;
  documentId: string;
  canSubmit: boolean;
  kind: "INVOICE" | "CREDIT_NOTE";
}) {
  const status = transmission?.status;
  const terminal = status === "DELIVERED" || status === "ACCEPTED" || status === "REJECTED";
  const retryable = status === "FAILED";
  const label = status ? electronicTransmissionStatusLabels[status] : "Non transmise";
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>États</CardTitle>
        <CardDescription>
          Trois axes distincts : document Mombongo, solde économique, transmission vers une plateforme agréée.
          Mombongo n’est pas une plateforme agréée.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4"><dt>Document</dt><dd>{documentAxisLabel(kind, documentStatus)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Paiement</dt><dd>{settlementLabel}</dd></div>
          <div className="flex justify-between gap-4"><dt>Transmission électronique</dt><dd>{label}</dd></div>
        </dl>
        {transmission?.route ? (
          <p className="text-sm text-muted-foreground">
            Route interne : {transmission.route === "E_INVOICING" ? "e-invoicing B2B" : transmission.route === "E_REPORTING" ? "e-reporting" : transmission.route}
            {transmission.provider ? ` · fournisseur ${transmission.provider}` : ""}.
          </p>
        ) : null}
        {transmission?.lastErrorMessage ? (
          <Alert variant="warning">
            {transmission.lastErrorMessage}
            {transmission.lastErrorCode ? <span className="mt-1 block text-xs text-muted-foreground">Code : {transmission.lastErrorCode}</span> : null}
          </Alert>
        ) : null}
        {canSubmit && !terminal ? (
          <SubmitElectronicButton documentId={documentId} retry={retryable} kind={kind} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function SubmitElectronicButton({ documentId, retry, kind }: { documentId: string; retry: boolean; kind: "INVOICE" | "CREDIT_NOTE" }) {
  const [state, action, pending] = useActionState(submitElectronicDocumentAction, undefined);
  const label = kind === "CREDIT_NOTE" ? "l’avoir" : "la facture";
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="documentId" value={documentId} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Transmission…" : retry ? `Réessayer la transmission de ${label}` : `Transmettre ${label} (test interne)`}
      </Button>
      {state?.error && <Alert variant="destructive">{state.error}</Alert>}
      {state?.ok && <Alert variant="success">Transmission enregistrée auprès du fournisseur de test interne.</Alert>}
    </form>
  );
}
