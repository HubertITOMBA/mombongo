import { customerCivilityLabels, customerDisplayName } from "@mombongo/contracts";
import { quantityToMilli, vatBreakdown } from "@/lib/documents/money";
import { toElectronicAddress } from "./address";
import { classifyElectronicInvoice } from "./classify";
import { quantityXml } from "./money";
import { en16931Category, exemptionReasonCodeXml, isSupportedTaxCategory } from "./tax";
import type { ElectronicInvoiceModel, ElectronicLine, ElectronicParty, ElectronicTax } from "./types";
import { FACTURX_GUIDELINE_EN16931 } from "./types";
import { mapUnitCode } from "./units";

export type ElectronicDocumentSource = {
  kind: "QUOTE" | "INVOICE" | "CREDIT_NOTE";
  status: string;
  number: string | null;
  title: string;
  notes: string | null;
  issuedAt: Date | null;
  dueDate: Date | null;
  supplyDate: Date | null;
  customerOrderNumber: string | null;
  creditReason: string | null;
  htCents: number;
  vatCents: number;
  ttcCents: number;
  issuerNameSnapshot: string | null;
  issuerCurrencySnapshot: string | null;
  issuerLegalNameSnapshot: string | null;
  issuerTradeNameSnapshot: string | null;
  issuerLegalFormLabelSnapshot: string | null;
  issuerSirenSnapshot: string | null;
  issuerSiretSnapshot: string | null;
  issuerVatNumberSnapshot: string | null;
  issuerEmailSnapshot: string | null;
  issuerPhoneSnapshot: string | null;
  issuerCountryCodeSnapshot: string | null;
  issuerAddressJsonSnapshot: unknown;
  paymentTermsSnapshot: string | null;
  customerNameSnapshot: string | null;
  customerEmailSnapshot: string | null;
  customerPhoneSnapshot: string | null;
  customerAddressJsonSnapshot: unknown;
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
  customerTaxablePersonSnapshot: boolean | null;
  customerDeliveryAddressJsonSnapshot: unknown;
  vatBreakdownSnapshot: unknown;
  lines: Array<{
    description: string;
    quantity: { toString(): string } | number | string;
    unit: string | null;
    unitCode?: string | null;
    unitPriceCents: number;
    discountBps: number;
    vatBps: number;
    taxCategory?: "STANDARD" | "ZERO_RATED" | "EXEMPT" | "REVERSE_CHARGE" | "OUT_OF_SCOPE" | null;
    taxExemptionReason?: string | null;
    taxExemptionReasonCode?: string | null;
    htCents: number;
    vatCents: number;
    ttcCents: number;
    itemKind: "PRODUCT" | "SERVICE" | null;
    position: number;
  }>;
  creditedInvoice?: { number: string | null; issuedAt?: Date | null } | null;
};

function digits(value: string | null | undefined) {
  return value?.replace(/\D/g, "") || null;
}

function sellerParty(document: ElectronicDocumentSource): ElectronicParty {
  const address = toElectronicAddress(document.issuerAddressJsonSnapshot, document.issuerCountryCodeSnapshot);
  const name = document.issuerLegalNameSnapshot?.trim()
    || document.issuerTradeNameSnapshot?.trim()
    || document.issuerNameSnapshot?.trim()
    || "";
  return {
    partyKind: "COMPANY",
    name,
    legalName: document.issuerLegalNameSnapshot,
    tradeName: document.issuerTradeNameSnapshot,
    legalForm: document.issuerLegalFormLabelSnapshot,
    civility: null,
    firstName: null,
    lastName: null,
    siren: digits(document.issuerSirenSnapshot),
    siret: digits(document.issuerSiretSnapshot),
    vatNumber: document.issuerVatNumberSnapshot?.trim() || null,
    email: document.issuerEmailSnapshot,
    phone: document.issuerPhoneSnapshot,
    countryCode: document.issuerCountryCodeSnapshot || address?.countryCode || null,
    address,
    taxablePerson: null,
  };
}

function buyerParty(document: ElectronicDocumentSource): ElectronicParty {
  const kind = document.customerPartyKindSnapshot === "PERSON" || document.customerPartyKindSnapshot === "COMPANY"
    ? document.customerPartyKindSnapshot
    : null;
  const address = toElectronicAddress(document.customerAddressJsonSnapshot, document.customerCountryCodeSnapshot);
  const civility = document.customerCivilitySnapshot === "MR" || document.customerCivilitySnapshot === "MRS" || document.customerCivilitySnapshot === "MX"
    ? customerCivilityLabels[document.customerCivilitySnapshot]
    : null;
  const personName = [civility, document.customerFirstNameSnapshot, document.customerLastNameSnapshot].filter(part => part && part.trim()).join(" ");
  const companyName = document.customerLegalNameSnapshot?.trim() || document.customerTradeNameSnapshot?.trim() || "";
  const name = kind === "PERSON"
    ? (personName || document.customerNameSnapshot?.trim() || "")
    : (companyName || document.customerNameSnapshot?.trim() || customerDisplayName({
      partyKind: kind,
      displayName: document.customerNameSnapshot,
      firstName: document.customerFirstNameSnapshot,
      lastName: document.customerLastNameSnapshot,
      legalName: document.customerLegalNameSnapshot,
      tradeName: document.customerTradeNameSnapshot,
    }));
  return {
    partyKind: kind,
    name,
    legalName: kind === "COMPANY" ? document.customerLegalNameSnapshot : null,
    tradeName: kind === "COMPANY" ? document.customerTradeNameSnapshot : null,
    legalForm: null,
    civility,
    firstName: kind === "PERSON" ? document.customerFirstNameSnapshot : null,
    lastName: kind === "PERSON" ? document.customerLastNameSnapshot : null,
    siren: kind === "PERSON" ? null : digits(document.customerSirenSnapshot),
    siret: kind === "PERSON" ? null : digits(document.customerSiretSnapshot),
    vatNumber: kind === "PERSON" ? null : (document.customerVatNumberSnapshot?.trim() || null),
    email: document.customerEmailSnapshot,
    phone: document.customerPhoneSnapshot,
    countryCode: document.customerCountryCodeSnapshot || address?.countryCode || null,
    address,
    taxablePerson: kind === "COMPANY" ? (document.customerTaxablePersonSnapshot ?? null) : null,
  };
}

function taxKey(taxCategory: string | null, vatBps: number, exemptionReason: string | null, exemptionReasonCode: string | null) {
  return `${taxCategory ?? ""}:${vatBps}:${exemptionReason ?? ""}:${exemptionReasonCode ?? ""}`;
}

function taxesOf(document: ElectronicDocumentSource, lines: ElectronicLine[]): ElectronicTax[] {
  const grouped = new Map<string, ElectronicTax>();
  for (const line of lines) {
    const key = taxKey(line.taxCategory, line.vatBps, line.exemptionReason, line.exemptionReasonCode);
    const current = grouped.get(key) ?? {
      vatBps: line.vatBps,
      taxCategory: line.taxCategory,
      vatCategory: line.vatCategory,
      exemptionReason: line.exemptionReason,
      exemptionReasonCode: line.exemptionReasonCode,
      htCents: 0,
      vatCents: 0,
    };
    current.htCents += line.htCents;
    current.vatCents += line.vatCents;
    grouped.set(key, current);
  }
  if (grouped.size > 0) return [...grouped.values()];
  const snapshot = Array.isArray(document.vatBreakdownSnapshot)
    ? document.vatBreakdownSnapshot.filter((item): item is { vatBps: number; htCents: number; vatCents: number } => {
      return !!item && typeof item === "object" && "vatBps" in item && "htCents" in item && "vatCents" in item;
    })
    : vatBreakdown(document.lines);
  return snapshot.map(rate => ({
    vatBps: rate.vatBps,
    taxCategory: rate.vatBps > 0 ? "STANDARD" as const : null,
    vatCategory: rate.vatBps > 0 ? "S" as const : null,
    exemptionReason: null,
    exemptionReasonCode: null,
    htCents: rate.htCents,
    vatCents: rate.vatCents,
  }));
}

function linesOf(document: ElectronicDocumentSource): ElectronicLine[] {
  return document.lines.map((line, index) => {
    const unit = mapUnitCode(line.unit, line.unitCode);
    const taxCategory = isSupportedTaxCategory(line.taxCategory)
      ? line.taxCategory
      : (line.vatBps > 0 ? "STANDARD" as const : null);
    const exemptionReason = line.taxExemptionReason?.trim() || null;
    const exemptionReasonCode = exemptionReasonCodeXml(taxCategory, line.taxExemptionReasonCode);
    return {
      position: line.position ?? index,
      description: line.description,
      quantityMilli: quantityToMilli(line.quantity),
      quantityXml: quantityXml(line.quantity),
      unit: line.unit,
      unitCode: unit.code,
      unitPriceCents: line.unitPriceCents,
      discountBps: line.discountBps,
      vatBps: line.vatBps,
      taxCategory,
      vatCategory: en16931Category(taxCategory, line.vatBps),
      exemptionReason,
      exemptionReasonCode,
      htCents: line.htCents,
      vatCents: line.vatCents,
      ttcCents: line.ttcCents,
      itemKind: line.itemKind,
    };
  });
}

export function buildElectronicInvoiceModel(document: ElectronicDocumentSource): ElectronicInvoiceModel | null {
  if (document.kind !== "INVOICE" && document.kind !== "CREDIT_NOTE") return null;
  const currency = document.issuerCurrencySnapshot && /^[A-Z]{3}$/.test(document.issuerCurrencySnapshot)
    ? document.issuerCurrencySnapshot
    : "";
  const seller = sellerParty(document);
  const buyer = buyerParty(document);
  const lines = linesOf(document);
  const header = {
    kind: document.kind,
    status: document.status,
    number: document.number,
    title: document.title,
    typeCode: document.kind === "CREDIT_NOTE" ? "381" as const : "380" as const,
    currency,
    issuedAt: document.issuedAt,
    dueDate: document.kind === "INVOICE" ? document.dueDate : null,
    supplyDate: document.supplyDate,
    customerOrderNumber: document.customerOrderNumber,
    creditedInvoiceNumber: document.kind === "CREDIT_NOTE" ? document.creditedInvoice?.number ?? null : null,
    creditedInvoiceIssuedAt: document.kind === "CREDIT_NOTE" ? document.creditedInvoice?.issuedAt ?? null : null,
    creditReason: document.kind === "CREDIT_NOTE" ? document.creditReason : null,
    notes: document.notes,
    paymentTerms: document.paymentTermsSnapshot,
    htCents: document.htCents,
    vatCents: document.vatCents,
    ttcCents: document.ttcCents,
  };
  const classified = classifyElectronicInvoice({ document: header, seller, buyer });
  return {
    document: header,
    seller,
    buyer,
    delivery: toElectronicAddress(document.customerDeliveryAddressJsonSnapshot, document.customerCountryCodeSnapshot),
    lines,
    taxes: taxesOf(document, lines),
    context: {
      profile: "EN16931",
      guidelineId: FACTURX_GUIDELINE_EN16931,
      syntax: "CII_D22B",
      facturxVersion: "1.09",
      market: classified.market,
      route: classified.route,
    },
  };
}
