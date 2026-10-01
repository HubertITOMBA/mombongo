import {
  addActivitySchema,
  addressIdInputSchema,
  changeStageSchema,
  createAddressSchema,
  createCustomerSchema,
  customerIdInputSchema,
  customerKindSchema,
  customerStatusSchema,
  pipelineStageLabels,
  pipelineStages,
  resolvePersistedDisplayName,
  updateAddressSchema,
  updateCustomerSchema,
} from "@mombongo/contracts";
import { getDb } from "@/lib/db";
import { AuthFlowError, rateLimit } from "@/lib/auth/rate-limit";
import { canWriteCustomers } from "@/lib/auth/permissions";
import type { ActivityType, CustomerCivility, CustomerKind, CustomerPartyKind, CustomerStatus, MemberRole, PipelineStage } from "@/generated/prisma/client";

const missing = () => new AuthFlowError("Cette fiche est introuvable.", 404);
const forbidden = () => new AuthFlowError("Votre rôle ne permet pas de modifier les fiches clients.", 403);
const archived = () => new AuthFlowError("Cette fiche est archivée. Restaurez-la pour la modifier.");
type CustomerStore = Pick<ReturnType<typeof getDb>, "customer" | "customerActivity" | "membership">;

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, body: unknown, message: string): T {
  const input = schema.safeParse(body);
  if (!input.success) throw new AuthFlowError(message);
  return input.data;
}

function assertWriter(role: MemberRole) {
  if (!canWriteCustomers(role)) throw forbidden();
}

async function customerOf(organizationId: string, customerId: string, tx: CustomerStore = getDb()) {
  const customer = await tx.customer.findFirst({ where: { id: customerId, organizationId } });
  if (!customer) throw missing();
  return customer;
}

async function recordActivity(
  tx: CustomerStore,
  organizationId: string,
  customerId: string,
  type: ActivityType,
  message: string,
  createdById?: string,
) {
  await tx.customerActivity.create({ data: { organizationId, customerId, type, message, createdById } });
}

async function assertOwner(organizationId: string, ownerUserId: string | undefined, tx: CustomerStore = getDb()) {
  if (!ownerUserId) return;
  const member = await tx.membership.findFirst({ where: { organizationId, userId: ownerUserId }, select: { id: true } });
  if (!member) throw new AuthFlowError("Le responsable doit appartenir à l’entreprise.");
}

function crmData(input: {
  stage?: PipelineStage;
  source?: string;
  ownerUserId?: string;
  estimatedCents?: number;
  probability?: number;
  nextAction?: string;
  nextActionAt?: string;
  kind: "CLIENT" | "PROSPECT";
}, creating = false) {
  return {
    ...(input.stage || creating ? { stage: input.stage ?? (input.kind === "CLIENT" ? "WON" : "NEW") } : {}),
    source: input.source ?? null,
    ownerUserId: input.ownerUserId ?? null,
    estimatedCents: input.estimatedCents ?? null,
    probability: input.probability ?? null,
    nextAction: input.nextAction ?? null,
    nextActionAt: input.nextActionAt ? new Date(`${input.nextActionAt}T12:00:00.000Z`) : null,
  };
}

async function assertUniqueEmail(organizationId: string, email: string | undefined, customerId?: string, tx: CustomerStore = getDb()) {
  if (!email) return;
  const duplicate = await tx.customer.findFirst({
    where: { organizationId, email, status: "ACTIVE", ...(customerId ? { id: { not: customerId } } : {}) },
    select: { id: true },
  });
  if (duplicate) throw new AuthFlowError("Un contact actif utilise déjà cette adresse email.");
}

type IdentityInput = {
  partyKind?: CustomerPartyKind;
  civility?: CustomerCivility;
  firstName?: string;
  lastName?: string;
  legalName?: string;
  tradeName?: string;
  displayName?: string;
  siren?: string;
  siret?: string;
  vatNumber?: string;
  companyNumber?: string;
  taxablePerson?: boolean;
};

type IdentityCurrent = {
  partyKind: CustomerPartyKind | null;
  civility: CustomerCivility | null;
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
  tradeName: string | null;
  displayName: string;
  siren: string | null;
  siret: string | null;
  vatNumber: string | null;
  companyNumber: string | null;
  taxablePerson: boolean | null;
};

function identityData(input: IdentityInput, current?: IdentityCurrent) {
  const partyKind = input.partyKind ?? current?.partyKind ?? null;
  const displayName = resolvePersistedDisplayName({
    partyKind,
    displayName: input.displayName ?? current?.displayName,
    firstName: input.firstName ?? current?.firstName,
    lastName: input.lastName ?? current?.lastName,
    legalName: input.legalName ?? current?.legalName,
    tradeName: input.tradeName ?? current?.tradeName,
  });
  const companyNumber = input.companyNumber ?? current?.companyNumber ?? null;
  const taxablePerson = input.taxablePerson ?? current?.taxablePerson ?? null;
  if (partyKind === "PERSON") {
    return {
      partyKind,
      civility: input.civility ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      legalName: null,
      tradeName: null,
      displayName,
      siren: null,
      siret: null,
      vatNumber: null,
      companyNumber,
      taxablePerson: null,
    };
  }
  if (partyKind === "COMPANY") {
    return {
      partyKind,
      civility: null,
      firstName: null,
      lastName: null,
      legalName: input.legalName ?? null,
      tradeName: input.tradeName ?? null,
      displayName,
      siren: input.siren ?? null,
      siret: input.siret ?? null,
      vatNumber: input.vatNumber ?? null,
      companyNumber,
      taxablePerson,
    };
  }
  return {
    partyKind: null,
    displayName,
    companyNumber,
    taxablePerson: null,
  };
}

export async function listCustomers(
  organizationId: string,
  filters: { query?: string; kind?: string; status?: string } = {},
) {
  const query = filters.query?.trim().slice(0, 120);
  const kind = customerKindSchema.safeParse(filters.kind);
  const status = filters.status === "ALL" ? undefined : customerStatusSchema.safeParse(filters.status || "ACTIVE");
  return getDb().customer.findMany({
    where: {
      organizationId,
      ...(kind.success ? { kind: kind.data } : {}),
      ...(status && status.success ? { status: status.data } : {}),
      ...(query
        ? {
          OR: [
            { displayName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { legalName: { contains: query, mode: "insensitive" } },
            { tradeName: { contains: query, mode: "insensitive" } },
          ],
        }
        : {}),
    },
    orderBy: [{ displayName: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { addresses: true } },
      owner: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function listOwners(organizationId: string) {
  const members = await getDb().membership.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  return members.map(member => member.user);
}

export async function listPipeline(organizationId: string) {
  const prospects = await getDb().customer.findMany({
    where: { organizationId, status: "ACTIVE", kind: "PROSPECT" },
    orderBy: [{ nextActionAt: "asc" }, { updatedAt: "desc" }],
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  return Object.fromEntries(pipelineStages.map(stage => [stage, prospects.filter(item => item.stage === stage)])) as Record<PipelineStage, typeof prospects>;
}

export async function getCustomer(organizationId: string, customerId: string) {
  const customer = await getDb().customer.findFirst({
    where: { id: customerId, organizationId },
    include: {
      addresses: { orderBy: { createdAt: "asc" } },
      owner: { select: { id: true, name: true, email: true } },
      activities: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true, email: true } } } },
    },
  });
  if (!customer) throw missing();
  return customer;
}

export async function createCustomer(role: MemberRole, organizationId: string, body: unknown, address: string, actorUserId?: string) {
  assertWriter(role);
  await rateLimit("customer-write", `${organizationId}:${address}`, 40);
  const input = parse(createCustomerSchema, body, "Vérifiez le nom et les coordonnées du contact.");
  const db = getDb();
  return db.$transaction(async tx => {
    if (input.email) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cust:${organizationId}:${input.email}`}))::text`;
    }
    await assertUniqueEmail(organizationId, input.email, undefined, tx);
    await assertOwner(organizationId, input.ownerUserId, tx);
    const customer = await tx.customer.create({
      data: {
        organizationId,
        email: input.email,
        phone: input.phone,
        kind: input.kind,
        notes: input.notes,
        ...identityData(input),
        ...crmData(input, true),
      },
    });
    await recordActivity(tx, organizationId, customer.id, "CREATED", input.kind === "PROSPECT" ? "Prospect créé" : "Client créé", actorUserId);
    return customer;
  });
}

export async function updateCustomer(role: MemberRole, organizationId: string, body: unknown, actorUserId?: string) {
  assertWriter(role);
  const input = parse(updateCustomerSchema, body, "Vérifiez le nom et les coordonnées du contact.");
  const db = getDb();
  return db.$transaction(async tx => {
    const current = await customerOf(organizationId, input.customerId, tx);
    if (current.status === "ARCHIVED") throw archived();
    if (input.email) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cust:${organizationId}:${input.email}`}))::text`;
    }
    await assertUniqueEmail(organizationId, input.email, input.customerId, tx);
    await assertOwner(organizationId, input.ownerUserId, tx);
    const nextStage = input.stage ?? current.stage;
    const customer = await tx.customer.update({
      where: { id: current.id },
      data: {
        email: input.email ?? null,
        phone: input.phone ?? null,
        kind: nextStage === "WON" ? "CLIENT" : input.kind,
        notes: input.notes ?? null,
        ...identityData(input, current),
        ...crmData({ ...input, kind: input.kind }),
      },
    });
    if (nextStage !== current.stage) {
      await recordActivity(tx, organizationId, customer.id, "STAGE", `Étape : ${pipelineStageLabels[current.stage]} → ${pipelineStageLabels[nextStage]}`, actorUserId);
    }
    if (current.kind === "PROSPECT" && customer.kind === "CLIENT") {
      await recordActivity(tx, organizationId, customer.id, "CONVERTED", "Prospect converti en client", actorUserId);
    }
    return customer;
  });
}

export async function archiveCustomer(role: MemberRole, organizationId: string, body: unknown) {
  assertWriter(role);
  const { customerId } = parse(customerIdInputSchema, body, "Cette fiche est introuvable.");
  const current = await customerOf(organizationId, customerId);
  if (current.status === "ARCHIVED") throw new AuthFlowError("Cette fiche est déjà archivée.");
  return getDb().customer.update({
    where: { id: current.id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}

export async function restoreCustomer(role: MemberRole, organizationId: string, body: unknown) {
  assertWriter(role);
  const { customerId } = parse(customerIdInputSchema, body, "Cette fiche est introuvable.");
  const db = getDb();
  return db.$transaction(async tx => {
    const current = await customerOf(organizationId, customerId, tx);
    if (current.status === "ACTIVE") throw new AuthFlowError("Cette fiche est déjà active.");
    if (current.email) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cust:${organizationId}:${current.email}`}))::text`;
    }
    await assertUniqueEmail(organizationId, current.email ?? undefined, current.id, tx);
    return tx.customer.update({
      where: { id: current.id },
      data: { status: "ACTIVE", archivedAt: null },
    });
  });
}

export async function convertProspect(role: MemberRole, organizationId: string, body: unknown, actorUserId?: string) {
  assertWriter(role);
  const { customerId } = parse(customerIdInputSchema, body, "Cette fiche est introuvable.");
  const db = getDb();
  return db.$transaction(async tx => {
    const current = await customerOf(organizationId, customerId, tx);
    if (current.status === "ARCHIVED") throw archived();
    if (current.kind === "CLIENT") throw new AuthFlowError("Cette fiche est déjà un client.");
    const customer = await tx.customer.update({
      where: { id: current.id },
      data: { kind: "CLIENT", stage: "WON" },
    });
    await recordActivity(tx, organizationId, customer.id, "CONVERTED", "Prospect converti en client", actorUserId);
    await recordActivity(tx, organizationId, customer.id, "STAGE", `Étape : ${pipelineStageLabels[current.stage]} → ${pipelineStageLabels.WON}`, actorUserId);
    return customer;
  });
}

export async function changePipelineStage(role: MemberRole, organizationId: string, body: unknown, actorUserId?: string) {
  assertWriter(role);
  const input = parse(changeStageSchema, body, "Vérifiez l’étape du pipeline.");
  const db = getDb();
  return db.$transaction(async tx => {
    const current = await customerOf(organizationId, input.customerId, tx);
    if (current.status === "ARCHIVED") throw archived();
    if (current.stage === input.stage) return current;
    const customer = await tx.customer.update({
      where: { id: current.id },
      data: {
        stage: input.stage,
        ...(input.stage === "WON" && current.kind === "PROSPECT" ? { kind: "CLIENT" } : {}),
      },
    });
    await recordActivity(tx, organizationId, customer.id, "STAGE", `Étape : ${pipelineStageLabels[current.stage]} → ${pipelineStageLabels[input.stage]}`, actorUserId);
    if (current.kind === "PROSPECT" && customer.kind === "CLIENT") {
      await recordActivity(tx, organizationId, customer.id, "CONVERTED", "Prospect converti en client", actorUserId);
    }
    return customer;
  });
}

export async function addCustomerActivity(role: MemberRole, organizationId: string, body: unknown, actorUserId?: string) {
  assertWriter(role);
  const input = parse(addActivitySchema, body, "Ajoutez un message d’au moins deux caractères.");
  const current = await customerOf(organizationId, input.customerId);
  if (current.status === "ARCHIVED") throw archived();
  await recordActivity(getDb(), organizationId, current.id, input.type, input.message, actorUserId);
  return current;
}

export async function addAddress(role: MemberRole, organizationId: string, body: unknown) {
  assertWriter(role);
  const input = parse(createAddressSchema, body, "Vérifiez l’adresse et le pays.");
  const current = await customerOf(organizationId, input.customerId);
  if (current.status === "ARCHIVED") throw archived();
  return getDb().address.create({
    data: {
      organizationId,
      customerId: current.id,
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

export async function updateAddress(role: MemberRole, organizationId: string, body: unknown) {
  assertWriter(role);
  const input = parse(updateAddressSchema, body, "Vérifiez l’adresse et le pays.");
  const address = await getDb().address.findFirst({
    where: { id: input.addressId, organizationId },
    include: { customer: { select: { status: true } } },
  });
  if (!address || !address.customerId || !address.customer) throw missing();
  if (address.customer.status === "ARCHIVED") throw archived();
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

export async function removeAddress(role: MemberRole, organizationId: string, body: unknown) {
  assertWriter(role);
  const { addressId } = parse(addressIdInputSchema, body, "Cette adresse est introuvable.");
  const address = await getDb().address.findFirst({
    where: { id: addressId, organizationId },
    include: { customer: { select: { status: true } } },
  });
  if (!address || !address.customerId || !address.customer) throw missing();
  if (address.customer.status === "ARCHIVED") throw archived();
  await getDb().address.delete({ where: { id: address.id } });
}

export type CustomerListItem = Awaited<ReturnType<typeof listCustomers>>[number];
export type CustomerRecord = Awaited<ReturnType<typeof getCustomer>>;
export type CustomerFilterKind = CustomerKind | undefined;
export type CustomerFilterStatus = CustomerStatus | "ALL" | undefined;
