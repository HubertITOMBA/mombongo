import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { addAddress, createCustomer, getCustomer, listCustomers, updateCustomer } from "../apps/web/src/lib/customers/service";
import { acceptQuote, createQuote, getQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { convertQuoteToInvoice, getInvoice } from "../apps/web/src/lib/invoices/service";
import { addOrganizationAddress, getOrganizationProfile, updateOrganizationIdentity } from "../apps/web/src/lib/organizations/service";
import { customerDisplayName } from "@mombongo/contracts";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `identity-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Entreprise identité") {
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

async function invoiceFromCustomer(owner: Awaited<ReturnType<typeof register>>, customerId: string, suffix: string) {
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId,
    title: `Prestation ${suffix}`,
    description: "Intervention",
    quantity: 1,
    unitPriceCents: 1000,
    vatBps: 2000,
  }, `${tag}-${suffix}-q`, owner.user.id);
  await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  return convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
}

after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, sourceDocumentId: { not: null } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.address.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("un particulier PERSON est créé sans SIREN, SIRET ni TVA, puis facturé", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "PERSON",
    firstName: "Marie",
    lastName: "Dupont",
    email: `${tag}-marie@client.test`,
    kind: "CLIENT",
  }, `${tag}-b2c`);
  assert.equal(customer.partyKind, "PERSON");
  assert.equal(customer.displayName, "Marie Dupont");
  assert.equal(customer.siren, null);
  assert.equal(customer.siret, null);
  assert.equal(customer.vatNumber, null);
  assert.equal(customer.legalName, null);
  assert.equal(customerDisplayName(customer), "Marie Dupont");
  const listed = await listCustomers(owner.membership.organizationId, { query: "Marie" });
  assert.equal(listed.some(item => item.id === customer.id), true);
  const invoice = await invoiceFromCustomer(owner, customer.id, "b2c");
  assert.equal(invoice.customerNameSnapshot, "Marie Dupont");
  assert.equal(invoice.customerCompanyNumberSnapshot, null);
  const loaded = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(loaded.customerNameSnapshot, "Marie Dupont");
});

test("un professionnel COMPANY conserve une identité structurée et peut être facturé", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    partyKind: "COMPANY",
    legalName: "Dupont Conseil",
    tradeName: "Atelier Dupont",
    siren: "123 456 789",
    siret: "12345678900014",
    vatNumber: "FR12345678901",
    kind: "CLIENT",
  }, `${tag}-b2b`);
  assert.equal(customer.partyKind, "COMPANY");
  assert.equal(customer.displayName, "Atelier Dupont");
  assert.equal(customer.siren, "123456789");
  assert.equal(customer.siret, "12345678900014");
  assert.equal(customer.vatNumber, "FR12345678901");
  const updated = await updateCustomer("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    partyKind: "COMPANY",
    legalName: "Dupont Conseil",
    tradeName: "Atelier Dupont Maj",
    siren: "123456789",
    siret: "12345678900014",
    vatNumber: "FR12345678901",
    kind: "CLIENT",
  });
  assert.equal(updated.displayName, "Atelier Dupont Maj");
  const invoice = await invoiceFromCustomer(owner, customer.id, "b2b");
  assert.equal(invoice.customerNameSnapshot, "Atelier Dupont Maj");
  await assert.rejects(
    () => createCustomer("OWNER", owner.membership.organizationId, {
      partyKind: "COMPANY",
      legalName: "Invalide",
      siren: "12",
      kind: "CLIENT",
    }, `${tag}-siren`),
    AuthFlowError,
  );
});

test("une fiche legacy reste lisible et ses documents historiques ne sont pas réécrits", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    displayName: "Ancienne fiche",
    companyNumber: "ABC-99",
    kind: "CLIENT",
  }, `${tag}-legacy`);
  assert.equal(customer.partyKind, null);
  assert.equal(customer.firstName, null);
  assert.equal(customer.siren, null);
  assert.equal(customer.siret, null);
  assert.equal(customer.companyNumber, "ABC-99");
  assert.equal(customerDisplayName(customer), "Ancienne fiche");
  const listed = await listCustomers(owner.membership.organizationId, { query: "Ancienne" });
  assert.equal(listed.some(item => item.id === customer.id), true);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Legacy",
    description: "Ligne",
    quantity: 1,
    unitPriceCents: 500,
    vatBps: 2000,
  }, `${tag}-leg-q`, owner.user.id);
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  assert.equal(sent.customerNameSnapshot, "Ancienne fiche");
  assert.equal(sent.customerCompanyNumberSnapshot, "ABC-99");
  await updateCustomer("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    displayName: "Nom actuel",
    companyNumber: "ABC-99",
    kind: "CLIENT",
  });
  const reloaded = await getQuote(owner.membership.organizationId, quote.id);
  assert.equal(reloaded.customerNameSnapshot, "Ancienne fiche");
  assert.equal(reloaded.customer.displayName, "Nom actuel");
});

test("l’identité de l’émetteur est isolée par organisation et réservée au propriétaire/administrateur", async () => {
  const first = await register("Entreprise Alpha");
  const second = await register("Entreprise Beta");
  await updateOrganizationIdentity("OWNER", first.membership.organizationId, {
    name: "Alpha",
    entityKind: "SOLE_TRADER",
    legalName: "Jean Martin",
    legalFormLabel: "EI",
    siren: "111222333",
    countryCode: "FR",
  });
  await updateOrganizationIdentity("OWNER", second.membership.organizationId, {
    name: "Beta",
    entityKind: "COMPANY",
    legalName: "Beta SAS",
    siren: "444555666",
    countryCode: "BE",
  });
  const profileA = await getOrganizationProfile(first.membership.organizationId);
  const profileB = await getOrganizationProfile(second.membership.organizationId);
  assert.equal(profileA.legalName, "Jean Martin");
  assert.equal(profileA.entityKind, "SOLE_TRADER");
  assert.equal(profileB.legalName, "Beta SAS");
  assert.equal(profileB.siren, "444555666");
  await addOrganizationAddress("OWNER", first.membership.organizationId, {
    type: "BILLING",
    label: "Siège A",
    line1: "1 rue Alpha",
    postalCode: "75001",
    city: "Paris",
    countryCode: "FR",
  });
  assert.equal((await getOrganizationProfile(first.membership.organizationId)).addresses.length, 1);
  assert.equal((await getOrganizationProfile(second.membership.organizationId)).addresses.length, 0);
  await assert.rejects(
    () => updateOrganizationIdentity("MEMBER", first.membership.organizationId, { name: "Intrus" }),
    AuthFlowError,
  );
  await assert.rejects(
    () => updateOrganizationIdentity("ACCOUNTANT", first.membership.organizationId, { name: "Intrus" }),
    AuthFlowError,
  );
  const customerA = await createCustomer("OWNER", first.membership.organizationId, {
    partyKind: "PERSON",
    firstName: "Client",
    lastName: "Alpha",
    kind: "CLIENT",
  }, `${tag}-iso-a`);
  await assert.rejects(() => getCustomer(second.membership.organizationId, customerA.id), AuthFlowError);
  await addAddress("OWNER", first.membership.organizationId, {
    customerId: customerA.id,
    type: "SHIPPING",
    label: "Livraison",
    line1: "2 rue Alpha",
    postalCode: "75002",
    city: "Paris",
    countryCode: "FR",
  });
  const loaded = await getCustomer(first.membership.organizationId, customerA.id);
  assert.equal(loaded.addresses[0].type, "SHIPPING");
  assert.equal(loaded.addresses[0].customerId, customerA.id);
});
