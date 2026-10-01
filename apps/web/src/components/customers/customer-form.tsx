"use client";
import { useActionState, useState } from "react";
import {
  customerCivilityLabels,
  customerKindLabels,
  customerPartyKindLabels,
  pipelineStageLabels,
  pipelineStages,
} from "@mombongo/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { FieldSelect } from "@/components/ui/field-select";
import { createCustomerAction, updateCustomerAction } from "@/lib/customers/actions";

type Values = {
  customerId?: string;
  partyKind?: "PERSON" | "COMPANY" | null;
  civility?: "MR" | "MRS" | "MX" | null;
  firstName?: string | null;
  lastName?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  displayName?: string;
  email?: string | null;
  phone?: string | null;
  siren?: string | null;
  siret?: string | null;
  vatNumber?: string | null;
  companyNumber?: string | null;
  taxablePerson?: boolean | null;
  kind?: "CLIENT" | "PROSPECT";
  notes?: string | null;
  stage?: keyof typeof pipelineStageLabels;
  source?: string | null;
  ownerUserId?: string | null;
  estimatedCents?: number | null;
  probability?: number | null;
  nextAction?: string | null;
  nextActionAt?: Date | string | null;
};

export function CustomerForm({ values, locked, owners = [] }: { values?: Values; locked?: boolean; owners?: { id: string; name: string | null; email: string }[] }) {
  const editing = Boolean(values?.customerId);
  const [state, action, pending] = useActionState(editing ? updateCustomerAction : createCustomerAction, undefined);
  const [partyKind, setPartyKind] = useState<"" | "PERSON" | "COMPANY">(
    values?.partyKind === "PERSON" || values?.partyKind === "COMPANY" ? values.partyKind : editing ? "" : "COMPANY",
  );
  const legacy = editing && !values?.partyKind;
  const structured = partyKind === "PERSON" || partyKind === "COMPANY";
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {values?.customerId && <input type="hidden" name="customerId" value={values.customerId} />}
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="customer-party">Identité</Label>
        <FieldSelect
          id="customer-party"
          name="partyKind"
          value={partyKind}
          disabled={locked}
          onChange={event => setPartyKind(event.target.value as "" | "PERSON" | "COMPANY")}
        >
          {legacy && <option value="">Fiche historique</option>}
          {Object.entries(customerPartyKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </FieldSelect>
      </div>
      {legacy && (
        <Alert className="sm:col-span-2">
          Fiche historique : le nom d’affichage et l’identifiant d’entreprise d’origine sont conservés. Choisissez Particulier ou Professionnel pour structurer la fiche.
        </Alert>
      )}
      {partyKind === "PERSON" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="customer-civility">Civilité</Label>
            <FieldSelect id="customer-civility" name="civility" defaultValue={values?.civility ?? ""} disabled={locked}>
              <option value="">Non renseignée</option>
              {Object.entries(customerCivilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </FieldSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-first-name">Prénom</Label>
            <Input id="customer-first-name" name="firstName" required minLength={1} maxLength={80} defaultValue={values?.firstName ?? ""} disabled={locked} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customer-last-name">Nom</Label>
            <Input id="customer-last-name" name="lastName" required minLength={1} maxLength={80} defaultValue={values?.lastName ?? ""} disabled={locked} />
          </div>
        </>
      )}
      {partyKind === "COMPANY" && (
        <>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customer-legal-name">Raison sociale</Label>
            <Input id="customer-legal-name" name="legalName" maxLength={180} defaultValue={values?.legalName ?? values?.displayName ?? ""} disabled={locked} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customer-trade-name">Nom commercial</Label>
            <Input id="customer-trade-name" name="tradeName" maxLength={180} defaultValue={values?.tradeName ?? ""} disabled={locked} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-siren">SIREN</Label>
            <Input id="customer-siren" name="siren" inputMode="numeric" maxLength={11} defaultValue={values?.siren ?? ""} disabled={locked} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-siret">SIRET</Label>
            <Input id="customer-siret" name="siret" inputMode="numeric" maxLength={17} defaultValue={values?.siret ?? ""} disabled={locked} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customer-vat">N° de TVA</Label>
            <Input id="customer-vat" name="vatNumber" maxLength={20} defaultValue={values?.vatNumber ?? ""} disabled={locked} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customer-taxable">Assujetti à la TVA</Label>
            <FieldSelect
              id="customer-taxable"
              name="taxablePerson"
              defaultValue={values?.taxablePerson === true ? "true" : values?.taxablePerson === false ? "false" : ""}
              disabled={locked}
            >
              <option value="">Non renseigné</option>
              <option value="true">Assujetti</option>
              <option value="false">Non assujetti</option>
            </FieldSelect>
          </div>
        </>
      )}
      {(legacy || !structured) && (
        <>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customer-name">Nom d’affichage historique</Label>
            <Input id="customer-name" name="displayName" maxLength={120} defaultValue={values?.displayName ?? ""} disabled={locked} />
          </div>
          {values?.companyNumber && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="customer-number">Identifiant historique (SIREN/SIRET non distingué)</Label>
              <Input id="customer-number" name="companyNumber" defaultValue={values.companyNumber} maxLength={40} disabled={locked} />
            </div>
          )}
        </>
      )}
      <div className="space-y-2">
        <Label htmlFor="customer-email">Adresse email</Label>
        <Input id="customer-email" name="email" type="email" maxLength={254} defaultValue={values?.email ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="customer-phone">Téléphone</Label>
        <Input id="customer-phone" name="phone" defaultValue={values?.phone ?? ""} maxLength={30} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="customer-kind">Type</Label>
        <FieldSelect id="customer-kind" name="kind" defaultValue={values?.kind ?? "CLIENT"} disabled={locked}>
          {Object.entries(customerKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="customer-stage">Étape</Label>
        <FieldSelect id="customer-stage" name="stage" defaultValue={values?.stage ?? (values?.kind === "CLIENT" ? "WON" : "NEW")} disabled={locked}>
          {pipelineStages.map(stage => <option key={stage} value={stage}>{pipelineStageLabels[stage]}</option>)}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="customer-source">Source</Label>
        <Input id="customer-source" name="source" defaultValue={values?.source ?? ""} maxLength={80} disabled={locked} placeholder="Site, recommandation…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="customer-owner">Responsable</Label>
        <FieldSelect id="customer-owner" name="ownerUserId" defaultValue={values?.ownerUserId ?? ""} disabled={locked}>
          <option value="">Non attribué</option>
          {owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name || owner.email}</option>)}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="customer-value">Valeur potentielle (€)</Label>
        <Input id="customer-value" name="estimatedCents" inputMode="decimal" defaultValue={values?.estimatedCents != null ? String(values.estimatedCents / 100) : ""} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="customer-proba">Probabilité (%)</Label>
        <Input id="customer-proba" name="probability" inputMode="numeric" defaultValue={values?.probability ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="customer-next">Prochaine action</Label>
        <Input id="customer-next" name="nextAction" defaultValue={values?.nextAction ?? ""} maxLength={200} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="customer-next-at">Échéance</Label>
        <Input id="customer-next-at" name="nextActionAt" type="date" defaultValue={values?.nextActionAt ? new Date(values.nextActionAt).toISOString().slice(0, 10) : ""} disabled={locked} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="customer-notes">Notes</Label>
        <textarea
          id="customer-notes"
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={values?.notes ?? ""}
          disabled={locked}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      {!locked && (
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending} size="lg">{pending ? "Enregistrement…" : editing ? "Enregistrer la fiche" : "Créer la fiche"}</Button>
        </div>
      )}
      {state?.ok && <Alert variant="success" className="sm:col-span-2">La fiche a été enregistrée.</Alert>}
      {state?.error && <Alert variant="destructive" className="sm:col-span-2">{state.error}</Alert>}
    </form>
  );
}
