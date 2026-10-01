"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { FieldSelect } from "@/components/ui/field-select";
import { CatalogLineFields, type CatalogChoice } from "@/components/catalog/catalog-line-fields";
import { createQuoteAction } from "@/lib/quotes/actions";

export function QuoteForm({
  customers,
  catalogItems = [],
}: {
  customers: { id: string; displayName: string }[];
  catalogItems?: CatalogChoice[];
}) {
  const [state, action, pending] = useActionState(createQuoteAction, undefined);
  const [title, setTitle] = useState("");
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="quote-title">Titre</Label>
        <Input id="quote-title" name="title" required minLength={2} maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="Site vitrine, prestation…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quote-customer">Destinataire</Label>
        <FieldSelect id="quote-customer" name="customerId" required defaultValue="">
          <option value="" disabled>Choisir une fiche</option>
          {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="quote-valid">Valable jusqu’au</Label>
        <Input id="quote-valid" name="validUntil" type="date" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quote-supply">Date de la prestation</Label>
        <Input id="quote-supply" name="supplyDate" type="date" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quote-order">N° de commande</Label>
        <Input id="quote-order" name="customerOrderNumber" maxLength={80} />
      </div>
      <CatalogLineFields items={catalogItems} idPrefix="quote" descriptionLabel="Première ligne" />
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="quote-notes">Notes</Label>
        <Input id="quote-notes" name="notes" maxLength={2000} />
      </div>
      {state?.error && <Alert variant="destructive" className="sm:col-span-2">{state.error}</Alert>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending || customers.length === 0}>{pending ? "Création…" : "Créer le brouillon"}</Button>
      </div>
    </form>
  );
}
