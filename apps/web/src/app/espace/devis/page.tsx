import Link from "next/link";
import { customerDisplayName, documentStatusLabels, formatMoney } from "@mombongo/contracts";
import { requireMembership } from "@/lib/auth/access";
import { canWriteQuotes } from "@/lib/auth/permissions";
import { listCustomers } from "@/lib/customers/service";
import { listCatalogItems } from "@/lib/catalog/service";
import { listQuotes } from "@/lib/quotes/service";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QuoteForm } from "@/components/quotes/quote-form";
import { documentCurrency, documentCustomerLabel } from "@/lib/documents/snapshot";

export default async function QuotesPage() {
  const { membership } = await requireMembership();
  const writable = canWriteQuotes(membership.role);
  const [quotes, customers, catalogItems] = await Promise.all([
    listQuotes(membership.organizationId),
    listCustomers(membership.organizationId, { status: "ACTIVE" }),
    listCatalogItems(membership.organizationId),
  ]);
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Votre entreprise</p>
        <h1 className="mt-3 text-3xl font-semibold">Devis de {membership.organization.name}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Un brouillon peut encore être modifié. L’envoi attribue un numéro unique dans l’année.
          {" "}<Link href="/espace/clients" className="text-primary hover:underline">Voir les fiches</Link>
        </p>
        {writable && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Nouveau devis</CardTitle>
              <CardDescription>Liez une fiche, puis une ligne libre ou un article du catalogue. Le catalogue n’est jamais obligatoire.</CardDescription>
            </CardHeader>
            <CardContent>
              {customers.length === 0
                ? <p className="text-sm text-muted-foreground">Créez d’abord un client ou un prospect.</p>
                : <QuoteForm customers={customers.map(item => ({ id: item.id, displayName: customerDisplayName(item) }))} catalogItems={catalogItems} />}
            </CardContent>
          </Card>
        )}
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Documents</h2>
          {quotes.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Aucun devis pour le moment.</p>
          ) : (
            <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
              {quotes.map(quote => (
                <article key={quote.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-medium">
                      <Link href={`/espace/devis/${quote.id}`} className="hover:text-primary hover:underline">{quote.title}</Link>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {quote.number ?? "Brouillon"} · {documentStatusLabels[quote.status]} · {documentCustomerLabel(quote)} · {formatMoney(quote.ttcCents, documentCurrency(quote, typeof membership.organization.currency === "string" ? membership.organization.currency : "EUR"))} TTC
                    </p>
                  </div>
                  <Link href={`/espace/devis/${quote.id}`} className="text-sm font-medium text-primary hover:underline">Ouvrir</Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </WorkspaceShell>
  );
}
