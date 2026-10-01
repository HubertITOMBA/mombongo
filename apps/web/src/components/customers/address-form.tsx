"use client";
import { useActionState } from "react";
import { addressTypeLabels, countryCodes, countryLabels } from "@mombongo/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { FieldSelect } from "@/components/ui/field-select";
import { addAddressAction, removeAddressAction, updateAddressAction } from "@/lib/customers/actions";
import { addOrganizationAddressAction, removeOrganizationAddressAction, updateOrganizationAddressAction } from "@/lib/organizations/actions";

type AddressValues = {
  id?: string;
  type?: keyof typeof addressTypeLabels;
  label?: string;
  line1?: string;
  line2?: string | null;
  postalCode?: string;
  city?: string;
  countryCode?: string;
};

export function AddressForm({
  customerId,
  values,
  locked,
  organizationOwned,
}: {
  customerId?: string;
  values?: AddressValues;
  locked?: boolean;
  organizationOwned?: boolean;
}) {
  const editing = Boolean(values?.id);
  const [state, action, pending] = useActionState(
    organizationOwned
      ? (editing ? updateOrganizationAddressAction : addOrganizationAddressAction)
      : (editing ? updateAddressAction : addAddressAction),
    undefined,
  );
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {customerId && <input type="hidden" name="customerId" value={customerId} />}
      {values?.id && <input type="hidden" name="addressId" value={values.id} />}
      <div className="space-y-2">
        <Label htmlFor={`address-type-${values?.id || "new"}`}>Type d’adresse</Label>
        <FieldSelect id={`address-type-${values?.id || "new"}`} name="type" defaultValue={values?.type ?? "BILLING"} disabled={locked}>
          {Object.entries(addressTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </FieldSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`address-label-${values?.id || "new"}`}>Libellé</Label>
        <Input id={`address-label-${values?.id || "new"}`} name="label" required maxLength={100} defaultValue={values?.label ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`address-line1-${values?.id || "new"}`}>Adresse</Label>
        <Input id={`address-line1-${values?.id || "new"}`} name="line1" required maxLength={200} defaultValue={values?.line1 ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`address-line2-${values?.id || "new"}`}>Complément</Label>
        <Input id={`address-line2-${values?.id || "new"}`} name="line2" maxLength={200} defaultValue={values?.line2 ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`address-postal-${values?.id || "new"}`}>Code postal</Label>
        <Input id={`address-postal-${values?.id || "new"}`} name="postalCode" required maxLength={20} defaultValue={values?.postalCode ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`address-city-${values?.id || "new"}`}>Ville</Label>
        <Input id={`address-city-${values?.id || "new"}`} name="city" required maxLength={100} defaultValue={values?.city ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`address-country-${values?.id || "new"}`}>Pays</Label>
        <FieldSelect id={`address-country-${values?.id || "new"}`} name="countryCode" defaultValue={values?.countryCode ?? "FR"} disabled={locked}>
          {countryCodes.map(code => <option key={code} value={code}>{countryLabels[code]}</option>)}
        </FieldSelect>
      </div>
      {!locked && (
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>{pending ? "Enregistrement…" : editing ? "Mettre à jour l’adresse" : "Ajouter l’adresse"}</Button>
        </div>
      )}
      {state?.ok && <Alert variant="success" className="sm:col-span-2">L’adresse a été enregistrée.</Alert>}
      {state?.error && <Alert variant="destructive" className="sm:col-span-2">{state.error}</Alert>}
    </form>
  );
}

export function RemoveAddressButton({
  addressId,
  customerId,
  label,
  organizationOwned,
}: {
  addressId: string;
  customerId?: string;
  label: string;
  organizationOwned?: boolean;
}) {
  const [state, action, pending] = useActionState(
    organizationOwned ? removeOrganizationAddressAction : removeAddressAction,
    undefined,
  );
  return (
    <form action={action}>
      <input type="hidden" name="addressId" value={addressId} />
      {customerId && <input type="hidden" name="customerId" value={customerId} />}
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`Supprimer l’adresse ${label}`}>{pending ? "Suppression…" : "Supprimer"}</Button>
      {state?.error && <Alert variant="destructive" className="mt-2">{state.error}</Alert>}
    </form>
  );
}
