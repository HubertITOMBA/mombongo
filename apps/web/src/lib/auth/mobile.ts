import { randomBytes, randomUUID } from "node:crypto";
import { loginSchema, mobileChallengeSchema, mobileRefreshSchema, mobileVerifySchema, registrationSchema } from "@mombongo/contracts";
import { getDb } from "@/lib/db";
import { digest, matches, parseChallengeToken, SESSION_TTL_SECONDS } from "./crypto";
import { listAccessibleOrganizations, resolveActiveOrganization, resolveOrganizationContext, type OrganizationContext } from "./organization";
import { AuthFlowError, rateLimit } from "./rate-limit";
import { beginAuth, completeAuth, resendCode } from "./service";

export const ACCESS_TTL_MS = 15 * 60_000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
const invalid = () => new AuthFlowError("Session mobile invalide ou expirée. Reconnectez-vous.", 401);

type AccessPayload = { sid: string; uid: string; exp: number };

export function signAccessToken(sessionId: string, userId: string, now = Date.now()) {
  const payload: AccessPayload = { sid: sessionId, uid: userId, exp: now + ACCESS_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${digest(`access:${body}`)}`;
}

export function readAccessToken(token: string): AccessPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature || !matches(`access:${body}`, signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AccessPayload;
    if (typeof payload.sid !== "string" || typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function createRefreshToken(userId: string, familyId: string = randomUUID()) {
  const id = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  await getDb().mobileRefreshToken.create({
    data: {
      id,
      userId,
      familyId,
      tokenHash: digest(`refresh:${id}:${secret}`),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return `${id}.${secret}`;
}

async function tokensFor(user: { id: string; name: string | null; email: string; sessionId: string }, familyId?: string) {
  return {
    accessToken: signAccessToken(user.sessionId, user.id),
    refreshToken: await createRefreshToken(user.id, familyId),
    expiresIn: ACCESS_TTL_MS / 1000,
    user: { id: user.id, name: user.name, email: user.email },
  };
}

export async function startMobileAuth(kind: "register" | "login", body: unknown, address: string) {
  const schema = kind === "register" ? registrationSchema : loginSchema;
  if (!schema.safeParse(body).success) {
    throw new AuthFlowError(kind === "register" ? "Vérifiez les champs et utilisez un mot de passe d’au moins 12 caractères." : "Vérifiez votre adresse email et votre mot de passe.");
  }
  return { challengeToken: await beginAuth(kind, body, address) };
}

export async function resendMobileCode(body: unknown, address: string) {
  const input = mobileChallengeSchema.safeParse(body);
  if (!input.success) throw new AuthFlowError("Recommencez la connexion pour recevoir un nouveau code.");
  await resendCode(input.data.challengeToken, address);
}

export async function verifyMobileAuth(body: unknown, address: string) {
  const input = mobileVerifySchema.safeParse(body);
  if (!input.success) throw new AuthFlowError("Vérifiez le code à six chiffres.");
  const user = await completeAuth(input.data.challengeToken, input.data.code, address);
  if (!user) throw new AuthFlowError("Code incorrect ou expiré. Vérifiez le dernier code reçu ou recommencez la connexion.", 401);
  return tokensFor(user);
}

export async function refreshMobileAuth(body: unknown, address: string) {
  await rateLimit("mobile-refresh", address, 40);
  const input = mobileRefreshSchema.safeParse(body);
  const parsed = input.success ? parseChallengeToken(input.data.refreshToken) : null;
  if (!parsed) throw invalid();
  const db = getDb();
  const current = await db.mobileRefreshToken.findUnique({ where: { id: parsed.id } });
  if (!current || !matches(`refresh:${parsed.id}:${parsed.binding}`, current.tokenHash)) throw invalid();
  if (current.revokedAt || current.expiresAt.getTime() <= Date.now()) throw invalid();
  if (current.consumedAt) {
    await db.mobileRefreshToken.updateMany({ where: { familyId: current.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw invalid();
  }
  const session = await db.$transaction(async tx => {
    const locked = await tx.mobileRefreshToken.findUnique({ where: { id: current.id } });
    if (!locked || locked.consumedAt || locked.revokedAt) throw invalid();
    await tx.mobileRefreshToken.update({ where: { id: locked.id }, data: { consumedAt: new Date() } });
    return tx.authSession.create({
      data: { id: randomBytes(32).toString("base64url"), userId: locked.userId, expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) },
    });
  });
  const user = await db.user.findUniqueOrThrow({ where: { id: current.userId }, select: { id: true, name: true, email: true } });
  return tokensFor({ ...user, sessionId: session.id }, current.familyId);
}

export async function revokeMobileAuth(userId: string, sessionId: string, refreshToken?: string) {
  const db = getDb();
  await db.authSession.deleteMany({ where: { id: sessionId, userId } });
  const parsed = refreshToken ? parseChallengeToken(refreshToken) : null;
  if (parsed) {
    const row = await db.mobileRefreshToken.findUnique({ where: { id: parsed.id } });
    if (row && row.userId === userId && matches(`refresh:${parsed.id}:${parsed.binding}`, row.tokenHash)) {
      await db.mobileRefreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      return;
    }
  }
  await db.mobileRefreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function requireMobileAccount(authorization: string | null) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const payload = readAccessToken(token);
  if (!payload) throw invalid();
  const db = getDb();
  const session = await db.authSession.findUnique({ where: { id: payload.sid } });
  if (!session || session.userId !== payload.uid || session.expiresAt.getTime() <= Date.now()) throw invalid();
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, accountType: true, memberships: { orderBy: { createdAt: "asc" }, include: { organization: { select: { id: true, name: true } } } } },
  });
  if (!user) throw invalid();
  return { user, sessionId: session.id };
}

export async function requireMobileOrganization(authorization: string | null, requestedOrganizationId?: string | null) {
  const account = await requireMobileAccount(authorization);
  if (account.user.accountType !== "BUSINESS") {
    throw new AuthFlowError("Cette fonction est réservée aux entreprises.", 403);
  }
  const resolved = await resolveActiveOrganization(account.user.id, requestedOrganizationId);
  return { ...account, ...resolved.context };
}

export async function summarizeAccount(userId: string, organizationId?: string | null) {
  const db = getDb();
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, name: true, accountType: true },
  });
  const organizations = user.accountType === "BUSINESS" ? await listAccessibleOrganizations(userId) : [];
  let context: OrganizationContext | null = null;
  if (user.accountType === "BUSINESS") {
    if (organizationId) context = await resolveOrganizationContext(userId, organizationId);
    else if (organizations.length > 0) context = (await resolveActiveOrganization(userId, null)).context;
  }
  const activeOrganizationId = context?.organization.id;
  const [clients, prospects, upcoming, openQuotes, issuedInvoices] = activeOrganizationId
    ? await Promise.all([
      db.customer.count({ where: { organizationId: activeOrganizationId, status: "ACTIVE", kind: "CLIENT" } }),
      db.customer.count({ where: { organizationId: activeOrganizationId, status: "ACTIVE", kind: "PROSPECT" } }),
      db.appointment.count({ where: { organizationId: activeOrganizationId, status: { in: ["SCHEDULED", "CONFIRMED"] }, startsAt: { gte: new Date() } } }),
      db.document.count({ where: { organizationId: activeOrganizationId, kind: "QUOTE", status: { in: ["DRAFT", "SENT"] } } }),
      db.document.count({ where: { organizationId: activeOrganizationId, kind: "INVOICE", status: "SENT" } }),
    ])
    : [0, 0, 0, 0, 0];
  return {
    name: user.name,
    email: user.email,
    accountType: user.accountType,
    organizationId: context?.organization.id ?? null,
    organizationName: context?.organization.name ?? null,
    role: context?.role ?? null,
    organizations,
    customers: { clients, prospects },
    invoices: { pending: issuedInvoices, overdue: 0, monthRevenue: 0, yearRevenue: 0 },
    expenses: { month: 0 },
    appointments: { upcoming },
    quotes: { open: openQuotes },
    alerts: [] as string[],
  };
}
