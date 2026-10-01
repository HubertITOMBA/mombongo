import { create } from "xmlbuilder2";
import { bpsToXmlPercent, centsToXmlAmount, netUnitPriceCents, xmlCalendarDate } from "./money";
import type { ElectronicInvoiceModel, ElectronicLine, ElectronicParty } from "./types";
import { FACTURX_GUIDELINE_EN16931 } from "./types";

type Xml = ReturnType<typeof create>;

const NS = {
  rsm: "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  qdt: "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
  ram: "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  udt: "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
};

function txt(parent: Xml, name: string, value: string | null | undefined, attributes?: Record<string, string>) {
  const text = value?.trim();
  if (!text) return;
  const node = attributes ? parent.ele(name, attributes) : parent.ele(name);
  node.txt(text);
}

function dateTime(parent: Xml, name: string, value: Date | null | undefined, kind: "udt" | "qdt" = "udt") {
  if (!value) return;
  const tag = kind === "qdt" ? "qdt:DateTimeString" : "udt:DateTimeString";
  parent.ele(name).ele(tag, { format: "102" }).txt(xmlCalendarDate(value));
}

function party(parent: Xml, name: string, value: ElectronicParty, role: "seller" | "buyer") {
  const node = parent.ele(name);
  if (value.siret) txt(node, "ram:ID", value.siret, { schemeID: "0009" });
  txt(node, "ram:Name", value.name);
  const tradeName = value.tradeName?.trim() && value.tradeName.trim() !== value.name ? value.tradeName.trim() : null;
  if (value.siren || tradeName) {
    const legal = node.ele("ram:SpecifiedLegalOrganization");
    if (value.siren) txt(legal, "ram:ID", value.siren, { schemeID: "0002" });
    if (tradeName) txt(legal, "ram:TradingBusinessName", tradeName);
  }
  if (value.address) {
    const postal = node.ele("ram:PostalTradeAddress");
    txt(postal, "ram:PostcodeCode", value.address.postalCode);
    txt(postal, "ram:LineOne", value.address.line1);
    txt(postal, "ram:LineTwo", value.address.line2);
    txt(postal, "ram:CityName", value.address.city);
    txt(postal, "ram:CountryID", value.address.countryCode);
  }
  if (value.email?.trim()) {
    node.ele("ram:URIUniversalCommunication").ele("ram:URIID", { schemeID: "EM" }).txt(value.email.trim());
  }
  if (value.vatNumber?.trim()) {
    node.ele("ram:SpecifiedTaxRegistration").ele("ram:ID", { schemeID: "VA" }).txt(value.vatNumber.trim());
  } else if (role === "seller" && value.siren) {
    node.ele("ram:SpecifiedTaxRegistration").ele("ram:ID", { schemeID: "FC" }).txt(value.siren);
  }
}

function lineItem(parent: Xml, line: ElectronicLine) {
  const item = parent.ele("ram:IncludedSupplyChainTradeLineItem");
  item.ele("ram:AssociatedDocumentLineDocument").ele("ram:LineID").txt(String(line.position + 1));
  txt(item.ele("ram:SpecifiedTradeProduct"), "ram:Name", line.description);
  const agreement = item.ele("ram:SpecifiedLineTradeAgreement");
  const net = netUnitPriceCents(line.unitPriceCents, line.discountBps);
  if (line.discountBps > 0) {
    const gross = agreement.ele("ram:GrossPriceProductTradePrice");
    txt(gross, "ram:ChargeAmount", centsToXmlAmount(line.unitPriceCents));
    const allowance = gross.ele("ram:AppliedTradeAllowanceCharge");
    allowance.ele("ram:ChargeIndicator").ele("udt:Indicator").txt("false");
    txt(allowance, "ram:ActualAmount", centsToXmlAmount(line.unitPriceCents - net));
  }
  agreement.ele("ram:NetPriceProductTradePrice").ele("ram:ChargeAmount").txt(centsToXmlAmount(net));
  item.ele("ram:SpecifiedLineTradeDelivery")
    .ele("ram:BilledQuantity", { unitCode: line.unitCode ?? "" })
    .txt(line.quantityXml);
  const settlement = item.ele("ram:SpecifiedLineTradeSettlement");
  const tax = settlement.ele("ram:ApplicableTradeTax");
  txt(tax, "ram:TypeCode", "VAT");
  txt(tax, "ram:CategoryCode", line.vatCategory);
  txt(tax, "ram:ExemptionReason", line.exemptionReason);
  txt(tax, "ram:ExemptionReasonCode", line.exemptionReasonCode);
  txt(tax, "ram:RateApplicablePercent", bpsToXmlPercent(line.vatBps));
  settlement.ele("ram:SpecifiedTradeSettlementLineMonetarySummation")
    .ele("ram:LineTotalAmount")
    .txt(centsToXmlAmount(line.htCents));
}

export function buildCrossIndustryInvoiceXml(model: ElectronicInvoiceModel) {
  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("rsm:CrossIndustryInvoice", {
    "xmlns:rsm": NS.rsm,
    "xmlns:qdt": NS.qdt,
    "xmlns:ram": NS.ram,
    "xmlns:udt": NS.udt,
  });
  root.ele("rsm:ExchangedDocumentContext")
    .ele("ram:GuidelineSpecifiedDocumentContextParameter")
    .ele("ram:ID")
    .txt(FACTURX_GUIDELINE_EN16931);
  const exchanged = root.ele("rsm:ExchangedDocument");
  txt(exchanged, "ram:ID", model.document.number);
  txt(exchanged, "ram:TypeCode", model.document.typeCode);
  dateTime(exchanged, "ram:IssueDateTime", model.document.issuedAt);
  if (model.document.notes?.trim()) {
    exchanged.ele("ram:IncludedNote").ele("ram:Content").txt(model.document.notes.trim());
  }
  if (model.document.creditReason?.trim()) {
    exchanged.ele("ram:IncludedNote").ele("ram:Content").txt(model.document.creditReason.trim());
  }
  const transaction = root.ele("rsm:SupplyChainTradeTransaction");
  for (const line of model.lines) lineItem(transaction, line);
  const agreement = transaction.ele("ram:ApplicableHeaderTradeAgreement");
  party(agreement, "ram:SellerTradeParty", model.seller, "seller");
  party(agreement, "ram:BuyerTradeParty", model.buyer, "buyer");
  if (model.document.customerOrderNumber?.trim()) {
    agreement.ele("ram:BuyerOrderReferencedDocument")
      .ele("ram:IssuerAssignedID")
      .txt(model.document.customerOrderNumber.trim());
  }
  const delivery = transaction.ele("ram:ApplicableHeaderTradeDelivery");
  if (model.document.supplyDate) {
    dateTime(delivery.ele("ram:ActualDeliverySupplyChainEvent"), "ram:OccurrenceDateTime", model.document.supplyDate);
  }
  if (model.delivery?.line1 && model.delivery.countryCode) {
    const shipTo = delivery.ele("ram:ShipToTradeParty").ele("ram:PostalTradeAddress");
    txt(shipTo, "ram:PostcodeCode", model.delivery.postalCode);
    txt(shipTo, "ram:LineOne", model.delivery.line1);
    txt(shipTo, "ram:LineTwo", model.delivery.line2);
    txt(shipTo, "ram:CityName", model.delivery.city);
    txt(shipTo, "ram:CountryID", model.delivery.countryCode);
  }
  const settlement = transaction.ele("ram:ApplicableHeaderTradeSettlement");
  txt(settlement, "ram:InvoiceCurrencyCode", model.document.currency);
  for (const tax of model.taxes) {
    const node = settlement.ele("ram:ApplicableTradeTax");
    txt(node, "ram:CalculatedAmount", centsToXmlAmount(tax.vatCents));
    txt(node, "ram:TypeCode", "VAT");
    txt(node, "ram:BasisAmount", centsToXmlAmount(tax.htCents));
    txt(node, "ram:CategoryCode", tax.vatCategory);
    txt(node, "ram:ExemptionReason", tax.exemptionReason);
    txt(node, "ram:ExemptionReasonCode", tax.exemptionReasonCode);
    txt(node, "ram:RateApplicablePercent", bpsToXmlPercent(tax.vatBps));
  }
  if (model.document.paymentTerms?.trim() || model.document.dueDate) {
    const terms = settlement.ele("ram:SpecifiedTradePaymentTerms");
    txt(terms, "ram:Description", model.document.paymentTerms);
    dateTime(terms, "ram:DueDateDateTime", model.document.dueDate);
  }
  const sums = settlement.ele("ram:SpecifiedTradeSettlementHeaderMonetarySummation");
  txt(sums, "ram:LineTotalAmount", centsToXmlAmount(model.document.htCents));
  txt(sums, "ram:TaxBasisTotalAmount", centsToXmlAmount(model.document.htCents));
  sums.ele("ram:TaxTotalAmount", { currencyID: model.document.currency }).txt(centsToXmlAmount(model.document.vatCents));
  txt(sums, "ram:GrandTotalAmount", centsToXmlAmount(model.document.ttcCents));
  txt(sums, "ram:DuePayableAmount", centsToXmlAmount(model.document.ttcCents));
  if (model.document.creditedInvoiceNumber) {
    const referenced = settlement.ele("ram:InvoiceReferencedDocument");
    txt(referenced, "ram:IssuerAssignedID", model.document.creditedInvoiceNumber);
    dateTime(referenced, "ram:FormattedIssueDateTime", model.document.creditedInvoiceIssuedAt, "qdt");
  }
  return root.end({ prettyPrint: true, indent: "  ", newline: "\n" });
}
