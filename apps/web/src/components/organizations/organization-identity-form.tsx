"use client";
import { useActionState } from "react";
import { countryCodes, countryLabels, organizationEntityKindLabels } from "@mombongo/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { FieldSelect } from "@/components/ui/field-select";
import { updateOrganizationIdentityAction } from "@/lib/organizations/actions";

type Values = {
  name: string;
  entityKind?: "SOLE_TRADER" | "COMPANY" | null;
  legalName?: string | null;
  tradeName?: string | null;
  legalFormLabel?: string | null;
  siren?: string | null;
  siret?: string | null;
  vatNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  countryCode?: string | null;
  currency: string;
  timezone: string;
  vatOnDebits?: boolean | null;
  invoiceDueDays?: number | null;
  paymentTerms?: string | null;
  earlyPaymentDiscountTerms?: string | null;
  latePaymentPenaltyTerms?: string | null;
  recoveryFeeMention?: string | null;
};

export function OrganizationIdentityForm({ values, locked }: { values: Values; locked?: boolean }) {
  const [state, action, pending] = useActionState(updateOrganizationIdentityAction, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="org-name">Nom de l’espace</Label>
        <Input id="org-name" name="name" required minLength={2} maxLength={120} defaultValue={values.name} disabled={locked} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="org-entity">Forme de l’émetteur</Label>
        <FieldSelect id="org-entity" name="entityKind" defaultValue={values.entityKind ?? ""} disabled={locked}>
          <option value="">Non renseignée</option>
          {Object.entries(organizationEntityKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </FieldSelect>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="org-legal-name">Raison sociale / nom légal</Label>
        <Input id="org-legal-name" name="legalName" maxLength={180} defaultValue={values.legalName ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-trade-name">Nom commercial</Label>
        <Input id="org-trade-name" name="tradeName" maxLength={180} defaultValue={values.tradeName ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-legal-form">Forme juridique (libellé)</Label>
        <Input id="org-legal-form" name="legalFormLabel" maxLength={80} defaultValue={values.legalFormLabel ?? ""} disabled={locked} placeholder="EI, SAS, micro-entrepreneur…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-siren">SIREN</Label>
        <Input id="org-siren" name="siren" inputMode="numeric" maxLength={11} defaultValue={values.siren ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-siret">SIRET</Label>
        <Input id="org-siret" name="siret" inputMode="numeric" maxLength={17} defaultValue={values.siret ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="org-vat">N° de TVA</Label>
        <Input id="org-vat" name="vatNumber" maxLength={20} defaultValue={values.vatNumber ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-email">Email</Label>
        <Input id="org-email" name="email" type="email" maxLength={254} defaultValue={values.email ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-phone">Téléphone</Label>
        <Input id="org-phone" name="phone" maxLength={30} defaultValue={values.phone ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="org-website">Site web</Label>
        <Input id="org-website" name="website" type="url" maxLength={200} defaultValue={values.website ?? ""} disabled={locked} placeholder="https://" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-country">Pays</Label>
        <FieldSelect id="org-country" name="countryCode" defaultValue={values.countryCode ?? "FR"} disabled={locked}>
          <option value="">Non renseigné</option>
          {countryCodes.map(code => <option key={code} value={code}>{countryLabels[code]}</option>)}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-currency">Devise</Label>
        <Input id="org-currency" name="currency" maxLength={3} defaultValue={values.currency} disabled={locked} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="org-timezone">Fuseau horaire</Label>
        <Input id="org-timezone" name="timezone" maxLength={60} defaultValue={values.timezone} disabled={locked} />
      </div>
      <div className="sm:col-span-2 rounded-lg border border-border p-4">
        <p className="text-sm font-medium">Paramètres fiscaux et de règlement</p>
        <p className="mt-1 text-xs text-muted-foreground">Ils sont copiés sur le document à l’émission. Ils ne s’appliquent pas aux pièces déjà émises.</p>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="hidden" name="vatOnDebits" value="false" />
          <input id="org-vat-debits" type="checkbox" name="vatOnDebits" value="true" defaultChecked={Boolean(values.vatOnDebits)} disabled={locked} />
          Option pour le paiement de la TVA d’après les débits
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="org-due-days">Délai de règlement (jours)</Label>
            <Input id="org-due-days" name="invoiceDueDays" inputMode="numeric" defaultValue={values.invoiceDueDays ?? ""} disabled={locked} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="org-payment-terms">Conditions de règlement</Label>
            <Input id="org-payment-terms" name="paymentTerms" maxLength={500} defaultValue={values.paymentTerms ?? ""} disabled={locked} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="org-early">Escompte pour paiement anticipé</Label>
            <Input id="org-early" name="earlyPaymentDiscountTerms" maxLength={500} defaultValue={values.earlyPaymentDiscountTerms ?? ""} disabled={locked} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="org-late">Pénalités de retard</Label>
            <Input id="org-late" name="latePaymentPenaltyTerms" maxLength={500} defaultValue={values.latePaymentPenaltyTerms ?? ""} disabled={locked} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="org-recovery">Indemnité forfaitaire de recouvrement</Label>
            <Input id="org-recovery" name="recoveryFeeMention" maxLength={500} defaultValue={values.recoveryFeeMention ?? ""} disabled={locked} />
          </div>
        </div>
      </div>
      {!locked && (
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending} size="lg">{pending ? "Enregistrement…" : "Enregistrer l’identité"}</Button>
        </div>
      )}
      {state?.ok && <Alert variant="success" className="sm:col-span-2">L’identité de l’émetteur a été enregistrée.</Alert>}
      {state?.error && <Alert variant="destructive" className="sm:col-span-2">{state.error}</Alert>}
    </form>
  );
}
