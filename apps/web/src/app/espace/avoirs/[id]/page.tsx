import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime, formatMoney, operationCategoryLabels, vatRates } from "@mombongo/contracts";
import { requireMembership } from "@/lib/auth/access";
import { canIssueCreditNotes, canSendDocuments, canSubmitElectronicInvoicing } from "@/lib/auth/permissions";
import { getCreditNote } from "@/lib/credit-notes/service";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { quantityNumber, vatBreakdown } from "@/lib/documents/money";
import { documentCurrency } from "@/lib/documents/snapshot";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DiscardCreditNoteButton, IssueCreditNoteButton } from "@/components/credit-notes/credit-note-actions";
import { DocumentParties, documentPartyName } from "@/components/documents/document-parties";
import { DocumentElectronicNotice, DocumentFacturXLink } from "@/components/documents/document-electronic-panel";
import { DocumentPdfLink } from "@/components/documents/document-pdf-link";
import { DocumentEmailPanel } from "@/components/documents/document-email-panel";
import { inspectElectronicDocument } from "@/lib/einvoice/service";
import { getDocumentElectronicTransmission } from "@/lib/einvoice-platform/service";
import { getDocumentEmailCompose, listDocumentEmailDeliveries } from "@/lib/document-emails/service";
import { DocumentLifecyclePanel } from "@/components/einvoice/lifecycle-panel";

function vatLabel(bps: number) {
  return vatRates.find(rate => rate.bps === bps)?.label ?? `${bps / 100} %`;
}

function creditLabel(status: string) {
  if (status === "SENT") return "Émis";
  if (status === "DRAFT") return "Brouillon";
  if (status === "CANCELLED") return "Annulé";
  return status;
}

export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireMembership();
  const canIssue = canIssueCreditNotes(membership.role);
  const canTransmit = canSubmitElectronicInvoicing(membership.role);
  const canEmail = canSendDocuments(membership.role);
  let note;
  try {
    note = await getCreditNote(membership.organizationId, id);
  } catch (error) {
    if (error instanceof AuthFlowError) notFound();
    throw error;
  }
  const currency = documentCurrency(note, typeof membership.organization.currency === "string" ? membership.organization.currency : "EUR");
  const rates = Array.isArray(note.vatBreakdownSnapshot)
    ? note.vatBreakdownSnapshot as { vatBps: number; htCents: number; vatCents: number }[]
    : vatBreakdown(note.lines);
  const draft = note.status === "DRAFT";
  const electronic = note.status === "SENT" ? inspectElectronicDocument(note) : null;
  const transmission = note.status === "SENT" ? await getDocumentElectronicTransmission(membership.organizationId, note.id) : null;
  const emailCompose = await getDocumentEmailCompose(membership.organizationId, note.id);
  const emailDeliveries = emailCompose.sendable ? await listDocumentEmailDeliveries(membership.organizationId, note.id) : [];
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          {note.creditedInvoice ? (
            <Link href={`/espace/factures/${note.creditedInvoice.id}`} className="hover:underline">
              Facture {note.creditedInvoice.number ?? note.creditedInvoice.title}
            </Link>
          ) : (
            <Link href="/espace/factures" className="hover:underline">Factures</Link>
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{note.number ?? "Avoir brouillon"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {creditLabel(note.status)} · {note.title} ·{" "}
              <Link href={`/espace/clients/${note.customer.id}`} className="text-primary hover:underline">{documentPartyName(note)}</Link>
              {note.issuedAt ? ` · ${formatDateTime(note.issuedAt)}` : ""}
              {note.operationCategory ? ` · ${operationCategoryLabels[note.operationCategory]}` : ""}
              {note.creditedInvoice?.number ? ` · relatif à ${note.creditedInvoice.number}` : ""}
            </p>
            {note.creditReason && <p className="mt-2 text-sm">Motif : {note.creditReason}</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <DocumentPdfLink documentId={note.id} />
            {electronic ? <DocumentFacturXLink documentId={note.id} available={electronic.available} /> : null}
            {canIssue && draft && (
              <>
                <IssueCreditNoteButton documentId={note.id} />
                <DiscardCreditNoteButton documentId={note.id} />
              </>
            )}
          </div>
        </div>
        {electronic ? <DocumentElectronicNotice inspection={electronic} /> : null}
        <DocumentLifecyclePanel
          documentStatus={note.status}
          settlementLabel="sans objet (avoir)"
          transmission={transmission}
          documentId={note.id}
          canSubmit={canTransmit && note.status === "SENT"}
          kind="CREDIT_NOTE"
        />
        <DocumentParties document={note} />
        {emailCompose.sendable && (
          <DocumentEmailPanel
            documentId={note.id}
            defaultToEmail={emailCompose.defaultToEmail}
            subject={emailCompose.subject}
            message={emailCompose.message}
            locked={!canEmail}
            deliveries={emailDeliveries}
          />
        )}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Lignes créditées</CardTitle>
            <CardDescription>Montants positifs. Le type avoir donne le sens économique. Devise {currency}, identique à la facture.</CardDescription>
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
                {note.lines.map(line => (
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
              HT {formatMoney(note.htCents, currency)} · TVA {formatMoney(note.vatCents, currency)} · <strong>TTC {formatMoney(note.ttcCents, currency)}</strong>
            </p>
          </CardContent>
        </Card>
      </main>
    </WorkspaceShell>
  );
}
