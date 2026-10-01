import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
} from "pdf-lib";
import { FACTURX_XML_NAME } from "./types";

function textOf(value: unknown) {
  if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText();
  return "";
}

function collectFileSpecs(node: PDFDict, found: PDFDict[]) {
  const names = node.lookup(PDFName.of("Names"));
  if (names instanceof PDFArray) {
    for (let index = 1; index < names.size(); index += 2) {
      const spec = names.lookup(index);
      if (spec instanceof PDFDict) found.push(spec);
    }
  }
  const kids = node.lookup(PDFName.of("Kids"));
  if (kids instanceof PDFArray) {
    for (let index = 0; index < kids.size(); index += 1) {
      const kid = kids.lookup(index);
      if (kid instanceof PDFDict) collectFileSpecs(kid, found);
    }
  }
}

function decodeStream(stream: PDFStream) {
  if (!(stream instanceof PDFRawStream)) return Buffer.from([]);
  return Buffer.from(decodePDFRawStream(stream).decode());
}

export async function extractFacturXXml(pdf: Buffer) {
  const document = await PDFDocument.load(pdf, { updateMetadata: false });
  const names = document.catalog.lookup(PDFName.of("Names"));
  if (!(names instanceof PDFDict)) return null;
  const embedded = names.lookup(PDFName.of("EmbeddedFiles"));
  if (!(embedded instanceof PDFDict)) return null;
  const specs: PDFDict[] = [];
  collectFileSpecs(embedded, specs);
  for (const spec of specs) {
    const filename = textOf(spec.lookup(PDFName.of("UF"))) || textOf(spec.lookup(PDFName.of("F")));
    if (filename !== FACTURX_XML_NAME) continue;
    const ef = spec.lookup(PDFName.of("EF"));
    if (!(ef instanceof PDFDict)) continue;
    const file = ef.lookup(PDFName.of("F")) ?? ef.lookup(PDFName.of("UF"));
    if (file instanceof PDFStream) return decodeStream(file).toString("utf8");
  }
  return null;
}
