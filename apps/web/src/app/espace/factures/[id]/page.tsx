import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, formatDateTime, formatMoney, operationCategoryLabels, paymentMethodLabels, paymentStatusLabels, settlementStateLabels, vatRates } from "@mombongo/contracts";
import { requireMembership } from "@/lib/auth/access";
import { canCancelInvoices, canCancelPayments, canIssueCreditNotes, canRecordPayments, canSendDocuments, canSubmitElectronicInvoicing } from "@/lib/auth/permissions";
import { getInvoice } from "@/lib/invoices/service";
import { invoiceSettlement, isInvoiceOverdue } from "@/lib/invoices/settlement";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { quantityNumber, vatBreakdown } from "@/lib/documents/money";
import { documentCurrency } from "@/lib/documents/snapshot";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CancelInvoiceButton } from "@/components/invoices/invoice-actions";
import { DocumentParties, documentPartyName } from "@/components/documents/document-parties";
import { DocumentElectronicNotice, DocumentFacturXLink } from "@/components/documents/document-electronic-panel";
import { DocumentPdfLink } from "@/components/documents/document-pdf-link";
import { DocumentEmailPanel } from "@/components/documents/document-email-panel";
import { inspectElectronicDocument } from "@/lib/einvoice/service";
import { getDocumentElectronicTransmission } from "@/lib/einvoice-platform/service";
import { getDocumentEmailCompose, listDocumentEmailDeliveries } from "@/lib/document-emails/service";
import { DocumentLifecyclePanel } from "@/components/einvoice/lifecycle-panel";
import { CancelPaymentButton, RecordPaymentForm } from "@/components/payments/payment-form";

function vatLabel(bps: number) {
  return vatRates.find(rate => rate.bps === bps)?.label ?? `${bps / 100} %`;
}

function creditLabel(status: string) {
  if (status === "SENT") return "Émis";
  if (status === "DRAFT") return "Brouillon";
  if (status === "CANCELLED") return "Annulé";
  return status;
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireMembership();
  const canCancel = canCancelInvoices(membership.role);
  const canCredit = canIssueCreditNotes(membership.role);
  const canPay = canRecordPayments(membership.role);
  const canVoidPayment = canCancelPayments(membership.role);
  const canTransmit = canSubmitElectronicInvoicing(membership.role);
  const canEmail = canSendDocuments(membership.role);
  let invoice;
  try {
    invoice = await getInvoice(membership.organizationId, id);
  } catch (error) {
    if (error instanceof AuthFlowError) notFound();
    throw error;
  }
  const issued = invoice.status === "SENT";
  const currency = documentCurrency(invoice, typeof membership.organization.currency === "string" ? membership.organization.currency : "EUR");
  const rates = Array.isArray(invoice.vatBreakdownSnapshot)
    ? invoice.vatBreakdownSnapshot as { vatBps: number; htCents: number; vatCents: number }[]
    : vatBreakdown(invoice.lines);
  const settlement = invoiceSettlement({
    grossTtcCents: invoice.ttcCents,
    creditNotes: invoice.creditNotes,
    payments: invoice.payments,
  });
  const overdue = isInvoiceOverdue(settlement.remainingTtcCents, invoice.dueDate);
  const electronic = issued ? inspectElectronicDocument(invoice) : null;
  const transmission = issued ? await getDocumentElectronicTransmission(membership.organizationId, invoice.id) : null;
  const emailCompose = await getDocumentEmailCompose(membership.organizationId, invoice.id);
  const emailDeliveries = emailCompose.sendable ? await listDocumentEmailDeliveries(membership.organizationId, invoice.id) : [];
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          <Link href="/espace/factures" className="hover:underline">Factures</Link>
        </p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{invoice.number ?? invoice.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {issued ? "Émise" : invoice.status === "CANCELLED" ? "Annulée (historique)" : invoice.status} · {invoice.title} ·{" "}
              {overdue ? "En retard · " : ""}
              <Link href={`/espace/clients/${invoice.customer.id}`} className="text-primary hover:underline">{documentPartyName(invoice)}</Link>
              {invoice.issuedAt ? ` · ${formatDateTime(invoice.issuedAt)}` : ""}
              {invoice.dueDate ? ` · Échéance ${formatDate(invoice.dueDate)}` : ""}
              {invoice.supplyDate ? ` · Prestation ${formatDate(invoice.supplyDate)}` : ""}
              {invoice.customerOrderNumber ? ` · Commande ${invoice.customerOrderNumber}` : ""}
              {invoice.operationCategory ? ` · ${operationCategoryLabels[invoice.operationCategory]}` : ""}
              {invoice.source ? <> · depuis <Link href={`/espace/devis/${invoice.source.id}`} className="text-primary hover:underline">{invoice.source.number}</Link></> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <DocumentPdfLink documentId={invoice.id} />
            {electronic ? <DocumentFacturXLink documentId={invoice.id} available={electronic.available} /> : null}
            {canCredit && issued && settlement.remainingTtcCents > 0 && (
              <Button asChild>
                <Link href={`/espace/factures/${invoice.id}/avoir`}>Créer un avoir</Link>
              </Button>
            )}
            {canCancel && invoice.status === "DRAFT" && <CancelInvoiceButton documentId={invoice.id} />}
          </div>
        </div>
        {electronic ? <DocumentElectronicNotice inspection={electronic} /> : null}
        <DocumentLifecyclePanel
          documentStatus={invoice.status}
          settlementLabel={`${settlementStateLabels[settlement.settlementState]}${overdue ? " · En retard" : ""}`}
          transmission={transmission}
          documentId={invoice.id}
          canSubmit={canTransmit && issued}
          kind="INVOICE"
        />
        <DocumentParties document={invoice} />
        {emailCompose.sendable && (
          <DocumentEmailPanel
            documentId={invoice.id}
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
            <CardDescription>Montants en {currency}. Copie figée du devis. L’état documentaire n’est pas un état de paiement.</CardDescription>
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
                {invoice.lines.map(line => (
                  <tr key={line.id} className="border-b border-border">
                    <td className="py-3">{line.description}</td>
                    <td className="py-3">{quantityNumber(line.quantity)} {line.unit ?? ""}</td>
                    <td className="py-3">{formatMoney(line.unitPriceCents, currency)}</td>
                    <td className="py-3">{vatLabel(line.vatBps)}</td>
                    <td className="py-3 text-right">{formatMoney(line.ttcCents, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rates.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                {rates.map(rate => (
                  <li key={rate.vatBps}>TVA {vatLabel(rate.vatBps)} : {formatMoney(rate.vatCents, currency)} (base {formatMoney(rate.htCents, currency)})</li>
                ))}
              </ul>
            )}
            <p className="mt-6 text-right text-sm">
              HT {formatMoney(invoice.htCents, currency)} · TVA {formatMoney(invoice.vatCents, currency)} · <strong>TTC {formatMoney(invoice.ttcCents, currency)}</strong>
            </p>
          </CardContent>
        </Card>
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Solde</CardTitle>
            <CardDescription>
              Total facture − avoirs = net facturé. Net − encaissements = reste à payer.
              Un avoir n’est pas un paiement. Aucun statut PAID n’est stocké sur le document.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between gap-4"><dt>Total facture</dt><dd>{formatMoney(settlement.grossTtcCents, currency)}</dd></div>
              <div className="flex justify-between gap-4 text-muted-foreground"><dt>− Avoirs émis</dt><dd>{formatMoney(settlement.creditedTtcCents, currency)}</dd></div>
              <div className="flex justify-between gap-4 border-t border-border pt-3"><dt>Net facturé</dt><dd>{formatMoney(settlement.netTtcCents, currency)}</dd></div>
              <div className="flex justify-between gap-4 text-muted-foreground"><dt>− Encaissements</dt><dd>{formatMoney(settlement.paidTtcCents, currency)}</dd></div>
              <div className="flex justify-between gap-4 border-t border-border pt-3 font-medium"><dt>Reste à payer</dt><dd>{formatMoney(settlement.remainingTtcCents, currency)}</dd></div>
            </dl>
          </CardContent>
        </Card>
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Avoirs</CardTitle>
            <CardDescription>La facture reste intacte. Les avoirs réduisent le net économique, pas le document original.</CardDescription>
          </CardHeader>
          <CardContent>
            {invoice.creditNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun avoir pour cette facture.</p>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {invoice.creditNotes.map(note => (
                  <article key={note.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm">
                      <Link href={`/espace/avoirs/${note.id}`} className="font-medium hover:text-primary hover:underline">{note.number ?? "Brouillon"}</Link>
                      {" · "}{creditLabel(note.status)} · {formatMoney(note.ttcCents, currency)} TTC
                      {note.issuedAt ? ` · ${formatDateTime(note.issuedAt)}` : ""}
                    </p>
                    <Link href={`/espace/avoirs/${note.id}`} className="text-sm font-medium text-primary hover:underline">Ouvrir</Link>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Paiements</CardTitle>
            <CardDescription>Encaissements manuels. Un paiement annulé reste dans l’historique et ne compte plus.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun paiement pour cette facture.</p>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {invoice.payments.map(payment => (
                  <article key={payment.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm">
                      {formatDate(payment.paidAt)} · {formatMoney(payment.amountCents, payment.currency)} · {paymentMethodLabels[payment.method]} · {paymentStatusLabels[payment.status]}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                    </p>
                    {canVoidPayment && payment.status === "CONFIRMED" && <CancelPaymentButton paymentId={payment.id} />}
                  </article>
                ))}
              </div>
            )}
            {canPay && issued && settlement.remainingTtcCents > 0 && (
              <div>
                <h3 className="mb-4 text-sm font-medium">Enregistrer un paiement</h3>
                <RecordPaymentForm invoiceId={invoice.id} remainingCents={settlement.remainingTtcCents} />
              </div>
            )}
          </CardContent>
        </Card>
        {(invoice.paymentTermsSnapshot || invoice.latePaymentPenaltyTermsSnapshot || invoice.recoveryFeeMentionSnapshot || invoice.issuerVatOnDebitsSnapshot) && (
          <p className="mt-6 space-y-1 text-sm text-muted-foreground">
            {invoice.paymentTermsSnapshot && <span className="block">{invoice.paymentTermsSnapshot}</span>}
            {invoice.earlyPaymentDiscountTermsSnapshot && <span className="block">{invoice.earlyPaymentDiscountTermsSnapshot}</span>}
            {invoice.latePaymentPenaltyTermsSnapshot && <span className="block">{invoice.latePaymentPenaltyTermsSnapshot}</span>}
            {invoice.recoveryFeeMentionSnapshot && <span className="block">{invoice.recoveryFeeMentionSnapshot}</span>}
            {invoice.issuerVatOnDebitsSnapshot ? <span className="block">Option pour le paiement de la TVA d’après les débits.</span> : null}
          </p>
        )}
      </main>
    </WorkspaceShell>
  );
}
