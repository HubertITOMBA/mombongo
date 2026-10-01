import type { ElectronicAddress, ElectronicInvoiceModel, ElectronicIssue, ElectronicParty } from "./types";
import { issue } from "./errors";
import { lineNeedsExemptionReason } from "./tax";

function completeAddress(address: ElectronicAddress | null) {
  return Boolean(address?.line1?.trim() && address.postalCode?.trim() && address.city?.trim() && address.countryCode);
}

function partyCountry(party: ElectronicParty) {
  return party.countryCode || party.address?.countryCode || null;
}

function digitLen(value: string | null, length: number) {
  return !!value && /^\d+$/.test(value) && value.length === length;
}

export function validateElectronicInvoice(model: ElectronicInvoiceModel): ElectronicIssue[] {
  const issues: ElectronicIssue[] = [];
  const { document, seller, buyer } = model;

  if (document.status !== "SENT") {
    issues.push(issue("DOCUMENT_NOT_ISSUED", "status", "Seule une facture ou un avoir émis peut produire un message électronique."));
  }
  if (!document.number?.trim()) {
    issues.push(issue("DOCUMENT_NUMBER_MISSING", "number", "Le numéro de pièce snapshoté est obligatoire pour le message électronique."));
  }
  if (!document.issuedAt) {
    issues.push(issue("ISSUE_DATE_MISSING", "issuedAt", "La date d’émission snapshotée est obligatoire. createdAt n’est pas utilisé."));
  }
  if (!/^[A-Z]{3}$/.test(document.currency)) {
    issues.push(issue("CURRENCY_MISSING", "currency", "La devise ISO snapshotée est obligatoire. Aucune devise n’est inventée."));
  }
  if (document.htCents + document.vatCents !== document.ttcCents) {
    issues.push(issue("TOTALS_MISMATCH", "ttcCents", "Les totaux HT + TVA du snapshot ne correspondent pas au TTC."));
  }
  const lineHt = model.lines.reduce((sum, line) => sum + line.htCents, 0);
  const lineVat = model.lines.reduce((sum, line) => sum + line.vatCents, 0);
  if (lineHt !== document.htCents || lineVat !== document.vatCents) {
    issues.push(issue("LINE_TOTALS_MISMATCH", "lines", "La somme des lignes historiques ne correspond pas aux totaux du document."));
  }
  const taxHt = model.taxes.reduce((sum, tax) => sum + tax.htCents, 0);
  const taxVat = model.taxes.reduce((sum, tax) => sum + tax.vatCents, 0);
  if (taxHt !== document.htCents || taxVat !== document.vatCents) {
    issues.push(issue("TAX_BREAKDOWN_MISMATCH", "taxes", "La ventilation TVA snapshotée ne correspond pas aux totaux du document."));
  }
  if (model.lines.length === 0) {
    issues.push(issue("LINES_MISSING", "lines", "Le message électronique exige au moins une ligne historique."));
  }
  if (document.kind === "CREDIT_NOTE" && !document.creditedInvoiceNumber?.trim()) {
    issues.push(issue("CREDIT_INVOICE_REFERENCE_MISSING", "creditedInvoiceNumber", "Un avoir électronique doit référencer le numéro de la facture créditée."));
  }

  if (!seller.name.trim()) {
    issues.push(issue("SELLER_NAME_MISSING", "seller.name", "Le nom de l’émetteur snapshoté est obligatoire."));
  }
  if (!completeAddress(seller.address)) {
    issues.push(issue("SELLER_ADDRESS_INCOMPLETE", "seller.address", "L’adresse émetteur snapshotée (voie, code postal, ville, pays) est obligatoire."));
  }
  if (!partyCountry(seller)) {
    issues.push(issue("SELLER_COUNTRY_MISSING", "seller.countryCode", "Le pays de l’émetteur snapshoté est obligatoire."));
  }
  if (seller.siren && !digitLen(seller.siren, 9)) {
    issues.push(issue("SELLER_SIREN_INVALID", "seller.siren", "Le SIREN émetteur snapshoté doit contenir 9 chiffres. companyNumber n’est jamais interprété."));
  }
  if (seller.siret && !digitLen(seller.siret, 14)) {
    issues.push(issue("SELLER_SIRET_INVALID", "seller.siret", "Le SIRET émetteur snapshoté doit contenir 14 chiffres."));
  }
  if (seller.siren && seller.siret && seller.siret.slice(0, 9) !== seller.siren) {
    issues.push(issue("SELLER_SIRET_SIREN_MISMATCH", "seller.siret", "Le SIRET émetteur ne commence pas par le SIREN snapshoté.", "warning"));
  }
  if (!seller.vatNumber && !seller.siren && !seller.siret) {
    issues.push(issue("SELLER_IDENTIFIER_MISSING", "seller", "EN 16931 exige un identifiant fiscal émetteur (TVA, SIREN ou SIRET) snapshoté. Aucune valeur n’est inventée."));
  }

  if (!buyer.name.trim()) {
    issues.push(issue("BUYER_NAME_MISSING", "buyer.name", "Le nom du destinataire snapshoté est obligatoire."));
  }
  if (!completeAddress(buyer.address)) {
    issues.push(issue("BUYER_ADDRESS_INCOMPLETE", "buyer.address", "L’adresse destinataire snapshotée (voie, code postal, ville, pays) est obligatoire."));
  }
  if (!partyCountry(buyer)) {
    issues.push(issue("BUYER_COUNTRY_MISSING", "buyer.countryCode", "Le pays du destinataire snapshoté est obligatoire."));
  }
  if (buyer.partyKind === "PERSON" && (buyer.siren || buyer.siret || buyer.vatNumber || buyer.legalName)) {
    issues.push(issue("BUYER_PERSON_IDENTIFIER_FORBIDDEN", "buyer", "Un particulier ne doit pas porter de SIREN, SIRET, TVA ou raison sociale dans le message électronique."));
  }
  if (buyer.partyKind === "COMPANY" && buyer.siren && !digitLen(buyer.siren, 9)) {
    issues.push(issue("BUYER_SIREN_INVALID", "buyer.siren", "Le SIREN destinataire snapshoté doit contenir 9 chiffres. companyNumber n’est jamais interprété."));
  }
  if (buyer.partyKind === "COMPANY" && buyer.siret && !digitLen(buyer.siret, 14)) {
    issues.push(issue("BUYER_SIRET_INVALID", "buyer.siret", "Le SIRET destinataire snapshoté doit contenir 14 chiffres."));
  }
  if (model.context.route === "E_INVOICING" && buyer.partyKind === "COMPANY" && !buyer.siren && !buyer.siret && !buyer.vatNumber) {
    issues.push(issue("BUYER_B2B_IDENTIFIER_MISSING", "buyer", "Le routage e-invoicing B2B France exigera plus tard un identifiant professionnel destinataire. Il est absent du snapshot.", "warning"));
  }
  if (buyer.partyKind === "COMPANY" && buyer.taxablePerson === null) {
    issues.push(issue("BUYER_TAXABLE_PERSON_UNKNOWN", "buyer.taxablePerson", "L’assujettissement TVA du destinataire professionnel n’est pas snapshoté. COMPANY n’implique pas l’assujettissement.", "warning"));
  }

  if (document.paymentTerms?.trim()) {
    issues.push(issue("PAYMENT_TERMS_UNCODED", "paymentTerms", "Les conditions de paiement snapshotées sont reprises en texte. Aucun code UNECE 4461 n’est déduit.", "warning"));
  }

  for (const [index, line] of model.lines.entries()) {
    const field = `lines[${index}]`;
    if (!line.description.trim()) {
      issues.push(issue("LINE_DESCRIPTION_MISSING", field, `La ligne ${index + 1} n’a pas de description historique.`));
    }
    if (line.quantityMilli <= 0 || !line.quantityXml) {
      issues.push(issue("LINE_QUANTITY_INVALID", field, `La quantité historique de la ligne ${index + 1} est invalide.`));
    }
    if (!line.unitCode) {
      issues.push(issue("UNIT_CODE_UNMAPPED", `${field}.unit`, `L’unité « ${line.unit ?? ""} » n’a pas de code UNECE Rec. 20 sûr. Aucun code n’est deviné.`));
    }
    if (line.vatBps > 0 && line.taxCategory && line.taxCategory !== "STANDARD") {
      issues.push(issue("VAT_CATEGORY_RATE_MISMATCH", `${field}.taxCategory`, `La ligne ${index + 1} a un taux positif incompatible avec ${line.taxCategory}.`));
    }
    if (line.vatBps > 0 && line.vatCategory !== "S") {
      issues.push(issue("VAT_CATEGORY_MISSING", `${field}.vatCategory`, `La ligne ${index + 1} a une TVA positive sans catégorie EN 16931 S.`));
    }
    if (line.vatBps === 0 && !line.taxCategory) {
      issues.push(issue("VAT_ZERO_CATEGORY_UNKNOWN", `${field}.vatBps`, "TVA 0 % n’est pas une qualification fiscale. Indiquez taux zéro, exonération, autoliquidation ou hors champ. Aucune catégorie n’est déduite."));
    }
    if (line.vatBps === 0 && line.taxCategory && !line.vatCategory) {
      issues.push(issue("VAT_ZERO_CATEGORY_UNKNOWN", `${field}.taxCategory`, `La qualification ${line.taxCategory} n’est pas traduisible en catégorie EN 16931 avec ce taux.`));
    }
    if (lineNeedsExemptionReason(line.taxCategory) && !line.exemptionReason && !line.exemptionReasonCode) {
      issues.push(issue("VAT_EXEMPTION_REASON_MISSING", `${field}.taxExemptionReason`, `La ligne ${index + 1} exige un motif d’exonération saisi. Aucune phrase juridique n’est générée depuis le taux 0 %.`));
    }
  }
  for (const [index, tax] of model.taxes.entries()) {
    if (tax.vatBps === 0 && !tax.taxCategory) {
      issues.push(issue("VAT_ZERO_CATEGORY_UNKNOWN", `taxes[${index}]`, "Une ventilation à 0 % ne peut pas être traduite en catégorie EN 16931 sans qualification snapshotée."));
    }
    if (lineNeedsExemptionReason(tax.taxCategory) && !tax.exemptionReason && !tax.exemptionReasonCode) {
      issues.push(issue("VAT_EXEMPTION_REASON_MISSING", `taxes[${index}]`, "La ventilation E/AE/O exige un motif d’exonération snapshoté."));
    }
  }

  return issues;
}

export function electronicErrors(issues: ElectronicIssue[]) {
  return issues.filter(item => item.severity === "error");
}

export function electronicWarnings(issues: ElectronicIssue[]) {
  return issues.filter(item => item.severity === "warning");
}
