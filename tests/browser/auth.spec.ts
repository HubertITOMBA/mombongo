import { test, expect } from "@playwright/test";
import { config } from "dotenv";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "../../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const emails: string[] = [];
const organization = `Atelier ${randomUUID().slice(0,8)}`;
async function latestCode(email: string) {
  const dir = process.env.LOCAL_MAIL_DIR!;
  const files = await readdir(dir);
  const mails = await Promise.all(files.filter(f => f.endsWith(".json")).map(async f => JSON.parse(await readFile(path.join(dir, f), "utf8"))));
  const mail = mails.filter(m => m.to === email).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
  return /\b\d{6}\b/.exec(mail.text)![0];
}
async function latestResetLink(email: string) {
  const dir = process.env.LOCAL_MAIL_DIR!;
  const files = (await readdir(dir)).filter(f => f.startsWith("reset-"));
  const mails = await Promise.all(files.map(async f => JSON.parse(await readFile(path.join(dir, f), "utf8"))));
  const latest = mails.filter(m => m.to === email).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
  return /https?:\/\/\S+/.exec(latest.text)![0];
}
test.afterAll(async () => {
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: memberships.map(m => m.organizationId) } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  const dir = process.env.LOCAL_MAIL_DIR!;
  for (const f of await readdir(dir).catch(() => [])) {
    if (f.endsWith(".json") && emails.includes(JSON.parse(await readFile(path.join(dir, f), "utf8")).to)) await unlink(path.join(dir, f));
  }
  await db.$disconnect();
});
for (const profile of ["Entreprise", "Particulier"] as const) {
const email = `browser-${randomUUID()}@example.test`;
emails.push(email);
test(`${profile} : inscription, validation, espace privé, déconnexion et reconnexion`, async ({ page, request }) => {
  const rejected = await request.post("/api/v1/auth/register", { headers: { Origin: "https://example.invalid" }, data: {} });
  expect(rejected.status()).toBe(403);
  const oversized = await request.post("/api/v1/auth/register", { headers: { Origin: "http://localhost:9070", "Content-Type": "application/json" }, data: "x".repeat(9000) });
  expect(oversized.status()).toBe(413);
  await page.goto("/espace");
  await expect(page).toHaveURL(/connexion/);
  await page.goto("/inscription");
  await page.getByRole("radio", { name: new RegExp(`^${profile}`) }).check();
  await page.getByLabel("Votre nom").fill("Camille Test");
  if (profile === "Entreprise") await page.getByLabel("Nom de votre entreprise").fill(organization);
  else await expect(page.getByLabel("Nom de votre entreprise")).toHaveCount(0);
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("Une phrase de passe navigateur 123!");
  const passwordInput = page.getByLabel("Mot de passe", { exact: true });
  await expect(passwordInput).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Afficher : Mot de passe", exact: true }).click();
  await expect(passwordInput).toHaveAttribute("type", "text");
  await expect(passwordInput).toHaveValue("Une phrase de passe navigateur 123!");
  await page.getByRole("button", { name: "Masquer : Mot de passe", exact: true }).click();
  await expect(passwordInput).toHaveAttribute("type", "password");
  await expect(page).toHaveURL(/inscription/);
  await page.getByRole("button", { name: "Créer mon espace" }).click();
  await expect(page).toHaveURL(/verification/);
  expect(await getDb().user.findUnique({ where: { email } })).toBeNull();
  await page.getByLabel("Code de vérification").fill(await latestCode(email));
  await page.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(page).toHaveURL(/espace/, { timeout: 30_000 });
  if (profile === "Entreprise") {
    await expect(page.getByText(organization, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Clients et prospects" })).toBeVisible();
  } else {
    await expect(page.getByText("Votre espace particulier", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mes factures", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Clients et prospects" })).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.local/workspace-${profile}-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `.local/workspace-${profile}-desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/connexion/);
  const user = await getDb().user.findUniqueOrThrow({ where: { email } });
  expect(await getDb().authSession.count({ where: { userId: user.id } })).toBe(0);
  await page.goto("/espace");
  await expect(page).toHaveURL(/connexion/);
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("Une phrase de passe navigateur 123!");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page).toHaveURL(/verification/);
  await page.getByLabel("Code de vérification").fill(await latestCode(email));
  await page.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(page).toHaveURL(/espace/);
  // Une autre page réinitialise le mot de passe et révoque la session courante.
  const recovery = await page.context().newPage();
  await recovery.goto("/connexion");
  await recovery.getByRole("link", { name: "Mot de passe oublié ?" }).click();
  await expect(recovery.getByRole("heading", { name: "Mot de passe oublié ?", exact: true })).toBeVisible();
  await recovery.getByLabel("Adresse email").fill(email);
  await recovery.getByRole("button", { name: "Recevoir le lien" }).click();
  await expect(recovery.getByRole("status")).toContainText("Si un compte correspond");
  const link = await latestResetLink(email);
  await recovery.goto(link);
  const nextPassword = "Nouvelle phrase de passe navigateur 456!";
  await recovery.getByLabel("Nouveau mot de passe", { exact: true }).fill(nextPassword);
  await recovery.getByLabel("Confirmer le mot de passe", { exact: true }).fill("Une autre phrase de passe différente");
  await recovery.getByRole("button", { name: "Afficher : Nouveau mot de passe", exact: true }).click();
  await expect(recovery.getByLabel("Nouveau mot de passe", { exact: true })).toHaveAttribute("type", "text");
  await expect(recovery.getByLabel("Confirmer le mot de passe", { exact: true })).toHaveAttribute("type", "password");
  await recovery.getByRole("button", { name: "Enregistrer le nouveau mot de passe" }).click();
  await expect(recovery.getByRole("alert").filter({ hasText: "ne correspondent pas" })).toBeVisible();
  await recovery.getByLabel("Confirmer le mot de passe", { exact: true }).fill(nextPassword);
  await recovery.getByRole("button", { name: "Afficher : Confirmer le mot de passe", exact: true }).click();
  await expect(recovery.getByLabel("Confirmer le mot de passe", { exact: true })).toHaveAttribute("type", "text");
  await recovery.getByRole("button", { name: "Enregistrer le nouveau mot de passe" }).click();
  await expect(recovery.getByRole("status")).toContainText("Votre mot de passe a été modifié");
  expect(await getDb().authSession.count({ where: { userId: user.id } })).toBe(0);
  await page.goto("/espace");
  await expect(page).toHaveURL(/connexion/);
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("Une phrase de passe navigateur 123!");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible();
  await page.getByLabel("Mot de passe", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page).toHaveURL(/verification/);
  await page.getByLabel("Code de vérification").fill(await latestCode(email));
  await page.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(page).toHaveURL(/espace/);
  await recovery.close();
});

}
