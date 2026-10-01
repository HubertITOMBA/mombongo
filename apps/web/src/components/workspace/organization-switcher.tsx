"use client";

import { useTransition } from "react";
import { FieldSelect } from "@/components/ui/field-select";
import { switchActiveOrganizationAction } from "@/lib/auth/organization-actions";

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: { id: string; name: string }[];
  activeOrganizationId: string;
}) {
  const [pending, startTransition] = useTransition();
  const active = organizations.find(item => item.id === activeOrganizationId) ?? organizations[0];
  if (!active) return null;
  if (organizations.length === 1) {
    return <p className="max-w-44 truncate text-sm font-medium text-foreground" title={active.name}>{active.name}</p>;
  }
  return (
    <form className="min-w-40">
      <label htmlFor="active-organization" className="sr-only">Organisation active</label>
      <FieldSelect
        id="active-organization"
        name="organizationId"
        defaultValue={active.id}
        disabled={pending}
        aria-label="Organisation active"
        className="h-10"
        onChange={event => {
          const formData = new FormData();
          formData.set("organizationId", event.target.value);
          startTransition(() => {
            void switchActiveOrganizationAction(formData);
          });
        }}
      >
        {organizations.map(organization => (
          <option key={organization.id} value={organization.id}>{organization.name}</option>
        ))}
      </FieldSelect>
    </form>
  );
}
