import { centsToXmlAmount } from "./money";
import { issue } from "./errors";
import { lineNeedsExemptionReason } from "./tax";
import type { ElectronicInvoiceModel, ElectronicIssue } from "./types";

/** Sous-ensemble de règles EN 16931 réellement exécuté. Pas un Schematron CEN complet. */
export const implementedEn16931Rules = [
  "BR-01",
  "BR-02",
  "BR-03",
  "BR-04",
  "BR-06",
  "BR-08",
  "BR-16",
  "BR-CO-10",
  "BR-CO-11",
  "BR-CO-14",
  "BR-S-01",
  "BR-Z-01",
  "BR-E-01",
  "BR-E-10",
  "BR-AE-01",
  "BR-AE-10",
  "BR-O-01",
  "BR-O-10",
] as const;

export function validateEn16931Subset(model: ElectronicInvoiceModel): ElectronicIssue[] {
  const issues: ElectronicIssue[] = [];
  const { document } = model;
  if (!document.number?.trim()) {
    issues.push(issue("BR-01", "number", "BR-01 : le numéro de facture (BT-1) est obligatoire."));
  }
  if (!document.issuedAt) {
    issues.push(issue("BR-02", "issuedAt", "BR-02 : la date d’émission (BT-2) est obligatoire."));
  }
  if (document.typeCode !== "380" && document.typeCode !== "381") {
    issues.push(issue("BR-03", "typeCode", "BR-03 : le type de document (BT-3) doit être 380 ou 381."));
  }
  if (!/^[A-Z]{3}$/.test(document.currency)) {
    issues.push(issue("BR-04", "currency", "BR-04 : la devise (BT-5) est obligatoire."));
  }
  if (!model.seller.name.trim()) {
    issues.push(issue("BR-06", "seller.name", "BR-06 : le nom du vendeur (BT-27) est obligatoire."));
  }
  if (!model.seller.address?.countryCode) {
    issues.push(issue("BR-08", "seller.address", "BR-08 : l’adresse postale du vendeur (BG-5) est obligatoire."));
  }
  if (model.lines.length === 0) {
    issues.push(issue("BR-16", "lines", "BR-16 : une facture doit avoir au moins une ligne."));
  }
  const lineHt = model.lines.reduce((sum, line) => sum + line.htCents, 0);
  if (lineHt !== document.htCents) {
    issues.push(issue("BR-CO-10", "htCents", "BR-CO-10 : la somme des lignes HT doit égaler le total HT."));
  }
  const taxVat = model.taxes.reduce((sum, tax) => sum + tax.vatCents, 0);
  if (taxVat !== document.vatCents) {
    issues.push(issue("BR-CO-11", "vatCents", "BR-CO-11 : la somme des TVA de ventilation doit égaler la TVA totale."));
  }
  if (document.htCents + document.vatCents !== document.ttcCents) {
    issues.push(issue("BR-CO-14", "ttcCents", "BR-CO-14 : HT + TVA doit égaler le TTC."));
  }
  for (const [index, tax] of model.taxes.entries()) {
    const field = `taxes[${index}]`;
    if (tax.vatCategory === "S" && tax.vatBps <= 0) {
      issues.push(issue("BR-S-01", field, "BR-S-01 : une ventilation S exige un taux supérieur à 0."));
    }
    if (tax.vatCategory === "Z" && tax.vatBps !== 0) {
      issues.push(issue("BR-Z-01", field, "BR-Z-01 : une ventilation Z exige un taux à 0."));
    }
    if (tax.vatCategory === "E" && tax.vatBps !== 0) {
      issues.push(issue("BR-E-01", field, "BR-E-01 : une ventilation E exige un taux à 0."));
    }
    if (tax.vatCategory === "E" && !tax.exemptionReason && !tax.exemptionReasonCode) {
      issues.push(issue("BR-E-10", field, "BR-E-10 : une ventilation E exige un motif d’exonération (BT-120 ou BT-121)."));
    }
    if (tax.vatCategory === "AE" && tax.vatBps !== 0) {
      issues.push(issue("BR-AE-01", field, "BR-AE-01 : une ventilation AE exige un taux à 0."));
    }
    if (tax.vatCategory === "AE" && !tax.exemptionReason && !tax.exemptionReasonCode) {
      issues.push(issue("BR-AE-10", field, "BR-AE-10 : une ventilation AE exige un motif d’exonération."));
    }
    if (tax.vatCategory === "O" && tax.vatBps !== 0) {
      issues.push(issue("BR-O-01", field, "BR-O-01 : une ventilation O exige un taux à 0."));
    }
    if (tax.vatCategory === "O" && !tax.exemptionReason && !tax.exemptionReasonCode) {
      issues.push(issue("BR-O-10", field, "BR-O-10 : une ventilation O exige un motif d’exonération."));
    }
    void centsToXmlAmount(tax.vatCents);
  }
  for (const [index, line] of model.lines.entries()) {
    if (lineNeedsExemptionReason(line.taxCategory) && !line.exemptionReason && !line.exemptionReasonCode) {
      issues.push(issue("BR-E-10", `lines[${index}]`, "Le motif d’exonération de ligne est obligatoire pour E, AE ou O."));
    }
  }
  return issues;
}
