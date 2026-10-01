import {
  countryLabels,
  customerCivilityLabels,
  formatDate,
  formatMoney,
  lineItemKindLabels,
  organizationEntityKindLabels,
  type CountryCode,
} from "@mombongo/contracts";
import { formatQuantity, vatBreakdown, type VatBreakdownRate } from "@/lib/documents/money";
import { formatAddressSnapshot, type AddressPartsSnapshot } from "@/lib/documents/snapshot";
import { documentKindTitle, documentPdfFilename, formatDiscount, formatVatRate } from "./format";
import type { DocumentPrintModel, PrintParty } from "./types";

type PrintLineSource = {
  description: string;
  quantity: { toString(): string } | number | string;
  unit: string | null;
  unitPriceCents: number;
  discountBps: number;
  vatBps: number;
  htCents: number;
  vatCents: number;
  itemKind: "PRODUCT" | "SERVICE" | null;
};

export type PrintDocumentSource = {
  kind: "QUOTE" | "INVOICE" | "CREDIT_NOTE";
  status: string;
  number: string | null;
  title: string;
  notes: string | null;
  issuedAt: Date | null;
  validUntil: Date | null;
  dueDate: Date | null;
  supplyDate: Date | null;
  customerOrderNumber: string | null;
  createdAt: Date;
  creditReason: string | null;
  htCents: number;
  vatCents: number;
  ttcCents: number;
  issuerNameSnapshot: string | null;
  issuerCurrencySnapshot: string | null;
  issuerEntityKindSnapshot: string | null;
  issuerLegalNameSnapshot: string | null;
  issuerTradeNameSnapshot: string | null;
  issuerLegalFormLabelSnapshot: string | null;
  issuerSirenSnapshot: string | null;
  issuerSiretSnapshot: string | null;
  issuerVatNumberSnapshot: string | null;
  issuerEmailSnapshot: string | null;
  issuerPhoneSnapshot: string | null;
  issuerCountryCodeSnapshot: string | null;
  issuerAddressSnapshot: string | null;
  issuerAddressJsonSnapshot: unknown;
  issuerVatOnDebitsSnapshot: boolean | null;
  paymentTermsSnapshot: string | null;
  earlyPaymentDiscountTermsSnapshot: string | null;
  latePaymentPenaltyTermsSnapshot: string | null;
  recoveryFeeMentionSnapshot: string | null;
  customerNameSnapshot: string | null;
  customerEmailSnapshot: string | null;
  customerPhoneSnapshot: string | null;
  customerCompanyNumberSnapshot: string | null;
  customerAddressSnapshot: string | null;
  customerPartyKindSnapshot: string | null;
  customerCivilitySnapshot: string | null;
  customerFirstNameSnapshot: string | null;
  customerLastNameSnapshot: string | null;
  customerLegalNameSnapshot: string | null;
  customerTradeNameSnapshot: string | null;
  customerSirenSnapshot: string | null;
  customerSiretSnapshot: string | null;
  customerVatNumberSnapshot: string | null;
  customerCountryCodeSnapshot: string | null;
  customerAddressJsonSnapshot: unknown;
  vatBreakdownSnapshot: unknown;
  lines: PrintLineSource[];
  creditedInvoice?: { number: string | null } | null;
};

function asAddressParts(value: unknown): AddressPartsSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const address = value as Record<string, unknown>;
  if (typeof address.line1 !== "string" || typeof address.postalCode !== "string" || typeof address.city !== "string") return null;
  return {
    type: typeof address.type === "string" ? address.type as AddressPartsSnapshot["type"] : "BILLING",
    label: typeof address.label === "string" ? address.label : "",
    line1: address.line1,
    line2: typeof address.line2 === "string" ? address.line2 : null,
    postalCode: address.postalCode,
    city: address.city,
    countryCode: typeof address.countryCode === "string" ? address.countryCode : "FR",
  };
}

function countryLabel(code: string | null) {
  if (!code) return null;
  return countryLabels[code as CountryCode] ?? code;
}

function pushUnique(details: string[], value: string | null | undefined) {
  const line = value?.trim();
  if (!line || details.includes(line)) return;
  details.push(line);
}

function historicalAddress(text: string | null, json: unknown) {
  return text?.trim() || formatAddressSnapshot(asAddressParts(json)) || null;
}

function issuerParty(document: PrintDocumentSource): PrintParty {
  const name = document.issuerTradeNameSnapshot?.trim()
    || document.issuerLegalNameSnapshot?.trim()
    || document.issuerNameSnapshot?.trim()
    || "";
  const details: string[] = [];
  if (document.issuerLegalNameSnapshot && document.issuerLegalNameSnapshot !== name) {
    pushUnique(details, document.issuerLegalNameSnapshot);
  }
  pushUnique(details, document.issuerLegalFormLabelSnapshot);
  if (document.issuerEntityKindSnapshot === "SOLE_TRADER" || document.issuerEntityKindSnapshot === "COMPANY") {
    pushUnique(details, organizationEntityKindLabels[document.issuerEntityKindSnapshot]);
  }
  pushUnique(details, historicalAddress(document.issuerAddressSnapshot, document.issuerAddressJsonSnapshot));
  pushUnique(details, document.issuerSirenSnapshot ? `SIREN ${document.issuerSirenSnapshot}` : null);
  pushUnique(details, document.issuerSiretSnapshot ? `SIRET ${document.issuerSiretSnapshot}` : null);
  pushUnique(details, document.issuerVatNumberSnapshot ? `TVA ${document.issuerVatNumberSnapshot}` : null);
  pushUnique(details, document.issuerEmailSnapshot);
  pushUnique(details, document.issuerPhoneSnapshot);
  pushUnique(details, countryLabel(document.issuerCountryCodeSnapshot));
  return { name, details };
}

function recipientParty(document: PrintDocumentSource): PrintParty {
  const kind = document.customerPartyKindSnapshot;
  const details: string[] = [];
  let name = document.customerNameSnapshot?.trim() || "";
  if (kind === "PERSON") {
    const civility = document.customerCivilitySnapshot === "MR" || document.customerCivilitySnapshot === "MRS" || document.customerCivilitySnapshot === "MX"
      ? customerCivilityLabels[document.customerCivilitySnapshot]
      : null;
    const person = [civility, document.customerFirstNameSnapshot, document.customerLastNameSnapshot].filter(part => part && part.trim()).join(" ");
    if (person) name = person;
    pushUnique(details, historicalAddress(document.customerAddressSnapshot, document.customerAddressJsonSnapshot));
    pushUnique(details, document.customerEmailSnapshot);
    pushUnique(details, document.customerPhoneSnapshot);
    return { name, details };
  }
  if (kind === "COMPANY") {
    name = document.customerTradeNameSnapshot?.trim() || document.customerLegalNameSnapshot?.trim() || name;
    if (document.customerLegalNameSnapshot && document.customerLegalNameSnapshot !== name) {
      pushUnique(details, document.customerLegalNameSnapshot);
    }
    pushUnique(details, historicalAddress(document.customerAddressSnapshot, document.customerAddressJsonSnapshot));
    pushUnique(details, document.customerSirenSnapshot ? `SIREN ${document.customerSirenSnapshot}` : null);
    pushUnique(details, document.customerSiretSnapshot ? `SIRET ${document.customerSiretSnapshot}` : null);
    pushUnique(details, document.customerVatNumberSnapshot ? `TVA ${document.customerVatNumberSnapshot}` : null);
    if (!document.customerSirenSnapshot) pushUnique(details, document.customerCompanyNumberSnapshot);
    pushUnique(details, document.customerEmailSnapshot);
    pushUnique(details, document.customerPhoneSnapshot);
    pushUnique(details, countryLabel(document.customerCountryCodeSnapshot));
    return { name, details };
  }
  pushUnique(details, historicalAddress(document.customerAddressSnapshot, document.customerAddressJsonSnapshot));
  pushUnique(details, document.customerEmailSnapshot);
  pushUnique(details, document.customerPhoneSnapshot);
  pushUnique(details, document.customerSirenSnapshot ? `SIREN ${document.customerSirenSnapshot}` : null);
  pushUnique(details, document.customerSiretSnapshot ? `SIRET ${document.customerSiretSnapshot}` : null);
  pushUnique(details, document.customerVatNumberSnapshot ? `TVA ${document.customerVatNumberSnapshot}` : null);
  if (!document.customerSirenSnapshot) pushUnique(details, document.customerCompanyNumberSnapshot);
  return { name, details };
}

function ratesOf(document: PrintDocumentSource): VatBreakdownRate[] {
  if (Array.isArray(document.vatBreakdownSnapshot)) {
    const snapshot = document.vatBreakdownSnapshot.filter((item): item is VatBreakdownRate => {
      return !!item && typeof item === "object" && "vatBps" in item && "htCents" in item && "vatCents" in item;
    });
    if (snapshot.length > 0) return snapshot;
  }
  return vatBreakdown(document.lines);
}

function invoiceTerms(document: PrintDocumentSource) {
  if (document.kind !== "INVOICE") {
    return [document.paymentTermsSnapshot].filter((item): item is string => !!item?.trim());
  }
  return [
    document.paymentTermsSnapshot,
    document.earlyPaymentDiscountTermsSnapshot,
    document.latePaymentPenaltyTermsSnapshot,
    document.recoveryFeeMentionSnapshot,
    document.issuerVatOnDebitsSnapshot ? "Option pour le paiement de la TVA d’après les débits." : null,
  ].filter((item): item is string => !!item?.trim());
}

export function buildDocumentPrintModel(document: PrintDocumentSource): DocumentPrintModel {
  const draft = document.status === "DRAFT";
  const currency = document.issuerCurrencySnapshot && /^[A-Z]{3}$/.test(document.issuerCurrencySnapshot)
    ? document.issuerCurrencySnapshot
    : "EUR";
  const money = (cents: number) => formatMoney(cents, currency);
  const credit = document.kind === "CREDIT_NOTE";
  const snapshotRates = ratesOf(document);
  return {
    kind: document.kind,
    kindLabel: documentKindTitle(document.kind),
    numberLabel: draft || !document.number ? "Brouillon" : document.number,
    filename: documentPdfFilename(document.kind, document.number, draft),
    draft,
    currency,
    title: document.title,
    issuedAtLabel: document.issuedAt ? formatDate(document.issuedAt) : null,
    validUntilLabel: document.kind === "QUOTE" && document.validUntil ? formatDate(document.validUntil) : null,
    dueDateLabel: document.kind === "INVOICE" && document.dueDate ? formatDate(document.dueDate) : null,
    supplyDateLabel: document.supplyDate ? formatDate(document.supplyDate) : null,
    customerOrderNumber: document.customerOrderNumber,
    issuer: issuerParty(document),
    recipient: recipientParty(document),
    creditedInvoiceNumber: credit ? document.creditedInvoice?.number ?? null : null,
    creditReason: credit ? document.creditReason : null,
    lines: document.lines.map(line => ({
      description: line.description,
      quantityLabel: formatQuantity(line.quantity),
      unit: line.unit?.trim() || "unité",
      unitPriceLabel: money(line.unitPriceCents),
      discountLabel: formatDiscount(line.discountBps),
      vatLabel: formatVatRate(line.vatBps),
      htLabel: money(line.htCents),
      itemKindLabel: line.itemKind ? lineItemKindLabels[line.itemKind] : null,
    })),
    totals: {
      htLabel: money(document.htCents),
      vatLabel: money(document.vatCents),
      ttcLabel: money(document.ttcCents),
      htCaption: credit ? "Total HT crédité" : "Total HT",
      vatCaption: credit ? "TVA créditée" : "TVA",
      ttcCaption: credit ? "Total TTC crédité" : "Total TTC",
    },
    vatBreakdown: snapshotRates.map(rate => ({
      rateLabel: formatVatRate(rate.vatBps),
      htLabel: money(rate.htCents),
      vatLabel: money(rate.vatCents),
    })),
    terms: invoiceTerms(document),
    notes: document.notes,
    createdAt: document.createdAt,
    issuedAt: document.issuedAt,
    issuerLogo: null,
  };
}
