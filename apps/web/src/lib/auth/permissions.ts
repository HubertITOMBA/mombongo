import type { MemberRole } from "@/generated/prisma/client";

export const assignableRoles = ["ADMIN", "MEMBER", "ACCOUNTANT"] as const;
export type AssignableRole = (typeof assignableRoles)[number];

const operationalRoles: readonly MemberRole[] = ["OWNER", "ADMIN", "MEMBER"];
const financeAdminRoles: readonly MemberRole[] = ["OWNER", "ADMIN"];
const paymentRoles: readonly MemberRole[] = ["OWNER", "ADMIN", "ACCOUNTANT"];
const teamAdminRoles: readonly MemberRole[] = ["OWNER", "ADMIN"];

function hasRole(role: MemberRole, allowed: readonly MemberRole[]) {
  return allowed.includes(role);
}

export function canWriteCustomers(role: MemberRole) {
  return hasRole(role, operationalRoles);
}

export function canWriteAppointments(role: MemberRole) {
  return hasRole(role, operationalRoles);
}

export function canWriteQuotes(role: MemberRole) {
  return hasRole(role, operationalRoles);
}

export function canManageCatalog(role: MemberRole) {
  return hasRole(role, operationalRoles);
}

export function canIssueInvoices(role: MemberRole) {
  return hasRole(role, operationalRoles);
}

/** Abandon d’un brouillon de facture uniquement. Une facture émise se corrige par un avoir. */
export function canCancelInvoices(role: MemberRole) {
  return hasRole(role, financeAdminRoles);
}

export function canIssueCreditNotes(role: MemberRole) {
  return hasRole(role, financeAdminRoles);
}

export function canRecordPayments(role: MemberRole) {
  return hasRole(role, paymentRoles);
}

export function canCancelPayments(role: MemberRole) {
  return hasRole(role, paymentRoles);
}

export function canManageTeam(role: MemberRole) {
  return hasRole(role, teamAdminRoles);
}

export function canManageOrganizationProfile(role: MemberRole) {
  return hasRole(role, teamAdminRoles);
}

/** Configuration PA : OWNER/ADMIN uniquement, jamais déduit de canIssueInvoices. */
export const canManageElectronicInvoicing = canManageOrganizationProfile;

/** Soumission électronique : OWNER/ADMIN. MEMBER peut émettre une facture sans la transmettre à une PA. */
export const canSubmitElectronicInvoicing = canCancelInvoices;

/** Credentials PSP : OWNER/ADMIN, jamais déduit de canRecordPayments. */
export const canManagePaymentIntegrations = canManageOrganizationProfile;

/** Envoi manuel d’un document émis : indépendant de l’émission, des paiements et de la PA. */
export function canSendDocuments(role: MemberRole) {
  return hasRole(role, ["OWNER", "ADMIN", "MEMBER", "ACCOUNTANT"]);
}

export function canAssignRole(actor: MemberRole, role: MemberRole) {
  if (role === "OWNER") return false;
  if (actor === "OWNER") return role === "ADMIN" || role === "MEMBER" || role === "ACCOUNTANT";
  if (actor === "ADMIN") return role === "MEMBER" || role === "ACCOUNTANT";
  return false;
}

export function canChangeMembership(actor: MemberRole, current: MemberRole, next?: MemberRole) {
  if (current === "OWNER") return false;
  if (next && !canAssignRole(actor, next)) return false;
  if (actor === "OWNER") return true;
  if (actor === "ADMIN") return current === "MEMBER" || current === "ACCOUNTANT";
  return false;
}
