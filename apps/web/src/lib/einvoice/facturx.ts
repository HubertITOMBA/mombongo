import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AFRelationship, PDFDocument, PDFName, PDFString } from "pdf-lib";
import type { ElectronicInvoiceArtifact, ElectronicInvoiceModel } from "./types";
import { FACTURX_GUIDELINE_EN16931, FACTURX_XML_NAME } from "./types";
import { facturXFilename } from "./filename";

function iccPath() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "icc", "sRGB.icc"),
    join(process.cwd(), "src/lib/einvoice/icc", "sRGB.icc"),
    join(process.cwd(), "apps/web/src/lib/einvoice/icc", "sRGB.icc"),
  ];
  const path = candidates.find(candidate => existsSync(candidate));
  if (!path) throw new Error("Profil ICC sRGB introuvable pour PDF/A-3.");
  return path;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function facturXmp(model: ElectronicInvoiceModel) {
  const title = xmlEscape(`${model.document.kind === "CREDIT_NOTE" ? "Avoir" : "Facture"} ${model.document.number ?? ""}`.trim());
  const author = xmlEscape(model.seller.name);
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
        xmlns:xmp="http://ns.adobe.com/xap/1.0/"
        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
        xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${author}</rdf:li></rdf:Seq></dc:creator>
      <pdf:Producer>Mombongo</pdf:Producer>
      <xmp:CreatorTool>Mombongo</xmp:CreatorTool>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>${FACTURX_XML_NAME}</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentType</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>INVOICE</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>Version</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The actual version of the Factur-X XML schema</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export async function embedFacturX(pdf: Buffer, xml: string, model: ElectronicInvoiceModel): Promise<ElectronicInvoiceArtifact> {
  const document = await PDFDocument.load(pdf, { updateMetadata: false });
  const producedAt = model.document.issuedAt ?? new Date(0);
  document.setTitle(`${model.document.kind === "CREDIT_NOTE" ? "Avoir" : "Facture"} ${model.document.number ?? ""}`.trim());
  document.setAuthor(model.seller.name);
  document.setProducer("Mombongo");
  document.setCreator("Mombongo");
  document.setCreationDate(producedAt);
  document.setModificationDate(producedAt);
  await document.attach(Buffer.from(xml, "utf8"), FACTURX_XML_NAME, {
    mimeType: "text/xml",
    description: "Factur-X/ZUGFeRD invoice",
    creationDate: producedAt,
    modificationDate: producedAt,
    afRelationship: AFRelationship.Data,
  });
  const icc = readFileSync(iccPath());
  const iccStream = document.context.flateStream(icc, { N: 3 });
  const outputIntent = document.context.obj({
    Type: "OutputIntent",
    S: "GTS_PDFA1",
    OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    DestOutputProfile: document.context.register(iccStream),
  });
  document.catalog.set(PDFName.of("OutputIntents"), document.context.obj([outputIntent]));
  const metadata = document.context.stream(Buffer.from(facturXmp(model), "utf8"), {
    Type: "Metadata",
    Subtype: "XML",
  });
  document.catalog.set(PDFName.of("Metadata"), document.context.register(metadata));
  const bytes = Buffer.from(await document.save({ useObjectStreams: false }));
  return {
    format: "FACTUR_X",
    profile: "EN16931",
    mimeType: "application/pdf",
    filename: facturXFilename(model.document.kind, model.document.number),
    bytes,
    xml,
    metadata: {
      guidelineId: FACTURX_GUIDELINE_EN16931,
      documentNumber: model.document.number ?? "",
      currency: model.document.currency,
      route: model.context.route,
      market: model.context.market,
    },
  };
}

export function pdfContainsFacturXMarkers(pdf: Buffer) {
  const latin1 = pdf.toString("latin1");
  return {
    header: latin1.startsWith("%PDF-"),
    xmlName: latin1.includes(FACTURX_XML_NAME),
    relationship: latin1.includes("/AFRelationship") && latin1.includes("/Data"),
    pdfa: latin1.includes("pdfaid:part") && latin1.includes(">3<"),
    conformance: latin1.includes("EN 16931"),
    outputIntent: latin1.includes("/OutputIntents") && latin1.includes("/GTS_PDFA1"),
  };
}
