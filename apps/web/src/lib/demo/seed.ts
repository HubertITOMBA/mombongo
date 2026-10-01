import { hash } from "argon2";
import { getDb } from "@/lib/db";
import { passwordOptions } from "@/lib/auth/service";
import { addAddress, createCustomer } from "@/lib/customers/service";
import { createCatalogItem } from "@/lib/catalog/service";
import { acceptQuote, addQuoteLine, cancelQuote, createQuote, refuseQuote, sendQuote } from "@/lib/quotes/service";
import { convertQuoteToInvoice, getInvoice } from "@/lib/invoices/service";
import { createCreditNote, issueCreditNote } from "@/lib/credit-notes/service";
import { recordPayment } from "@/lib/payments/service";
import { addOrganizationAddress, updateOrganizationIdentity } from "@/lib/organizations/service";
import { assertDemoMutationsAllowed, DEMO_DATASET_KEY, DEMO_PASSWORD } from "./guard";
import { purgeDemoDataset } from "./purge";

export type DemoSeedSummary = {
  key: string;
  organizationId: string;
  users: { role: string; email: string }[];
  customers: number;
  persons: number;
  companies: number;
  clients: number;
  prospects: number;
  catalogItems: number;
  quotes: number;
  invoices: number;
  creditNotes: number;
  payments: number;
};

type MemberRole = "OWNER" | "ADMIN" | "MEMBER" | "ACCOUNTANT";

const persons: Array<{ firstName: string; lastName: string; civility: "MR" | "MRS" | "MX"; kind: "CLIENT" | "PROSPECT"; city: string; postalCode: string }> = [
  { firstName: "Léa", lastName: "Moreau", civility: "MRS", kind: "CLIENT", city: "Lyon", postalCode: "69003" },
  { firstName: "Hugo", lastName: "Bernard", civility: "MR", kind: "CLIENT", city: "Lille", postalCode: "59000" },
  { firstName: "Inès", lastName: "Petit", civility: "MRS", kind: "PROSPECT", city: "Nantes", postalCode: "44000" },
  { firstName: "Noah", lastName: "Garcia", civility: "MR", kind: "CLIENT", city: "Toulouse", postalCode: "31000" },
  { firstName: "Chloé", lastName: "Roux", civility: "MRS", kind: "PROSPECT", city: "Bordeaux", postalCode: "33000" },
  { firstName: "Louis", lastName: "Fournier", civility: "MR", kind: "CLIENT", city: "Strasbourg", postalCode: "67000" },
  { firstName: "Manon", lastName: "Girard", civility: "MRS", kind: "CLIENT", city: "Rennes", postalCode: "35000" },
  { firstName: "Adam", lastName: "Bonnet", civility: "MR", kind: "PROSPECT", city: "Nice", postalCode: "06000" },
  { firstName: "Jade", lastName: "Dupont", civility: "MRS", kind: "CLIENT", city: "Montpellier", postalCode: "34000" },
  { firstName: "Léo", lastName: "Lambert", civility: "MR", kind: "PROSPECT", city: "Dijon", postalCode: "21000" },
  { firstName: "Sarah", lastName: "Chevalier", civility: "MRS", kind: "CLIENT", city: "Reims", postalCode: "51100" },
  { firstName: "Théo", lastName: "Fontaine", civility: "MX", kind: "PROSPECT", city: "Angers", postalCode: "49000" },
  { firstName: "Camille", lastName: "Blanc", civility: "MX", kind: "CLIENT", city: "Tours", postalCode: "37000" },
  { firstName: "Emma", lastName: "Gauthier", civility: "MRS", kind: "PROSPECT", city: "Clermont-Ferrand", postalCode: "63000" },
  { firstName: "Nathan", lastName: "Perrin", civility: "MR", kind: "CLIENT", city: "Le Havre", postalCode: "76600" },
];

const companies: Array<{ legalName: string; tradeName: string; kind: "CLIENT" | "PROSPECT"; city: string; postalCode: string; line1: string }> = [
  { legalName: "Atelier Nordique Fictif SAS", tradeName: "Nordique", kind: "CLIENT", city: "Roubaix", postalCode: "59100", line1: "12 rue des Métiers" },
  { legalName: "Société Brume Atlantique SARL", tradeName: "Brume", kind: "CLIENT", city: "La Rochelle", postalCode: "17000", line1: "8 quai des Fables" },
  { legalName: "Cabinet Horizon Cimenté SAS", tradeName: "Horizon", kind: "PROSPECT", city: "Orléans", postalCode: "45000", line1: "4 place Imaginaire" },
  { legalName: "Établissements Sable Clair EURL", tradeName: "Sable Clair", kind: "CLIENT", city: "Nîmes", postalCode: "30000", line1: "19 avenue des Contes" },
  { legalName: "Coopérative Feuille d’Exemple", tradeName: "Feuille", kind: "PROSPECT", city: "Limoges", postalCode: "87000", line1: "3 impasse Demo" },
  { legalName: "Holding Pavillon Inexistant SA", tradeName: "Pavillon", kind: "CLIENT", city: "Metz", postalCode: "57000", line1: "27 boulevard Inventé" },
  { legalName: "Studio Pixel de Papier SAS", tradeName: "Pixel Papier", kind: "CLIENT", city: "Grenoble", postalCode: "38000", line1: "6 allée des Maquettes" },
  { legalName: "Transports Rivière Secrète SARL", tradeName: "Rivière", kind: "PROSPECT", city: "Amiens", postalCode: "80000", line1: "15 rue du Quai Fictif" },
  { legalName: "Boulangerie Nuage d’Or EURL", tradeName: "Nuage d’Or", kind: "CLIENT", city: "Avignon", postalCode: "84000", line1: "1 place des Exemples" },
  { legalName: "Laboratoire Calme Technique SAS", tradeName: "Calme Tech", kind: "PROSPECT", city: "Besançon", postalCode: "25000", line1: "22 rue des Échantillons" },
  { legalName: "Agence Mistral d’Archive SARL", tradeName: "Mistral", kind: "CLIENT", city: "Perpignan", postalCode: "66000", line1: "9 cours des Hypothèses" },
  { legalName: "Ferme des Collines Imaginées", tradeName: "Collines", kind: "CLIENT", city: "Pau", postalCode: "64000", line1: "chemin du Pré Démo" },
  { legalName: "Éditions Phare de Carton SAS", tradeName: "Phare", kind: "PROSPECT", city: "Caen", postalCode: "14000", line1: "11 rue des Manuels" },
  { legalName: "Menuiserie Trait d’Union EURL", tradeName: "Trait d’Union", kind: "CLIENT", city: "Poitiers", postalCode: "86000", line1: "5 ruelle du Prototype" },
  { legalName: "Conseil Aurore Latente SAS", tradeName: "Aurore", kind: "PROSPECT", city: "Nancy", postalCode: "54000", line1: "18 avenue des Scénarios" },
  { legalName: "Marée de Silice SARL", tradeName: "Silice", kind: "CLIENT", city: "Brest", postalCode: "29200", line1: "2 rue du Port Inventé" },
  { legalName: "Hôtel des Pages Blanches SAS", tradeName: "Pages Blanches", kind: "CLIENT", city: "Annecy", postalCode: "74000", line1: "14 quai du Brouillon" },
  { legalName: "Atelier Verre de Nulle Part", tradeName: "Verre", kind: "PROSPECT", city: "Mulhouse", postalCode: "68100", line1: "7 rue des Fictions" },
  { legalName: "Logistique Étoile Calme SARL", tradeName: "Étoile Calme", kind: "CLIENT", city: "Le Mans", postalCode: "72000", line1: "31 zone des Cas tests" },
  { legalName: "Institut Brise Légère SAS", tradeName: "Brise", kind: "PROSPECT", city: "Toulon", postalCode: "83000", line1: "16 corniche des Données" },
  { legalName: "Imprimerie Encre d’Exemple", tradeName: "Encre", kind: "CLIENT", city: "Saint-Étienne", postalCode: "42000", line1: "10 rue du Tirage Fictif" },
  { legalName: "Cuisine Vent du Large EURL", tradeName: "Vent du Large", kind: "CLIENT", city: "Bayonne", postalCode: "64100", line1: "8 rue des Recettes" },
  { legalName: "Bureau Sphère Discrète SAS", tradeName: "Sphère", kind: "PROSPECT", city: "Troyes", postalCode: "10000", line1: "21 boulevard des Jeux" },
  { legalName: "Jardin des Hypothèses SARL", tradeName: "Hypothèses", kind: "CLIENT", city: "Aix-en-Provence", postalCode: "13100", line1: "4 allée des Spécimens" },
  { legalName: "Forge des Specimens Uniques", tradeName: "Forge", kind: "PROSPECT", city: "Chambéry", postalCode: "73000", line1: "13 chemin des Bancs" },
];

function tag(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 48) || "demo";
}

function userEmail(key: string, local: string) {
  return key === DEMO_DATASET_KEY ? `${local}@mombongo.demo.test` : `${local}.${tag(key)}@mombongo.demo.test`;
}

function customerEmail(key: string, local: string, official?: string) {
  if (official) return official;
  return key === DEMO_DATASET_KEY ? `${local}@mombongo.demo.test` : `${local}.${tag(key)}@mombongo.demo.test`;
}

function fictionalSiren(index: number) {
  return `9${String(10000000 + index).slice(-8)}`;
}

function limitKey(key: string, scope: string) {
  return `demo:${key}:${scope}`;
}

async function issuedInvoice(
  role: MemberRole,
  organizationId: string,
  userId: string,
  customerId: string,
  key: string,
  title: string,
  lines: Array<{ description: string; quantity: number; unit?: string; unitPriceCents: number; vatBps: number; itemKind?: "PRODUCT" | "SERVICE"; catalogItemId?: string }>,
) {
  const [first, ...rest] = lines;
  const quote = await createQuote(role, organizationId, {
    customerId,
    title,
    description: first.description,
    quantity: first.quantity,
    unit: first.unit,
    unitPriceCents: first.unitPriceCents,
    vatBps: first.vatBps,
    itemKind: first.itemKind ?? "SERVICE",
    catalogItemId: first.catalogItemId,
  }, limitKey(key, `quote-${title}`), userId);
  for (const line of rest) {
    await addQuoteLine(role, organizationId, {
      documentId: quote.id,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      vatBps: line.vatBps,
      itemKind: line.itemKind ?? "SERVICE",
      catalogItemId: line.catalogItemId,
    });
  }
  await sendQuote(role, organizationId, { documentId: quote.id }, userId);
  await acceptQuote(role, organizationId, { documentId: quote.id }, userId);
  const invoice = await convertQuoteToInvoice(role, organizationId, { documentId: quote.id }, userId);
  return getInvoice(organizationId, invoice.id);
}

export async function seedDemoDataset(key = DEMO_DATASET_KEY): Promise<DemoSeedSummary> {
  assertDemoMutationsAllowed();
  await purgeDemoDataset(key);
  const db = getDb();
  const passwordHash = await hash(DEMO_PASSWORD, passwordOptions);
  await db.demoDataset.create({ data: { key } });

  const accounts: Array<{ role: MemberRole; email: string; name: string }> = [
    { role: "OWNER", email: userEmail(key, "owner"), name: "Owner Démo" },
    { role: "ADMIN", email: userEmail(key, "admin"), name: "Admin Démo" },
    { role: "MEMBER", email: userEmail(key, "member"), name: "Membre Démo" },
    { role: "ACCOUNTANT", email: userEmail(key, "accountant"), name: "Comptable Démo" },
  ];
  const users = [];
  for (const account of accounts) {
    const clash = await db.user.findUnique({ where: { email: account.email } });
    if (clash) throw new Error(`L’adresse ${account.email} existe déjà hors du dataset DEMO ${key}.`);
    users.push(await db.user.create({
      data: {
        email: account.email,
        name: account.name,
        accountType: "BUSINESS",
        passwordHash,
        emailVerified: new Date(),
        demoDatasetKey: key,
      },
    }));
  }
  const owner = users[0]!;
  const organization = await db.organization.create({
    data: {
      name: key === DEMO_DATASET_KEY ? "Mombongo Démo" : `Mombongo Démo ${tag(key)}`,
      slug: `demo-${tag(key)}`,
      demoDatasetKey: key,
      currency: "EUR",
      timezone: "Europe/Paris",
    },
  });
  for (const [index, account] of accounts.entries()) {
    await db.membership.create({
      data: { userId: users[index]!.id, organizationId: organization.id, role: account.role },
    });
  }

  const identity = {
    name: organization.name,
    entityKind: "COMPANY" as const,
    legalName: "Mombongo Démonstration SAS",
    tradeName: "Mombongo Démo",
    legalFormLabel: "SAS",
    siren: "900000001",
    siret: "90000000100013",
    vatNumber: "FR00900000001",
    email: "emetteur@mombongo.demo.test",
    phone: "01 02 03 04 05",
    website: "https://mombongo.fr",
    countryCode: "FR" as const,
    currency: "EUR",
    timezone: "Europe/Paris",
    invoiceDueDays: 30,
    paymentTerms: "Paiement à 30 jours.",
    latePaymentPenaltyTerms: "Pénalités de retard au taux légal.",
    recoveryFeeMention: "Indemnité forfaitaire de 40 € pour frais de recouvrement.",
  };
  await updateOrganizationIdentity("OWNER", organization.id, identity);
  await addOrganizationAddress("OWNER", organization.id, {
    type: "BILLING",
    label: "Siège",
    line1: "42 rue des Fixtures",
    postalCode: "75011",
    city: "Paris",
    countryCode: "FR",
  });

  const catalog = [
    { itemKind: "PRODUCT" as const, reference: "CAH-A4", name: "Cahier A4", description: "Cahier 96 pages", unit: "pièce", unitPriceCents: 4.5, vatBps: 550 },
    { itemKind: "PRODUCT" as const, reference: "ENC-NOI", name: "Encre noire", description: "Cartouche fictive", unit: "pièce", unitPriceCents: 28, vatBps: 2000 },
    { itemKind: "PRODUCT" as const, reference: "PAP-80", name: "Ramette 80 g", description: "Papier A4", unit: "unité", unitPriceCents: 6.2, vatBps: 550 },
    { itemKind: "PRODUCT" as const, reference: "COL-S", name: "Colis standard", description: "Emballage", unit: "pièce", unitPriceCents: 3.1, vatBps: 2000 },
    { itemKind: "SERVICE" as const, reference: "AUD-01", name: "Audit organisation", description: "Journée d’audit", unit: "jour", unitPriceCents: 650, vatBps: 2000 },
    { itemKind: "SERVICE" as const, reference: "MAI-01", name: "Maintenance", description: "Forfait mensuel", unit: "forfait", unitPriceCents: 120, vatBps: 2000 },
    { itemKind: "SERVICE" as const, reference: "FOR-01", name: "Formation", description: "Demi-journée", unit: "heure", unitPriceCents: 90, vatBps: 1000 },
    { itemKind: "SERVICE" as const, reference: "HEB-01", name: "Hébergement", description: "Hébergement annuel", unit: "forfait", unitPriceCents: 240, vatBps: 2000 },
  ];
  const catalogItems = [];
  for (const [index, item] of catalog.entries()) {
    catalogItems.push(await createCatalogItem("OWNER", organization.id, item, limitKey(key, `catalog-${index}`)));
  }

  const createdPersons = [];
  for (const [index, person] of persons.entries()) {
    const official = index === 0 ? "delivered@resend.dev" : index === 1 ? "bounced@resend.dev" : index === 2 ? "complained@resend.dev" : undefined;
    const customer = await createCustomer("OWNER", organization.id, {
      partyKind: "PERSON",
      civility: person.civility,
      firstName: person.firstName,
      lastName: person.lastName,
      kind: person.kind,
      email: customerEmail(key, `person-${String(index + 1).padStart(2, "0")}`, official),
      phone: `06 12 34 56 ${String(10 + index).padStart(2, "0")}`,
      notes: index === 3
        ? "Scénario d’envoi personnel : remplacer le destinataire par mombongo.devo@gmail.com avant l’envoi."
        : "Contact fictif du dataset DEMO.",
    }, limitKey(key, `person-${index}`), owner.id);
    await addAddress("OWNER", organization.id, {
      customerId: customer.id,
      type: "BILLING",
      label: "Domicile",
      line1: `${10 + index} rue des Particuliers`,
      postalCode: person.postalCode,
      city: person.city,
      countryCode: "FR",
    });
    createdPersons.push(customer);
  }

  const createdCompanies = [];
  for (const [index, company] of companies.entries()) {
    const siren = fictionalSiren(index + 1);
    const customer = await createCustomer("OWNER", organization.id, {
      partyKind: "COMPANY",
      legalName: company.legalName.trim(),
      tradeName: company.tradeName,
      kind: company.kind,
      email: customerEmail(key, `company-${String(index + 1).padStart(2, "0")}`),
      phone: `01 45 67 89 ${String(10 + index).padStart(2, "0")}`,
      siren,
      siret: `${siren}0001${String(index % 10)}`,
      vatNumber: `FR88${siren}`,
      taxablePerson: true,
      notes: "Entreprise fictive du dataset DEMO. Identifiants non attribués.",
    }, limitKey(key, `company-${index}`), owner.id);
    await addAddress("OWNER", organization.id, {
      customerId: customer.id,
      type: "BILLING",
      label: "Facturation",
      line1: company.line1,
      postalCode: company.postalCode,
      city: company.city,
      countryCode: "FR",
    });
    if (index % 3 === 0) {
      await addAddress("OWNER", organization.id, {
        customerId: customer.id,
        type: "SHIPPING",
        label: "Livraison",
        line1: `${20 + index} entrepôt des Spécimens`,
        postalCode: company.postalCode,
        city: company.city,
        countryCode: "FR",
      });
    }
    createdCompanies.push(customer);
  }

  const role: MemberRole = "OWNER";
  const orgId = organization.id;
  const userId = owner.id;
  const delivered = createdPersons[0]!;
  const personal = createdPersons[3]!;
  const b2c = createdPersons[4]!;
  const b2b = createdCompanies[0]!;
  const mixed = createdCompanies[1]!;
  const chfCustomer = createdCompanies[2]!;

  await createQuote(role, orgId, {
    customerId: createdPersons[5]!.id,
    title: "Devis brouillon formation",
    description: "Préparation pédagogique",
    quantity: 1,
    unitPriceCents: 90,
    vatBps: 1000,
    itemKind: "SERVICE",
    catalogItemId: catalogItems[6]!.id,
  }, limitKey(key, "q-draft"), userId);

  const sentQuote = await createQuote(role, orgId, {
    customerId: delivered.id,
    title: "Devis envoyé — site vitrine",
    description: "Conception",
    quantity: 1,
    unitPriceCents: 1200,
    vatBps: 2000,
    itemKind: "SERVICE",
  }, limitKey(key, "q-sent"), userId);
  await sendQuote(role, orgId, { documentId: sentQuote.id }, userId);

  const acceptedQuote = await createQuote(role, orgId, {
    customerId: createdCompanies[3]!.id,
    title: "Devis accepté — maintenance",
    description: "Forfait mensuel",
    quantity: 1,
    unitPriceCents: 120,
    vatBps: 2000,
    catalogItemId: catalogItems[5]!.id,
  }, limitKey(key, "q-accepted"), userId);
  await sendQuote(role, orgId, { documentId: acceptedQuote.id }, userId);
  await acceptQuote(role, orgId, { documentId: acceptedQuote.id }, userId);

  const refusedQuote = await createQuote(role, orgId, {
    customerId: createdPersons[6]!.id,
    title: "Devis refusé — audit",
    description: "Journée d’audit",
    quantity: 1,
    unitPriceCents: 650,
    vatBps: 2000,
    catalogItemId: catalogItems[4]!.id,
  }, limitKey(key, "q-refused"), userId);
  await sendQuote(role, orgId, { documentId: refusedQuote.id }, userId);
  await refuseQuote(role, orgId, { documentId: refusedQuote.id }, userId);

  const cancelledQuote = await createQuote(role, orgId, {
    customerId: createdPersons[7]!.id,
    title: "Devis annulé — hébergement",
    description: "Hébergement annuel",
    quantity: 1,
    unitPriceCents: 240,
    vatBps: 2000,
    catalogItemId: catalogItems[7]!.id,
  }, limitKey(key, "q-cancelled"), userId);
  await cancelQuote(role, orgId, { documentId: cancelledQuote.id }, userId);

  await issuedInvoice(role, orgId, userId, delivered.id, key, "Facture à payer — accompagnement", [
    { description: "Accompagnement", quantity: 1, unitPriceCents: 800, vatBps: 2000 },
  ]);
  const overdue = await issuedInvoice(role, orgId, userId, createdCompanies[4]!.id, key, "Facture en retard — ramettes", [
    { description: "Ramette 80 g", quantity: 12, unit: "unité", unitPriceCents: 6.2, vatBps: 550, itemKind: "PRODUCT", catalogItemId: catalogItems[2]!.id },
  ]);
  const past = new Date();
  past.setUTCDate(past.getUTCDate() - 40);
  await db.document.update({ where: { id: overdue.id }, data: { issuedAt: past, dueDate: past } });

  const partial = await issuedInvoice(role, orgId, userId, b2b.id, key, "Facture partielle — audit", [
    { description: "Audit organisation", quantity: 1, unit: "jour", unitPriceCents: 650, vatBps: 2000, catalogItemId: catalogItems[4]!.id },
  ]);
  await recordPayment(role, orgId, { invoiceId: partial.id, amountCents: 300, method: "BANK_TRANSFER", reference: "VIR-DEMO-1" }, userId);

  const paid = await issuedInvoice(role, orgId, userId, createdCompanies[5]!.id, key, "Facture soldée — formation", [
    { description: "Formation", quantity: 4, unit: "heure", unitPriceCents: 90, vatBps: 1000, catalogItemId: catalogItems[6]!.id },
  ]);
  const paidLoaded = await getInvoice(orgId, paid.id);
  await recordPayment(role, orgId, { invoiceId: paid.id, amountCents: paidLoaded.ttcCents / 100, method: "CARD" }, userId);

  const credited = await issuedInvoice(role, orgId, userId, createdCompanies[6]!.id, key, "Facture soldée par avoir — colis", [
    { description: "Colis standard", quantity: 10, unit: "pièce", unitPriceCents: 3.1, vatBps: 2000, itemKind: "PRODUCT", catalogItemId: catalogItems[3]!.id },
  ]);
  const totalNote = await createCreditNote(role, orgId, { invoiceId: credited.id, mode: "TOTAL", creditReason: "Annulation de commande fictive" }, userId);
  await issueCreditNote(role, orgId, { documentId: totalNote.id }, userId);

  const mixedVat = await issuedInvoice(role, orgId, userId, mixed.id, key, "Facture mixte TVA et décimales", [
    { description: "Cahier A4", quantity: 1.5, unit: "pièce", unitPriceCents: 4.5, vatBps: 550, itemKind: "PRODUCT", catalogItemId: catalogItems[0]!.id },
    { description: "Encre noire", quantity: 2.75, unit: "pièce", unitPriceCents: 28, vatBps: 2000, itemKind: "PRODUCT", catalogItemId: catalogItems[1]!.id },
  ]);
  const mixedLoaded = await getInvoice(orgId, mixedVat.id);
  const firstLine = mixedLoaded.lines[0]!;
  const partialNote = await createCreditNote(role, orgId, {
    invoiceId: mixedVat.id,
    mode: "PARTIAL",
    creditReason: "Retour partiel de cahiers",
    [`quantity-${firstLine.id}`]: "0.5",
  }, userId);
  await issueCreditNote(role, orgId, { documentId: partialNote.id }, userId);

  await issuedInvoice(role, orgId, userId, b2c.id, key, "Facture B2C — maintenance", [
    { description: "Maintenance", quantity: 1, unitPriceCents: 120, vatBps: 2000, catalogItemId: catalogItems[5]!.id },
  ]);

  await issuedInvoice(role, orgId, userId, personal.id, key, "Facture test personnel Resend", [
    { description: "Prestation de démonstration", quantity: 1, unitPriceCents: 50, vatBps: 2000 },
  ]);

  await updateOrganizationIdentity("OWNER", orgId, { ...identity, currency: "CHF" });
  const chfInvoice = await issuedInvoice(role, orgId, userId, chfCustomer.id, key, "Facture CHF — conseil", [
    { description: "Conseil", quantity: 1, unitPriceCents: 400, vatBps: 2000 },
  ]);
  await updateOrganizationIdentity("OWNER", orgId, { ...identity, currency: "EUR" });
  await recordPayment(role, orgId, { invoiceId: chfInvoice.id, amountCents: 200, method: "BANK_TRANSFER", reference: "VIR-CHF-DEMO" }, userId);

  const [customerCounts, documentCounts, paymentCount] = await Promise.all([
    db.customer.groupBy({
      by: ["partyKind", "kind"],
      where: { organizationId: orgId },
      _count: true,
    }),
    db.document.groupBy({
      by: ["kind"],
      where: { organizationId: orgId },
      _count: true,
    }),
    db.payment.count({ where: { organizationId: orgId } }),
  ]);

  const countCustomers = (partyKind: "PERSON" | "COMPANY", kind?: "CLIENT" | "PROSPECT") =>
    customerCounts.filter(row => row.partyKind === partyKind && (kind ? row.kind === kind : true)).reduce((sum, row) => sum + row._count, 0);
  const countDocs = (kind: "QUOTE" | "INVOICE" | "CREDIT_NOTE") =>
    documentCounts.find(row => row.kind === kind)?._count ?? 0;

  return {
    key,
    organizationId: orgId,
    users: accounts.map(item => ({ role: item.role, email: item.email })),
    customers: createdPersons.length + createdCompanies.length,
    persons: countCustomers("PERSON"),
    companies: countCustomers("COMPANY"),
    clients: countCustomers("PERSON", "CLIENT") + countCustomers("COMPANY", "CLIENT"),
    prospects: countCustomers("PERSON", "PROSPECT") + countCustomers("COMPANY", "PROSPECT"),
    catalogItems: catalogItems.length,
    quotes: countDocs("QUOTE"),
    invoices: countDocs("INVOICE"),
    creditNotes: countDocs("CREDIT_NOTE"),
    payments: paymentCount,
  };
}

export async function inspectDemoDataset(key = DEMO_DATASET_KEY) {
  const db = getDb();
  const organization = await db.organization.findFirst({ where: { demoDatasetKey: key }, select: { id: true } });
  if (!organization) {
    return {
      key,
      organizations: 0,
      users: 0,
      customers: 0,
      persons: 0,
      companies: 0,
      clients: 0,
      prospects: 0,
      documents: 0,
      payments: 0,
    };
  }
  const [users, customers, persons, companies, clients, prospects, documents, payments] = await Promise.all([
    db.user.count({ where: { demoDatasetKey: key } }),
    db.customer.count({ where: { organizationId: organization.id } }),
    db.customer.count({ where: { organizationId: organization.id, partyKind: "PERSON" } }),
    db.customer.count({ where: { organizationId: organization.id, partyKind: "COMPANY" } }),
    db.customer.count({ where: { organizationId: organization.id, kind: "CLIENT" } }),
    db.customer.count({ where: { organizationId: organization.id, kind: "PROSPECT" } }),
    db.document.count({ where: { organizationId: organization.id } }),
    db.payment.count({ where: { organizationId: organization.id } }),
  ]);
  return { key, organizations: 1, users, customers, persons, companies, clients, prospects, documents, payments };
}
