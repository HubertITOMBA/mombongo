import {
  documentIdInputSchema,
  paymentIdInputSchema,
  upsertElectronicInvoicingConnectionSchema,
} from "@mombongo/contracts";
import { getDb } from "@/lib/db";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { canManageElectronicInvoicing, canSubmitElectronicInvoicing } from "@/lib/auth/permissions";
import type { ElectronicInvoicingProvider, MemberRole } from "@/generated/prisma/client";
import { assertNoSecretFields } from "@/lib/integrations/credentials";
import { logIntegration } from "@/lib/integrations/log";
import {
  assertCapabilityImplemented,
  assertEnvironmentAllowed,
  requireAvailableConnector,
} from "@/lib/integrations/registry";
import { eInvoiceGateway } from "./gateway";
import { getEInvoiceAdapterForKey } from "./registry";
import { outboundDocumentOperations } from "./types";

const forbiddenManage = () => new AuthFlowError("Votre rôle ne permet pas de configurer la facturation électronique.", 403);
const forbiddenSubmit = () => new AuthFlowError("Votre rôle ne permet pas de transmettre une pièce à une plateforme agréée.", 403);

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, body: unknown, message: string): T {
  const input = schema.safeParse(body);
  if (!input.success) throw new AuthFlowError(message);
  return input.data;
}

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function getElectronicInvoicingConnection(organizationId: string) {
  return getDb().electronicInvoicingConnection.findUnique({ where: { organizationId } });
}

export async function getElectronicInvoicingConnectionById(organizationId: string, connectionId: string) {
  const connection = await getDb().electronicInvoicingConnection.findFirst({
    where: { id: connectionId, organizationId },
  });
  if (!connection) throw new AuthFlowError("Cette connexion est introuvable.", 404);
  return connection;
}

export async function upsertElectronicInvoicingConnection(role: MemberRole, organizationId: string, body: unknown) {
  if (!canManageElectronicInvoicing(role)) throw forbiddenManage();
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  assertNoSecretFields(raw);
  const input = parse(upsertElectronicInvoicingConnectionSchema, body, "Vérifiez la connexion de facturation électronique.");
  const connectorKey = input.connectorKey;
  const descriptor = requireAvailableConnector(connectorKey, "ELECTRONIC_INVOICING");
  assertEnvironmentAllowed(descriptor, input.environment);
  const provider = connectorKey as ElectronicInvoicingProvider;
  if (input.provider !== provider) throw new AuthFlowError("Ce connecteur n’est pas reconnu par Mombongo.", 400);
  try {
    const saved = await getDb().electronicInvoicingConnection.upsert({
      where: { organizationId },
      create: {
        organizationId,
        provider,
        connectorKey,
        status: input.status,
        environment: input.environment,
        externalAccountId: input.externalAccountId ?? null,
      },
      update: {
        provider,
        connectorKey,
        status: input.status,
        environment: input.environment,
        externalAccountId: input.externalAccountId ?? null,
      },
    });
    logIntegration({
      organizationId,
      connectorFamily: "ELECTRONIC_INVOICING",
      connectorKey,
      connectionId: saved.id,
      operation: "upsert_connection",
      result: saved.status,
    });
    return saved;
  } catch (error) {
    if (isUniqueConflict(error)) throw new AuthFlowError("Cet identifiant de compte fournisseur est déjà utilisé.", 409);
    throw error;
  }
}

export async function testElectronicInvoicingConnection(role: MemberRole, organizationId: string) {
  if (!canManageElectronicInvoicing(role)) throw forbiddenManage();
  const connection = await getElectronicInvoicingConnection(organizationId);
  if (!connection) throw new AuthFlowError("Configurez d’abord une connexion de test interne.", 409);
  const adapter = getEInvoiceAdapterForKey(connection.connectorKey || connection.provider);
  const result = await adapter.testConnection(connection);
  await getDb().electronicInvoicingConnection.update({
    where: { id: connection.id },
    data: { lastCheckedAt: new Date(), lastCheckOk: result.ok, status: result.ok ? connection.status : "ERROR" },
  });
  logIntegration({
    organizationId,
    connectorFamily: "ELECTRONIC_INVOICING",
    connectorKey: connection.connectorKey,
    connectionId: connection.id,
    operation: "test_connection",
    result: result.ok ? "ok" : "error",
  });
  return result;
}

export async function lookupElectronicDirectory(role: MemberRole, organizationId: string) {
  if (!canManageElectronicInvoicing(role)) throw forbiddenManage();
  const connection = await getElectronicInvoicingConnection(organizationId);
  assertCapabilityImplemented(connection?.connectorKey || "MOCK", "DIRECTORY_LOOKUP");
}

export async function getDocumentElectronicTransmission(organizationId: string, documentId: string) {
  return getDb().electronicTransmission.findFirst({
    where: {
      organizationId,
      documentId,
      direction: "OUTBOUND",
      operation: { in: outboundDocumentOperations },
    },
    include: { events: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listLatestDocumentTransmissions(organizationId: string, documentIds: string[]) {
  if (documentIds.length === 0) return [];
  const rows = await getDb().electronicTransmission.findMany({
    where: {
      organizationId,
      documentId: { in: documentIds },
      direction: "OUTBOUND",
      operation: { in: outboundDocumentOperations },
    },
    orderBy: { createdAt: "desc" },
  });
  const seen = new Set<string>();
  return rows.filter(row => {
    if (!row.documentId || seen.has(row.documentId)) return false;
    seen.add(row.documentId);
    return true;
  });
}

export async function submitElectronicDocument(role: MemberRole, organizationId: string, body: unknown) {
  if (!canSubmitElectronicInvoicing(role)) throw forbiddenSubmit();
  const { documentId } = parse(documentIdInputSchema, body, "Cette pièce est introuvable.");
  return eInvoiceGateway.submitOutbound({ organizationId, documentId });
}

export async function preparePaymentElectronicReporting(role: MemberRole, organizationId: string, body: unknown) {
  if (!canSubmitElectronicInvoicing(role)) throw forbiddenSubmit();
  const { paymentId } = parse(paymentIdInputSchema, body, "Ce paiement est introuvable.");
  return eInvoiceGateway.preparePaymentReporting({ organizationId, paymentId });
}
