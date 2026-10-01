"use client";

import { useActionState, useState } from "react";
import {
  catalogKindLabels,
  lineTaxCategoryLabels,
  lineUnitOptions,
  taxCategoryNeedsExemptionReason,
  taxExemptionReasonCodeLabels,
  vatRates,
} from "@mombongo/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { FieldSelect } from "@/components/ui/field-select";
import { createCatalogItemAction, updateCatalogItemAction } from "@/lib/catalog/actions";

type Values = {
  catalogItemId?: string;
  itemKind?: "PRODUCT" | "SERVICE";
  reference?: string | null;
  name?: string;
  description?: string | null;
  unit?: string;
  unitPriceCents?: number;
  vatBps?: number;
  taxCategory?: "STANDARD" | "ZERO_RATED" | "EXEMPT" | "REVERSE_CHARGE" | "OUT_OF_SCOPE" | null;
  taxExemptionReason?: string | null;
  taxExemptionReasonCode?: string | null;
};

function eurosFromCents(cents?: number) {
  if (cents === undefined) return "";
  const value = cents / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
}

export function CatalogForm({ values, locked }: { values?: Values; locked?: boolean }) {
  const editing = Boolean(values?.catalogItemId);
  const [state, action, pending] = useActionState(editing ? updateCatalogItemAction : createCatalogItemAction, undefined);
  const [vatBps, setVatBps] = useState(String(values?.vatBps ?? 2000));
  const [taxCategory, setTaxCategory] = useState(values?.taxCategory ?? (Number(values?.vatBps ?? 2000) > 0 ? "STANDARD" : ""));
  const [taxExemptionReason, setTaxExemptionReason] = useState(values?.taxExemptionReason ?? "");
  const [taxExemptionReasonCode, setTaxExemptionReasonCode] = useState(values?.taxExemptionReasonCode ?? "");
  const zeroRated = vatBps === "0";
  const needsReason = taxCategoryNeedsExemptionReason(taxCategory);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {values?.catalogItemId && <input type="hidden" name="catalogItemId" value={values.catalogItemId} />}
      <div className="space-y-2">
        <Label htmlFor="catalog-kind">Type</Label>
        <FieldSelect id="catalog-kind" name="itemKind" defaultValue={values?.itemKind ?? "SERVICE"} disabled={locked}>
          {Object.entries(catalogKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="catalog-reference">Référence</Label>
        <Input id="catalog-reference" name="reference" defaultValue={values?.reference ?? ""} maxLength={40} disabled={locked} placeholder="CONSULT-01" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="catalog-name">Nom</Label>
        <Input id="catalog-name" name="name" required minLength={2} maxLength={120} defaultValue={values?.name ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="catalog-description">Description</Label>
        <Input id="catalog-description" name="description" minLength={2} maxLength={200} defaultValue={values?.description ?? ""} disabled={locked} placeholder="Texte recopié sur la ligne du devis" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="catalog-unit">Unité</Label>
        <FieldSelect id="catalog-unit" name="unit" defaultValue={values?.unit ?? "unité"} disabled={locked}>
          {lineUnitOptions.map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="catalog-price">Prix unitaire HT</Label>
        <Input id="catalog-price" name="unitPriceCents" inputMode="decimal" required defaultValue={eurosFromCents(values?.unitPriceCents)} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="catalog-vat">TVA</Label>
        <FieldSelect id="catalog-vat" name="vatBps" value={vatBps} disabled={locked} onChange={event => {
          const next = event.target.value;
          setVatBps(next);
          setTaxCategory(next === "0" ? "" : "STANDARD");
          if (next !== "0") {
            setTaxExemptionReason("");
            setTaxExemptionReasonCode("");
          }
        }}>
          {vatRates.map(rate => <option key={rate.bps} value={rate.bps}>{rate.label}</option>)}
        </FieldSelect>
      </div>
      {zeroRated && (
        <div className="space-y-2">
          <Label htmlFor="catalog-tax-category">Qualification fiscale</Label>
          <FieldSelect id="catalog-tax-category" name="taxCategory" value={taxCategory} disabled={locked} onChange={event => {
            setTaxCategory(event.target.value);
            if (!taxCategoryNeedsExemptionReason(event.target.value)) {
              setTaxExemptionReason("");
              setTaxExemptionReasonCode("");
            }
          }}>
            <option value="">À qualifier</option>
            {Object.entries(lineTaxCategoryLabels).filter(([value]) => value !== "STANDARD").map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </FieldSelect>
        </div>
      )}
      {!zeroRated && <input type="hidden" name="taxCategory" value="STANDARD" />}
      {needsReason && (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="catalog-exemption">Motif d’exonération</Label>
          <Input id="catalog-exemption" name="taxExemptionReason" required minLength={2} maxLength={500} value={taxExemptionReason} disabled={locked} onChange={event => setTaxExemptionReason(event.target.value)} placeholder="Motif saisi, non généré automatiquement" />
        </div>
      )}
      {taxCategory === "EXEMPT" && (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="catalog-exemption-code">Code de motif (optionnel)</Label>
          <FieldSelect id="catalog-exemption-code" name="taxExemptionReasonCode" value={taxExemptionReasonCode} disabled={locked} onChange={event => setTaxExemptionReasonCode(event.target.value)}>
            <option value="">Aucun code</option>
            {Object.entries(taxExemptionReasonCodeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </FieldSelect>
        </div>
      )}
      {!locked && (
        <div className="flex items-end">
          <Button type="submit" disabled={pending}>{pending ? "Enregistrement…" : editing ? "Enregistrer l’article" : "Ajouter au catalogue"}</Button>
        </div>
      )}
      {state?.error && <Alert variant="destructive" className="sm:col-span-2">{state.error}</Alert>}
      {state?.ok && <Alert variant="success" className="sm:col-span-2">Article enregistré. Les devis déjà créés restent inchangés.</Alert>}
    </form>
  );
}
