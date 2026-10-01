import { test, expect } from "./test";
import { config } from "dotenv";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "../../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const emails: string[] = [];
const organization = `Intégrations ${randomUUID().slice(0, 8)}`;
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
  await db.electronicInboundDocument.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.electronicTransmission.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.electronicInvoicingConnection.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.paymentConnection.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  const dir = process.env.LOCAL_MAIL_DIR!;
  for (const file of await readdir(dir).catch(() => [])) {
    if (file.endsWith(".json") && emails.includes(JSON.parse(await readFile(path.join(dir, file), "utf8")).to)) await unlink(path.join(dir, file));
  }
  await db.$disconnect();
});

test("le centre des intégrations sépare PA de test et paiements bientôt disponibles", async ({ page }) => {
  const ownerEmail = `browser-intg-${randomUUID()}@example.test`;
  emails.push(ownerEmail);
  await page.goto("/inscription");
  await page.getByRole("radio", { name: /^Entreprise/ }).check();
  await page.getByLabel("Votre nom").fill("Camille Intégrations");
  await page.getByLabel("Nom de votre entreprise").fill(organization);
  await page.getByLabel("Adresse email").fill(ownerEmail);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Créer mon espace" }).click();
  await expect(page).toHaveURL(/verification/);
  await page.getByLabel("Code de vérification").fill(await latestCode(ownerEmail));
  await page.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(page).toHaveURL(/espace/);
  await page.getByRole("link", { name: "Intégrations", exact: true }).click();
  await expect(page).toHaveURL(/espace\/integrations/);
  await expect(page.getByRole("heading", { name: "Facturation électronique" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connecteur interne de test" })).toBeVisible();
  await expect(page.getByText("Connecteur interne de test. Ce n’est pas une plateforme agréée.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paiements" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stripe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "PayPal" })).toBeVisible();
  await expect(page.getByText("Bientôt disponible").first()).toBeVisible();
  await page.getByLabel("État").selectOption("READY");
  await page.getByLabel("Identifiant de compte de test").fill(`mock-${randomUUID().slice(0, 8)}`);
  await page.getByRole("button", { name: "Enregistrer la connexion" }).click();
  await expect(page.getByText("Connexion de test interne enregistrée")).toBeVisible();
  await page.getByRole("button", { name: "Tester la connexion" }).click();
  await expect(page.getByText("Le connecteur interne de test est disponible")).toBeVisible();
  await page.getByRole("button", { name: "Connecter", exact: true }).first().click();
  await expect(page.getByRole("alert").filter({ hasText: "Ce connecteur de paiement n’est pas encore disponible" })).toBeVisible();
});

test("un membre voit les intégrations sans pouvoir les configurer", async ({ page, browser }) => {
  const ownerEmail = `browser-intg-owner-${randomUUID()}@example.test`;
  const memberEmail = `browser-intg-member-${randomUUID()}@example.test`;
  emails.push(ownerEmail, memberEmail);
  await page.goto("/inscription");
  await page.getByRole("radio", { name: /^Entreprise/ }).check();
  await page.getByLabel("Votre nom").fill("Camille Owner Intg");
  await page.getByLabel("Nom de votre entreprise").fill(`${organization} membre`);
  await page.getByLabel("Adresse email").fill(ownerEmail);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Créer mon espace" }).click();
  await expect(page).toHaveURL(/verification/);
  await page.getByLabel("Code de vérification").fill(await latestCode(ownerEmail));
  await page.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(page).toHaveURL(/espace/);
  await page.getByRole("link", { name: "Équipe", exact: true }).click();
  await page.getByLabel("Adresse email").fill(memberEmail);
  await page.getByLabel("Rôle").selectOption("MEMBER");
  await page.getByRole("button", { name: "Envoyer l’invitation" }).click();
  await expect(page.getByRole("status")).toContainText("L’invitation a été envoyée");
  const memberPage = await browser.newContext().then(context => context.newPage());
  await memberPage.goto(await latestInviteLink(memberEmail));
  await memberPage.getByLabel("Votre nom").fill("Membre Intégrations");
  await memberPage.getByLabel("Mot de passe", { exact: true }).fill(password);
  await memberPage.getByLabel("Confirmer le mot de passe", { exact: true }).fill(password);
  await memberPage.getByRole("button", { name: "Créer mon compte et rejoindre" }).click();
  await expect(memberPage).toHaveURL(/connexion\?invite=1/);
  await memberPage.getByLabel("Adresse email").fill(memberEmail);
  await memberPage.getByLabel("Mot de passe", { exact: true }).fill(password);
  await memberPage.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(memberPage).toHaveURL(/verification/);
  await memberPage.getByLabel("Code de vérification").fill(await latestCode(memberEmail));
  await memberPage.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(memberPage).toHaveURL(/espace/);
  await memberPage.goto("/espace/integrations");
  await expect(memberPage.getByText("Seul le propriétaire ou un administrateur peut configurer la connexion")).toBeVisible();
  await expect(memberPage.getByRole("button", { name: "Enregistrer la connexion" })).toHaveCount(0);
  await expect(memberPage.getByRole("button", { name: "Connecter", exact: true })).toHaveCount(0);
  await memberPage.close();
});
