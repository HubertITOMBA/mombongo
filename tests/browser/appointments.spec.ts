import { test, expect } from "./test";
import { config } from "dotenv";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "../../apps/web/src/lib/db";
config({ path: "apps/web/.env.local", quiet: true });
const emails: string[] = [];
const organization = `Agenda ${randomUUID().slice(0, 8)}`;
const password = "Une phrase de passe navigateur 123!";

function nextSlot() {
  const date = new Date(Date.now() + 60 * 60_000);
  date.setMinutes(0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addMinutes(slot: string, minutes: number) {
  const date = new Date(`${slot}:00`);
  date.setMinutes(date.getMinutes() + minutes);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
  await db.appointment.deleteMany({ where: { organizationId: { in: organizationIds } } });
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

test("création d’un rendez-vous, refus du chevauchement et accès particulier refusé", async ({ page, browser }) => {
  const ownerEmail = `browser-rdv-${randomUUID()}@example.test`;
  const individualEmail = `browser-rdv-ind-${randomUUID()}@example.test`;
  emails.push(ownerEmail, individualEmail);
  await page.goto("/inscription");
  await page.getByRole("radio", { name: /^Entreprise/ }).check();
  await page.getByLabel("Votre nom").fill("Camille Agenda");
  await page.getByLabel("Nom de votre entreprise").fill(organization);
  await page.getByLabel("Adresse email").fill(ownerEmail);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Créer mon espace" }).click();
  await expect(page).toHaveURL(/verification/);
  await page.getByLabel("Code de vérification").fill(await latestCode(ownerEmail));
  await page.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(page).toHaveURL(/espace/);
  await page.getByRole("link", { name: "Agenda", exact: true }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`Agenda de ${organization}`) })).toBeVisible();
  const slot = nextSlot();
  await page.getByLabel("Titre").fill("Point commercial");
  await page.getByLabel("Début").fill(slot);
  await page.getByRole("button", { name: "Planifier" }).click();
  await expect(page.getByRole("heading", { name: "Point commercial" })).toBeVisible();
  await page.getByLabel("Titre").fill("Chevauchement");
  await page.getByLabel("Début").fill(slot);
  await page.getByRole("button", { name: "Planifier" }).click();
  await expect(page.getByText("Ce créneau chevauche un rendez-vous déjà planifié.")).toBeVisible();
  await page.getByLabel("Titre").fill("Créneau suivant");
  await page.getByLabel("Début").fill(addMinutes(slot, 30));
  await page.getByRole("button", { name: "Planifier" }).click();
  await expect(page.getByRole("heading", { name: "Créneau suivant" })).toBeVisible();
  const individual = await browser.newContext().then(context => context.newPage());
  await individual.goto("/inscription");
  await individual.getByRole("radio", { name: /^Particulier/ }).check();
  await individual.getByLabel("Votre nom").fill("Pat Particulier");
  await individual.getByLabel("Adresse email").fill(individualEmail);
  await individual.getByLabel("Mot de passe", { exact: true }).fill(password);
  await individual.getByRole("button", { name: "Créer mon espace" }).click();
  await expect(individual).toHaveURL(/verification/);
  await individual.getByLabel("Code de vérification").fill(await latestCode(individualEmail));
  await individual.getByRole("button", { name: "Valider et accéder" }).click();
  await expect(individual).toHaveURL(/espace/);
  await individual.goto("/espace/agenda");
  await expect(individual).toHaveURL(/espace$/);
  await expect(individual.getByRole("link", { name: "Agenda", exact: true })).toHaveCount(0);
  await individual.close();
});
