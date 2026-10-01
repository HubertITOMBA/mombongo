import {
  addressIdInputSchema,
  createOrganizationAddressSchema,
  organizationIdentitySchema,
  updateOrganizationAddressSchema,
} from "@mombongo/contracts";
import { getDb } from "@/lib/db";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { canManageOrganizationProfile } from "@/lib/auth/permissions";
import type { MemberRole } from "@/generated/prisma/client";

const missing = () => new AuthFlowError("Cette organisation est introuvable.", 404);
const forbidden = () => new AuthFlowError("Votre rôle ne permet pas de modifier l’identité de l’entreprise.", 403);

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, body: unknown, message: string): T {
  const input = schema.safeParse(body);
  if (!input.success) throw new AuthFlowError(message);
  return input.data;
}

function assertManager(role: MemberRole) {
  if (!canManageOrganizationProfile(role)) throw forbidden();
}

export async function getOrganizationProfile(organizationId: string) {
  const organization = await getDb().organization.findFirst({
    where: { id: organizationId },
    include: { addresses: { where: { customerId: null }, orderBy: { createdAt: "asc" } } },
  });
  if (!organization) throw missing();
  return organization;
}

export async function updateOrganizationIdentity(role: MemberRole, organizationId: string, body: unknown) {
  assertManager(role);
  const input = parse(organizationIdentitySchema, body, "Vérifiez l’identité commerciale et les coordonnées de l’émetteur.");
  const current = await getOrganizationProfile(organizationId);
  return getDb().organization.update({
    where: { id: current.id },
    data: {
      name: input.name,
      entityKind: input.entityKind ?? null,
      legalName: input.legalName ?? null,
      tradeName: input.tradeName ?? null,
      legalFormLabel: input.legalFormLabel ?? null,
      siren: input.siren ?? null,
      siret: input.siret ?? null,
      vatNumber: input.vatNumber ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      countryCode: input.countryCode ?? null,
      currency: input.currency ?? current.currency,
      timezone: input.timezone ?? current.timezone,
      vatOnDebits: input.vatOnDebits ?? null,
      invoiceDueDays: input.invoiceDueDays ?? null,
      paymentTerms: input.paymentTerms ?? null,
      earlyPaymentDiscountTerms: input.earlyPaymentDiscountTerms ?? null,
      latePaymentPenaltyTerms: input.latePaymentPenaltyTerms ?? null,
      recoveryFeeMention: input.recoveryFeeMention ?? null,
    },
  });
}

export async function addOrganizationAddress(role: MemberRole, organizationId: string, body: unknown) {
  assertManager(role);
  const input = parse(createOrganizationAddressSchema, body, "Vérifiez l’adresse et le pays.");
  await getOrganizationProfile(organizationId);
  return getDb().address.create({
    data: {
      organizationId,
      customerId: null,
      type: input.type,
      label: input.label,
      line1: input.line1,
      line2: input.line2,
      postalCode: input.postalCode,
      city: input.city,
      countryCode: input.countryCode,
    },
  });
}

export async function updateOrganizationAddress(role: MemberRole, organizationId: string, body: unknown) {
  assertManager(role);
  const input = parse(updateOrganizationAddressSchema, body, "Vérifiez l’adresse et le pays.");
  const address = await getDb().address.findFirst({
    where: { id: input.addressId, organizationId, customerId: null },
  });
  if (!address) throw missing();
  return getDb().address.update({
    where: { id: address.id },
    data: {
      type: input.type,
      label: input.label,
      line1: input.line1,
      line2: input.line2 ?? null,
      postalCode: input.postalCode,
      city: input.city,
      countryCode: input.countryCode,
    },
  });
}

export async function removeOrganizationAddress(role: MemberRole, organizationId: string, body: unknown) {
  assertManager(role);
  const { addressId } = parse(addressIdInputSchema, body, "Cette adresse est introuvable.");
  const address = await getDb().address.findFirst({
    where: { id: addressId, organizationId, customerId: null },
  });
  if (!address) throw missing();
  await getDb().address.delete({ where: { id: address.id } });
}
