import Link from "next/link";
import type { DocumentStatus } from "@/generated/prisma/client";
import { documentCustomerLabel } from "@/lib/documents/snapshot";

type DocumentPartiesProps = {
  document: {
    status: DocumentStatus;
    issuerNameSnapshot: string | null;
    issuerLegalNameSnapshot?: string | null;
    issuerTradeNameSnapshot?: string | null;
    issuerSirenSnapshot?: string | null;
    issuerSiretSnapshot?: string | null;
    issuerVatNumberSnapshot?: string | null;
    issuerEmailSnapshot?: string | null;
    issuerPhoneSnapshot?: string | null;
    issuerAddressSnapshot?: string | null;
    customerNameSnapshot: string | null;
    customerEmailSnapshot: string | null;
    customerPhoneSnapshot: string | null;
    customerCompanyNumberSnapshot: string | null;
    customerAddressSnapshot: string | null;
    customerPartyKindSnapshot?: string | null;
    customerSirenSnapshot?: string | null;
    customerSiretSnapshot?: string | null;
    customerVatNumberSnapshot?: string | null;
    customerDeliveryAddressSnapshot?: string | null;
    customer: { id: string; displayName: string };
  };
};

export function documentPartyName(document: DocumentPartiesProps["document"]) {
  return documentCustomerLabel(document);
}

export function DocumentParties({ document }: DocumentPartiesProps) {
  if (document.status === "DRAFT" && !document.issuerNameSnapshot) return null;
  const issuerLegal = document.issuerLegalNameSnapshot && document.issuerLegalNameSnapshot !== document.issuerNameSnapshot
    ? document.issuerLegalNameSnapshot
    : null;
  return (
    <section className="mt-8 grid gap-4 sm:grid-cols-2">
      <article className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-medium uppercase tracking-widest text-primary">Émetteur</h2>
        <p className="mt-2 font-medium">{document.issuerNameSnapshot ?? "—"}</p>
        {issuerLegal && <p className="mt-1 text-sm text-muted-foreground">{issuerLegal}</p>}
        {document.issuerSirenSnapshot && <p className="mt-1 text-sm text-muted-foreground">SIREN {document.issuerSirenSnapshot}</p>}
        {document.issuerSiretSnapshot && <p className="mt-1 text-sm text-muted-foreground">SIRET {document.issuerSiretSnapshot}</p>}
        {document.issuerVatNumberSnapshot && <p className="mt-1 text-sm text-muted-foreground">TVA {document.issuerVatNumberSnapshot}</p>}
        {document.issuerEmailSnapshot && <p className="mt-1 text-sm text-muted-foreground">{document.issuerEmailSnapshot}</p>}
        {document.issuerPhoneSnapshot && <p className="mt-1 text-sm text-muted-foreground">{document.issuerPhoneSnapshot}</p>}
        {document.issuerAddressSnapshot && (
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{document.issuerAddressSnapshot}</p>
        )}
      </article>
      <article className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-medium uppercase tracking-widest text-primary">Destinataire</h2>
        <p className="mt-2 font-medium">
          <Link href={`/espace/clients/${document.customer.id}`} className="text-primary hover:underline">
            {documentCustomerLabel(document)}
          </Link>
        </p>
        {document.customerPartyKindSnapshot === "PERSON" && <p className="mt-1 text-sm text-muted-foreground">Particulier</p>}
        {document.customerPartyKindSnapshot === "COMPANY" && <p className="mt-1 text-sm text-muted-foreground">Professionnel</p>}
        {document.customerEmailSnapshot && <p className="mt-1 text-sm text-muted-foreground">{document.customerEmailSnapshot}</p>}
        {document.customerPhoneSnapshot && <p className="mt-1 text-sm text-muted-foreground">{document.customerPhoneSnapshot}</p>}
        {document.customerSirenSnapshot && <p className="mt-1 text-sm text-muted-foreground">SIREN {document.customerSirenSnapshot}</p>}
        {document.customerSiretSnapshot && <p className="mt-1 text-sm text-muted-foreground">SIRET {document.customerSiretSnapshot}</p>}
        {document.customerVatNumberSnapshot && <p className="mt-1 text-sm text-muted-foreground">TVA {document.customerVatNumberSnapshot}</p>}
        {document.customerCompanyNumberSnapshot && !document.customerSirenSnapshot && (
          <p className="mt-1 text-sm text-muted-foreground">{document.customerCompanyNumberSnapshot}</p>
        )}
        {document.customerAddressSnapshot && (
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Facturation</span>
            {"\n"}
            {document.customerAddressSnapshot}
          </p>
        )}
        {document.customerDeliveryAddressSnapshot && (
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Livraison</span>
            {"\n"}
            {document.customerDeliveryAddressSnapshot}
          </p>
        )}
      </article>
    </section>
  );
}
