"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { archiveCustomerAction, convertProspectAction, restoreCustomerAction } from "@/lib/customers/actions";

function StatusForm({
  customerId,
  name,
  action,
  label,
  pendingLabel,
}: {
  customerId: string;
  name: string;
  action: typeof archiveCustomerAction;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction}>
      <input type="hidden" name="customerId" value={customerId} />
      <Button type="submit" variant="outline" disabled={pending} aria-label={`${label} ${name}`}>{pending ? pendingLabel : label}</Button>
      {state?.ok && <Alert variant="success" className="mt-2">La fiche a été mise à jour.</Alert>}
      {state?.error && <Alert variant="destructive" className="mt-2">{state.error}</Alert>}
    </form>
  );
}

export function ArchiveCustomerButton({ customerId, name }: { customerId: string; name: string }) {
  return <StatusForm customerId={customerId} name={name} action={archiveCustomerAction} label="Archiver" pendingLabel="Archivage…" />;
}

export function RestoreCustomerButton({ customerId, name }: { customerId: string; name: string }) {
  return <StatusForm customerId={customerId} name={name} action={restoreCustomerAction} label="Restaurer" pendingLabel="Restauration…" />;
}

export function ConvertProspectButton({ customerId, name }: { customerId: string; name: string }) {
  return <StatusForm customerId={customerId} name={name} action={convertProspectAction} label="Convertir en client" pendingLabel="Conversion…" />;
}
