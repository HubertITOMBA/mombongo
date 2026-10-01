import {
  catalogItemIdInputSchema,
  createCatalogItemSchema,
  defaultTaxCategory,
  unitCodeFromUnit,
  updateCatalogItemSchema,
} from "@mombongo/contracts";
import { getDb } from "@/lib/db";
import { AuthFlowError, rateLimit } from "@/lib/auth/rate-limit";
import { canManageCatalog } from "@/lib/auth/permissions";
import type { LineItemKind, LineTaxCategory, MemberRole } from "@/generated/prisma/client";

const missing = () => new AuthFlowError("Cet article du catalogue est introuvable.", 404);
const forbidden = () => new AuthFlowError("Votre rôle ne permet pas de modifier le catalogue.", 403);

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, body: unknown, message: string): T {
  const input = schema.safeParse(body);
  if (!input.success) throw new AuthFlowError(message);
  return input.data;
}

function assertManager(role: MemberRole) {
  if (!canManageCatalog(role)) throw forbidden();
}

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function listCatalogItems(
  organizationId: string,
  filters: { query?: string; itemKind?: string; active?: string } = {},
) {
  const query = filters.query?.trim().slice(0, 120);
  const kind = filters.itemKind === "PRODUCT" || filters.itemKind === "SERVICE" ? filters.itemKind : undefined;
  const active = filters.active === "INACTIVE" ? false : filters.active === "ALL" ? undefined : true;
  return getDb().catalogItem.findMany({
    where: {
      organizationId,
      ...(kind ? { itemKind: kind } : {}),
      ...(active === undefined ? {} : { active }),
      ...(query
        ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { reference: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
        }
        : {}),
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: 80,
  });
}

export async function getCatalogItem(organizationId: string, catalogItemId: string) {
  const item = await getDb().catalogItem.findFirst({ where: { id: catalogItemId, organizationId } });
  if (!item) throw missing();
  return item;
}

function fiscalFields(input: {
  unit: string;
  vatBps: number;
  taxCategory?: LineTaxCategory | null;
  taxExemptionReason?: string | null;
  taxExemptionReasonCode?: string | null;
}) {
  const taxCategory = defaultTaxCategory(input.vatBps, input.taxCategory ?? null);
  return {
    unit: input.unit,
    unitCode: unitCodeFromUnit(input.unit),
    vatBps: input.vatBps,
    taxCategory,
    taxExemptionReason: taxCategory && ["EXEMPT", "REVERSE_CHARGE", "OUT_OF_SCOPE"].includes(taxCategory)
      ? (input.taxExemptionReason ?? null)
      : null,
    taxExemptionReasonCode: taxCategory === "EXEMPT" ? (input.taxExemptionReasonCode ?? null) : null,
  };
}

export async function createCatalogItem(role: MemberRole, organizationId: string, body: unknown, address: string) {
  assertManager(role);
  await rateLimit("catalog-write", `${organizationId}:${address}`, 40);
  const input = parse(createCatalogItemSchema, body, "Vérifiez le nom, le prix HT et la TVA de l’article.");
  try {
    return await getDb().catalogItem.create({
      data: {
        organizationId,
        itemKind: input.itemKind,
        reference: input.reference ?? null,
        name: input.name,
        description: input.description ?? null,
        unitPriceCents: input.unitPriceCents,
        ...fiscalFields(input),
      },
    });
  } catch (error) {
    if (isUniqueConflict(error)) throw new AuthFlowError("Cette référence existe déjà dans le catalogue.");
    throw error;
  }
}

export async function updateCatalogItem(role: MemberRole, organizationId: string, body: unknown) {
  assertManager(role);
  const input = parse(updateCatalogItemSchema, body, "Vérifiez le nom, le prix HT et la TVA de l’article.");
  const current = await getCatalogItem(organizationId, input.catalogItemId);
  try {
    return await getDb().catalogItem.update({
      where: { id: current.id },
      data: {
        itemKind: input.itemKind,
        reference: input.reference ?? null,
        name: input.name,
        description: input.description ?? null,
        unitPriceCents: input.unitPriceCents,
        ...fiscalFields(input),
      },
    });
  } catch (error) {
    if (isUniqueConflict(error)) throw new AuthFlowError("Cette référence existe déjà dans le catalogue.");
    throw error;
  }
}

async function setCatalogActive(role: MemberRole, organizationId: string, body: unknown, active: boolean) {
  assertManager(role);
  const { catalogItemId } = parse(catalogItemIdInputSchema, body, "Cet article du catalogue est introuvable.");
  const current = await getCatalogItem(organizationId, catalogItemId);
  return getDb().catalogItem.update({
    where: { id: current.id },
    data: { active },
  });
}

export async function deactivateCatalogItem(role: MemberRole, organizationId: string, body: unknown) {
  return setCatalogActive(role, organizationId, body, false);
}

export async function reactivateCatalogItem(role: MemberRole, organizationId: string, body: unknown) {
  return setCatalogActive(role, organizationId, body, true);
}

export async function resolveCatalogLine(
  organizationId: string,
  input: {
    catalogItemId?: string;
    description: string;
    unit: string;
    unitPriceCents: number;
    vatBps: number;
    itemKind: LineItemKind;
    taxCategory?: LineTaxCategory | null;
    taxExemptionReason?: string | null;
    taxExemptionReasonCode?: string | null;
  },
  tx: Pick<ReturnType<typeof getDb>, "catalogItem"> = getDb(),
) {
  if (!input.catalogItemId) {
    return {
      ...input,
      ...fiscalFields(input),
    };
  }
  const item = await tx.catalogItem.findFirst({ where: { id: input.catalogItemId, organizationId } });
  if (!item) throw missing();
  if (!item.active) throw new AuthFlowError("Cet article n’est plus proposé. Saisissez une ligne libre ou réactivez-le.");
  return {
    ...input,
    description: input.description,
    unitPriceCents: item.unitPriceCents,
    itemKind: item.itemKind,
    unit: item.unit,
    unitCode: item.unitCode,
    vatBps: item.vatBps,
    taxCategory: item.taxCategory,
    taxExemptionReason: item.taxExemptionReason,
    taxExemptionReasonCode: item.taxExemptionReasonCode,
  };
}
