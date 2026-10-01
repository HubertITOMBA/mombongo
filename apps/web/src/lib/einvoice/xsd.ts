import { create } from "xmlbuilder2";
import { issue } from "./errors";
import type { ElectronicIssue } from "./types";

const AMOUNT = /^\d+\.\d{2}$/;
const DATE102 = /^\d{8}$/;
const UNIT = /^[A-Z0-9]{2,3}$/;
const CATEGORY = /^(S|Z|E|AE|O)$/;
const TYPE = /^(380|381)$/;
const CURRENCY = /^[A-Z]{3}$/;
const PERCENT = /^\d+\.\d{2}$/;

type Node = Record<string, unknown>;

function asNode(value: unknown): Node | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Node : null;
}

function asList(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  const node = asNode(value);
  if (!node) return "";
  if (typeof node["#"] === "string" || typeof node["#"] === "number") return String(node["#"]);
  if (typeof node["@"] === "string") return "";
  return "";
}

function attr(value: unknown, name: string) {
  const node = asNode(value);
  if (!node) return "";
  const direct = node[`@${name}`];
  if (typeof direct === "string") return direct;
  const attrs = asNode(node["@"]);
  const nested = attrs?.[name];
  return typeof nested === "string" ? nested : "";
}

function requireText(node: Node | null, path: string, issues: ElectronicIssue[]) {
  const text = textOf(node);
  if (!text.trim()) issues.push(issue("XSD_REQUIRED", path, `Élément requis absent : ${path}.`));
  return text;
}

export function validateCiiXsdSubset(xml: string): ElectronicIssue[] {
  const issues: ElectronicIssue[] = [];
  let parsed: Node;
  try {
    parsed = create(xml).end({ format: "object" }) as Node;
  } catch {
    issues.push(issue("XSD_PARSE", "xml", "Le XML CII ne peut pas être parsé pour la validation XSD de sous-ensemble."));
    return issues;
  }
  const root = asNode(parsed["rsm:CrossIndustryInvoice"]);
  if (!root) {
    issues.push(issue("XSD_ROOT", "rsm:CrossIndustryInvoice", "La racine rsm:CrossIndustryInvoice est obligatoire."));
    return issues;
  }
  const context = asNode(root["rsm:ExchangedDocumentContext"]);
  const guideline = asNode(context?.["ram:GuidelineSpecifiedDocumentContextParameter"]);
  if (!textOf(guideline?.["ram:ID"]).includes("en16931")) {
    issues.push(issue("XSD_GUIDELINE", "ram:ID", "Le guideline Factur-X EN 16931 est obligatoire dans ce sous-ensemble."));
  }
  const exchanged = asNode(root["rsm:ExchangedDocument"]);
  if (!exchanged) {
    issues.push(issue("XSD_EXCHANGED", "rsm:ExchangedDocument", "rsm:ExchangedDocument est obligatoire."));
  } else {
    const type = requireText(asNode(exchanged["ram:TypeCode"]) ?? exchanged["ram:TypeCode"] as Node, "ram:TypeCode", issues);
    if (type && !TYPE.test(type)) issues.push(issue("XSD_TYPE_CODE", "ram:TypeCode", "TypeCode doit être 380 ou 381."));
    const issued = asNode(exchanged["ram:IssueDateTime"]);
    const issuedText = textOf(issued?.["udt:DateTimeString"]);
    if (!DATE102.test(issuedText)) issues.push(issue("XSD_ISSUE_DATE", "ram:IssueDateTime", "IssueDateTime format 102 (AAAAMMJJ) est obligatoire."));
  }
  const transaction = asNode(root["rsm:SupplyChainTradeTransaction"]);
  if (!transaction) {
    issues.push(issue("XSD_TRANSACTION", "rsm:SupplyChainTradeTransaction", "rsm:SupplyChainTradeTransaction est obligatoire."));
    return issues;
  }
  const lines = asList(transaction["ram:IncludedSupplyChainTradeLineItem"]);
  if (lines.length === 0) {
    issues.push(issue("XSD_LINES", "ram:IncludedSupplyChainTradeLineItem", "Au moins une ligne CII est obligatoire."));
  }
  for (const [index, raw] of lines.entries()) {
    const line = asNode(raw);
    const qty = line && (asNode(line["ram:SpecifiedLineTradeDelivery"])?.["ram:BilledQuantity"]
      ?? asNode(asNode(line["ram:SpecifiedLineTradeDelivery"])?.["ram:BilledQuantity"]));
    const quantityNode = asNode(asNode(line?.["ram:SpecifiedLineTradeDelivery"])?.["ram:BilledQuantity"])
      ?? asNode(line?.["ram:SpecifiedLineTradeDelivery"]);
    const billed = asNode(asNode(line?.["ram:SpecifiedLineTradeDelivery"])?.["ram:BilledQuantity"]);
    const unitCode = attr(billed, "unitCode");
    if (!UNIT.test(unitCode)) {
      issues.push(issue("XSD_UNIT_CODE", `lines[${index}].unitCode`, "unitCode UNECE Rec. 20 (2 ou 3 caractères) est obligatoire."));
    }
    const tax = asNode(asNode(asNode(line?.["ram:SpecifiedLineTradeSettlement"])?.["ram:ApplicableTradeTax"]));
    const category = textOf(tax?.["ram:CategoryCode"]);
    if (!CATEGORY.test(category)) {
      issues.push(issue("XSD_VAT_CATEGORY", `lines[${index}].CategoryCode`, "CategoryCode doit être S, Z, E, AE ou O."));
    }
    const percent = textOf(tax?.["ram:RateApplicablePercent"]);
    if (!PERCENT.test(percent)) {
      issues.push(issue("XSD_VAT_RATE", `lines[${index}].RateApplicablePercent`, "RateApplicablePercent doit avoir 2 décimales."));
    }
    void qty;
    void quantityNode;
  }
  const settlement = asNode(transaction["ram:ApplicableHeaderTradeSettlement"]);
  const currency = textOf(settlement?.["ram:InvoiceCurrencyCode"]);
  if (!CURRENCY.test(currency)) {
    issues.push(issue("XSD_CURRENCY", "ram:InvoiceCurrencyCode", "InvoiceCurrencyCode ISO-3 est obligatoire."));
  }
  const taxes = asList(settlement?.["ram:ApplicableTradeTax"]);
  if (taxes.length === 0) {
    issues.push(issue("XSD_TAXES", "ram:ApplicableTradeTax", "Au moins une ventilation TVA d’en-tête est obligatoire."));
  }
  for (const [index, raw] of taxes.entries()) {
    const tax = asNode(raw);
    const category = textOf(tax?.["ram:CategoryCode"]);
    if (!CATEGORY.test(category)) {
      issues.push(issue("XSD_HEADER_VAT_CATEGORY", `taxes[${index}].CategoryCode`, "CategoryCode d’en-tête doit être S, Z, E, AE ou O."));
    }
    const calculated = textOf(tax?.["ram:CalculatedAmount"]);
    const basis = textOf(tax?.["ram:BasisAmount"]);
    if (!AMOUNT.test(calculated) || !AMOUNT.test(basis)) {
      issues.push(issue("XSD_TAX_AMOUNT", `taxes[${index}]`, "CalculatedAmount et BasisAmount doivent avoir 2 décimales."));
    }
    if ((category === "E" || category === "AE" || category === "O") && !textOf(tax?.["ram:ExemptionReason"]).trim() && !textOf(tax?.["ram:ExemptionReasonCode"]).trim()) {
      issues.push(issue("XSD_EXEMPTION", `taxes[${index}].ExemptionReason`, "Une catégorie E, AE ou O exige ExemptionReason ou ExemptionReasonCode."));
    }
  }
  const sums = asNode(settlement?.["ram:SpecifiedTradeSettlementHeaderMonetarySummation"]);
  for (const field of ["ram:LineTotalAmount", "ram:TaxBasisTotalAmount", "ram:GrandTotalAmount", "ram:DuePayableAmount"] as const) {
    if (!AMOUNT.test(textOf(sums?.[field]))) {
      issues.push(issue("XSD_SUM", field, `${field} doit être un montant à 2 décimales.`));
    }
  }
  const taxTotal = sums?.["ram:TaxTotalAmount"];
  if (!AMOUNT.test(textOf(taxTotal)) || !CURRENCY.test(attr(taxTotal, "currencyID"))) {
    issues.push(issue("XSD_TAX_TOTAL", "ram:TaxTotalAmount", "TaxTotalAmount exige un montant à 2 décimales et currencyID."));
  }
  return issues;
}
