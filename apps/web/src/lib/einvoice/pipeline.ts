import { create } from "xmlbuilder2";
import { issue } from "./errors";
import { validateEn16931Subset } from "./en16931";
import { electronicErrors, electronicWarnings, validateElectronicInvoice } from "./validate";
import { validateCiiXsdSubset } from "./xsd";
import { validatePdfA3Structure, validatePdfXmlConsistency } from "./pdfa";
import type {
  ElectronicInvoiceModel,
  ElectronicIssue,
  ElectronicValidationResult,
  ElectronicValidatorId,
  ElectronicValidatorResult,
} from "./types";

const names: Record<ElectronicValidatorId, string> = {
  "business-model": "Modèle métier électronique",
  "xml-wellformed": "XML CII bien formé",
  "xsd-subset": "XSD sous-ensemble CII Mombongo",
  "en16931-subset": "Règles EN 16931 (sous-ensemble testé)",
  "pdfa-3-structure": "PDF/A-3 structurel",
  "pdf-xml-consistency": "Cohérence PDF / XML",
};

function validator(
  id: ElectronicValidatorId,
  issues: ElectronicIssue[],
  status: ElectronicValidatorResult["status"] = issues.some(item => item.severity === "error") ? "fail" : "pass",
): ElectronicValidatorResult {
  return { id, name: names[id], status, issues };
}

function skipped(id: ElectronicValidatorId): ElectronicValidatorResult {
  return { id, name: names[id], status: "skipped", issues: [] };
}

function resultOf(validators: ElectronicValidatorResult[]): ElectronicValidationResult {
  const issues = validators.flatMap(item => item.issues);
  const errors = electronicErrors(issues);
  return {
    valid: errors.length === 0 && validators.filter(item => item.status !== "skipped").every(item => item.status === "pass"),
    errors,
    warnings: electronicWarnings(issues),
    validators,
  };
}

function wellFormed(xml: string): ElectronicIssue[] {
  try {
    const parsed = create(xml).end({ format: "object" }) as Record<string, unknown>;
    if (!parsed["rsm:CrossIndustryInvoice"]) {
      return [issue("XML_MALFORMED", "xml", "Le XML CII n’est pas bien formé.")];
    }
    return [];
  } catch {
    return [issue("XML_MALFORMED", "xml", "Le XML CII n’est pas bien formé.")];
  }
}

export function validateElectronicModelPipeline(model: ElectronicInvoiceModel, xml?: string): ElectronicValidationResult {
  const business = validator("business-model", validateElectronicInvoice(model));
  const rules = validator("en16931-subset", validateEn16931Subset(model));
  if (!xml) {
    return resultOf([business, skipped("xml-wellformed"), skipped("xsd-subset"), rules, skipped("pdfa-3-structure"), skipped("pdf-xml-consistency")]);
  }
  const formed = validator("xml-wellformed", wellFormed(xml));
  const xsd = validator("xsd-subset", validateCiiXsdSubset(xml));
  return resultOf([business, formed, xsd, rules, skipped("pdfa-3-structure"), skipped("pdf-xml-consistency")]);
}

export async function validateElectronicArtifactPipeline(
  model: ElectronicInvoiceModel,
  xml: string,
  pdf: Buffer,
): Promise<ElectronicValidationResult> {
  const base = validateElectronicModelPipeline(model, xml);
  const pdfa = validator("pdfa-3-structure", validatePdfA3Structure(pdf, xml));
  const consistency = validator("pdf-xml-consistency", await validatePdfXmlConsistency(pdf, xml));
  const validators = base.validators.map(item => {
    if (item.id === "pdfa-3-structure") return pdfa;
    if (item.id === "pdf-xml-consistency") return consistency;
    return item;
  });
  return resultOf(validators);
}
