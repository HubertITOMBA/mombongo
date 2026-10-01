import { customerDisplayName } from "@mombongo/contracts";
import { Prisma, type AddressType, type DocumentStatus, type LineItemKind, type OperationCategory } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { vatBreakdown, type VatBreakdownRate } from "./money";

export type AddressPartsSnapshot = {
  type: AddressType;
  label: string;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
};

export type DocumentSnapshot = {
  issuerNameSnapshot: string;
  issuerCurrencySnapshot: string;
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
  issuerAddressJsonSnapshot: AddressPartsSnapshot | null;
  issuerVatOnDebitsSnapshot: boolean | null;
  paymentTermsSnapshot: string | null;
  earlyPaymentDiscountTermsSnapshot: string | null;
  latePaymentPenaltyTermsSnapshot: string | null;
  recoveryFeeMentionSnapshot: string | null;
  customerNameSnapshot: string;
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
  customerTaxablePersonSnapshot: boolean | null;
  customerAddressJsonSnapshot: AddressPartsSnapshot | null;
  customerDeliveryAddressSnapshot: string | null;
  customerDeliveryAddressJsonSnapshot: AddressPartsSnapshot | null;
  vatBreakdownSnapshot: VatBreakdownRate[];
  operationCategory: OperationCategory | null;
};

type SnapshotAddress = AddressPartsSnapshot & { createdAt: Date; customerId: string | null };

function byCreated<T extends { createdAt: Date }>(left: T, right: T) {
  return left.createdAt.getTime() - right.createdAt.getTime();
}

export function formatAddressSnapshot(address: Omit<AddressPartsSnapshot, "type" | "label"> | null) {
  if (!address) return null;
  return [address.line1, address.line2, `${address.postalCode} ${address.city}`, address.countryCode]
    .filter(part => part && part.trim())
    .join("\n");
}

export function toAddressParts(address: SnapshotAddress | AddressPartsSnapshot | null): AddressPartsSnapshot | null {
  if (!address) return null;
  return {
    type: address.type,
    label: address.label,
    line1: address.line1,
    line2: address.line2,
    postalCode: address.postalCode,
    city: address.city,
    countryCode: address.countryCode,
  };
}

export function pickIssuerAddress<T extends { type: AddressType; createdAt: Date; customerId: string | null }>(addresses: T[]) {
  const issuer = addresses.filter(item => item.customerId === null);
  const billing = issuer.filter(item => item.type === "BILLING").sort(byCreated);
  if (billing[0]) return billing[0];
  const office = issuer.filter(item => item.type === "OFFICE").sort(byCreated);
  if (office[0]) return office[0];
  return [...issuer].sort(byCreated)[0] ?? null;
}

export function pickBillingAddress<T extends { type: AddressType; createdAt: Date; customerId: string | null }>(addresses: T[]) {
  const customer = addresses.filter(item => item.customerId !== null);
  const ranked = [...customer].sort((left, right) => {
    const rank = (item: { type: AddressType }) => item.type === "BILLING" ? 0 : 1;
    return rank(left) - rank(right) || byCreated(left, right);
  });
  return ranked[0] ?? null;
}

export function pickSnapshotAddress<T extends { type: AddressType; createdAt: Date; customerId?: string | null }>(addresses: T[]) {
  return pickBillingAddress(addresses.map(item => ({ ...item, customerId: item.customerId ?? "customer" })));
}

export function pickDeliveryAddress<T extends { type: AddressType; createdAt: Date; customerId: string | null }>(addresses: T[]) {
  return addresses.filter(item => item.customerId !== null && item.type === "SHIPPING").sort(byCreated)[0] ?? null;
}

export function issuerDisplayName(organization: { name: string; legalName: string | null; tradeName: string | null }) {
  return organization.tradeName?.trim() || organization.legalName?.trim() || organization.name;
}

export function computeOperationCategory(kinds: Array<LineItemKind | null | undefined>): OperationCategory | null {
  const present = [...new Set(kinds.filter((item): item is LineItemKind => item === "PRODUCT" || item === "SERVICE"))];
  if (present.length === 0) return null;
  if (present.length === 2) return "MIXED";
  return present[0] === "PRODUCT" ? "GOODS" : "SERVICES";
}

export function buildDocumentSnapshot(input: {
  organization: {
    name: string;
    currency: string;
    entityKind: string | null;
    legalName: string | null;
    tradeName: string | null;
    legalFormLabel: string | null;
    siren: string | null;
    siret: string | null;
    vatNumber: string | null;
    email: string | null;
    phone: string | null;
    countryCode: string | null;
    vatOnDebits: boolean | null;
    paymentTerms: string | null;
    earlyPaymentDiscountTerms: string | null;
    latePaymentPenaltyTerms: string | null;
    recoveryFeeMention: string | null;
  };
  customer: {
    displayName: string;
    email: string | null;
    phone: string | null;
    companyNumber: string | null;
    partyKind: "PERSON" | "COMPANY" | null;
    civility: string | null;
    firstName: string | null;
    lastName: string | null;
    legalName: string | null;
    tradeName: string | null;
    siren: string | null;
    siret: string | null;
    vatNumber: string | null;
    taxablePerson: boolean | null;
  };
  addresses: SnapshotAddress[];
  lines: { vatBps: number; htCents: number; vatCents: number; itemKind: LineItemKind | null }[];
}): DocumentSnapshot {
  const issuerAddress = pickIssuerAddress(input.addresses);
  const billingAddress = pickBillingAddress(input.addresses);
  const deliveryAddress = pickDeliveryAddress(input.addresses);
  const issuerParts = toAddressParts(issuerAddress);
  const billingParts = toAddressParts(billingAddress);
  const deliveryParts = toAddressParts(deliveryAddress);
  return {
    issuerNameSnapshot: issuerDisplayName(input.organization),
    issuerCurrencySnapshot: input.organization.currency,
    issuerEntityKindSnapshot: input.organization.entityKind,
    issuerLegalNameSnapshot: input.organization.legalName,
    issuerTradeNameSnapshot: input.organization.tradeName,
    issuerLegalFormLabelSnapshot: input.organization.legalFormLabel,
    issuerSirenSnapshot: input.organization.siren,
    issuerSiretSnapshot: input.organization.siret,
    issuerVatNumberSnapshot: input.organization.vatNumber,
    issuerEmailSnapshot: input.organization.email,
    issuerPhoneSnapshot: input.organization.phone,
    issuerCountryCodeSnapshot: input.organization.countryCode,
    issuerAddressSnapshot: formatAddressSnapshot(issuerParts),
    issuerAddressJsonSnapshot: issuerParts,
    issuerVatOnDebitsSnapshot: input.organization.vatOnDebits,
    paymentTermsSnapshot: input.organization.paymentTerms,
    earlyPaymentDiscountTermsSnapshot: input.organization.earlyPaymentDiscountTerms,
    latePaymentPenaltyTermsSnapshot: input.organization.latePaymentPenaltyTerms,
    recoveryFeeMentionSnapshot: input.organization.recoveryFeeMention,
    customerNameSnapshot: customerDisplayName(input.customer) || input.customer.displayName,
    customerEmailSnapshot: input.customer.email,
    customerPhoneSnapshot: input.customer.phone,
    customerCompanyNumberSnapshot: input.customer.companyNumber,
    customerAddressSnapshot: formatAddressSnapshot(billingParts),
    customerPartyKindSnapshot: input.customer.partyKind,
    customerCivilitySnapshot: input.customer.civility,
    customerFirstNameSnapshot: input.customer.firstName,
    customerLastNameSnapshot: input.customer.lastName,
    customerLegalNameSnapshot: input.customer.legalName,
    customerTradeNameSnapshot: input.customer.tradeName,
    customerSirenSnapshot: input.customer.siren,
    customerSiretSnapshot: input.customer.siret,
    customerVatNumberSnapshot: input.customer.vatNumber,
    customerCountryCodeSnapshot: billingParts?.countryCode ?? null,
    customerTaxablePersonSnapshot: input.customer.taxablePerson ?? null,
    customerAddressJsonSnapshot: billingParts,
    customerDeliveryAddressSnapshot: formatAddressSnapshot(deliveryParts),
    customerDeliveryAddressJsonSnapshot: deliveryParts,
    vatBreakdownSnapshot: vatBreakdown(input.lines),
    operationCategory: computeOperationCategory(input.lines.map(line => line.itemKind)),
  };
}

const snapshotKeys = [
  "issuerNameSnapshot",
  "issuerCurrencySnapshot",
  "issuerEntityKindSnapshot",
  "issuerLegalNameSnapshot",
  "issuerTradeNameSnapshot",
  "issuerLegalFormLabelSnapshot",
  "issuerSirenSnapshot",
  "issuerSiretSnapshot",
  "issuerVatNumberSnapshot",
  "issuerEmailSnapshot",
  "issuerPhoneSnapshot",
  "issuerCountryCodeSnapshot",
  "issuerAddressSnapshot",
  "issuerAddressJsonSnapshot",
  "issuerVatOnDebitsSnapshot",
  "paymentTermsSnapshot",
  "earlyPaymentDiscountTermsSnapshot",
  "latePaymentPenaltyTermsSnapshot",
  "recoveryFeeMentionSnapshot",
  "customerNameSnapshot",
  "customerEmailSnapshot",
  "customerPhoneSnapshot",
  "customerCompanyNumberSnapshot",
  "customerAddressSnapshot",
  "customerPartyKindSnapshot",
  "customerCivilitySnapshot",
  "customerFirstNameSnapshot",
  "customerLastNameSnapshot",
  "customerLegalNameSnapshot",
  "customerTradeNameSnapshot",
  "customerSirenSnapshot",
  "customerSiretSnapshot",
  "customerVatNumberSnapshot",
  "customerCountryCodeSnapshot",
  "customerTaxablePersonSnapshot",
  "customerAddressJsonSnapshot",
  "customerDeliveryAddressSnapshot",
  "customerDeliveryAddressJsonSnapshot",
  "vatBreakdownSnapshot",
  "operationCategory",
] as const;

export function copyDocumentSnapshot<T extends Record<string, unknown>>(source: T) {
  return Object.fromEntries(snapshotKeys.map(key => [key, source[key] ?? null])) as DocumentSnapshot;
}

function jsonOrDbNull<T>(value: T | null) {
  return value === null ? Prisma.DbNull : value;
}

export function writableDocumentSnapshot(snapshot: DocumentSnapshot) {
  return {
    ...snapshot,
    issuerAddressJsonSnapshot: jsonOrDbNull(snapshot.issuerAddressJsonSnapshot),
    customerAddressJsonSnapshot: jsonOrDbNull(snapshot.customerAddressJsonSnapshot),
    customerDeliveryAddressJsonSnapshot: jsonOrDbNull(snapshot.customerDeliveryAddressJsonSnapshot),
    vatBreakdownSnapshot: jsonOrDbNull(snapshot.vatBreakdownSnapshot),
  };
}

export function documentCustomerLabel(document: {
  status: DocumentStatus;
  customerNameSnapshot: string | null;
  customer: { displayName: string; partyKind?: "PERSON" | "COMPANY" | null; firstName?: string | null; lastName?: string | null; legalName?: string | null; tradeName?: string | null };
}) {
  if (document.customerNameSnapshot) return document.customerNameSnapshot;
  return customerDisplayName(document.customer);
}

export function documentCurrency(document: { issuerCurrencySnapshot?: string | null; organization?: { currency?: string } | null }, fallback = "EUR") {
  return document.issuerCurrencySnapshot || document.organization?.currency || fallback;
}

export async function loadPartySnapshot(
  organizationId: string,
  customerId: string,
  tx: Pick<ReturnType<typeof getDb>, "organization" | "customer"> = getDb(),
  lines: { vatBps: number; htCents: number; vatCents: number; itemKind: LineItemKind | null }[] = [],
): Promise<DocumentSnapshot> {
  const [organization, customer] = await Promise.all([
    tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { addresses: { where: { customerId: null }, orderBy: { createdAt: "asc" } } },
    }),
    tx.customer.findFirstOrThrow({
      where: { id: customerId, organizationId },
      include: { addresses: { orderBy: { createdAt: "asc" } } },
    }),
  ]);
  return buildDocumentSnapshot({
    organization,
    customer,
    addresses: [...organization.addresses, ...customer.addresses],
    lines,
  });
}

export async function backfillIssuedDocumentSnapshots(db = getDb()) {
  const issued = await db.document.findMany({
    where: { status: { not: "DRAFT" }, customerNameSnapshot: null },
    select: { id: true, organizationId: true, customerId: true },
  });
  for (const document of issued) {
    const snapshot = await loadPartySnapshot(document.organizationId, document.customerId, db);
    await db.document.update({
      where: { id: document.id },
      data: {
        issuerNameSnapshot: snapshot.issuerNameSnapshot,
        issuerCurrencySnapshot: snapshot.issuerCurrencySnapshot,
        customerNameSnapshot: snapshot.customerNameSnapshot,
        customerEmailSnapshot: snapshot.customerEmailSnapshot,
        customerPhoneSnapshot: snapshot.customerPhoneSnapshot,
        customerCompanyNumberSnapshot: snapshot.customerCompanyNumberSnapshot,
        customerAddressSnapshot: snapshot.customerAddressSnapshot,
      },
    });
  }
  return issued.length;
}
