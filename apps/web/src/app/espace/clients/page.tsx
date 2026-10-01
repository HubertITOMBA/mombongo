import Link from "next/link";
import { customerDisplayName, customerKindLabels, customerPartyKindLabels } from "@mombongo/contracts";
import { requireMembership } from "@/lib/auth/access";
import { canWriteCustomers } from "@/lib/auth/permissions";
import { listCustomers, listOwners } from "@/lib/customers/service";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerForm } from "@/components/customers/customer-form";

const filters = [
  { href: "/espace/clients", label: "Actifs" },
  { href: "/espace/clients?type=CLIENT", label: "Clients" },
  { href: "/espace/clients?type=PROSPECT", label: "Prospects" },
  { href: "/espace/clients?statut=ARCHIVED", label: "Archives" },
  { href: "/espace/clients?statut=ALL", label: "Tous" },
];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; statut?: string }>;
}) {
  const params = await searchParams;
  const { membership } = await requireMembership();
  const writable = canWriteCustomers(membership.role);
  const owners = await listOwners(membership.organizationId);
  const customers = await listCustomers(membership.organizationId, {
    query: params.q,
    kind: params.type,
    status: params.statut,
  });
  const current = params.statut === "ARCHIVED"
    ? "/espace/clients?statut=ARCHIVED"
    : params.statut === "ALL"
      ? "/espace/clients?statut=ALL"
      : params.type === "CLIENT"
        ? "/espace/clients?type=CLIENT"
        : params.type === "PROSPECT"
          ? "/espace/clients?type=PROSPECT"
          : "/espace/clients";
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Votre entreprise</p>
        <h1 className="mt-3 text-3xl font-semibold">Clients de {membership.organization.name}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Particulier ou professionnel, les fiches restent isolées à votre entreprise. Un prospect peut être converti en client sans créer de doublon.
          {" "}<Link href="/espace/pipeline" className="text-primary hover:underline">Ouvrir le pipeline</Link>
        </p>
        <form action="/espace/clients" className="mt-8 flex flex-wrap items-end gap-3">
          {params.type && <input type="hidden" name="type" value={params.type} />}
          {params.statut && <input type="hidden" name="statut" value={params.statut} />}
          <div className="min-w-60 flex-1">
            <label htmlFor="customer-search" className="sr-only">Rechercher un contact</label>
            <Input id="customer-search" name="q" defaultValue={params.q ?? ""} placeholder="Rechercher un nom ou un email" />
          </div>
          <Button type="submit" variant="outline">Rechercher</Button>
        </form>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Filtres des fiches">
          {filters.map(filter => (
            <Link
              key={filter.href}
              href={filter.href}
              className={`rounded-full px-3 py-1 text-sm ${current === filter.href ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-primary"}`}
            >
              {filter.label}
            </Link>
          ))}
        </nav>
        {writable && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Nouvelle fiche</CardTitle>
              <CardDescription>Choisissez particulier ou professionnel. Les adresses s’ajoutent ensuite sur la fiche. SIREN, SIRET et TVA restent optionnels pour un prospect.</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerForm owners={owners} />
            </CardContent>
          </Card>
        )}
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Fiches</h2>
          {customers.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Aucun contact pour ce filtre.</p>
          ) : (
            <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
              {customers.map(customer => (
                <article key={customer.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-medium">
                      <Link href={`/espace/clients/${customer.id}`} className="hover:text-primary hover:underline">{customerDisplayName(customer)}</Link>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {customer.partyKind ? `${customerPartyKindLabels[customer.partyKind]} · ` : ""}
                      {customerKindLabels[customer.kind]}
                      {customer.status === "ARCHIVED" ? " · Archivé" : ""}
                      {customer.email ? ` · ${customer.email}` : ""}
                      {` · ${customer._count.addresses} adresse${customer._count.addresses > 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <Link href={`/espace/clients/${customer.id}`} className="text-sm font-medium text-primary hover:underline">Ouvrir</Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </WorkspaceShell>
  );
}
