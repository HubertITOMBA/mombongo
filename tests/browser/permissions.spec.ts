import { test, expect } from "./test";
import { config } from "dotenv";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "../../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const emails: string[] = [];
const organization = `Droits ${randomUUID().slice(0, 8)}`;
const password = "Une phrase de passe navigateur 123!";

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

test.afterAll(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
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

test("un membre ne voit pas l’annulation ni l’avoir ; le propriétaire crée un avoir, pas une annulation de statut", async ({ page, browser }) => {
  const ownerEmail = `browser-perm-owner-${randomUUID()}@example.test`;
  const memberEmail = `browser-perm-member-${randomUUID()}@example.test`;
  emails.push(ownerEmail, memberEmail);
  await page.goto("/inscription");
  await page.getByRole("radio", { name: /^Entreprise/ }).check();
  await page.getByLabel("Votre nom").fill("Camille Owner");
  await page.getByLabel("Nom de votre entreprise").fill(organization);
  await page.getByLabel("Adresse email").fill(ownerEmail);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Créer mon espace" }).click();
  await expect(page).toHaveURL(/verification/);
  await page.getByLabel("Code de vérification").fill(await latestCode(ownerEmail));
  await page.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(page).toHaveURL(/espace/);
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByLabel("Raison sociale").fill("Atelier Droits");
  await page.getByRole("button", { name: "Créer la fiche" }).click();
  await expect(page.getByRole("heading", { name: "Atelier Droits" })).toBeVisible();
  await page.getByRole("link", { name: "Devis", exact: true }).click();
  await page.getByLabel("Titre").fill("Site vitrine");
  await page.getByLabel("Destinataire").selectOption({ label: "Atelier Droits" });
  await page.getByLabel("Première ligne").fill("Conception");
  await page.getByLabel("Prix unitaire HT").fill("1000");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(page.getByRole("heading", { name: "Site vitrine" })).toBeVisible();
  await page.getByRole("button", { name: "Envoyer le devis" }).click();
  await expect(page.getByText(/DEV-\d{4}-0001 ·/)).toBeVisible();
  await page.getByRole("button", { name: "Marquer accepté" }).click();
  await page.getByRole("button", { name: "Créer la facture" }).click();
  await expect(page).toHaveURL(/espace\/factures\//);
  await expect(page.getByRole("link", { name: "Créer un avoir" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Annuler la facture" })).toHaveCount(0);
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
  await expect(member.getByRole("button", { name: "Annuler la facture" })).toHaveCount(0);
  await expect(member.getByRole("link", { name: "Créer un avoir" })).toHaveCount(0);
  await member.close();
});
