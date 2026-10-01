import Link from "next/link";
import { formatDate, formatDateTime, formatMoney, settlementStateLabels } from "@mombongo/contracts";
import { requireMembership } from "@/lib/auth/access";
import { listInvoices } from "@/lib/invoices/service";
import { invoiceSettlement, isInvoiceOverdue } from "@/lib/invoices/settlement";
import { documentCurrency, documentCustomerLabel } from "@/lib/documents/snapshot";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

function invoiceLabel(status: string) {
  if (status === "SENT") return "Émise";
  if (status === "CANCELLED") return "Annulée (historique)";
  return status;
}

export default async function InvoicesPage() {
  const { membership } = await requireMembership();
  const invoices = await listInvoices(membership.organizationId);
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Votre entreprise</p>
        <h1 className="mt-3 text-3xl font-semibold">Factures de {membership.organization.name}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Une facture naît d’un devis accepté. Le numéro <code>FA-AAAA-0001</code> est unique dans l’année.
          Les avoirs et paiements se gèrent depuis le détail d’une facture. {" "}
          <Link href="/espace/devis" className="text-primary hover:underline">Voir les devis</Link>
        </p>
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Documents</h2>
          {invoices.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Aucune facture pour le moment.</p>
          ) : (
            <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
              {invoices.map(invoice => {
                const currency = documentCurrency(invoice, typeof membership.organization.currency === "string" ? membership.organization.currency : "EUR");
                const settlement = invoiceSettlement({
                  grossTtcCents: invoice.ttcCents,
                  creditNotes: invoice.creditNotes,
                  payments: invoice.payments,
                });
                const overdue = isInvoiceOverdue(settlement.remainingTtcCents, invoice.dueDate);
                return (
                <article key={invoice.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-medium">
                      <Link href={`/espace/factures/${invoice.id}`} className="hover:text-primary hover:underline">{invoice.number ?? invoice.title}</Link>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {invoiceLabel(invoice.status)} · {settlementStateLabels[settlement.settlementState]}
                      {overdue ? " · En retard" : ""} · {documentCustomerLabel(invoice)} · {formatMoney(invoice.ttcCents, currency)} TTC
                      {settlement.creditedTtcCents > 0 ? ` · Net ${formatMoney(settlement.netTtcCents, currency)}` : ""}
                      {settlement.paidTtcCents > 0 || settlement.remainingTtcCents !== invoice.ttcCents ? ` · Reste ${formatMoney(settlement.remainingTtcCents, currency)}` : ""}
                      {invoice.issuedAt ? ` · ${formatDateTime(invoice.issuedAt)}` : ""}
                      {invoice.dueDate ? ` · Échéance ${formatDate(invoice.dueDate)}` : ""}
                      {invoice.source?.number ? ` · depuis ${invoice.source.number}` : ""}
                    </p>
                  </div>
                  <Link href={`/espace/factures/${invoice.id}`} className="text-sm font-medium text-primary hover:underline">Ouvrir</Link>
                </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </WorkspaceShell>
  );
}
