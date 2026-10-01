import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { extractText } from "unpdf";
import { formatMoney } from "@mombongo/contracts";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { addAddress, createCustomer, updateCustomer } from "../apps/web/src/lib/customers/service";
import { createCatalogItem, updateCatalogItem } from "../apps/web/src/lib/catalog/service";
import { acceptQuote, addQuoteLine, createQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { convertQuoteToInvoice, getInvoice } from "../apps/web/src/lib/invoices/service";
import { createCreditNote, issueCreditNote } from "../apps/web/src/lib/credit-notes/service";
import { addOrganizationAddress, updateOrganizationIdentity } from "../apps/web/src/lib/organizations/service";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
import { buildDocumentPrintModel } from "../apps/web/src/lib/pdf/model";
import { getPrintableDocument } from "../apps/web/src/lib/pdf/service";
import { centsToXmlAmount, milliToXmlQuantity, bpsToXmlPercent } from "../apps/web/src/lib/einvoice/money";
import { mapUnitCode } from "../apps/web/src/lib/einvoice/units";
import { facturXFilename } from "../apps/web/src/lib/einvoice/filename";
import { buildCrossIndustryInvoiceXml } from "../apps/web/src/lib/einvoice/cii";
import { extractFacturXXml } from "../apps/web/src/lib/einvoice/extract";
import { pdfContainsFacturXMarkers } from "../apps/web/src/lib/einvoice/facturx";
import { ElectronicInvoiceError } from "../apps/web/src/lib/einvoice/errors";
import { FACTURX_GUIDELINE_EN16931, FACTURX_XML_NAME } from "../apps/web/src/lib/einvoice/types";
import { buildOrganizationFacturX, inspectElectronicDocument, inspectOrganizationFacturX } from "../apps/web/src/lib/einvoice/service";
import { validateCiiXsdSubset } from "../apps/web/src/lib/einvoice/xsd";
import { validateEn16931Subset } from "../apps/web/src/lib/einvoice/en16931";
import { validatePdfA3Structure } from "../apps/web/src/lib/einvoice/pdfa";

config({ path: "apps/web/.env.local", quiet: true });
const tag = `einvoice-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Entreprise Factur-X") {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Compte test", accountType: "BUSINESS", organizationName }, `${tag}:${email}`);
  const user = await completeAuth(token, await codeFor(token.split(".")[0], 1), `${tag}:${email}`);
  assert.ok(user);
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: user.id } });
  return { email, user, membership };
}

async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}

async function frenchIssuer(owner: Awaited<ReturnType<typeof register>>, extras: Record<string, unknown> = {}) {
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Société A",
    legalName: "Société A",
    tradeName: "Atelier A",
    siren: "123456789",
    siret: "12345678900014",
    vatNumber: "FR12345678901",
    countryCode: "FR",
    paymentTerms: "Paiement à 30 jours.",
    currency: "EUR",
    ...extras,
  });
  await addOrganizationAddress("OWNER", owner.membership.organizationId, {
    type: "BILLING",
    label: "Siège A",
    line1: "10 rue A",
    postalCode: "75011",
    city: "Paris",
    countryCode: "FR",
  });
}

async function invoiceFrom(owner: Awaited<ReturnType<typeof register>>, customerId: string, input: {
  title: string;
  description: string;
  quantity?: number;
  unit?: string;
  unitPriceCents: number;
  vatBps: number;
  taxCategory?: "STANDARD" | "ZERO_RATED" | "EXEMPT" | "REVERSE_CHARGE" | "OUT_OF_SCOPE";
  taxExemptionReason?: string;
  taxExemptionReasonCode?: "FRANCE_FRANCHISE";
  catalogItemId?: string;
  extraLines?: Array<{
    description: string;
    quantity: number;
    unit?: string;
    unitPriceCents: number;
    vatBps: number;
    discountBps?: number;
    taxCategory?: "STANDARD" | "ZERO_RATED" | "EXEMPT" | "REVERSE_CHARGE" | "OUT_OF_SCOPE";
    taxExemptionReason?: string;
  }>;
}) {
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId,
    title: input.title,
    description: input.description,
    quantity: input.quantity ?? 1,
    unit: input.unit,
    unitPriceCents: input.unitPriceCents,
    vatBps: input.vatBps,
    taxCategory: input.taxCategory,
    taxExemptionReason: input.taxExemptionReason,
    taxExemptionReasonCode: input.taxExemptionReasonCode,
    catalogItemId: input.catalogItemId,
  }, `${tag}-${input.title}`, owner.user.id);
  for (const line of input.extraLines ?? []) {
    await addQuoteLine("OWNER", owner.membership.organizationId, {
      documentId: quote.id,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      vatBps: line.vatBps,
      discountBps: line.discountBps,
      taxCategory: line.taxCategory,
      taxExemptionReason: line.taxExemptionReason,
    });
  }
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  return getInvoice(owner.membership.organizationId, invoice.id);
}

after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.payment.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, kind: "CREDIT_NOTE" } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, sourceDocumentId: { not: null } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.catalogItem.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.address.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("les conversions XML et les unités UNECE restent déterministes", () => {
  assert.equal(centsToXmlAmount(100), "1.00");
  assert.equal(centsToXmlAmount(120), "1.20");
  assert.equal(centsToXmlAmount(0), "0.00");
  assert.equal(milliToXmlQuantity(1500), "1.5");
  assert.equal(milliToXmlQuantity(2750), "2.75");
  assert.equal(milliToXmlQuantity(1000), "1");
  assert.equal(bpsToXmlPercent(2000), "20.00");
  assert.equal(bpsToXmlPercent(1000), "10.00");
  assert.equal(mapUnitCode("heure").code, "HUR");
  assert.equal(mapUnitCode("jour").code, "DAY");
  assert.equal(mapUnitCode("kg").code, "KGM");
  assert.equal(mapUnitCode("pièce").code, "H87");
  assert.equal(mapUnitCode("unité").code, "C62");
  assert.equal(mapUnitCode("forfait").code, null);
  assert.equal(facturXFilename("INVOICE", "FA-2026-0001"), "facture-FA-2026-0001-factur-x.pdf");
  assert.equal(facturXFilename("CREDIT_NOTE", "AV-2026-0001"), "avoir-AV-2026-0001-factur-x.pdf");
});

test("une facture B2B France produit un Factur-X EN 16931 historique, multi-TVA et déterministe", async () => {
  const owner = await register("B2B France");
  await frenchIssuer(owner);
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Client A",
    tradeName: "Atelier Client A",
    siren: "111222333",
    siret: "11122233300011",
    vatNumber: "FR11122233300",
    taxablePerson: true,
    kind: "CLIENT",
  }, `${tag}-b2b-c`);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Facturation A",
    line1: "1 avenue Snapshot",
    postalCode: "69001",
    city: "Lyon",
    countryCode: "FR",
  });
  const catalog = await createCatalogItem("OWNER", owner.membership.organizationId, {
    itemKind: "SERVICE",
    name: "Service historique",
    unitPriceCents: 100,
    vatBps: 2000,
    unit: "heure",
  }, `${tag}-cat`);
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Mission B2B",
    description: "Conseil 20 %",
    quantity: 1.5,
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 2000,
    extraLines: [{ description: "Fourniture 10 %", quantity: 2.75, unit: "pièce", unitPriceCents: 40, vatBps: 1000 }],
  });
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Société B live",
    legalName: "Société B live",
    tradeName: "Atelier B",
    siren: "123456789",
    siret: "12345678900014",
    vatNumber: "FR12345678901",
    countryCode: "FR",
    currency: "USD",
  });
  await updateCustomer("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    partyKind: "COMPANY",
    legalName: "Client B",
    tradeName: "Atelier Client B",
    kind: "CLIENT",
  });
  await updateCatalogItem("OWNER", owner.membership.organizationId, {
    catalogItemId: catalog.id,
    itemKind: "SERVICE",
    name: "Service live",
    unitPriceCents: 999,
    vatBps: 0,
    unit: "forfait",
  });
  const first = await buildOrganizationFacturX(owner.membership.organizationId, invoice.id);
  const second = await buildOrganizationFacturX(owner.membership.organizationId, invoice.id);
  assert.equal(first.xml, second.xml);
  assert.equal(first.filename, `facture-${invoice.number}-factur-x.pdf`);
  assert.equal(first.metadata.route, "E_INVOICING");
  assert.equal(first.metadata.market, "B2B_FR");
  assert.equal(first.metadata.guidelineId, FACTURX_GUIDELINE_EN16931);
  assert.match(first.xml, /TypeCode>380</);
  assert.match(first.xml, /InvoiceCurrencyCode>EUR</);
  assert.match(first.xml, /1\.5/);
  assert.match(first.xml, /2\.75/);
  assert.match(first.xml, /unitCode="HUR"/);
  assert.match(first.xml, /unitCode="H87"/);
  assert.match(first.xml, /RateApplicablePercent>20\.00</);
  assert.match(first.xml, /RateApplicablePercent>10\.00</);
  assert.match(first.xml, /schemeID="0002">123456789</);
  assert.match(first.xml, /schemeID="0009">11122233300011</);
  assert.doesNotMatch(first.xml, /Société B live|Atelier B|Client B|Service live/);
  const extracted = await extractFacturXXml(first.bytes);
  assert.equal(extracted, first.xml);
  const markers = pdfContainsFacturXMarkers(first.bytes);
  assert.equal(markers.header, true);
  assert.equal(markers.xmlName, true);
  assert.equal(markers.relationship, true);
  assert.equal(markers.pdfa, true);
  assert.equal(markers.conformance, true);
  assert.equal(markers.outputIntent, true);
  assert.match(first.bytes.toString("latin1"), new RegExp(FACTURX_XML_NAME));
  const print = buildDocumentPrintModel(await getPrintableDocument(owner.membership.organizationId, invoice.id));
  const inspection = inspectElectronicDocument(invoice);
  assert.ok(inspection.model);
  assert.equal(print.numberLabel, inspection.model.document.number);
  assert.equal(print.currency, inspection.model.document.currency);
  assert.equal(print.issuer.name.includes("Atelier A") || print.issuer.name.includes("Société A"), true);
  assert.match(inspection.model.seller.name, /Société A|Atelier A/);
  assert.match(inspection.model.buyer.name, /Client A|Atelier Client A/);
  assert.equal(print.totals.htLabel, formatMoney(inspection.model.document.htCents, "EUR"));
  assert.equal(print.totals.vatLabel, formatMoney(inspection.model.document.vatCents, "EUR"));
  assert.equal(print.totals.ttcLabel, formatMoney(inspection.model.document.ttcCents, "EUR"));
  const pdfText = (await extractText(new Uint8Array(first.bytes), { mergePages: true })).text.replace(/\u00a0|\u202f/g, " ");
  assert.match(pdfText, /FACTURE/);
  assert.match(pdfText, /Atelier A|Société A/);
  assert.doesNotMatch(pdfText, /Société B live/);
});

test("une facture B2C France reste un particulier et se classe en e-reporting", async () => {
  const owner = await register("B2C France");
  await frenchIssuer(owner);
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "PERSON",
    civility: "MRS",
    firstName: "Marie",
    lastName: "Dupont",
    kind: "CLIENT",
  }, `${tag}-b2c`);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Domicile",
    line1: "8 rue des Lilas",
    postalCode: "33000",
    city: "Bordeaux",
    countryCode: "FR",
  });
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Cours particulier",
    description: "Heure de soutien",
    quantity: 2.75,
    unit: "heure",
    unitPriceCents: 40,
    vatBps: 2000,
  });
  const artifact = await buildOrganizationFacturX(owner.membership.organizationId, invoice.id);
  assert.equal(artifact.metadata.route, "E_REPORTING");
  assert.equal(artifact.metadata.market, "B2C_FR");
  assert.match(artifact.xml, /Marie Dupont/);
  assert.doesNotMatch(artifact.xml, /schemeID="0002">111|schemeID="0009">111|schemeID="VA">FR111/);
  const inspection = inspectElectronicDocument(invoice);
  assert.equal(inspection.model?.buyer.partyKind, "PERSON");
  assert.equal(inspection.model?.buyer.siren, null);
  assert.equal(inspection.model?.buyer.siret, null);
  assert.equal(inspection.model?.buyer.vatNumber, null);
});

test("un client professionnel étranger n’entre pas dans l’e-invoicing domestique", async () => {
  const owner = await register("B2B international");
  await frenchIssuer(owner, { currency: "USD" });
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Berlin GmbH",
    vatNumber: "DE123456789",
    taxablePerson: true,
    kind: "CLIENT",
  }, `${tag}-intl`);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Berlin",
    line1: "1 Alexanderplatz",
    postalCode: "10178",
    city: "Berlin",
    countryCode: "DE",
  });
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Export conseil",
    description: "Mission internationale",
    unit: "jour",
    unitPriceCents: 250,
    vatBps: 2000,
  });
  const artifact = await buildOrganizationFacturX(owner.membership.organizationId, invoice.id);
  assert.equal(artifact.metadata.route, "E_REPORTING");
  assert.equal(artifact.metadata.market, "B2B_INTL");
  assert.match(artifact.xml, /InvoiceCurrencyCode>USD</);
  assert.match(artifact.xml, /CountryID>DE</);
  assert.match(artifact.xml, /unitCode="DAY"/);
  assert.doesNotMatch(artifact.xml, /E_INVOICING/);
});

test("un avoir électronique référence la facture avec des magnitudes positives", async () => {
  const owner = await register("Avoir électronique");
  await frenchIssuer(owner);
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Dupont Conseil",
    siren: "111222333",
    siret: "11122233300011",
    vatNumber: "FR11122233300",
    taxablePerson: true,
    kind: "CLIENT",
  }, `${tag}-cn-c`);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Facturation",
    line1: "2 rue Client",
    postalCode: "69001",
    city: "Lyon",
    countryCode: "FR",
  });
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Audit",
    description: "Prestation",
    unit: "jour",
    unitPriceCents: 100,
    vatBps: 2000,
  });
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, {
    invoiceId: invoice.id,
    mode: "PARTIAL",
    creditReason: "Geste commercial",
    [`quantity-${invoice.lines[0]!.id}`]: "1",
  }, owner.user.id);
  const issued = await issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  const artifact = await buildOrganizationFacturX(owner.membership.organizationId, issued.id);
  assert.equal(artifact.filename, `avoir-${issued.number}-factur-x.pdf`);
  assert.match(artifact.xml, /TypeCode>381</);
  assert.match(artifact.xml, new RegExp(`IssuerAssignedID>${invoice.number}</`));
  assert.match(artifact.xml, /Geste commercial/);
  assert.doesNotMatch(artifact.xml, /LineTotalAmount>-/);
  const inspection = inspectElectronicDocument(await getPrintableDocument(owner.membership.organizationId, issued.id));
  assert.equal(inspection.model?.document.creditedInvoiceNumber, invoice.number);
  assert.ok((inspection.model?.document.htCents ?? 0) > 0);
});

test("un devis et une facture legacy incomplète n’inventent pas de Factur-X", async () => {
  const owner = await register("Legacy électronique");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Client historique", kind: "CLIENT" }, `${tag}-leg-c`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Devis seul",
    description: "Ligne",
    quantity: 1,
    unitPriceCents: 10,
    vatBps: 2000,
  }, `${tag}-quote`, owner.user.id);
  const quoteInspect = inspectElectronicDocument(await getPrintableDocument(owner.membership.organizationId, quote.id));
  assert.equal(quoteInspect.available, false);
  assert.equal(quoteInspect.issues.some(item => item.code === "DOCUMENT_KIND_UNSUPPORTED"), true);
  await frenchIssuer(owner);
  const billed = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Client A2",
    kind: "CLIENT",
  }, `${tag}-a2`);
  const invoice = await invoiceFrom(owner, billed.id, {
    title: "Legacy",
    description: "Maintenance",
    unitPriceCents: 2000,
    vatBps: 2000,
  });
  await getDb().document.update({
    where: { id: invoice.id },
    data: {
      issuerLegalNameSnapshot: null,
      issuerTradeNameSnapshot: null,
      issuerSirenSnapshot: null,
      issuerSiretSnapshot: null,
      issuerVatNumberSnapshot: null,
      issuerAddressJsonSnapshot: null,
      customerPartyKindSnapshot: null,
      customerAddressJsonSnapshot: null,
      customerSirenSnapshot: null,
      vatBreakdownSnapshot: null,
    },
  });
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Nom live interdit",
    legalName: "Nom live interdit",
    countryCode: "FR",
    currency: "EUR",
  });
  const inspected = await inspectOrganizationFacturX(owner.membership.organizationId, invoice.id);
  assert.equal(inspected.available, false);
  assert.ok(inspected.issues.some(item => item.code === "SELLER_IDENTIFIER_MISSING" || item.code === "SELLER_ADDRESS_INCOMPLETE"));
  assert.doesNotMatch(JSON.stringify(inspected.model), /Nom live interdit/);
  await assert.rejects(() => buildOrganizationFacturX(owner.membership.organizationId, invoice.id), (error: unknown) => {
    assert.ok(error instanceof ElectronicInvoiceError);
    assert.equal(error.status, 422);
    assert.ok(error.issues.length > 0);
    return true;
  });
});

test("une unité non mappée ou une TVA 0 % sans catégorie bloque le message électronique", async () => {
  const owner = await register("Unités TVA");
  await frenchIssuer(owner);
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Client Unité",
    siren: "111222333",
    siret: "11122233300011",
    vatNumber: "FR11122233300",
    taxablePerson: true,
    kind: "CLIENT",
  }, `${tag}-unit`);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Facturation",
    line1: "3 rue Unité",
    postalCode: "75001",
    city: "Paris",
    countryCode: "FR",
  });
  const unmapped = await invoiceFrom(owner, customer.id, {
    title: "Forfait",
    description: "Lot",
    unit: "forfait",
    unitPriceCents: 50,
    vatBps: 2000,
  });
  const zero = await invoiceFrom(owner, customer.id, {
    title: "Zero",
    description: "Exonération indéterminée",
    unit: "unité",
    unitPriceCents: 50,
    vatBps: 0,
  });
  const unmappedInspect = inspectElectronicDocument(unmapped);
  const zeroInspect = inspectElectronicDocument(zero);
  assert.equal(unmappedInspect.issues.some(item => item.code === "UNIT_CODE_UNMAPPED"), true);
  assert.equal(zeroInspect.issues.some(item => item.code === "VAT_ZERO_CATEGORY_UNKNOWN"), true);
  assert.equal(unmappedInspect.available, false);
  assert.equal(zeroInspect.available, false);
});

test("l’isolation organisation refuse le Factur-X d’une autre entreprise", async () => {
  const ownerA = await register("Org e-invoice A");
  const ownerB = await register("Org e-invoice B");
  await frenchIssuer(ownerA);
  const customer = await createCustomer("OWNER", ownerA.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Client A",
    siren: "111222333",
    siret: "11122233300011",
    vatNumber: "FR11122233300",
    taxablePerson: true,
    kind: "CLIENT",
  }, `${tag}-iso`);
  await addAddress("OWNER", ownerA.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Facturation",
    line1: "1 rue A",
    postalCode: "75001",
    city: "Paris",
    countryCode: "FR",
  });
  const invoice = await invoiceFrom(ownerA, customer.id, {
    title: "Secret",
    description: "Confidentiel",
    unit: "heure",
    unitPriceCents: 80,
    vatBps: 2000,
  });
  await assert.rejects(() => inspectOrganizationFacturX(ownerB.membership.organizationId, invoice.id), (error: unknown) => {
    assert.ok(error instanceof AuthFlowError);
    assert.equal(error.status, 404);
    return true;
  });
  const xml = buildCrossIndustryInvoiceXml((await inspectOrganizationFacturX(ownerA.membership.organizationId, invoice.id)).model!);
  assert.match(xml, new RegExp(FACTURX_GUIDELINE_EN16931));
});

test("une TVA 0 % qualifiée produit un CII E/Z/AE et un vatBps=0 sans qualification est refusé", async () => {
  const owner = await register("TVA qualifiée");
  await frenchIssuer(owner);
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Client Fiscal",
    siren: "111222333",
    siret: "11122233300011",
    vatNumber: "FR11122233300",
    taxablePerson: true,
    kind: "CLIENT",
  }, `${tag}-tax`);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Facturation",
    line1: "4 rue Fiscale",
    postalCode: "75002",
    city: "Paris",
    countryCode: "FR",
  });
  const exempt = await invoiceFrom(owner, customer.id, {
    title: "Exonéré",
    description: "Formation",
    unit: "heure",
    unitPriceCents: 80,
    vatBps: 0,
    taxCategory: "EXEMPT",
    taxExemptionReason: "Exonération formation professionnelle",
    extraLines: [{ description: "Taux zéro", quantity: 1, unit: "unité", unitPriceCents: 20, vatBps: 0, taxCategory: "ZERO_RATED" }],
  });
  const reverse = await invoiceFrom(owner, customer.id, {
    title: "Autoliquidation",
    description: "Sous-traitance",
    unit: "jour",
    unitPriceCents: 200,
    vatBps: 0,
    taxCategory: "REVERSE_CHARGE",
    taxExemptionReason: "Autoliquidation demandée par le client",
  });
  const exemptArtifact = await buildOrganizationFacturX(owner.membership.organizationId, exempt.id);
  assert.match(exemptArtifact.xml, /CategoryCode>E</);
  assert.match(exemptArtifact.xml, /CategoryCode>Z</);
  assert.match(exemptArtifact.xml, /ExemptionReason>Exonération formation professionnelle</);
  assert.doesNotMatch(exemptArtifact.xml, /CategoryCode>S</);
  const reverseArtifact = await buildOrganizationFacturX(owner.membership.organizationId, reverse.id);
  assert.match(reverseArtifact.xml, /CategoryCode>AE</);
  assert.match(reverseArtifact.xml, /ExemptionReasonCode>VATEX-EU-AE</);
  assert.equal(exemptArtifact.validation.valid, true);
  const zero = await invoiceFrom(owner, customer.id, {
    title: "Zero nu",
    description: "Sans qualification",
    unit: "unité",
    unitPriceCents: 50,
    vatBps: 0,
  });
  const zeroInspect = inspectElectronicDocument(zero);
  assert.equal(zeroInspect.issues.some(item => item.code === "VAT_ZERO_CATEGORY_UNKNOWN"), true);
  assert.equal(zeroInspect.available, false);
});

test("le catalogue fiscal A reste snapshoté après modification live B", async () => {
  const owner = await register("Historique fiscal");
  await frenchIssuer(owner);
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Client Hist",
    siren: "111222333",
    siret: "11122233300011",
    vatNumber: "FR11122233300",
    taxablePerson: true,
    kind: "CLIENT",
  }, `${tag}-hist-f`);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Facturation",
    line1: "5 rue Hist",
    postalCode: "75003",
    city: "Paris",
    countryCode: "FR",
  });
  const catalog = await createCatalogItem("OWNER", owner.membership.organizationId, {
    itemKind: "SERVICE",
    name: "Article A",
    unitPriceCents: 100,
    vatBps: 0,
    unit: "heure",
    taxCategory: "EXEMPT",
    taxExemptionReason: "Motif A",
  }, `${tag}-hist-cat`);
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Copie A",
    description: "Article A",
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 0,
    taxCategory: "EXEMPT",
    taxExemptionReason: "Motif A",
    catalogItemId: catalog.id,
  });
  await updateCatalogItem("OWNER", owner.membership.organizationId, {
    catalogItemId: catalog.id,
    itemKind: "SERVICE",
    name: "Article B",
    unitPriceCents: 999,
    vatBps: 2000,
    unit: "forfait",
    taxCategory: "STANDARD",
  });
  const inspection = inspectElectronicDocument(invoice);
  assert.equal(inspection.model?.lines[0]?.taxCategory, "EXEMPT");
  assert.equal(inspection.model?.lines[0]?.unitCode, "HUR");
  assert.equal(inspection.model?.lines[0]?.exemptionReason, "Motif A");
  assert.equal(inspection.model?.lines[0]?.vatBps, 0);
  assert.match((await buildOrganizationFacturX(owner.membership.organizationId, invoice.id)).xml, /CategoryCode>E</);
});

test("un professionnel français sans assujettissement connu passe en revue requise", async () => {
  const owner = await register("Revue B2B");
  await frenchIssuer(owner);
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Client sans assujettissement",
    siren: "111222333",
    siret: "11122233300011",
    vatNumber: "FR11122233300",
    kind: "CLIENT",
  }, `${tag}-review`);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Facturation",
    line1: "6 rue Revue",
    postalCode: "75004",
    city: "Paris",
    countryCode: "FR",
  });
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Revue",
    description: "Conseil",
    unit: "heure",
    unitPriceCents: 80,
    vatBps: 2000,
  });
  const inspection = inspectElectronicDocument(invoice);
  assert.equal(inspection.model?.context.route, "REVIEW_REQUIRED");
  assert.equal(inspection.model?.buyer.taxablePerson, null);
  assert.equal(inspection.available, true);
});

test("un particulier B2C conserve sa qualification de ligne indépendamment du partyKind", async () => {
  const owner = await register("B2C TVA ligne");
  await frenchIssuer(owner);
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "PERSON",
    civility: "MR",
    firstName: "Paul",
    lastName: "Martin",
    kind: "CLIENT",
  }, `${tag}-b2c-tax`);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Domicile",
    line1: "9 rue Verte",
    postalCode: "44000",
    city: "Nantes",
    countryCode: "FR",
  });
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Cours",
    description: "Heure",
    unit: "heure",
    unitPriceCents: 40,
    vatBps: 550,
  });
  const inspection = inspectElectronicDocument(invoice);
  assert.equal(inspection.model?.buyer.partyKind, "PERSON");
  assert.equal(inspection.model?.buyer.siren, null);
  assert.equal(inspection.model?.lines[0]?.taxCategory, "STANDARD");
  assert.equal(inspection.model?.lines[0]?.vatCategory, "S");
  assert.equal(inspection.model?.lines[0]?.vatBps, 550);
  const artifact = await buildOrganizationFacturX(owner.membership.organizationId, invoice.id);
  assert.equal(artifact.metadata.route, "E_REPORTING");
  assert.doesNotMatch(artifact.xml, /schemeID="0002">111|schemeID="0009">111|schemeID="VA">FR111/);
});

test("une facture legacy sans unité structurée reste PDF-ok et refuse le Factur-X", async () => {
  const owner = await register("Legacy unités");
  await frenchIssuer(owner);
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Client Legacy",
    siren: "111222333",
    siret: "11122233300011",
    vatNumber: "FR11122233300",
    taxablePerson: true,
    kind: "CLIENT",
  }, `${tag}-leg-u`);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Facturation",
    line1: "7 rue Legacy",
    postalCode: "75005",
    city: "Paris",
    countryCode: "FR",
  });
  const invoice = await invoiceFrom(owner, customer.id, {
    title: "Legacy forfait",
    description: "Lot historique",
    unit: "unité",
    unitPriceCents: 100,
    vatBps: 2000,
  });
  await getDb().documentLine.updateMany({
    where: { documentId: invoice.id },
    data: { unit: "forfait", unitCode: null, taxCategory: null, vatBps: 0 },
  });
  const print = buildDocumentPrintModel(await getPrintableDocument(owner.membership.organizationId, invoice.id));
  assert.ok(print.lines[0]?.unit.includes("forfait") || print.lines[0]?.unit);
  const inspected = inspectElectronicDocument(await getPrintableDocument(owner.membership.organizationId, invoice.id));
  assert.equal(inspected.available, false);
  assert.ok(inspected.issues.some(item => item.code === "UNIT_CODE_UNMAPPED" || item.code === "VAT_ZERO_CATEGORY_UNKNOWN"));
});

test("les validateurs XSD, EN 16931 et PDF/A échouent sur des fixtures invalides", () => {
  const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100">
  <rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>nope</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument><ram:ID>X</ram:ID></rsm:ExchangedDocument>
</rsm:CrossIndustryInvoice>`;
  const xsdIssues = validateCiiXsdSubset(invalidXml);
  assert.ok(xsdIssues.some(item => item.code.startsWith("XSD_")));
  const model = inspectElectronicDocument({
    kind: "INVOICE",
    status: "SENT",
    number: "FA-1",
    title: "X",
    notes: null,
    issuedAt: new Date("2026-09-01T12:00:00.000Z"),
    dueDate: null,
    supplyDate: null,
    customerOrderNumber: null,
    creditReason: null,
    htCents: 100,
    vatCents: 0,
    ttcCents: 100,
    issuerNameSnapshot: "Société A",
    issuerCurrencySnapshot: "EUR",
    issuerLegalNameSnapshot: "Société A",
    issuerTradeNameSnapshot: null,
    issuerLegalFormLabelSnapshot: null,
    issuerSirenSnapshot: "123456789",
    issuerSiretSnapshot: "12345678900014",
    issuerVatNumberSnapshot: "FR12345678901",
    issuerEmailSnapshot: null,
    issuerPhoneSnapshot: null,
    issuerCountryCodeSnapshot: "FR",
    issuerAddressJsonSnapshot: { line1: "10 rue A", line2: null, postalCode: "75011", city: "Paris", countryCode: "FR" },
    paymentTermsSnapshot: null,
    customerNameSnapshot: "Client A",
    customerEmailSnapshot: null,
    customerPhoneSnapshot: null,
    customerAddressJsonSnapshot: { line1: "1 rue B", line2: null, postalCode: "69001", city: "Lyon", countryCode: "FR" },
    customerPartyKindSnapshot: "COMPANY",
    customerCivilitySnapshot: null,
    customerFirstNameSnapshot: null,
    customerLastNameSnapshot: null,
    customerLegalNameSnapshot: "Client A",
    customerTradeNameSnapshot: null,
    customerSirenSnapshot: "111222333",
    customerSiretSnapshot: "11122233300011",
    customerVatNumberSnapshot: "FR11122233300",
    customerCountryCodeSnapshot: "FR",
    customerTaxablePersonSnapshot: true,
    customerDeliveryAddressJsonSnapshot: null,
    vatBreakdownSnapshot: [{ vatBps: 0, htCents: 100, vatCents: 0 }],
    lines: [{
      description: "Ligne",
      quantity: 1,
      unit: "heure",
      unitCode: "HUR",
      unitPriceCents: 100,
      discountBps: 0,
      vatBps: 0,
      taxCategory: "EXEMPT",
      taxExemptionReason: null,
      taxExemptionReasonCode: null,
      htCents: 100,
      vatCents: 0,
      ttcCents: 100,
      itemKind: "SERVICE",
      position: 0,
    }],
  }).model!;
  const ruleIssues = validateEn16931Subset(model);
  assert.ok(ruleIssues.some(item => item.code === "BR-E-10"));
  const pdfIssues = validatePdfA3Structure(Buffer.from("%PDF-1.4\ntrailer\n%%EOF", "utf8"));
  assert.ok(pdfIssues.some(item => item.code.startsWith("PDFA_")));
});

