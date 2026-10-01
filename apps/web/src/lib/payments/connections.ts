import { getDb } from "@/lib/db";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { canManagePaymentIntegrations } from "@/lib/auth/permissions";
import { assertNoSecretFields } from "@/lib/integrations/credentials";
import { logIntegration } from "@/lib/integrations/log";
import { requireConnectorDescriptor } from "@/lib/integrations/registry";
import type { MemberRole } from "@/generated/prisma/client";

const forbidden = () => new AuthFlowError("Votre rôle ne permet pas de configurer un prestataire de paiement.", 403);
const missing = () => new AuthFlowError("Cette connexion de paiement est introuvable.", 404);

export async function listPaymentConnections(organizationId: string) {
  return getDb().paymentConnection.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPaymentConnection(organizationId: string, connectionId: string) {
  const connection = await getDb().paymentConnection.findFirst({
    where: { id: connectionId, organizationId },
  });
  if (!connection) throw missing();
  return connection;
}

export async function upsertPaymentConnection(role: MemberRole, organizationId: string, body: unknown) {
  if (!canManagePaymentIntegrations(role)) throw forbidden();
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  assertNoSecretFields(raw);
  const connectorKey = typeof raw.connectorKey === "string" ? raw.connectorKey : "";
  requireConnectorDescriptor(connectorKey, "PAYMENT");
  logIntegration({
    organizationId,
    connectorFamily: "PAYMENT",
    connectorKey,
    operation: "upsert_connection",
    result: "unavailable",
  });
  throw new AuthFlowError("Ce connecteur de paiement n’est pas encore disponible dans Mombongo.", 409);
}
