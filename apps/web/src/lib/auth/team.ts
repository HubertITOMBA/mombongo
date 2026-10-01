import { randomBytes, randomUUID } from "node:crypto";
import { hash } from "argon2";
import { acceptInvitationSchema, inviteMemberSchema, changeMemberRoleSchema } from "@mombongo/contracts";
import { getDb } from "@/lib/db";
import { digest, matches, parseChallengeToken } from "./crypto";
import { assertMailConfigured, sendInvitation } from "./mail";
import { AuthFlowError, rateLimit } from "./rate-limit";
import { passwordOptions } from "./service";
import { canAssignRole, canChangeMembership, canManageTeam } from "./permissions";
import type { MemberRole } from "@/generated/prisma/client";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
const invalidLink = () => new AuthFlowError("Cette invitation est invalide ou a expiré.");

export type InvitationPreview = {
  email: string;
  organizationName: string;
  role: Exclude<MemberRole, "OWNER">;
  status: "signup" | "login" | "join" | "member";
};

export async function inviteMember(actorUserId: string, organizationId: string, actorRole: MemberRole, body: unknown, address: string) {
  if (!canManageTeam(actorRole)) throw new AuthFlowError("Votre rôle ne permet pas d’inviter des collaborateurs.", 403);
  await rateLimit("invite-ip", address, 20);
  await rateLimit("invite-org", organizationId, 15);
  const input = inviteMemberSchema.safeParse(body);
  if (!input.success) throw new AuthFlowError("Vérifiez l’adresse email et le rôle proposé.");
  if (!canAssignRole(actorRole, input.data.role)) throw new AuthFlowError("Vous ne pouvez pas attribuer ce rôle.", 403);
  assertMailConfigured();
  const db = getDb();
  const existing = await db.user.findUnique({ where: { email: input.data.email } });
  if (existing?.accountType === "INDIVIDUAL") throw new AuthFlowError("Cette adresse appartient à un compte particulier.");
  if (existing) {
    const member = await db.membership.findUnique({ where: { userId_organizationId: { userId: existing.id, organizationId } } });
    if (member) throw new AuthFlowError("Cette personne fait déjà partie de l’entreprise.");
  }
  const id = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  const organization = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`org:${organizationId}`}))::text`;
    const current = await tx.user.findUnique({ where: { email: input.data.email } });
    if (current?.accountType === "INDIVIDUAL") throw new AuthFlowError("Cette adresse appartient à un compte particulier.");
    if (current && await tx.membership.findUnique({ where: { userId_organizationId: { userId: current.id, organizationId } } })) {
      throw new AuthFlowError("Cette personne fait déjà partie de l’entreprise.");
    }
    await tx.invitation.updateMany({ where: { organizationId, email: input.data.email, consumedAt: null }, data: { consumedAt: new Date() } });
    await tx.invitation.create({
      data: {
        id,
        email: input.data.email,
        organizationId,
        role: input.data.role,
        tokenHash: digest(`invite:${id}:${secret}`),
        invitedById: actorUserId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    return tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
  });
  try {
    await sendInvitation(input.data.email, organization.name, `${id}.${secret}`, id);
  } catch {
    await db.invitation.update({ where: { id }, data: { consumedAt: new Date() } });
    throw new AuthFlowError("L’invitation n’a pas pu être envoyée. Réessayez plus tard.", 503);
  }
}

export async function listTeam(organizationId: string) {
  const db = getDb();
  const [members, invitations] = await Promise.all([
    db.membership.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, email: true, name: true } } },
    }),
    db.invitation.findMany({
      where: { organizationId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    }),
  ]);
  const rank = { OWNER: 0, ADMIN: 1, MEMBER: 2, ACCOUNTANT: 3 } as const;
  return { members: members.sort((a, b) => rank[a.role] - rank[b.role] || a.createdAt.getTime() - b.createdAt.getTime()), invitations };
}

export async function previewInvitation(token: string, sessionUser?: { id: string; email: string } | null): Promise<InvitationPreview> {
  const invitation = await loadInvitation(token);
  if (!invitation) throw invalidLink();
  const existing = await getDb().user.findUnique({ where: { email: invitation.email } });
  if (existing) {
    const member = await getDb().membership.findUnique({ where: { userId_organizationId: { userId: existing.id, organizationId: invitation.organizationId } } });
    if (member) return { email: invitation.email, organizationName: invitation.organization.name, role: invitation.role, status: "member" };
    if (sessionUser?.id === existing.id) return { email: invitation.email, organizationName: invitation.organization.name, role: invitation.role, status: "join" };
    return { email: invitation.email, organizationName: invitation.organization.name, role: invitation.role, status: "login" };
  }
  return { email: invitation.email, organizationName: invitation.organization.name, role: invitation.role, status: "signup" };
}

export async function acceptInvitation(token: string, body: unknown, address: string, sessionUser?: { id: string; email: string } | null) {
  await rateLimit("invite-accept-ip", address, 20);
  const parsedToken = parseChallengeToken(token);
  if (!parsedToken || !acceptInvitationSchema.safeParse({ ...objectBody(body), token }).success) throw invalidLink();
  const invitation = await loadInvitation(token);
  if (!invitation) throw invalidLink();
  const db = getDb();
  const existing = await db.user.findUnique({ where: { email: invitation.email } });
  if (existing?.accountType === "INDIVIDUAL") throw new AuthFlowError("Cette adresse appartient à un compte particulier.");
  if (existing) {
    if (!sessionUser || sessionUser.id !== existing.id || sessionUser.email !== existing.email) {
      throw new AuthFlowError("Connectez-vous avec cette adresse, puis rouvrez le lien reçu.");
    }
  } else {
    const input = acceptInvitationSchema.safeParse({ ...objectBody(body), token });
    const name = input.success ? input.data.name : undefined;
    const password = input.success ? input.data.password : undefined;
    const confirmation = input.success ? input.data.confirmation : undefined;
    if (!name || !password || password.length < 12 || password !== confirmation) {
      throw new AuthFlowError("Saisissez votre nom et deux mots de passe identiques d’au moins 12 caractères.");
    }
  }
  const passwordHash = existing ? null : await hash(String(objectBody(body).password), passwordOptions);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`org:${invitation.organizationId}`}))::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${invitation.email}))::text`;
    await tx.$queryRaw`SELECT id FROM "Invitation" WHERE id = ${parsedToken.id} FOR UPDATE`;
    const current = await tx.invitation.findUnique({ where: { id: parsedToken.id } });
    if (!current || current.consumedAt || current.expiresAt.getTime() <= Date.now() || !matches(`invite:${parsedToken.id}:${parsedToken.binding}`, current.tokenHash)) throw invalidLink();
    let userId = existing?.id;
    if (!userId) {
      if (await tx.user.findUnique({ where: { email: current.email } })) throw new AuthFlowError("Un compte existe déjà pour cette adresse. Connectez-vous, puis rouvrez le lien.");
      const created = await tx.user.create({
        data: {
          email: current.email,
          name: String(objectBody(body).name),
          accountType: "BUSINESS",
          passwordHash: passwordHash!,
          emailVerified: new Date(),
        },
      });
      userId = created.id;
    } else if (await tx.membership.findUnique({ where: { userId_organizationId: { userId, organizationId: current.organizationId } } })) {
      throw new AuthFlowError("Vous faites déjà partie de cette entreprise.");
    }
    await tx.membership.create({ data: { userId, organizationId: current.organizationId, role: current.role } });
    await tx.invitation.update({ where: { id: current.id }, data: { consumedAt: new Date() } });
    await tx.invitation.updateMany({ where: { organizationId: current.organizationId, email: current.email, consumedAt: null }, data: { consumedAt: new Date() } });
  });
}

export async function changeMemberRole(actorRole: MemberRole, organizationId: string, body: unknown) {
  if (!canManageTeam(actorRole)) throw new AuthFlowError("Votre rôle ne permet pas de modifier les accès.", 403);
  const input = changeMemberRoleSchema.safeParse(body);
  if (!input.success) throw new AuthFlowError("Vérifiez le collaborateur et le rôle.");
  const db = getDb();
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`org:${organizationId}`}))::text`;
    const membership = await tx.membership.findFirst({ where: { id: input.data.membershipId, organizationId } });
    if (!membership) throw new AuthFlowError("Collaborateur introuvable.");
    if (!canChangeMembership(actorRole, membership.role, input.data.role)) throw new AuthFlowError("Vous ne pouvez pas modifier ce rôle.", 403);
    if (membership.role === input.data.role) return;
    await tx.membership.update({ where: { id: membership.id }, data: { role: input.data.role } });
  });
}

export async function removeMember(actorUserId: string, actorRole: MemberRole, organizationId: string, membershipId: string) {
  if (!canManageTeam(actorRole)) throw new AuthFlowError("Votre rôle ne permet pas de retirer un collaborateur.", 403);
  const db = getDb();
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`org:${organizationId}`}))::text`;
    const membership = await tx.membership.findFirst({ where: { id: membershipId, organizationId } });
    if (!membership) throw new AuthFlowError("Collaborateur introuvable.");
    if (membership.userId === actorUserId) throw new AuthFlowError("Vous ne pouvez pas quitter l’entreprise depuis cet écran.");
    if (!canChangeMembership(actorRole, membership.role)) throw new AuthFlowError("Vous ne pouvez pas retirer ce collaborateur.", 403);
    if (membership.role === "OWNER") throw new AuthFlowError("Le propriétaire ne peut pas être retiré.");
    await tx.membership.delete({ where: { id: membership.id } });
  });
}

export async function revokeInvitation(actorRole: MemberRole, organizationId: string, invitationId: string) {
  if (!canManageTeam(actorRole)) throw new AuthFlowError("Votre rôle ne permet pas d’annuler une invitation.", 403);
  const db = getDb();
  const invitation = await db.invitation.findFirst({ where: { id: invitationId, organizationId, consumedAt: null } });
  if (!invitation) throw new AuthFlowError("Invitation introuvable.");
  if (!canAssignRole(actorRole, invitation.role)) throw new AuthFlowError("Vous ne pouvez pas annuler cette invitation.", 403);
  await db.invitation.update({ where: { id: invitation.id }, data: { consumedAt: new Date() } });
}

async function loadInvitation(token: string) {
  const parsed = parseChallengeToken(token);
  if (!parsed) return null;
  const invitation = await getDb().invitation.findUnique({ where: { id: parsed.id }, include: { organization: { select: { name: true } } } });
  if (!invitation || invitation.consumedAt || invitation.expiresAt.getTime() <= Date.now() || invitation.role === "OWNER") return null;
  if (!matches(`invite:${parsed.id}:${parsed.binding}`, invitation.tokenHash)) return null;
  return invitation as typeof invitation & { role: Exclude<MemberRole, "OWNER"> };
}

function objectBody(body: unknown) {
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}
