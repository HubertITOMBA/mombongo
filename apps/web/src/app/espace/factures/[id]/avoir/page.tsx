import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney } from "@mombongo/contracts";
import { requireMembership } from "@/lib/auth/access";
import { canIssueCreditNotes } from "@/lib/auth/permissions";
import { getInvoice } from "@/lib/invoices/service";
import { remainingMilliByLine } from "@/lib/credit-notes/service";
import { invoiceSettlement } from "@/lib/invoices/settlement";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { quantityNumber } from "@/lib/documents/money";
import { documentCurrency, documentCustomerLabel } from "@/lib/documents/snapshot";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditNoteForm } from "@/components/credit-notes/credit-note-form";

export default async function CreateCreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireMembership();
  if (!canIssueCreditNotes(membership.role)) notFound();
  let invoice;
  try {
    invoice = await getInvoice(membership.organizationId, id);
  } catch (error) {
    if (error instanceof AuthFlowError) notFound();
    throw error;
  }
  if (invoice.status !== "SENT") notFound();
  const currency = documentCurrency(invoice, typeof membership.organization.currency === "string" ? membership.organization.currency : "EUR");
  const remaining = remainingMilliByLine(invoice.lines, invoice.creditNotes);
  const settlement = invoiceSettlement({
    grossTtcCents: invoice.ttcCents,
    creditNotes: invoice.creditNotes,
    payments: invoice.payments,
  });
  const lines = invoice.lines.map(line => ({
    id: line.id,
    description: line.description,
    quantity: quantityNumber(line.quantity),
    remaining: (remaining.get(line.id) ?? 0) / 1000,
    unit: line.unit,
    unitPriceLabel: `${formatMoney(line.unitPriceCents, currency)} HT`,
  }));
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          <Link href={`/espace/factures/${invoice.id}`} className="hover:underline">{invoice.number ?? invoice.title}</Link>
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Créer un avoir</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Relatif à {invoice.number} · {documentCustomerLabel(invoice)} · Facture {formatMoney(invoice.ttcCents, currency)} TTC · Reste créditable {formatMoney(settlement.remainingTtcCents, currency)} TTC (net facturé moins encaissements).
          L’identité historique de la facture est reprise telle quelle.
        </p>
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Lignes à créditer</CardTitle>
            <CardDescription>Avoir total ou partiel. Les brouillons ne consomment le reste qu’à l’émission.</CardDescription>
          </CardHeader>
          <CardContent>
            {settlement.remainingTtcCents <= 0 ? (
              <p className="text-sm text-muted-foreground">
                {settlement.paidTtcCents > 0
                  ? "Cette facture est déjà encaissée. Un avoir créerait un remboursement, non disponible en A10."
                  : "Cette facture est déjà entièrement créditée."}
              </p>
            ) : (
              <CreditNoteForm invoiceId={invoice.id} lines={lines} />
            )}
          </CardContent>
        </Card>
      </main>
    </WorkspaceShell>
  );
}
