"use client";

import { useState } from "react";
import {
  catalogKindLabels,
  lineItemKindLabels,
  lineTaxCategoryLabels,
  lineUnitOptions,
  taxCategoryNeedsExemptionReason,
  taxExemptionReasonCodeLabels,
  vatRates,
} from "@mombongo/contracts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldSelect } from "@/components/ui/field-select";

export type CatalogChoice = {
  id: string;
  name: string;
  reference: string | null;
  description: string | null;
  unit: string;
  unitPriceCents: number;
  vatBps: number;
  itemKind: "PRODUCT" | "SERVICE";
  taxCategory?: "STANDARD" | "ZERO_RATED" | "EXEMPT" | "REVERSE_CHARGE" | "OUT_OF_SCOPE" | null;
  taxExemptionReason?: string | null;
  taxExemptionReasonCode?: string | null;
};

function eurosFromCents(cents: number) {
  const value = cents / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
}

export function CatalogLineFields({
  items,
  idPrefix,
  descriptionLabel,
}: {
  items: CatalogChoice[];
  idPrefix: string;
  descriptionLabel: string;
}) {
  const [catalogItemId, setCatalogItemId] = useState("");
  const [description, setDescription] = useState("");
  const [itemKind, setItemKind] = useState("SERVICE");
  const [unit, setUnit] = useState("unité");
  const [unitPrice, setUnitPrice] = useState("");
  const [vatBps, setVatBps] = useState("2000");
  const [taxCategory, setTaxCategory] = useState("STANDARD");
  const [taxExemptionReason, setTaxExemptionReason] = useState("");
  const [taxExemptionReasonCode, setTaxExemptionReasonCode] = useState("");

  function applyCatalog(value: string) {
    setCatalogItemId(value);
    const item = items.find(entry => entry.id === value);
    if (!item) return;
    setDescription((item.description && item.description.trim().length >= 2) ? item.description : item.name);
    setItemKind(item.itemKind);
    setUnit(item.unit);
    setUnitPrice(eurosFromCents(item.unitPriceCents));
    setVatBps(String(item.vatBps));
    setTaxCategory(item.taxCategory ?? (item.vatBps > 0 ? "STANDARD" : ""));
    setTaxExemptionReason(item.taxExemptionReason ?? "");
    setTaxExemptionReasonCode(item.taxExemptionReasonCode ?? "");
  }

  const zeroRated = vatBps === "0";
  const needsReason = taxCategoryNeedsExemptionReason(taxCategory);

  return (
    <>
      {items.length > 0 && (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-catalog`}>Produit ou service</Label>
          <FieldSelect id={`${idPrefix}-catalog`} name="catalogItemId" value={catalogItemId} onChange={event => applyCatalog(event.target.value)}>
            <option value="">Ligne libre</option>
            {items.map(item => (
              <option key={item.id} value={item.id}>
                {catalogKindLabels[item.itemKind]} · {item.name}{item.reference ? ` (${item.reference})` : ""}
              </option>
            ))}
          </FieldSelect>
        </div>
      )}
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-description`}>{descriptionLabel}</Label>
        <Input id={`${idPrefix}-description`} name="description" required minLength={2} maxLength={200} value={description} onChange={event => setDescription(event.target.value)} placeholder="Prestation, produit…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-kind`}>Nature</Label>
        <FieldSelect id={`${idPrefix}-kind`} name="itemKind" value={itemKind} onChange={event => setItemKind(event.target.value)}>
          {Object.entries(lineItemKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-unit`}>Unité</Label>
        <FieldSelect id={`${idPrefix}-unit`} name="unit" value={unit} onChange={event => setUnit(event.target.value)}>
          {lineUnitOptions.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-qty`}>Quantité</Label>
        <Input id={`${idPrefix}-qty`} name="quantity" inputMode="decimal" defaultValue="1" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-price`}>{idPrefix === "quote" ? "Prix unitaire HT" : "Prix HT"}</Label>
        <Input id={`${idPrefix}-price`} name="unitPriceCents" inputMode="decimal" required value={unitPrice} onChange={event => setUnitPrice(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-vat`}>TVA</Label>
        <FieldSelect id={`${idPrefix}-vat`} name="vatBps" value={vatBps} onChange={event => {
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
          <Label htmlFor={`${idPrefix}-tax-category`}>Qualification fiscale</Label>
          <FieldSelect id={`${idPrefix}-tax-category`} name="taxCategory" value={taxCategory} onChange={event => {
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
          <Label htmlFor={`${idPrefix}-exemption`}>Motif d’exonération</Label>
          <Input id={`${idPrefix}-exemption`} name="taxExemptionReason" required minLength={2} maxLength={500} value={taxExemptionReason} onChange={event => setTaxExemptionReason(event.target.value)} placeholder="Motif saisi, non généré automatiquement" />
        </div>
      )}
      {taxCategory === "EXEMPT" && (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-exemption-code`}>Code de motif (optionnel)</Label>
          <FieldSelect id={`${idPrefix}-exemption-code`} name="taxExemptionReasonCode" value={taxExemptionReasonCode} onChange={event => setTaxExemptionReasonCode(event.target.value)}>
            <option value="">Aucun code</option>
            {Object.entries(taxExemptionReasonCodeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </FieldSelect>
        </div>
      )}
    </>
  );
}
