import Link from "next/link";
import { notFound } from "next/navigation";
import { catalogKindLabels, formatMoney } from "@mombongo/contracts";
import { requireMembership } from "@/lib/auth/access";
import { canManageCatalog } from "@/lib/auth/permissions";
import { getCatalogItem } from "@/lib/catalog/service";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { CatalogForm } from "@/components/catalog/catalog-form";
import { DeactivateCatalogItemButton, ReactivateCatalogItemButton } from "@/components/catalog/catalog-actions";

export default async function CatalogItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireMembership();
  const writable = canManageCatalog(membership.role);
  const currency = typeof membership.organization.currency === "string" ? membership.organization.currency : "EUR";
  let item;
  try {
    item = await getCatalogItem(membership.organizationId, id);
  } catch (error) {
    if (error instanceof AuthFlowError) notFound();
    throw error;
  }
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          <Link href="/espace/catalogue" className="hover:underline">Produits et services</Link>
        </p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{item.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {catalogKindLabels[item.itemKind]}
              {item.reference ? ` · ${item.reference}` : ""}
              {` · ${formatMoney(item.unitPriceCents, currency)} HT`}
              {item.active ? " · Actif" : " · Inactif"}
            </p>
          </div>
          {writable && (
            item.active
              ? <DeactivateCatalogItemButton catalogItemId={item.id} name={item.name} />
              : <ReactivateCatalogItemButton catalogItemId={item.id} name={item.name} />
          )}
        </div>
        {!item.active && (
          <Alert variant="warning" className="mt-6">
            Cet article n’est plus proposé à la création d’une ligne. Les devis déjà enregistrés restent inchangés.
          </Alert>
        )}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Fiche catalogue</CardTitle>
            <CardDescription>Ces valeurs sont copiées au moment de l’ajout d’une ligne. Elles ne relisent jamais un document existant.</CardDescription>
          </CardHeader>
          <CardContent>
            <CatalogForm values={{ ...item, catalogItemId: item.id }} locked={!writable} />
          </CardContent>
        </Card>
      </main>
    </WorkspaceShell>
  );
}
