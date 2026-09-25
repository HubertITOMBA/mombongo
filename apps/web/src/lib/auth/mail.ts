import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resend } from "resend";
export function assertMailConfigured() {
  if (process.env.MAIL_TRANSPORT === "local" && process.env.NODE_ENV !== "production" && process.env.LOCAL_MAIL_DIR) return;
  if (process.env.MAIL_TRANSPORT === "resend" && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return;
  throw new Error("Configurez Resend ou la boîte mail locale de développement.");
}
export async function sendCode(email: string, code: string, challengeId: string, sendNumber: number) {
  return sendAuthMail({
    to: email,
    subject: "Votre code de connexion Facturia",
    text: `Votre code Facturia : ${code}\n\nIl expire dans 5 minutes et ne peut être utilisé qu’une fois. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
  }, `${challengeId}-${sendNumber}`);
}
export async function sendPasswordReset(email: string, token: string, id: string) {
  const origin = process.env.AUTH_URL;
  if (!origin) throw new Error("AUTH_URL doit être configurée.");
  const url = new URL("/reinitialiser-mot-de-passe", origin);
  url.hash = token;
  return sendAuthMail({
    to: email,
    subject: "Réinitialisez votre mot de passe Facturia",
    text: `Pour choisir un nouveau mot de passe, ouvrez ce lien :\n${url.toString()}\n\nCe lien expire dans 15 minutes et ne peut être utilisé qu’une fois. Vos sessions seront déconnectées après validation. Si vous n’avez pas demandé cette modification, ignorez ce message : votre mot de passe reste inchangé.`,
  }, `reset-${id}`);
}
async function sendAuthMail(message: { to: string; subject: string; text: string }, deliveryId: string) {
  assertMailConfigured();
  if (process.env.MAIL_TRANSPORT === "local" && process.env.NODE_ENV !== "production") {
    const directory = process.env.LOCAL_MAIL_DIR!;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(directory, `${deliveryId}.json`), JSON.stringify({ ...message, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600, flag: "wx" });
    return;
  }
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ ...message, from: process.env.EMAIL_FROM! }, { idempotencyKey: `auth/${deliveryId}` });
  if (error) throw new Error("L’envoi du code a échoué.");
}
