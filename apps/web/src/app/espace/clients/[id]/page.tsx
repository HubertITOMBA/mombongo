import Link from "next/link";
import { notFound } from "next/navigation";
import { activityTypeLabels, addressTypeLabels, countryLabels, customerDisplayName, customerKindLabels, customerPartyKindLabels, formatDateTime, pipelineStageLabels, type CountryCode } from "@mombongo/contracts";
import { requireMembership } from "@/lib/auth/access";
import { canWriteCustomers } from "@/lib/auth/permissions";
import { getCustomer, listOwners } from "@/lib/customers/service";
import { listAppointments } from "@/lib/appointments/service";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { CustomerForm } from "@/components/customers/customer-form";
import { AddressForm, RemoveAddressButton } from "@/components/customers/address-form";
import { ArchiveCustomerButton, ConvertProspectButton, RestoreCustomerButton } from "@/components/customers/customer-actions";
import { ActivityForm } from "@/components/customers/activity-form";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireMembership();
  const writable = canWriteCustomers(membership.role);
  const owners = await listOwners(membership.organizationId);
  const appointments = await listAppointments(membership.organizationId, { customerId: id, includePast: true });
  let customer;
  try {
    customer = await getCustomer(membership.organizationId, id);
  } catch (error) {
    if (error instanceof AuthFlowError) notFound();
    throw error;
  }
  const archived = customer.status === "ARCHIVED";
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          <Link href="/espace/clients" className="hover:underline">Clients</Link>
        </p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{customerDisplayName(customer)}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {customer.partyKind ? `${customerPartyKindLabels[customer.partyKind]} · ` : ""}
              {customerKindLabels[customer.kind]} · {pipelineStageLabels[customer.stage]} · {archived ? "Archivé" : "Actif"}
            </p>
          </div>
          {writable && (
            <div className="flex flex-wrap gap-3">
              {customer.kind === "PROSPECT" && !archived && <ConvertProspectButton customerId={customer.id} name={customerDisplayName(customer)} />}
              {archived
                ? <RestoreCustomerButton customerId={customer.id} name={customerDisplayName(customer)} />
                : <ArchiveCustomerButton customerId={customer.id} name={customerDisplayName(customer)} />}
            </div>
          )}
        </div>
        {archived && <Alert variant="warning" className="mt-6">Cette fiche est archivée. Elle n’est plus proposée à la modification.</Alert>}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Fiche</CardTitle>
            <CardDescription>Les factures futures copieront ces informations ; modifier la fiche ne réécrira pas un document déjà émis.</CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerForm values={{ ...customer, customerId: customer.id }} locked={!writable || archived} owners={owners} />
          </CardContent>
        </Card>
        <section className="mt-10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Rendez-vous</h2>
            <Link href="/espace/agenda" className="text-sm font-medium text-primary hover:underline">Ouvrir l’agenda</Link>
          </div>
          {appointments.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Aucun rendez-vous lié à cette fiche.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {appointments.map(item => (
                <li key={item.id} className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">{formatDateTime(item.startsAt)} · {item.status === "CANCELLED" ? "Annulé" : "Planifié"}</p>
                  <p className="mt-1 text-sm font-medium">{item.title}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Historique</h2>
          {writable && !archived && (
            <div className="mt-4">
              <ActivityForm customerId={customer.id} />
            </div>
          )}
          {customer.activities.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Aucun événement pour le moment.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {customer.activities.map(activity => (
                <li key={activity.id} className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(activity.createdAt)} · {activityTypeLabels[activity.type]}
                    {activity.createdBy ? ` · ${activity.createdBy.name || activity.createdBy.email}` : ""}
                  </p>
                  <p className="mt-1 text-sm">{activity.message}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Adresses</h2>
          {customer.addresses.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">Aucune adresse pour le moment.</p>
          )}
          <div className="mt-4 space-y-4">
            {customer.addresses.map(address => (
              <Card key={address.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>{address.label}</CardTitle>
                    <CardDescription>
                      {addressTypeLabels[address.type]} · {address.city} · {countryLabels[address.countryCode as CountryCode] ?? address.countryCode}
                    </CardDescription>
                  </div>
                  {writable && !archived && <RemoveAddressButton addressId={address.id} customerId={customer.id} label={address.label} />}
                </CardHeader>
                <CardContent>
                  <AddressForm customerId={customer.id} values={address} locked={!writable || archived} />
                </CardContent>
              </Card>
            ))}
          </div>
          {writable && !archived && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Ajouter une adresse</CardTitle>
                <CardDescription>Facturation, livraison, bureau ou autre. Plusieurs adresses du même type sont possibles.</CardDescription>
              </CardHeader>
              <CardContent>
                <AddressForm customerId={customer.id} />
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </WorkspaceShell>
  );
}
