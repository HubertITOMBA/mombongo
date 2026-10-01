import { redactCredentialRef } from "./credentials";
import { listConnectorDescriptors, publicConnectorView } from "./registry";
import { getElectronicInvoicingConnection } from "@/lib/einvoice-platform/service";
import { listPaymentConnections } from "@/lib/payments/connections";

export async function getIntegrationsOverview(organizationId: string) {
  const connection = await getElectronicInvoicingConnection(organizationId);
  const paymentConnections = await listPaymentConnections(organizationId);
  return {
    electronic: listConnectorDescriptors("ELECTRONIC_INVOICING").map(publicConnectorView),
    payments: listConnectorDescriptors("PAYMENT").map(publicConnectorView),
    electronicConnection: connection
      ? {
        id: connection.id,
        connectorKey: connection.connectorKey,
        provider: connection.provider,
        status: connection.status,
        environment: connection.environment,
        externalAccountId: connection.externalAccountId,
        lastCheckedAt: connection.lastCheckedAt,
        lastCheckOk: connection.lastCheckOk,
        credentialState: redactCredentialRef(connection.credentialRef),
      }
      : null,
    paymentConnections: paymentConnections.map(item => ({
      id: item.id,
      connectorKey: item.connectorKey,
      status: item.status,
      environment: item.environment,
      lastCheckedAt: item.lastCheckedAt,
      lastCheckOk: item.lastCheckOk,
      credentialState: redactCredentialRef(item.credentialRef),
    })),
  };
}
