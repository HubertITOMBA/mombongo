type IntegrationLogFields = {
  organizationId: string;
  connectorFamily: "ELECTRONIC_INVOICING" | "PAYMENT";
  connectorKey: string;
  connectionId?: string | null;
  operation: string;
  result: string;
};

export function logIntegration(fields: IntegrationLogFields) {
  console.info(JSON.stringify({
    domain: "integrations",
    organizationId: fields.organizationId,
    connectorFamily: fields.connectorFamily,
    connectorKey: fields.connectorKey,
    connectionId: fields.connectionId ?? null,
    operation: fields.operation,
    result: fields.result,
  }));
}
