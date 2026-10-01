export type PrintParty = {
  name: string;
  details: string[];
};

export type PrintLine = {
  description: string;
  quantityLabel: string;
  unit: string;
  unitPriceLabel: string;
  discountLabel: string;
  vatLabel: string;
  htLabel: string;
  itemKindLabel: string | null;
};

export type PrintVatRate = {
  rateLabel: string;
  htLabel: string;
  vatLabel: string;
};

export type DocumentPrintModel = {
  kind: "QUOTE" | "INVOICE" | "CREDIT_NOTE";
  kindLabel: string;
  numberLabel: string;
  filename: string;
  draft: boolean;
  currency: string;
  title: string;
  issuedAtLabel: string | null;
  validUntilLabel: string | null;
  dueDateLabel: string | null;
  supplyDateLabel: string | null;
  customerOrderNumber: string | null;
  issuer: PrintParty;
  recipient: PrintParty;
  creditedInvoiceNumber: string | null;
  creditReason: string | null;
  lines: PrintLine[];
  totals: {
    htLabel: string;
    vatLabel: string;
    ttcLabel: string;
    htCaption: string;
    vatCaption: string;
    ttcCaption: string;
  };
  vatBreakdown: PrintVatRate[];
  terms: string[];
  notes: string | null;
  createdAt: Date;
  issuedAt: Date | null;
  issuerLogo: Buffer | null;
};
