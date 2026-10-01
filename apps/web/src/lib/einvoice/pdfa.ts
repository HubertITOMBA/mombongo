import { extractFacturXXml } from "./extract";
import { issue } from "./errors";
import { pdfContainsFacturXMarkers } from "./facturx";
import type { ElectronicIssue } from "./types";
import { FACTURX_XML_NAME } from "./types";

export function validatePdfA3Structure(pdf: Buffer, xml?: string): ElectronicIssue[] {
  const issues: ElectronicIssue[] = [];
  const markers = pdfContainsFacturXMarkers(pdf);
  if (!markers.header) issues.push(issue("PDFA_HEADER", "pdf", "Le fichier ne commence pas par %PDF-."));
  if (!markers.pdfa) issues.push(issue("PDFA_XMP_PART", "pdfaid:part", "XMP pdfaid:part = 3 absent. Validation PDF/A structurelle en échec."));
  if (!markers.conformance) issues.push(issue("PDFA_XMP_FX", "fx:ConformanceLevel", "XMP Factur-X EN 16931 absent."));
  if (!markers.outputIntent) issues.push(issue("PDFA_OUTPUT_INTENT", "OutputIntents", "OutputIntent sRGB / GTS_PDFA1 absent."));
  if (!markers.xmlName) issues.push(issue("PDFA_EMBEDDED_XML", FACTURX_XML_NAME, "La pièce jointe factur-x.xml est absente."));
  if (!markers.relationship) issues.push(issue("PDFA_AF_RELATIONSHIP", "AFRelationship", "AFRelationship /Data est absent."));
  const latin1 = pdf.toString("latin1");
  if (!latin1.includes("pdfaid:conformance") || !latin1.includes(">B<")) {
    issues.push(issue("PDFA_CONFORMANCE_B", "pdfaid:conformance", "XMP pdfaid:conformance = B absent."));
  }
  if (xml !== undefined) {
    return issues;
  }
  return issues;
}

export async function validatePdfXmlConsistency(pdf: Buffer, xml: string): Promise<ElectronicIssue[]> {
  const issues = validatePdfA3Structure(pdf, xml);
  const extracted = await extractFacturXXml(pdf);
  if (extracted !== xml) {
    issues.push(issue("PDF_XML_MISMATCH", "factur-x.xml", "Le XML embarqué ne correspond pas au CII généré."));
  }
  return issues;
}
