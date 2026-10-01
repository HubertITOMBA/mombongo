import { test, expect } from "./test";
import { config } from "dotenv";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "../../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const emails: string[] = [];
const organization = `Paiements ${randomUUID().slice(0, 8)}`;
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
  await page.getByLabel("Votre nom").fill("Camille Paiement");
  await page.getByLabel("Nom de votre entreprise").fill(orgName);
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Créer mon espace" }).click();
  await expect(page).toHaveURL(/verification/);
  await page.getByLabel("Code de vérification").fill(await latestCode(email));
  await page.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(page).toHaveURL(/espace/);
}

async function createIssuedInvoice(page: import("@playwright/test").Page, customer: string, title: string, price = "1000") {
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByLabel("Raison sociale").fill(customer);
  await page.getByRole("button", { name: "Créer la fiche" }).click();
  await expect(page.getByRole("heading", { name: customer })).toBeVisible();
  await page.getByRole("link", { name: "Devis", exact: true }).click();
  await page.getByLabel("Titre").fill(title);
  await page.getByLabel("Destinataire").selectOption({ label: customer });
  await page.getByLabel("Première ligne").fill("Forfait");
  await page.getByLabel("Prix unitaire HT").fill(price);
  await page.getByLabel("TVA").selectOption("0");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
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
  await db.payment.deleteMany({ where: { organizationId: { in: organizationIds } } });
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

test("paiement total, partiel, surpaiement refusé et annulation", async ({ page }) => {
  const ownerEmail = `browser-pay-flow-${randomUUID()}@example.test`;
  emails.push(ownerEmail);
  await registerOwner(page, ownerEmail, `${organization}-flow`);
  await createIssuedInvoice(page, "Atelier Encaissement", "Prestation payée");
  await expect(page.getByText("Reste à payer", { exact: true })).toBeVisible();
  await page.getByLabel("Montant TTC").fill("300");
  await page.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Partiellement encaissé")).toBeVisible();
  await page.getByLabel("Montant TTC").fill("3000");
  await page.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Ce paiement dépasse le reste à payer.")).toBeVisible();
  await page.getByLabel("Montant TTC").fill("700");
  await page.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Soldée", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Annuler le paiement" }).first().click();
  await expect(page.getByText("Annulé")).toBeVisible();
  await expect(page.getByText("Partiellement encaissé")).toBeVisible();
});

test("avoir puis paiement affichent le net et le reste", async ({ page }) => {
  const ownerEmail = `browser-pay-credit-${randomUUID()}@example.test`;
  emails.push(ownerEmail);
  await registerOwner(page, ownerEmail, `${organization}-credit`);
  await createIssuedInvoice(page, "Atelier Mixte Paiement", "Livraison mixte");
  await page.getByRole("link", { name: "Créer un avoir" }).click();
  await page.getByLabel("Type d’avoir").selectOption("PARTIAL");
  await page.getByLabel("Quantité à créditer — Forfait").fill("0.2");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.getByRole("button", { name: "Émettre l’avoir" }).click();
  await page.getByRole("link", { name: /Facture FA-\d{4}-0001/ }).click();
  await expect(page.getByText("Net facturé", { exact: true })).toBeVisible();
  await page.getByLabel("Montant TTC").fill("500");
  await page.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Partiellement encaissé")).toBeVisible();
  await expect(page.getByText(/300,00/)).toBeVisible();
});

test("un comptable peut enregistrer un paiement ; un membre non", async ({ page, browser }) => {
  const ownerEmail = `browser-pay-owner-${randomUUID()}@example.test`;
  const accountantEmail = `browser-pay-acc-${randomUUID()}@example.test`;
  const memberEmail = `browser-pay-member-${randomUUID()}@example.test`;
  emails.push(ownerEmail, accountantEmail, memberEmail);
  await registerOwner(page, ownerEmail, `${organization}-roles`);
  await createIssuedInvoice(page, "Atelier Droits Paiement", "Prestation rôles");
  await expect(page.getByRole("button", { name: "Enregistrer le paiement" })).toBeVisible();
  const invoiceUrl = page.url();
  await page.getByRole("link", { name: "Équipe", exact: true }).click();
  await page.getByLabel("Adresse email").fill(accountantEmail);
  await page.getByLabel("Rôle").selectOption("ACCOUNTANT");
  await page.getByRole("button", { name: "Envoyer l’invitation" }).click();
  await expect(page.getByRole("status")).toContainText("L’invitation a été envoyée");
  await page.getByLabel("Adresse email").fill(memberEmail);
  await page.getByLabel("Rôle").selectOption("MEMBER");
  await page.getByRole("button", { name: "Envoyer l’invitation" }).click();
  await expect(page.getByRole("status")).toContainText("L’invitation a été envoyée");

  const accountant = await browser.newContext().then(context => context.newPage());
  await accountant.goto(await latestInviteLink(accountantEmail));
  await accountant.getByLabel("Votre nom").fill("Alex Comptable");
  await accountant.getByLabel("Mot de passe", { exact: true }).fill(password);
  await accountant.getByLabel("Confirmer le mot de passe", { exact: true }).fill(password);
  await accountant.getByRole("button", { name: "Créer mon compte et rejoindre" }).click();
  await expect(accountant).toHaveURL(/connexion\?invite=1/);
  await accountant.getByLabel("Adresse email").fill(accountantEmail);
  await accountant.getByLabel("Mot de passe", { exact: true }).fill(password);
  await accountant.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(accountant).toHaveURL(/verification/);
  await accountant.getByLabel("Code de vérification").fill(await latestCode(accountantEmail));
  await accountant.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(accountant).toHaveURL(/espace/);
  await accountant.goto(invoiceUrl);
  await expect(accountant.getByRole("button", { name: "Enregistrer le paiement" })).toBeVisible();
  await accountant.getByLabel("Montant TTC").fill("100");
  await accountant.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(accountant.getByText("Partiellement encaissé")).toBeVisible();
  await accountant.close();

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
  await expect(member.getByRole("button", { name: "Enregistrer le paiement" })).toHaveCount(0);
  await member.close();
});
