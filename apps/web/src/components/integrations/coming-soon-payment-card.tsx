"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { upsertPaymentConnectionAction } from "@/lib/integrations/actions";
import type { PublicConnectorView } from "@/lib/integrations/types";

const capabilityLabels: Record<string, string> = {
  CARD_PAYMENT: "Paiement carte",
  PAYPAL_PAYMENT: "Paiement PayPal",
  DIRECT_DEBIT: "Prélèvement",
  REFUND: "Remboursement",
  WEBHOOKS: "Webhooks",
};

export function ComingSoonPaymentCard({ descriptor, locked }: { descriptor: PublicConnectorView; locked?: boolean }) {
  const [state, action, pending] = useActionState(upsertPaymentConnectionAction, undefined);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{descriptor.description}</p>
      <p className="text-sm font-medium">Bientôt disponible</p>
      <p className="text-sm text-muted-foreground">Environnements prévus : {descriptor.environments.join(", ")}.</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {descriptor.capabilities.filter(item => item.supportedByProvider).map(item => (
          <li key={item.key}>
            {capabilityLabels[item.key] ?? item.key}
            {item.implementedByMombongo ? "" : " — non implémenté par Mombongo"}
          </li>
        ))}
      </ul>
      {!locked && (
        <form action={action}>
          <input type="hidden" name="connectorKey" value={descriptor.key} />
          <Button type="submit" variant="outline" disabled={pending}>{pending ? "…" : "Connecter"}</Button>
          {state?.error && <Alert className="mt-2" variant="destructive">{state.error}</Alert>}
        </form>
      )}
    </div>
  );
}
