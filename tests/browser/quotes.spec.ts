import { test, expect } from "./test";
import { config } from "dotenv";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "../../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const emails: string[] = [];
const organization = `Devis ${randomUUID().slice(0, 8)}`;
const password = "Une phrase de passe navigateur 123!";

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

test("création, envoi et acceptation d’un devis", async ({ page }) => {
  const ownerEmail = `browser-quote-${randomUUID()}@example.test`;
  emails.push(ownerEmail);
  await page.goto("/inscription");
  await page.getByRole("radio", { name: /^Entreprise/ }).check();
  await page.getByLabel("Votre nom").fill("Camille Devis");
  await page.getByLabel("Nom de votre entreprise").fill(organization);
  await page.getByLabel("Adresse email").fill(ownerEmail);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Créer mon espace" }).click();
  await expect(page).toHaveURL(/verification/);
  await page.getByLabel("Code de vérification").fill(await latestCode(ownerEmail));
  await page.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(page).toHaveURL(/espace/);
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByLabel("Raison sociale").fill("Atelier Devis");
  await page.getByLabel("Type").selectOption("PROSPECT");
  await page.getByRole("button", { name: "Créer la fiche" }).click();
  await expect(page.getByRole("heading", { name: "Atelier Devis" })).toBeVisible();
  await page.getByRole("link", { name: "Devis", exact: true }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`Devis de ${organization}`) })).toBeVisible();
  await page.getByLabel("Titre").fill("Site vitrine");
  await page.getByLabel("Destinataire").selectOption({ label: "Atelier Devis" });
  await page.getByLabel("Première ligne").fill("Conception");
  await page.getByLabel("Prix unitaire HT").fill("1000");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(page.getByRole("heading", { name: "Site vitrine" })).toBeVisible();
  await expect(page.getByText("TTC 1 200,00 €")).toBeVisible();
  await page.getByRole("button", { name: "Envoyer le devis" }).click();
  await expect(page.getByText(/DEV-\d{4}-0001 ·/)).toBeVisible();
  await page.getByRole("button", { name: "Marquer accepté" }).click();
  await expect(page.getByText("Accepté")).toBeVisible();
});
