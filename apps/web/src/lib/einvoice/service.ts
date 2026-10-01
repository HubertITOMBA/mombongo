import { buildOrganizationDocumentPdf, getPrintableDocument } from "@/lib/pdf/service";
import { buildCrossIndustryInvoiceXml } from "./cii";
import { issue, ElectronicInvoiceError } from "./errors";
import { embedFacturX } from "./facturx";
import { buildElectronicInvoiceModel } from "./model";
import { validateElectronicArtifactPipeline, validateElectronicModelPipeline } from "./pipeline";
import type { ElectronicInvoiceModel, ElectronicIssue, ElectronicValidationResult } from "./types";

export type ElectronicInvoiceInspection = {
  model: ElectronicInvoiceModel | null;
  issues: ElectronicIssue[];
  available: boolean;
  validation: ElectronicValidationResult | null;
};

function quoteRejected(): ElectronicInvoiceInspection {
  return {
    model: null,
    issues: [issue("DOCUMENT_KIND_UNSUPPORTED", "kind", "Un devis n’est pas une facture électronique réglementaire.")],
    available: false,
    validation: null,
  };
}

export function inspectElectronicDocument(document: Parameters<typeof buildElectronicInvoiceModel>[0]): ElectronicInvoiceInspection {
  if (document.kind === "QUOTE") return quoteRejected();
  const model = buildElectronicInvoiceModel(document);
  if (!model) return quoteRejected();
  const modelValidation = validateElectronicModelPipeline(model);
  if (modelValidation.errors.length > 0) {
    return {
      model,
      issues: [...modelValidation.errors, ...modelValidation.warnings],
      available: false,
      validation: modelValidation,
    };
  }
  const xml = buildCrossIndustryInvoiceXml(model);
  const validation = validateElectronicModelPipeline(model, xml);
  return {
    model,
    issues: [...validation.errors, ...validation.warnings],
    available: validation.valid,
    validation,
  };
}

export async function inspectOrganizationFacturX(organizationId: string, documentId: string) {
  const document = await getPrintableDocument(organizationId, documentId);
  return { document, ...inspectElectronicDocument(document) };
}

export async function buildOrganizationFacturX(organizationId: string, documentId: string) {
  const inspected = await inspectOrganizationFacturX(organizationId, documentId);
  if (!inspected.model || !inspected.available) {
    throw new ElectronicInvoiceError(inspected.issues);
  }
  const xml = buildCrossIndustryInvoiceXml(inspected.model);
  const { pdf } = await buildOrganizationDocumentPdf(organizationId, documentId);
  const artifact = await embedFacturX(pdf, xml, inspected.model);
  const validation = await validateElectronicArtifactPipeline(inspected.model, xml, artifact.bytes);
  if (!validation.valid) {
    throw new ElectronicInvoiceError(validation.errors.length > 0 ? validation.errors : inspected.issues);
  }
  return { ...artifact, validation };
}
