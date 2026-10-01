import { test, expect } from "./test";
import { config } from "dotenv";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "../../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const emails: string[] = [];
const organization = `Avoirs ${randomUUID().slice(0, 8)}`;
const password = "Une phrase de passe navigateur 123!";

test.describe.configure({ timeout: 90_000 });

async function latestCode(email: string) {
  const dir = process.env.LOCAL_MAIL_DIR!;
  const files = await readdir(dir);
  const mails = await Promise.all(files.filter(file => file.endsWith(".json")).map(async file => JSON.parse(await readFile(path.join(dir, file), "utf8"))));
  const mail = mails.filter(item => item.to === email).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return /\b\d{6}\b/.exec(mail.text)![0];
}

async function latestInviteLink(email: string) {
  const dir = process.env.LOCAL_MAIL_DIR!;
  const files = (await readdir(dir)).filter(file => file.startsWith("invite-"));
  const mails = await Promise.all(files.map(async file => JSON.parse(await readFile(path.join(dir, file), "utf8"))));
  const latest = mails.filter(item => item.to === email).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return /https?:\/\/\S+/.exec(latest.text)![0];
}

async function registerOwner(page: import("@playwright/test").Page, email: string, orgName: string) {
  await page.goto("/inscription");
  await page.getByRole("radio", { name: /^Entreprise/ }).check();
  await page.getByLabel("Votre nom").fill("Camille Avoir");
  await page.getByLabel("Nom de votre entreprise").fill(orgName);
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Créer mon espace" }).click();
  await expect(page).toHaveURL(/verification/);
  await page.getByLabel("Code de vérification").fill(await latestCode(email));
  await page.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(page).toHaveURL(/espace/);
}

async function createIssuedInvoice(page: import("@playwright/test").Page, customer: string, title: string, lines: Array<{ description: string; price: string; vat?: string; kind?: string; quantity?: string }>) {
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByLabel("Raison sociale").fill(customer);
  await page.getByRole("button", { name: "Créer la fiche" }).click();
  await expect(page.getByRole("heading", { name: customer })).toBeVisible();
  await page.getByRole("link", { name: "Devis", exact: true }).click();
  await page.getByLabel("Titre").fill(title);
  await page.getByLabel("Destinataire").selectOption({ label: customer });
  const [first, ...rest] = lines;
  await page.getByLabel("Première ligne").fill(first.description);
  await page.getByLabel("Prix unitaire HT").fill(first.price);
  if (first.vat) await page.getByLabel("TVA").selectOption(first.vat);
  if (first.kind) await page.getByLabel("Nature").selectOption({ label: first.kind });
  if (first.quantity) await page.getByLabel("Quantité").fill(first.quantity);
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  for (const line of rest) {
    await page.getByLabel("Ligne").fill(line.description);
    await page.getByLabel("Prix HT").fill(line.price);
    if (line.vat) await page.locator("#line-vat").selectOption(line.vat);
    if (line.kind) await page.locator("#line-kind").selectOption({ label: line.kind });
    if (line.quantity) await page.locator("#line-qty").fill(line.quantity);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Ligne ajoutée.")).toBeVisible();
  }
  await page.getByRole("button", { name: "Envoyer le devis" }).click();
  await expect(page.getByText(/DEV-\d{4}-0001 ·/)).toBeVisible();
  await page.getByRole("button", { name: "Marquer accepté" }).click();
  await page.getByRole("button", { name: "Créer la facture" }).click();
  await expect(page).toHaveURL(/espace\/factures\//);
  await expect(page.getByRole("heading", { name: /FA-\d{4}-0001/ })).toBeVisible();
}

test.afterAll(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, kind: "CREDIT_NOTE" } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, sourceDocumentId: { not: null } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  const dir = process.env.LOCAL_MAIL_DIR!;
  for (const file of await readdir(dir).catch(() => [])) {
    if (file.endsWith(".json") && emails.includes(JSON.parse(await readFile(path.join(dir, file), "utf8")).to)) await unlink(path.join(dir, file));
  }
  await db.$disconnect();
});

test("une facture émise reçoit un avoir total numéroté", async ({ page }) => {
  const ownerEmail = `browser-credit-total-${randomUUID()}@example.test`;
  emails.push(ownerEmail);
  await registerOwner(page, ownerEmail, `${organization}-total`);
  await createIssuedInvoice(page, "Atelier Avoir Total", "Prestation totale", [
    { description: "Forfait", price: "1000", vat: "0" },
  ]);
  await expect(page.getByRole("strong")).toContainText(/1.000,00/);
  await page.getByRole("link", { name: "Créer un avoir" }).click();
  await expect(page.getByRole("heading", { name: "Créer un avoir" })).toBeVisible();
  await page.getByLabel("Motif").fill("Annulation prestation");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(page).toHaveURL(/espace\/avoirs\//);
  await page.getByRole("button", { name: "Émettre l’avoir" }).click();
  await expect(page.getByRole("heading", { name: /AV-\d{4}-0001/ })).toBeVisible();
  await expect(page.getByText(/relatif à FA-\d{4}-0001/)).toBeVisible();
  await expect(page.getByText("Motif : Annulation prestation")).toBeVisible();
  await page.getByRole("link", { name: /Facture FA-\d{4}-0001/ }).click();
  await expect(page.getByText("Soldée par avoirs")).toBeVisible();
  await expect(page.getByText(/Net facturé0,00/)).toBeVisible();
  await expect(page.getByRole("link", { name: /AV-\d{4}-0001/ })).toBeVisible();
});

test("avoir partiel, plusieurs avoirs, puis sur-crédit refusé", async ({ page }) => {
  const ownerEmail = `browser-credit-partial-${randomUUID()}@example.test`;
  emails.push(ownerEmail);
  await registerOwner(page, ownerEmail, `${organization}-partial`);
  await createIssuedInvoice(page, "Atelier Avoir Partiel", "Livraison mixte", [
    { description: "Produit A", price: "100", vat: "0", kind: "Bien", quantity: "6" },
    { description: "Service B", price: "100", vat: "0", kind: "Service", quantity: "4" },
  ]);
  await expect(page.getByRole("strong")).toContainText(/1.000,00/);
  await page.getByRole("link", { name: "Créer un avoir" }).click();
  await page.getByLabel("Type d’avoir").selectOption("PARTIAL");
  await page.getByLabel("Quantité à créditer — Produit A").fill("2");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.getByRole("button", { name: "Émettre l’avoir" }).click();
  await expect(page.getByRole("heading", { name: /AV-\d{4}-0001/ })).toBeVisible();
  await page.getByRole("link", { name: /Facture FA-\d{4}-0001/ }).click();
  await expect(page.getByText(/Net facturé800,00/)).toBeVisible();
  await page.getByRole("link", { name: "Créer un avoir" }).click();
  await page.getByLabel("Type d’avoir").selectOption("PARTIAL");
  await page.getByLabel("Quantité à créditer — Service B").fill("3");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.getByRole("button", { name: "Émettre l’avoir" }).click();
  await expect(page.getByRole("heading", { name: /AV-\d{4}-0002/ })).toBeVisible();
  await page.getByRole("link", { name: /Facture FA-\d{4}-0001/ }).click();
  await expect(page.getByText(/Net facturé500,00/)).toBeVisible();
  await page.getByRole("link", { name: "Créer un avoir" }).click();
  await page.getByLabel("Type d’avoir").selectOption("PARTIAL");
  await page.getByLabel("Quantité à créditer — Produit A").fill("6");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(page.getByText("Cet avoir dépasse le montant encore créditable sur la facture.")).toBeVisible();
});

test("un membre ne voit pas l’action de création d’avoir", async ({ page, browser }) => {
  const ownerEmail = `browser-credit-owner-${randomUUID()}@example.test`;
  const memberEmail = `browser-credit-member-${randomUUID()}@example.test`;
  emails.push(ownerEmail, memberEmail);
  await registerOwner(page, ownerEmail, `${organization}-member`);
  await createIssuedInvoice(page, "Atelier Droits Avoir", "Prestation membre", [
    { description: "Conseil", price: "1000", vat: "0" },
  ]);
  await expect(page.getByRole("link", { name: "Créer un avoir" })).toBeVisible();
  const invoiceUrl = page.url();
  await page.getByRole("link", { name: "Équipe", exact: true }).click();
  await page.getByLabel("Adresse email").fill(memberEmail);
  await page.getByLabel("Rôle").selectOption("MEMBER");
  await page.getByRole("button", { name: "Envoyer l’invitation" }).click();
  await expect(page.getByRole("status")).toContainText("L’invitation a été envoyée");
  const member = await browser.newContext().then(context => context.newPage());
  await member.goto(await latestInviteLink(memberEmail));
  await member.getByLabel("Votre nom").fill("Alex Membre");
  await member.getByLabel("Mot de passe", { exact: true }).fill(password);
  await member.getByLabel("Confirmer le mot de passe", { exact: true }).fill(password);
  await member.getByRole("button", { name: "Créer mon compte et rejoindre" }).click();
  await expect(member).toHaveURL(/connexion\?invite=1/);
  await member.getByLabel("Adresse email").fill(memberEmail);
  await member.getByLabel("Mot de passe", { exact: true }).fill(password);
  await member.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(member).toHaveURL(/verification/);
  await member.getByLabel("Code de vérification").fill(await latestCode(memberEmail));
  await member.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(member).toHaveURL(/espace/);
  await member.goto(invoiceUrl);
  await expect(member.getByRole("heading", { name: /FA-\d{4}-0001/ })).toBeVisible();
  await expect(member.getByRole("link", { name: "Créer un avoir" })).toHaveCount(0);
  await member.close();
});
