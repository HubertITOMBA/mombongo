import { test, expect } from "./test";
import { config } from "dotenv";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "../../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const emails: string[] = [];
const organization = `Moteur ${randomUUID().slice(0, 8)}`;
const password = "Une phrase de passe navigateur 123!";

test.describe.configure({ timeout: 90_000 });

async function latestCode(email: string) {
  const dir = process.env.LOCAL_MAIL_DIR!;
  const files = await readdir(dir);
  const mails = await Promise.all(files.filter(file => file.endsWith(".json")).map(async file => JSON.parse(await readFile(path.join(dir, file), "utf8"))));
  const mail = mails.filter(item => item.to === email).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return /\b\d{6}\b/.exec(mail.text)![0];
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

test("devis → facture → avoir → paiement, résumé financier et pas d’annulation de statut", async ({ page }) => {
  const ownerEmail = `browser-engine-${randomUUID()}@example.test`;
  emails.push(ownerEmail);
  await page.goto("/inscription");
  await page.getByRole("radio", { name: /^Entreprise/ }).check();
  await page.getByLabel("Votre nom").fill("Camille Moteur");
  await page.getByLabel("Nom de votre entreprise").fill(organization);
  await page.getByLabel("Adresse email").fill(ownerEmail);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Créer mon espace" }).click();
  await expect(page).toHaveURL(/verification/);
  await page.getByLabel("Code de vérification").fill(await latestCode(ownerEmail));
  await page.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(page).toHaveURL(/espace/);
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByLabel("Raison sociale").fill("Atelier Moteur");
  await page.getByRole("button", { name: "Créer la fiche" }).click();
  await expect(page.getByRole("heading", { name: "Atelier Moteur" })).toBeVisible();
  await page.getByRole("link", { name: "Devis", exact: true }).click();
  await page.getByLabel("Titre").fill("Mission consolidée");
  await page.getByLabel("Destinataire").selectOption({ label: "Atelier Moteur" });
  await page.getByLabel("Première ligne").fill("Forfait");
  await page.getByLabel("Prix unitaire HT").fill("1000");
  await page.getByLabel("TVA").selectOption("0");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(page.getByRole("heading", { name: "Mission consolidée" })).toBeVisible();
  await page.getByRole("button", { name: "Envoyer le devis" }).click();
  await expect(page.getByText(/DEV-\d{4}-0001 ·/)).toBeVisible();
  await page.getByRole("button", { name: "Marquer accepté" }).click();
  await page.getByRole("button", { name: "Créer la facture" }).click();
  await expect(page).toHaveURL(/espace\/factures\//);
  await expect(page.getByRole("heading", { name: /FA-\d{4}-0001/ })).toBeVisible();
  await expect(page.getByText("Total facture", { exact: true })).toBeVisible();
  await expect(page.getByText("Net facturé", { exact: true })).toBeVisible();
  await expect(page.getByText("Reste à payer", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Annuler la facture" })).toHaveCount(0);
  await page.getByRole("link", { name: "Créer un avoir" }).click();
  await page.getByLabel("Type d’avoir").selectOption("PARTIAL");
  await page.getByLabel("Quantité à créditer — Forfait").fill("0.2");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.getByRole("button", { name: "Émettre l’avoir" }).click();
  await page.getByRole("link", { name: /Facture FA-\d{4}-0001/ }).click();
  await expect(page.getByText(/Net facturé800,00/)).toBeVisible();
  await page.getByLabel("Montant TTC").fill("500");
  await page.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Partiellement encaissé")).toBeVisible();
  await expect(page.getByText(/− Encaissements/)).toBeVisible();
});
