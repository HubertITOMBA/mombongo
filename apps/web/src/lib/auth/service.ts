import { randomBytes, randomUUID } from "node:crypto";
import { hash, verify, argon2id } from "argon2";
import { loginSchema, registrationSchema, verificationCodeSchema } from "@facturia/contracts";
import { getDb } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { CODE_TTL_MS, SESSION_TTL_SECONDS, digest, generateCode, matches, parseChallengeToken } from "./crypto";
import { assertMailConfigured, sendCode } from "./mail";
import { AuthFlowError, rateLimit } from "./rate-limit";

export const passwordOptions = { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
let dummyHash: Promise<string> | undefined;
function timingHash() { return dummyHash ??= hash(randomBytes(32), passwordOptions); }
const invalidCode = () => new AuthFlowError("Code incorrect ou expiré. Recommencez la connexion si nécessaire.");

async function lockChallenge(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "AuthChallenge" WHERE id = ${id} FOR UPDATE`;
  return tx.authChallenge.findUnique({ where: { id } });
}

export async function beginAuth(kind: "register" | "login", body: unknown, address: string) {
  await rateLimit("start-ip", address, 30);
  const result = (kind === "register" ? registrationSchema : loginSchema).safeParse(body);
  if (!result.success) throw new AuthFlowError(kind === "register" ? "Vérifiez les champs et utilisez un mot de passe d’au moins 12 caractères." : "Vérifiez votre adresse email et votre mot de passe.");
  const input = result.data;
  await rateLimit("start-email", input.email, 5);
  assertMailConfigured();
  const db = getDb();
  const existing = await db.user.findUnique({ where: { email: input.email } });
  let passwordHash: string | null = null;
  if (kind === "login") {
    const valid = await verify(existing?.passwordHash || await timingHash(), input.password);
    if (!existing || !valid) throw new AuthFlowError("Email ou mot de passe incorrect.", 401);
  } else {
    passwordHash = await hash(input.password, passwordOptions);
  }
  // Même réponse d’inscription pour une adresse existante, sans changer son mot de passe ni envoyer de code.
  const id = randomUUID();
  const binding = randomBytes(32).toString("base64url");
  if (kind === "register" && existing) return `${id}.${binding}`;
  const code = generateCode();
  const registration = kind === "register" ? registrationSchema.parse(body) : null;
  await db.$transaction(async tx => {
    // Sérialise la création et le renvoi par adresse, y compris avant la création du User.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.email}))::text`;
    if (kind === "login") {
      const current = await tx.user.findUnique({ where: { id: existing!.id } });
      if (!current || current.passwordHash !== existing!.passwordHash) throw new AuthFlowError("Email ou mot de passe incorrect.", 401);
    }
    await tx.authChallenge.updateMany({ where: { email: input.email, consumedAt: null }, data: { consumedAt: new Date(), passwordHash: null } });
    await tx.authChallenge.create({ data: {
      id, email: input.email, purpose: kind === "register" ? "REGISTER" : "LOGIN",
      bindingHash: digest(`binding:${binding}`), codeHash: digest(`code:${id}:${code}`),
      passwordHash, name: registration?.name,
      accountType: registration?.accountType ?? existing?.accountType ?? "BUSINESS",
      organizationName: registration?.accountType === "BUSINESS" ? registration.organizationName : null,
      userId: kind === "login" ? existing!.id : null, expiresAt: new Date(Date.now() + CODE_TTL_MS),
    } });
  });
  try { await sendCode(input.email, code, id, 1); }
  catch {
    await db.authChallenge.update({ where: { id }, data: { consumedAt: new Date(), passwordHash: null } });
    throw new AuthFlowError("Le code n’a pas pu être envoyé. Veuillez réessayer.", 503);
  }
  return `${id}.${binding}`;
}

export async function resendCode(token: string, address: string) {
  await rateLimit("resend-ip", address, 15);
  const parsed = parseChallengeToken(token);
  if (!parsed) throw invalidCode();
  assertMailConfigured();
  const db = getDb();
  const existing = await db.authChallenge.findUnique({ where: { id: parsed.id } });
  if (!existing || !matches(`binding:${parsed.binding}`, existing.bindingHash)) throw invalidCode();
  await rateLimit("start-email", existing.email, 5);
  let code = generateCode();
  const challenge = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${existing.email}))::text`;
    const current = await lockChallenge(tx, parsed.id);
    if (!current || current.consumedAt || current.createdAt.getTime() + 15 * 60_000 < Date.now() || current.attempts >= 5 || current.sends >= 3) throw invalidCode();
    if (Date.now() - current.lastSentAt.getTime() < 60_000) throw new AuthFlowError("Patientez une minute entre deux envois.", 429);
    while (matches(`code:${current.id}:${code}`, current.codeHash)) code = generateCode();
    return tx.authChallenge.update({ where: { id: current.id }, data: { codeHash: digest(`code:${current.id}:${code}`), expiresAt: new Date(Date.now() + CODE_TTL_MS), lastSentAt: new Date(), sends: { increment: 1 } } });
  });
  try { await sendCode(challenge.email, code, challenge.id, challenge.sends); }
  catch {
    await db.authChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date(), passwordHash: null } });
    throw new AuthFlowError("Le code n’a pas pu être envoyé. Recommencez la connexion.", 503);
  }
}

export async function completeAuth(token: string, code: unknown, address: string) {
  await rateLimit("verify-ip", address, 40);
  const parsed = parseChallengeToken(token);
  if (!parsed || !verificationCodeSchema.safeParse(code).success) return null;
  const db = getDb();
  const hint = await db.authChallenge.findUnique({ where: { id: parsed.id }, select: { email: true } });
  if (!hint) return null;
  const result = await db.$transaction(async tx => {
    // Même ordre de verrouillage que la réinitialisation : compte puis challenge.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${hint.email}))::text`;
    const challenge = await lockChallenge(tx, parsed.id);
    if (!challenge || !matches(`binding:${parsed.binding}`, challenge.bindingHash) || challenge.consumedAt || challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= 5) return null;
    if (!matches(`code:${challenge.id}:${code}`, challenge.codeHash)) {
      await tx.authChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      return null; // Retourner plutôt que lever pour conserver le compteur dans la transaction.
    }
    let user;
    if (challenge.purpose === "REGISTER") {
      // Deux challenges concurrents ne peuvent pas créer deux comptes portant le même email.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`register:${challenge.email}`}))::text`;
      if (await tx.user.findUnique({ where: { email: challenge.email } })) return null;
      if (!challenge.passwordHash || (challenge.accountType === "BUSINESS" && !challenge.organizationName)) return null;
      user = await tx.user.create({ data: {
        email: challenge.email, name: challenge.name, accountType: challenge.accountType,
        passwordHash: challenge.passwordHash, emailVerified: new Date(),
        ...(challenge.accountType === "BUSINESS" ? { memberships: { create: {
          role: "OWNER", organization: { create: { name: challenge.organizationName!, slug: `entreprise-${randomUUID()}` } },
        } } } : {}),
      } });
    } else {
      if (!challenge.userId) return null;
      user = await tx.user.findUnique({ where: { id: challenge.userId } });
      if (!user) return null;
      if (!user.emailVerified) await tx.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
    }
    const session = await tx.authSession.create({ data: { id: randomBytes(32).toString("base64url"), userId: user.id, expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) } });
    await tx.authChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date(), passwordHash: null } });
    return { id: user.id, name: user.name, email: user.email, sessionId: session.id };
  });
  return result;
}
