import { randomBytes, randomUUID } from "node:crypto";
import { hash } from "argon2";
import { forgotPasswordSchema, resetPasswordSchema } from "@facturia/contracts";
import { getDb } from "@/lib/db";
import { digest, matches, parseChallengeToken } from "./crypto";
import { assertMailConfigured, sendPasswordReset } from "./mail";
import { AuthFlowError, rateLimit } from "./rate-limit";
import { passwordOptions } from "./service";
const invalidLink = () => new AuthFlowError("Ce lien est invalide ou a expiré. Demandez un nouveau lien.");

export async function requestPasswordReset(body: unknown, address: string) {
  await rateLimit("reset-request-ip", address, 20);
  const input = forgotPasswordSchema.safeParse(body);
  if (!input.success) throw new AuthFlowError("Vérifiez votre adresse email.");
  // Le même compteur et la même réponse sont utilisés pour une adresse inconnue.
  try { await rateLimit("reset-request-email", input.data.email, 3); }
  catch (error) { if (error instanceof AuthFlowError && error.status === 429) return; throw error; }
  assertMailConfigured();
  const db = getDb();
  const user = await db.user.findUnique({ where: { email: input.data.email } });
  if (!user) return;
  const id = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${user.email}))::text`;
    await tx.passwordReset.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
    await tx.passwordReset.create({ data: { id, userId: user.id, tokenHash: digest(`reset:${id}:${secret}`), expiresAt: new Date(Date.now() + 15 * 60_000) } });
  });
  try { await sendPasswordReset(user.email, `${id}.${secret}`, id); }
  catch {
    await db.passwordReset.update({ where: { id }, data: { consumedAt: new Date() } });
    // Même réponse publique, même si un envoi échoue pour un compte existant.
    console.error("Échec d’envoi du lien de réinitialisation");
  }
}

export async function resetPassword(body: unknown, address: string) {
  await rateLimit("reset-apply-ip", address, 20);
  const input = resetPasswordSchema.safeParse(body);
  if (!input.success) throw new AuthFlowError("Vérifiez le lien et saisissez deux mots de passe identiques d’au moins 12 caractères.");
  const { token, password } = input.data;
  const parsed = parseChallengeToken(token);
  if (!parsed) throw invalidLink();
  const db = getDb();
  const hint = await db.passwordReset.findUnique({ where: { id: parsed.id }, include: { user: { select: { email: true } } } });
  if (!hint || hint.consumedAt || hint.expiresAt.getTime() <= Date.now() || !matches(`reset:${parsed.id}:${parsed.binding}`, hint.tokenHash)) throw invalidLink();
  const passwordHash = await hash(password, passwordOptions);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${hint.user.email}))::text`;
    await tx.$queryRaw`SELECT id FROM "PasswordReset" WHERE id = ${parsed.id} FOR UPDATE`;
    const reset = await tx.passwordReset.findUnique({ where: { id: parsed.id } });
    if (!reset || reset.consumedAt || reset.expiresAt.getTime() <= Date.now() || !matches(`reset:${parsed.id}:${parsed.binding}`, reset.tokenHash)) throw invalidLink();
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    await tx.authSession.deleteMany({ where: { userId: reset.userId } });
    await tx.authChallenge.updateMany({ where: { email: hint.user.email, consumedAt: null }, data: { consumedAt: new Date(), passwordHash: null } });
    await tx.passwordReset.updateMany({ where: { userId: reset.userId, consumedAt: null }, data: { consumedAt: new Date() } });
  });
}
