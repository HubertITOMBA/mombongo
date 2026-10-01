import { test, expect } from "./test";
import { config } from "dotenv";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "../../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const emails: string[] = [];
const orgA = `Alpha ${randomUUID().slice(0, 8)}`;
const orgB = `Beta ${randomUUID().slice(0, 8)}`;
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
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: memberships.map(item => item.organizationId) } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  const dir = process.env.LOCAL_MAIL_DIR!;
  for (const file of await readdir(dir).catch(() => [])) {
    if (file.endsWith(".json") && emails.includes(JSON.parse(await readFile(path.join(dir, file), "utf8")).to)) await unlink(path.join(dir, file));
  }
  await db.$disconnect();
});
test("le sélecteur web bascule A → B puis revient à A", async ({ page, browser }) => {
  const ownerEmail = `browser-orga-${randomUUID()}@example.test`;
  const hostEmail = `browser-orgb-${randomUUID()}@example.test`;
  emails.push(ownerEmail, hostEmail);
  await page.goto("/inscription");
  await page.getByRole("radio", { name: /^Entreprise/ }).check();
  await page.getByLabel("Votre nom").fill("Camille Alpha");
  await page.getByLabel("Nom de votre entreprise").fill(orgA);
  await page.getByLabel("Adresse email").fill(ownerEmail);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Créer mon espace" }).click();
  await expect(page).toHaveURL(/verification/);
  await page.getByLabel("Code de vérification").fill(await latestCode(ownerEmail));
  await page.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(page).toHaveURL(/espace/);
  await expect(page.getByTitle(orgA)).toBeVisible();
  await expect(page.getByText(`Votre espace ${orgA} est prêt.`)).toBeVisible();
  await expect(page.getByLabel("Organisation active")).toHaveCount(0);
  const host = await browser.newContext().then(context => context.newPage());
  await host.goto("/inscription");
  await host.getByRole("radio", { name: /^Entreprise/ }).check();
  await host.getByLabel("Votre nom").fill("Camille Beta");
  await host.getByLabel("Nom de votre entreprise").fill(orgB);
  await host.getByLabel("Adresse email").fill(hostEmail);
  await host.getByLabel("Mot de passe", { exact: true }).fill(password);
  await host.getByRole("button", { name: "Créer mon espace" }).click();
  await expect(host).toHaveURL(/verification/);
  await host.getByLabel("Code de vérification").fill(await latestCode(hostEmail));
  await host.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(host).toHaveURL(/espace/);
  await host.goto("/espace/equipe");
  await host.getByLabel("Adresse email").fill(ownerEmail);
  await host.getByLabel("Rôle").selectOption("MEMBER");
  await host.getByRole("button", { name: "Envoyer l’invitation" }).click();
  await expect(host.getByRole("status")).toContainText("L’invitation a été envoyée");
  await page.goto(await latestInviteLink(ownerEmail));
  await expect(page.getByText(orgB)).toBeVisible();
  await page.getByRole("button", { name: "Rejoindre l’entreprise" }).click();
  await expect(page).toHaveURL(/connexion\?invite=1/);
  await page.goto("/espace");
  await expect(page.getByLabel("Organisation active")).toBeVisible();
  await expect(page.getByLabel("Organisation active")).toHaveValue(/.+/);
  await page.getByLabel("Organisation active").selectOption({ label: orgB });
  await expect(page).toHaveURL(/espace/);
  await expect(page.getByText(`Votre espace ${orgB} est prêt.`)).toBeVisible();
  await page.getByLabel("Organisation active").selectOption({ label: orgA });
  await expect(page.getByText(`Votre espace ${orgA} est prêt.`)).toBeVisible();
  await host.close();
});
