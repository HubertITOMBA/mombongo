import PDFDocument from "pdfkit";
import { readPdfFont } from "./fonts";
import type { DocumentPrintModel, PrintLine } from "./types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = 812;
const CONTENT_BOTTOM = 790;
const INK = "#182b29";
const MUTED = "#64748b";
const LINE = "#d8dee6";
const ACCENT = "#065f46";
const DRAFT = "#b91c1c";

const COLUMNS = [
  { key: "description", label: "Description", width: 148, align: "left" as const },
  { key: "quantity", label: "Qté", width: 42, align: "right" as const },
  { key: "unit", label: "Unité", width: 50, align: "left" as const },
  { key: "unitPrice", label: "PU HT", width: 64, align: "right" as const },
  { key: "discount", label: "Remise", width: 42, align: "right" as const },
  { key: "vat", label: "TVA", width: 40, align: "right" as const },
  { key: "ht", label: "Total HT", width: 64, align: "right" as const },
];

function lineCells(line: PrintLine) {
  const description = line.itemKindLabel ? `${line.description}\n${line.itemKindLabel}` : line.description;
  return {
    description,
    quantity: line.quantityLabel,
    unit: line.unit,
    unitPrice: line.unitPriceLabel,
    discount: line.discountLabel,
    vat: line.vatLabel,
    ht: line.htLabel,
  };
}

function registerFonts(doc: PDFKit.PDFDocument) {
  doc.registerFont("Sans", readPdfFont("regular"));
  doc.registerFont("Sans-Bold", readPdfFont("bold"));
}

function drawWatermark(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.fillColor(DRAFT).opacity(0.08);
  doc.font("Sans-Bold").fontSize(64);
  doc.rotate(-32, { origin: [PAGE_WIDTH / 2, PAGE_HEIGHT / 2] });
  doc.text("BROUILLON", 40, PAGE_HEIGHT / 2 - 40, { width: PAGE_WIDTH - 80, align: "center" });
  doc.restore();
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number, onNewPage: () => void) {
  if (doc.y + needed <= CONTENT_BOTTOM) return;
  doc.addPage();
  onNewPage();
}

export function renderDocumentPdf(model: DocumentPrintModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const producedAt = model.issuedAt ?? model.createdAt;
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: `${model.kindLabel} ${model.numberLabel}`,
        Author: model.issuer.name || "Mombongo",
        Subject: model.title,
        Creator: "Mombongo",
        Producer: "Mombongo",
        CreationDate: producedAt,
        ModDate: producedAt,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      registerFonts(doc);
      drawDocument(doc, model);
      const range = doc.bufferedPageRange();
      for (let index = range.start; index < range.start + range.count; index += 1) {
        doc.switchToPage(index);
        if (model.draft) drawWatermark(doc);
        doc.font("Sans").fontSize(8).fillColor(MUTED);
        doc.text(model.numberLabel, MARGIN, FOOTER_Y, { width: CONTENT_WIDTH / 2, lineBreak: false });
        doc.text(`Page ${index - range.start + 1} / ${range.count}`, MARGIN, FOOTER_Y, {
          width: CONTENT_WIDTH,
          align: "right",
          lineBreak: false,
        });
      }
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function drawDocument(doc: PDFKit.PDFDocument, model: DocumentPrintModel) {
  doc.font("Sans-Bold").fontSize(18).fillColor(ACCENT).text(model.kindLabel, MARGIN, MARGIN);
  doc.font("Sans").fontSize(11).fillColor(INK).text(model.numberLabel, MARGIN, MARGIN, { width: CONTENT_WIDTH, align: "right" });
  if (model.draft) {
    doc.moveDown(0.2);
    doc.font("Sans-Bold").fontSize(10).fillColor(DRAFT).text("BROUILLON — ce document n’est pas une pièce émise.");
  }
  doc.moveDown(0.4);
  doc.font("Sans").fontSize(9).fillColor(MUTED).text(model.title);
  doc.moveDown(0.6);
  drawMeta(doc, model);
  if (model.kind === "CREDIT_NOTE") drawCreditBanner(doc, model);
  doc.moveDown(0.8);
  const partyTop = doc.y;
  const columnWidth = (CONTENT_WIDTH - 16) / 2;
  const issuerHeight = drawParty(doc, "Émetteur", model.issuer, MARGIN, partyTop, columnWidth);
  const recipientHeight = drawParty(doc, "Destinataire", model.recipient, MARGIN + columnWidth + 16, partyTop, columnWidth);
  doc.y = partyTop + Math.max(issuerHeight, recipientHeight) + 16;
  drawTable(doc, model);
  drawTotals(doc, model);
  drawTerms(doc, model);
}

function drawMeta(doc: PDFKit.PDFDocument, model: DocumentPrintModel) {
  const items = [
    model.issuedAtLabel ? `Émis le ${model.issuedAtLabel}` : null,
    model.validUntilLabel ? `Valable jusqu’au ${model.validUntilLabel}` : null,
    model.dueDateLabel ? `Échéance ${model.dueDateLabel}` : null,
    model.supplyDateLabel ? `Prestation / livraison ${model.supplyDateLabel}` : null,
    model.customerOrderNumber ? `Commande ${model.customerOrderNumber}` : null,
  ].filter((item): item is string => !!item);
  if (items.length === 0) return;
  doc.font("Sans").fontSize(9).fillColor(INK).text(items.join("  ·  "));
}

function drawCreditBanner(doc: PDFKit.PDFDocument, model: DocumentPrintModel) {
  doc.moveDown(0.4);
  doc.font("Sans-Bold").fontSize(10).fillColor(ACCENT).text(`Avoir ${model.numberLabel}`);
  doc.font("Sans").fontSize(9).fillColor(INK);
  if (model.creditedInvoiceNumber) doc.text(`Facture concernée : ${model.creditedInvoiceNumber}`);
  if (model.creditReason) doc.text(`Motif : ${model.creditReason}`);
  doc.fontSize(8).fillColor(MUTED).text("Les montants ci-dessous sont des crédits (magnitudes positives). Ce document n’est pas une facture.");
}

function drawParty(doc: PDFKit.PDFDocument, heading: string, party: DocumentPrintModel["issuer"], x: number, y: number, width: number) {
  const startY = y;
  doc.font("Sans").fontSize(8).fillColor(MUTED).text(heading.toUpperCase(), x, y, { width, lineBreak: false });
  y += 14;
  doc.font("Sans-Bold").fontSize(10).fillColor(INK).text(party.name || "—", x, y, { width });
  y = doc.y + 2;
  doc.font("Sans").fontSize(8).fillColor(INK);
  for (const line of party.details) {
    doc.text(line, x, y, { width });
    y = doc.y;
  }
  return y - startY;
}

function drawTableHeader(doc: PDFKit.PDFDocument) {
  doc.font("Sans-Bold").fontSize(8).fillColor(MUTED);
  let x = MARGIN;
  const y = doc.y;
  for (const column of COLUMNS) {
    doc.text(column.label, x, y, { width: column.width, align: column.align, lineBreak: false });
    x += column.width;
  }
  doc.moveTo(MARGIN, y + 12).lineTo(MARGIN + CONTENT_WIDTH, y + 12).strokeColor(LINE).stroke();
  doc.y = y + 16;
}

function rowHeight(doc: PDFKit.PDFDocument, line: PrintLine) {
  const cells = lineCells(line);
  let height = 12;
  doc.font("Sans").fontSize(8);
  for (const column of COLUMNS) {
    const value = cells[column.key as keyof typeof cells];
    height = Math.max(height, doc.heightOfString(value, { width: column.width - 4 }));
  }
  return height + 8;
}

function drawRow(doc: PDFKit.PDFDocument, line: PrintLine) {
  const cells = lineCells(line);
  const height = rowHeight(doc, line);
  const y = doc.y;
  let x = MARGIN;
  doc.font("Sans").fontSize(8).fillColor(INK);
  for (const column of COLUMNS) {
    doc.text(cells[column.key as keyof typeof cells], x, y, {
      width: column.width - 4,
      align: column.align,
    });
    x += column.width;
  }
  doc.y = y + height;
  doc.moveTo(MARGIN, doc.y - 4).lineTo(MARGIN + CONTENT_WIDTH, doc.y - 4).strokeColor(LINE).stroke();
}

function drawTable(doc: PDFKit.PDFDocument, model: DocumentPrintModel) {
  const restart = () => {
    doc.y = MARGIN + 8;
    doc.font("Sans-Bold").fontSize(9).fillColor(ACCENT).text(`${model.kindLabel} ${model.numberLabel}`);
    doc.moveDown(0.4);
    drawTableHeader(doc);
  };
  drawTableHeader(doc);
  if (model.lines.length === 0) {
    doc.font("Sans").fontSize(8).fillColor(MUTED).text("Aucune ligne.");
    doc.moveDown();
    return;
  }
  for (const line of model.lines) {
    ensureSpace(doc, rowHeight(doc, line) + 4, restart);
    drawRow(doc, line);
  }
  doc.moveDown(0.6);
}

function drawTotals(doc: PDFKit.PDFDocument, model: DocumentPrintModel) {
  const blockHeight = 70 + model.vatBreakdown.length * 14;
  ensureSpace(doc, blockHeight, () => {
    doc.y = MARGIN + 8;
    doc.font("Sans-Bold").fontSize(9).fillColor(ACCENT).text(`${model.kindLabel} ${model.numberLabel}`);
    doc.moveDown(0.6);
  });
  const width = 220;
  const x = MARGIN + CONTENT_WIDTH - width;
  const startY = doc.y;
  let vatBottom = startY;
  if (model.vatBreakdown.length > 0) {
    doc.font("Sans-Bold").fontSize(8).fillColor(MUTED).text("Ventilation TVA", MARGIN, startY, { width: CONTENT_WIDTH - width - 12 });
    doc.font("Sans").fontSize(8).fillColor(INK);
    for (const rate of model.vatBreakdown) {
      doc.text(`Base HT ${rate.htLabel}  ·  ${rate.rateLabel}  ·  TVA ${rate.vatLabel}`, MARGIN, doc.y, { width: CONTENT_WIDTH - width - 12 });
    }
    vatBottom = doc.y;
  }
  const rows = [
    [model.totals.htCaption, model.totals.htLabel],
    [model.totals.vatCaption, model.totals.vatLabel],
    [model.totals.ttcCaption, model.totals.ttcLabel],
  ];
  rows.forEach(([caption, amount], index) => {
    const y = startY + index * 16;
    doc.font(index === 2 ? "Sans-Bold" : "Sans").fontSize(9).fillColor(INK);
    doc.text(caption, x, y, { width: 110 });
    doc.text(amount, x + 110, y, { width: 110, align: "right" });
  });
  doc.y = Math.max(vatBottom, startY + rows.length * 16) + 12;
}

function drawTerms(doc: PDFKit.PDFDocument, model: DocumentPrintModel) {
  const blocks = [...model.terms, model.notes].filter((item): item is string => !!item?.trim());
  if (blocks.length === 0) return;
  ensureSpace(doc, 48, () => {
    doc.y = MARGIN + 8;
  });
  doc.font("Sans-Bold").fontSize(8).fillColor(MUTED).text(model.kind === "INVOICE" ? "Conditions de règlement" : "Mentions");
  doc.moveDown(0.2);
  doc.font("Sans").fontSize(8).fillColor(INK);
  for (const block of blocks) {
    ensureSpace(doc, 24, () => {
      doc.y = MARGIN + 8;
    });
    doc.text(block, { width: CONTENT_WIDTH });
    doc.moveDown(0.3);
  }
}
