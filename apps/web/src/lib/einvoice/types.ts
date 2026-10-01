export const electronicRoutes = ["E_INVOICING", "E_REPORTING", "OUT_OF_SCOPE", "REVIEW_REQUIRED"] as const;
export type ElectronicRoute = (typeof electronicRoutes)[number];

export const electronicMarkets = ["B2B_FR", "B2C_FR", "B2B_INTL", "B2C_INTL", "UNKNOWN"] as const;
export type ElectronicMarket = (typeof electronicMarkets)[number];

export type ElectronicIssue = {
  code: string;
  field: string;
  message: string;
  severity: "error" | "warning";
};

export type ElectronicAddress = {
  line1: string | null;
  line2: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string | null;
};

export type ElectronicParty = {
  partyKind: "PERSON" | "COMPANY" | null;
  name: string;
  legalName: string | null;
  tradeName: string | null;
  legalForm: string | null;
  civility: string | null;
  firstName: string | null;
  lastName: string | null;
  siren: string | null;
  siret: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
  countryCode: string | null;
  address: ElectronicAddress | null;
  taxablePerson: boolean | null;
};

export type ElectronicLine = {
  position: number;
  description: string;
  quantityMilli: number;
  quantityXml: string;
  unit: string | null;
  unitCode: string | null;
  unitPriceCents: number;
  discountBps: number;
  vatBps: number;
  taxCategory: "STANDARD" | "ZERO_RATED" | "EXEMPT" | "REVERSE_CHARGE" | "OUT_OF_SCOPE" | null;
  vatCategory: "S" | "Z" | "E" | "AE" | "O" | null;
  exemptionReason: string | null;
  exemptionReasonCode: string | null;
  htCents: number;
  vatCents: number;
  ttcCents: number;
  itemKind: "PRODUCT" | "SERVICE" | null;
};

export type ElectronicTax = {
  vatBps: number;
  taxCategory: "STANDARD" | "ZERO_RATED" | "EXEMPT" | "REVERSE_CHARGE" | "OUT_OF_SCOPE" | null;
  vatCategory: "S" | "Z" | "E" | "AE" | "O" | null;
  exemptionReason: string | null;
  exemptionReasonCode: string | null;
  htCents: number;
  vatCents: number;
};

export type ElectronicInvoiceModel = {
  document: {
    kind: "INVOICE" | "CREDIT_NOTE";
    status: string;
    number: string | null;
    title: string;
    typeCode: "380" | "381";
    currency: string;
    issuedAt: Date | null;
    dueDate: Date | null;
    supplyDate: Date | null;
    customerOrderNumber: string | null;
    creditedInvoiceNumber: string | null;
    creditedInvoiceIssuedAt: Date | null;
    creditReason: string | null;
    notes: string | null;
    paymentTerms: string | null;
    htCents: number;
    vatCents: number;
    ttcCents: number;
  };
  seller: ElectronicParty;
  buyer: ElectronicParty;
  delivery: ElectronicAddress | null;
  lines: ElectronicLine[];
  taxes: ElectronicTax[];
  context: {
    profile: "EN16931";
    guidelineId: string;
    syntax: "CII_D22B";
    facturxVersion: "1.09";
    market: ElectronicMarket;
    route: ElectronicRoute;
  };
};

export type ElectronicInvoiceArtifact = {
  format: "FACTUR_X";
  profile: "EN16931";
  mimeType: "application/pdf";
  filename: string;
  bytes: Buffer;
  xml: string;
  metadata: {
    guidelineId: string;
    documentNumber: string;
    currency: string;
    route: ElectronicRoute;
    market: ElectronicMarket;
  };
};

export type ElectronicValidatorId =
  | "business-model"
  | "xml-wellformed"
  | "xsd-subset"
  | "en16931-subset"
  | "pdfa-3-structure"
  | "pdf-xml-consistency";

export type ElectronicValidatorResult = {
  id: ElectronicValidatorId;
  name: string;
  status: "pass" | "fail" | "skipped";
  issues: ElectronicIssue[];
};

export type ElectronicValidationResult = {
  valid: boolean;
  errors: ElectronicIssue[];
  warnings: ElectronicIssue[];
  validators: ElectronicValidatorResult[];
};

export const FACTURX_GUIDELINE_EN16931 = "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931";
export const FACTURX_XML_NAME = "factur-x.xml";
