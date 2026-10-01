"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { deactivateCatalogItemAction, reactivateCatalogItemAction } from "@/lib/catalog/actions";

function StatusForm({
  catalogItemId,
  name,
  action,
  label,
  pendingLabel,
}: {
  catalogItemId: string;
  name: string;
  action: typeof deactivateCatalogItemAction;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction}>
      <input type="hidden" name="catalogItemId" value={catalogItemId} />
      <Button type="submit" variant="outline" disabled={pending} aria-label={`${label} ${name}`}>{pending ? pendingLabel : label}</Button>
      {state?.ok && <Alert variant="success" className="mt-2">Le catalogue a été mis à jour.</Alert>}
      {state?.error && <Alert variant="destructive" className="mt-2">{state.error}</Alert>}
    </form>
  );
}

export function DeactivateCatalogItemButton({ catalogItemId, name }: { catalogItemId: string; name: string }) {
  return <StatusForm catalogItemId={catalogItemId} name={name} action={deactivateCatalogItemAction} label="Désactiver" pendingLabel="Désactivation…" />;
}

export function ReactivateCatalogItemButton({ catalogItemId, name }: { catalogItemId: string; name: string }) {
  return <StatusForm catalogItemId={catalogItemId} name={name} action={reactivateCatalogItemAction} label="Réactiver" pendingLabel="Réactivation…" />;
}
