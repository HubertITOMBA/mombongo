import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resend } from "resend";
import { buildAppUrl } from "@/lib/app-url";

export function assertMailConfigured() {
  if (process.env.MAIL_TRANSPORT === "local" && process.env.NODE_ENV !== "production" && process.env.LOCAL_MAIL_DIR) return;
  if (process.env.MAIL_TRANSPORT === "resend" && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return;
  throw new Error("Configurez Resend ou la boîte mail locale de développement.");
}

export type MailAttachment = { filename: string; content: Buffer; contentType?: string };
export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: MailAttachment[];
};

let testFailure: string | null = null;
export function setMailTestFailure(message: string | null) {
  testFailure = message;
}

export function mailFromAddress() {
  const from = process.env.EMAIL_FROM?.trim();
  if (process.env.MAIL_TRANSPORT === "resend" && !from) throw new Error("EMAIL_FROM doit être configuré.");
  return from || "Mombongo <dev@localhost>";
}

export function currentMailProvider(): "LOCAL" | "RESEND" {
  return process.env.MAIL_TRANSPORT === "resend" ? "RESEND" : "LOCAL";
}

export async function sendOutboundMail(message: OutboundMail, deliveryId: string) {
  assertMailConfigured();
  if (testFailure) throw new Error(testFailure);
  if (process.env.MAIL_TRANSPORT === "local" && process.env.NODE_ENV !== "production") {
    const directory = process.env.LOCAL_MAIL_DIR!;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const record = {
      to: message.to,
      from: mailFromAddress(),
      replyTo: message.replyTo ?? null,
      subject: message.subject,
      text: message.text,
      attachments: (message.attachments ?? []).map(item => ({ filename: item.filename, bytes: item.content.length })),
      createdAt: new Date().toISOString(),
    };
    await writeFile(path.join(directory, `${deliveryId}.json`), JSON.stringify(record, null, 2), { mode: 0o600, flag: "wx" });
    for (const attachment of message.attachments ?? []) {
      await writeFile(path.join(directory, `${deliveryId}-${attachment.filename}`), attachment.content, { mode: 0o600, flag: "wx" });
    }
    return { provider: "LOCAL" as const, providerMessageId: deliveryId };
  }
  const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.EMAIL_FROM!,
    to: message.to,
    subject: message.subject,
    text: message.text,
    replyTo: message.replyTo,
    attachments: message.attachments?.map(item => ({ filename: item.filename, content: item.content })),
  }, { idempotencyKey: deliveryId });
  if (error) throw new Error("L’envoi de l’e-mail a échoué.");
  return { provider: "RESEND" as const, providerMessageId: data?.id ?? null };
}

export async function sendCode(email: string, code: string, challengeId: string, sendNumber: number) {
  return sendAuthMail({
    to: email,
    subject: "Votre code de connexion Mombongo",
    text: `Votre code Mombongo : ${code}\n\nIl expire dans 5 minutes et ne peut être utilisé qu’une fois. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
  }, `${challengeId}-${sendNumber}`);
}
export async function sendInvitation(email: string, organizationName: string, token: string, id: string) {
  const url = buildAppUrl("/invitation", token);
  return sendAuthMail({
    to: email,
    subject: `Invitation à rejoindre ${organizationName} sur Mombongo`,
    text: `Vous êtes invité à rejoindre l’espace ${organizationName} sur Mombongo.\n\nOuvrez ce lien pour accepter :\n${url}\n\nCe lien expire dans 7 jours. S’il ne s’agit pas de vous, ignorez ce message.`,
  }, `invite-${id}`);
}
export async function sendPasswordReset(email: string, token: string, id: string) {
  const url = buildAppUrl("/reinitialiser-mot-de-passe", token);
  return sendAuthMail({
    to: email,
    subject: "Réinitialisez votre mot de passe Mombongo",
    text: `Pour choisir un nouveau mot de passe, ouvrez ce lien :\n${url}\n\nCe lien expire dans 15 minutes et ne peut être utilisé qu’une fois. Vos sessions seront déconnectées après validation. Si vous n’avez pas demandé cette modification, ignorez ce message : votre mot de passe reste inchangé.`,
  }, `reset-${id}`);
}
async function sendAuthMail(message: { to: string; subject: string; text: string }, deliveryId: string) {
  try {
    await sendOutboundMail(message, deliveryId);
  } catch (error) {
    if (error instanceof Error && error.message === "L’envoi de l’e-mail a échoué.") {
      throw new Error("L’envoi du code a échoué.");
    }
    throw error;
  }
}
