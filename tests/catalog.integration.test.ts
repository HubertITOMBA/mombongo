import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { createCustomer } from "../apps/web/src/lib/customers/service";
import {
  createCatalogItem,
  deactivateCatalogItem,
  getCatalogItem,
  listCatalogItems,
  reactivateCatalogItem,
  updateCatalogItem,
} from "../apps/web/src/lib/catalog/service";
import { acceptQuote, addQuoteLine, createQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { convertQuoteToInvoice, getInvoice } from "../apps/web/src/lib/invoices/service";
import { canManageCatalog } from "../apps/web/src/lib/auth/permissions";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
import type { MemberRole } from "../apps/web/src/generated/prisma/client";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `catalog-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Entreprise catalogue") {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Compte test", accountType: "BUSINESS", organizationName }, `${tag}:${email}`);
  const user = await completeAuth(token, await codeFor(token.split(".")[0], 1), `${tag}:${email}`);
  assert.ok(user);
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: user.id } });
  return { email, user, membership };
}

async function colleague(organizationId: string, role: Exclude<MemberRole, "OWNER">) {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const user = await getDb().user.create({ data: { email, accountType: "BUSINESS", name: role } });
  await getDb().membership.create({ data: { userId: user.id, organizationId, role } });
  return user;
}

async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}

after(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, sourceDocumentId: { not: null } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.catalogItem.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("un article catalogue copie ses valeurs puis reste indépendant du devis et de la facture", async () => {
  const owner = await register();
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Client catalogue", kind: "CLIENT" }, `${tag}-hist-c`);
  const item = await createCatalogItem("OWNER", owner.membership.organizationId, {
    itemKind: "SERVICE",
    reference: "CONSULT-01",
    name: "Consultation",
    description: "A.",
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 2000,
  }, `${tag}-hist`);
  assert.equal(item.unitPriceCents, 10000);
  assert.equal(item.active, true);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Mission",
    catalogItemId: item.id,
    description: "A.",
    quantity: 1,
    unit: "heure",
    unitPriceCents: 100,
    vatBps: 2000,
    itemKind: "SERVICE",
  }, `${tag}-hist-q`, owner.user.id);
  assert.equal(quote.lines[0]?.description, "A.");
  assert.equal(quote.lines[0]?.unitPriceCents, 10000);
  assert.equal(quote.lines[0]?.vatBps, 2000);
  assert.equal(quote.lines[0]?.itemKind, "SERVICE");
  assert.equal(quote.htCents, 10000);
  assert.equal(quote.vatCents, 2000);
  assert.equal(quote.ttcCents, 12000);
  await updateCatalogItem("OWNER", owner.membership.organizationId, {
    catalogItemId: item.id,
    itemKind: "SERVICE",
    reference: "CONSULT-01",
    name: "Consultation",
    description: "B.",
    unit: "jour",
    unitPriceCents: 150,
    vatBps: 1000,
  });
  const unchanged = await getDb().document.findFirstOrThrow({
    where: { id: quote.id, organizationId: owner.membership.organizationId },
    include: { lines: true },
  });
  assert.equal(unchanged.lines[0]?.description, "A.");
  assert.equal(unchanged.lines[0]?.unitPriceCents, 10000);
  assert.equal(unchanged.lines[0]?.vatBps, 2000);
  assert.equal(unchanged.lines[0]?.unit, "heure");
  const sent = await sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: sent.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  const loaded = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(loaded.lines[0]?.description, "A.");
  assert.equal(loaded.lines[0]?.unitPriceCents, 10000);
  assert.equal(loaded.lines[0]?.vatBps, 2000);
  assert.equal(loaded.htCents, 10000);
});

test("une ligne libre reste possible et une ID catalogue étrangère est refusée", async () => {
  const first = await register("Entreprise A");
  const second = await register("Entreprise B");
  const itemA = await createCatalogItem("OWNER", first.membership.organizationId, {
    itemKind: "PRODUCT",
    name: "Clavier A",
    unitPriceCents: 40,
    vatBps: 2000,
  }, `${tag}-iso-a`);
  const itemB = await createCatalogItem("OWNER", second.membership.organizationId, {
    itemKind: "PRODUCT",
    name: "Clavier B",
    unitPriceCents: 80,
    vatBps: 2000,
  }, `${tag}-iso-b`);
  assert.equal((await listCatalogItems(first.membership.organizationId)).map(item => item.id).join(), itemA.id);
  await assert.rejects(() => getCatalogItem(first.membership.organizationId, itemB.id), AuthFlowError);
  await assert.rejects(
    () => updateCatalogItem("OWNER", first.membership.organizationId, {
      catalogItemId: itemB.id,
      itemKind: "PRODUCT",
      name: "Intrus",
      unitPriceCents: 1,
      vatBps: 2000,
    }),
    AuthFlowError,
  );
  await assert.rejects(
    () => deactivateCatalogItem("OWNER", first.membership.organizationId, { catalogItemId: itemB.id }),
    AuthFlowError,
  );
  const customer = await createCustomer("OWNER", first.membership.organizationId, { displayName: "Client A", kind: "CLIENT" }, `${tag}-iso-c`);
  await assert.rejects(
    () => createQuote("OWNER", first.membership.organizationId, {
      customerId: customer.id,
      title: "Intrus",
      catalogItemId: itemB.id,
      description: "Clavier B",
      quantity: 1,
      unitPriceCents: 80,
      vatBps: 2000,
      itemKind: "PRODUCT",
    }, `${tag}-iso-q`, first.user.id),
    AuthFlowError,
  );
  const free = await createQuote("OWNER", first.membership.organizationId, {
    customerId: customer.id,
    title: "Libre",
    description: "Ligne libre",
    quantity: 1,
    unitPriceCents: 25,
    vatBps: 2000,
  }, `${tag}-free`, first.user.id);
  assert.equal(free.lines[0]?.description, "Ligne libre");
  assert.equal(free.htCents, 2500);
});

test("la désactivation retire l’article du sélecteur sans toucher l’historique", async () => {
  const owner = await register("Désactivation");
  const customer = await createCustomer("OWNER", owner.membership.organizationId, { displayName: "Client actif", kind: "CLIENT" }, `${tag}-off-c`);
  const item = await createCatalogItem("OWNER", owner.membership.organizationId, {
    itemKind: "SERVICE",
    name: "Maintenance",
    description: "Contrat",
    unitPriceCents: 90,
    vatBps: 2000,
  }, `${tag}-off`);
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Contrat",
    catalogItemId: item.id,
    description: "Contrat",
    quantity: 1,
    unitPriceCents: 90,
    vatBps: 2000,
    itemKind: "SERVICE",
  }, `${tag}-off-q`, owner.user.id);
  await deactivateCatalogItem("OWNER", owner.membership.organizationId, { catalogItemId: item.id });
  const still = await getDb().document.findFirstOrThrow({
    where: { id: quote.id },
    include: { lines: true },
  });
  assert.equal(still.lines[0]?.unitPriceCents, 9000);
  assert.equal((await listCatalogItems(owner.membership.organizationId)).length, 0);
  assert.equal((await listCatalogItems(owner.membership.organizationId, { active: "ALL" })).length, 1);
  await assert.rejects(
    () => addQuoteLine("OWNER", owner.membership.organizationId, {
      documentId: quote.id,
      catalogItemId: item.id,
      description: "Contrat",
      quantity: 1,
      unitPriceCents: 90,
      vatBps: 2000,
      itemKind: "SERVICE",
    }),
    AuthFlowError,
  );
  await reactivateCatalogItem("OWNER", owner.membership.organizationId, { catalogItemId: item.id });
  assert.equal((await listCatalogItems(owner.membership.organizationId))[0]?.id, item.id);
});

test("OWNER ADMIN MEMBER gèrent le catalogue ; ACCOUNTANT lit sans écrire", async () => {
  assert.equal(canManageCatalog("OWNER"), true);
  assert.equal(canManageCatalog("ADMIN"), true);
  assert.equal(canManageCatalog("MEMBER"), true);
  assert.equal(canManageCatalog("ACCOUNTANT"), false);
  const owner = await register("Droits catalogue");
  await colleague(owner.membership.organizationId, "ADMIN");
  await colleague(owner.membership.organizationId, "MEMBER");
  await colleague(owner.membership.organizationId, "ACCOUNTANT");
  const byOwner = await createCatalogItem("OWNER", owner.membership.organizationId, {
    itemKind: "SERVICE",
    name: "Par propriétaire",
    unitPriceCents: 10,
    vatBps: 2000,
  }, `${tag}-perm-o`);
  const byAdmin = await createCatalogItem("ADMIN", owner.membership.organizationId, {
    itemKind: "PRODUCT",
    name: "Par admin",
    unitPriceCents: 12,
    vatBps: 2000,
  }, `${tag}-perm-a`);
  const byMember = await createCatalogItem("MEMBER", owner.membership.organizationId, {
    itemKind: "SERVICE",
    name: "Par membre",
    unitPriceCents: 14,
    vatBps: 2000,
  }, `${tag}-perm-m`);
  assert.ok(byOwner.id && byAdmin.id && byMember.id);
  await assert.rejects(
    () => createCatalogItem("ACCOUNTANT", owner.membership.organizationId, {
      itemKind: "SERVICE",
      name: "Interdit",
      unitPriceCents: 1,
      vatBps: 2000,
    }, `${tag}-perm-acc`),
    error => error instanceof AuthFlowError && error.status === 403,
  );
  const listed = await listCatalogItems(owner.membership.organizationId);
  assert.equal(listed.length, 3);
  await updateCatalogItem("ADMIN", owner.membership.organizationId, {
    catalogItemId: byOwner.id,
    itemKind: "SERVICE",
    name: "Mis à jour",
    unitPriceCents: 11,
    vatBps: 2000,
  });
  await deactivateCatalogItem("MEMBER", owner.membership.organizationId, { catalogItemId: byAdmin.id });
  await assert.rejects(
    () => deactivateCatalogItem("ACCOUNTANT", owner.membership.organizationId, { catalogItemId: byMember.id }),
    error => error instanceof AuthFlowError && error.status === 403,
  );
});

test("une référence renseignée est unique par organisation, les absentes restent autorisées", async () => {
  const first = await register("Réf A");
  const second = await register("Réf B");
  await createCatalogItem("OWNER", first.membership.organizationId, {
    itemKind: "SERVICE",
    reference: "DEV-WEB",
    name: "Site",
    unitPriceCents: 500,
    vatBps: 2000,
  }, `${tag}-ref-1`);
  await assert.rejects(
    () => createCatalogItem("OWNER", first.membership.organizationId, {
      itemKind: "SERVICE",
      reference: "DEV-WEB",
      name: "Doublon",
      unitPriceCents: 400,
      vatBps: 2000,
    }, `${tag}-ref-2`),
    AuthFlowError,
  );
  const other = await createCatalogItem("OWNER", second.membership.organizationId, {
    itemKind: "SERVICE",
    reference: "DEV-WEB",
    name: "Site B",
    unitPriceCents: 500,
    vatBps: 2000,
  }, `${tag}-ref-b`);
  assert.equal(other.reference, "DEV-WEB");
  const firstBlank = await createCatalogItem("OWNER", first.membership.organizationId, {
    itemKind: "PRODUCT",
    name: "Sans référence 1",
    unitPriceCents: 5,
    vatBps: 2000,
  }, `${tag}-ref-n1`);
  const secondBlank = await createCatalogItem("OWNER", first.membership.organizationId, {
    itemKind: "PRODUCT",
    name: "Sans référence 2",
    unitPriceCents: 6,
    vatBps: 2000,
  }, `${tag}-ref-n2`);
  assert.equal(firstBlank.reference, null);
  assert.equal(secondBlank.reference, null);
});
