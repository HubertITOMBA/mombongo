"use client";

import { useActionState } from "react";
import { electronicConnectionEnvironmentLabels, electronicConnectionStatusLabels } from "@mombongo/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { FieldSelect } from "@/components/ui/field-select";
import {
  testElectronicInvoicingConnectionAction,
  upsertElectronicInvoicingConnectionAction,
} from "@/lib/integrations/actions";
import type { PublicConnectorView } from "@/lib/integrations/types";

const capabilityLabels: Record<string, string> = {
  OUTBOUND_INVOICE: "Émission de factures",
  OUTBOUND_CREDIT_NOTE: "Émission d’avoirs",
  E_REPORTING: "E-reporting (préparé)",
  PAYMENT_REPORTING: "Reporting de paiement (préparé)",
  INBOUND_INVOICE: "Réception de factures",
  DIRECTORY_LOOKUP: "Annuaire",
  WEBHOOKS: "Webhooks",
};

type Values = {
  connectorKey?: string | null;
  status?: "INACTIVE" | "READY" | "ERROR" | "DISABLED" | null;
  environment?: string | null;
  externalAccountId?: string | null;
  lastCheckOk?: boolean | null;
};

export function ElectronicInvoicingConnectionForm({
  values,
  locked,
  descriptor,
}: {
  values?: Values | null;
  locked?: boolean;
  descriptor: PublicConnectorView;
}) {
  const [state, action, pending] = useActionState(upsertElectronicInvoicingConnectionAction, undefined);
  const [testState, testAction, testPending] = useActionState(testElectronicInvoicingConnectionAction, undefined);
  const implemented = descriptor.capabilities.filter(item => item.implementedByMombongo);
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{descriptor.description}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {implemented.map(item => (
          <li key={item.key}>{capabilityLabels[item.key] ?? item.key}</li>
        ))}
      </ul>
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="connectorKey" value={descriptor.key} />
        <input type="hidden" name="provider" value={descriptor.key} />
        <div className="space-y-2">
          <Label htmlFor="pa-status">État</Label>
          <FieldSelect id="pa-status" name="status" defaultValue={values?.status ?? "INACTIVE"} disabled={locked}>
            {(["INACTIVE", "READY", "DISABLED"] as const).map(value => (
              <option key={value} value={value}>{electronicConnectionStatusLabels[value]}</option>
            ))}
          </FieldSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pa-env">Environnement</Label>
          <FieldSelect id="pa-env" name="environment" defaultValue={values?.environment && descriptor.environments.includes(values.environment) ? values.environment : descriptor.environments[0]} disabled={locked}>
            {descriptor.environments.map(value => (
              <option key={value} value={value}>
                {electronicConnectionEnvironmentLabels[value as keyof typeof electronicConnectionEnvironmentLabels] ?? value}
              </option>
            ))}
          </FieldSelect>
        </div>
        {descriptor.configurationFields.map(field => (
          <div key={field.name} className="space-y-2 sm:col-span-2">
            <Label htmlFor={`pa-${field.name}`}>{field.label}</Label>
            <Input
              id={`pa-${field.name}`}
              name={field.name}
              maxLength={field.maxLength}
              defaultValue={field.name === "externalAccountId" ? values?.externalAccountId ?? "" : ""}
              disabled={locked}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        ))}
        <div className="sm:col-span-2 space-y-3">
          {!locked && (
            <Button type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer la connexion"}</Button>
          )}
          {state?.ok && <Alert variant="success">Connexion de test interne enregistrée. Mombongo n’est pas une plateforme agréée.</Alert>}
          {state?.error && <Alert variant="destructive">{state.error}</Alert>}
        </div>
      </form>
      {values ? (
        <p className="text-sm text-muted-foreground">
          {values.lastCheckOk ? "Connexion réellement vérifiée." : "Configurée, mais pas encore vérifiée."}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Non configurée.</p>
      )}
      {!locked && values && (
        <form action={testAction} className="space-y-2">
          <Button type="submit" variant="outline" disabled={testPending}>{testPending ? "Vérification…" : "Tester la connexion"}</Button>
          {testState?.message && <Alert variant="success">{testState.message}</Alert>}
          {testState?.error && <Alert variant="destructive">{testState.error}</Alert>}
        </form>
      )}
    </div>
  );
}
