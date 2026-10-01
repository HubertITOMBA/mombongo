import Link from "next/link";
import { catalogKindLabels, formatMoney } from "@mombongo/contracts";
import { requireMembership } from "@/lib/auth/access";
import { canManageCatalog } from "@/lib/auth/permissions";
import { listCatalogItems } from "@/lib/catalog/service";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CatalogForm } from "@/components/catalog/catalog-form";

const filters = [
  { href: "/espace/catalogue", label: "Actifs" },
  { href: "/espace/catalogue?type=PRODUCT", label: "Produits" },
  { href: "/espace/catalogue?type=SERVICE", label: "Services" },
  { href: "/espace/catalogue?statut=INACTIVE", label: "Inactifs" },
  { href: "/espace/catalogue?statut=ALL", label: "Tous" },
];

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; statut?: string }>;
}) {
  const params = await searchParams;
  const { membership } = await requireMembership();
  const writable = canManageCatalog(membership.role);
  const currency = typeof membership.organization.currency === "string" ? membership.organization.currency : "EUR";
  const items = await listCatalogItems(membership.organizationId, {
    query: params.q,
    itemKind: params.type,
    active: params.statut,
  });
  const current = params.statut === "INACTIVE"
    ? "/espace/catalogue?statut=INACTIVE"
    : params.statut === "ALL"
      ? "/espace/catalogue?statut=ALL"
      : params.type === "PRODUCT"
        ? "/espace/catalogue?type=PRODUCT"
        : params.type === "SERVICE"
          ? "/espace/catalogue?type=SERVICE"
          : "/espace/catalogue";
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Votre entreprise</p>
        <h1 className="mt-3 text-3xl font-semibold">Produits et services de {membership.organization.name}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Le catalogue accélère la saisie d’un devis. Une ligne enregistrée reste indépendante : modifier un article ici ne change jamais un document existant.
          {" "}<Link href="/espace/devis" className="text-primary hover:underline">Créer un devis</Link>
        </p>
        <form action="/espace/catalogue" className="mt-8 flex flex-wrap items-end gap-3">
          {params.type && <input type="hidden" name="type" value={params.type} />}
          {params.statut && <input type="hidden" name="statut" value={params.statut} />}
          <div className="min-w-60 flex-1">
            <label htmlFor="catalog-search" className="sr-only">Rechercher un article</label>
            <Input id="catalog-search" name="q" defaultValue={params.q ?? ""} placeholder="Rechercher un nom ou une référence" />
          </div>
          <Button type="submit" variant="outline">Rechercher</Button>
        </form>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Filtres du catalogue">
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
              <CardTitle>Nouvel article</CardTitle>
              <CardDescription>Produit ou service, dans la devise de l’organisation ({currency}). La quantité se choisit sur le devis.</CardDescription>
            </CardHeader>
            <CardContent>
              <CatalogForm />
            </CardContent>
          </Card>
        )}
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Catalogue</h2>
          {items.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Aucun article pour ce filtre.</p>
          ) : (
            <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
              {items.map(item => (
                <article key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-medium">
                      <Link href={`/espace/catalogue/${item.id}`} className="hover:text-primary hover:underline">{item.name}</Link>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      <span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs ${item.itemKind === "PRODUCT" ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>
                        {catalogKindLabels[item.itemKind]}
                      </span>
                      {item.reference ? `${item.reference} · ` : ""}
                      {formatMoney(item.unitPriceCents, currency)} HT
                      {!item.active ? " · Inactif" : ""}
                    </p>
                  </div>
                  <Link href={`/espace/catalogue/${item.id}`} className="text-sm font-medium text-primary hover:underline">Ouvrir</Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </WorkspaceShell>
  );
}
