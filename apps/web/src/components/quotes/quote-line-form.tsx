"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CatalogLineFields, type CatalogChoice } from "@/components/catalog/catalog-line-fields";
import { addQuoteLineAction } from "@/lib/quotes/actions";

export function QuoteLineForm({ documentId, catalogItems = [] }: { documentId: string; catalogItems?: CatalogChoice[] }) {
  const [state, action, pending] = useActionState(addQuoteLineAction, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="documentId" value={documentId} />
      <CatalogLineFields items={catalogItems} idPrefix="line" descriptionLabel="Ligne" />
      <div className="flex items-end">
        <Button type="submit" disabled={pending}>{pending ? "Ajout…" : "Ajouter"}</Button>
      </div>
      {state?.error && <Alert variant="destructive" className="sm:col-span-2">{state.error}</Alert>}
      {state?.ok && <Alert variant="success" className="sm:col-span-2">Ligne ajoutée.</Alert>}
    </form>
  );
}
