import Link from "next/link";
import { notFound } from "next/navigation";
import { documentStatusLabels, formatDate, formatDateTime, formatMoney, operationCategoryLabels, vatRates } from "@mombongo/contracts";
import { requireMembership } from "@/lib/auth/access";
import { canIssueInvoices, canSendDocuments, canWriteQuotes } from "@/lib/auth/permissions";
import { listCatalogItems } from "@/lib/catalog/service";
import { getQuote } from "@/lib/quotes/service";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { quantityNumber, vatBreakdown } from "@/lib/documents/money";
import { documentCurrency } from "@/lib/documents/snapshot";
import { getDocumentEmailCompose, listDocumentEmailDeliveries } from "@/lib/document-emails/service";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QuoteLineForm } from "@/components/quotes/quote-line-form";
import { AcceptQuoteButton, CancelQuoteButton, RefuseQuoteButton, SendQuoteButton } from "@/components/quotes/quote-actions";
import { ConvertQuoteButton } from "@/components/invoices/invoice-actions";
import { DocumentParties, documentPartyName } from "@/components/documents/document-parties";
import { DocumentPdfLink } from "@/components/documents/document-pdf-link";
import { DocumentEmailPanel } from "@/components/documents/document-email-panel";

function money(cents: number, currency: string) {
  return formatMoney(cents, currency);
}

function vatLabel(bps: number) {
  return vatRates.find(rate => rate.bps === bps)?.label ?? `${bps / 100} %`;
}

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireMembership();
  const writable = canWriteQuotes(membership.role);
  const canIssue = canIssueInvoices(membership.role);
  const canEmail = canSendDocuments(membership.role);
  const catalogItems = writable ? await listCatalogItems(membership.organizationId) : [];
  let quote;
  try {
    quote = await getQuote(membership.organizationId, id);
  } catch (error) {
    if (error instanceof AuthFlowError) notFound();
    throw error;
  }
  const currency = documentCurrency(quote, typeof membership.organization.currency === "string" ? membership.organization.currency : "EUR");
  const rates = Array.isArray(quote.vatBreakdownSnapshot) ? quote.vatBreakdownSnapshot as { vatBps: number; htCents: number; vatCents: number }[] : vatBreakdown(quote.lines);
  const emailCompose = await getDocumentEmailCompose(membership.organizationId, quote.id);
  const emailDeliveries = emailCompose.sendable ? await listDocumentEmailDeliveries(membership.organizationId, quote.id) : [];
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          <Link href="/espace/devis" className="hover:underline">Devis</Link>
        </p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{quote.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {quote.number ?? "Brouillon"} · {documentStatusLabels[quote.status]} ·{" "}
              <Link href={`/espace/clients/${quote.customer.id}`} className="text-primary hover:underline">{documentPartyName(quote)}</Link>
              {quote.issuedAt ? ` · ${formatDateTime(quote.issuedAt)}` : ""}
              {quote.validUntil ? ` · Valable jusqu’au ${formatDate(quote.validUntil)}` : ""}
              {quote.supplyDate ? ` · Prestation ${formatDate(quote.supplyDate)}` : ""}
              {quote.customerOrderNumber ? ` · Commande ${quote.customerOrderNumber}` : ""}
              {quote.operationCategory ? ` · ${operationCategoryLabels[quote.operationCategory]}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <DocumentPdfLink documentId={quote.id} />
            {writable && quote.status === "DRAFT" && <SendQuoteButton documentId={quote.id} />}
            {writable && quote.status === "SENT" && (
              <>
                <AcceptQuoteButton documentId={quote.id} />
                <RefuseQuoteButton documentId={quote.id} />
              </>
            )}
            {writable && (quote.status === "DRAFT" || quote.status === "SENT") && <CancelQuoteButton documentId={quote.id} />}
            {canIssue && quote.status === "ACCEPTED" && quote.derived.length === 0 && <ConvertQuoteButton documentId={quote.id} />}
            {quote.derived[0] && (
              <Link href={`/espace/factures/${quote.derived[0].id}`} className="text-sm font-medium text-primary hover:underline">
                Voir {quote.derived[0].number}
              </Link>
            )}
          </div>
        </div>
        <DocumentParties document={quote} />
        {emailCompose.sendable && (
          <DocumentEmailPanel
            documentId={quote.id}
            defaultToEmail={emailCompose.defaultToEmail}
            subject={emailCompose.subject}
            message={emailCompose.message}
            locked={!canEmail}
            deliveries={emailDeliveries}
          />
        )}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Lignes</CardTitle>
            <CardDescription>Montants en {currency}. TVA par ligne, totaux calculés côté serveur.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 font-medium">Description</th>
                  <th className="py-2 font-medium">Qté</th>
                  <th className="py-2 font-medium">PU HT</th>
                  <th className="py-2 font-medium">TVA</th>
                  <th className="py-2 text-right font-medium">TTC</th>
                </tr>
              </thead>
              <tbody>
                {quote.lines.map(line => (
                  <tr key={line.id} className="border-b border-border">
                    <td className="py-3">{line.description}</td>
                    <td className="py-3">{quantityNumber(line.quantity)} {line.unit ?? ""}</td>
                    <td className="py-3">{money(line.unitPriceCents, currency)}</td>
                    <td className="py-3">{vatLabel(line.vatBps)}</td>
                    <td className="py-3 text-right">{money(line.ttcCents, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rates.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                {rates.map(rate => (
                  <li key={rate.vatBps}>TVA {vatLabel(rate.vatBps)} : {money(rate.vatCents, currency)} (base {money(rate.htCents, currency)})</li>
                ))}
              </ul>
            )}
            <p className="mt-6 text-right text-sm">
              HT {money(quote.htCents, currency)} · TVA {money(quote.vatCents, currency)} · <strong>TTC {money(quote.ttcCents, currency)}</strong>
            </p>
            {writable && quote.status === "DRAFT" && (
              <div className="mt-8 border-t border-border pt-6">
                <QuoteLineForm documentId={quote.id} catalogItems={catalogItems} />
              </div>
            )}
          </CardContent>
        </Card>
        {quote.paymentTermsSnapshot && <p className="mt-4 text-sm text-muted-foreground">{quote.paymentTermsSnapshot}</p>}
        {quote.notes && <p className="mt-6 text-sm text-muted-foreground">{quote.notes}</p>}
      </main>
    </WorkspaceShell>
  );
}
