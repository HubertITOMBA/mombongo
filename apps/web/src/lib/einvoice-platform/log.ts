type ElectronicLogFields = {
  organizationId: string;
  documentId?: string | null;
  transmissionId?: string | null;
  provider: string;
  event: string;
};

export function logElectronicPlatform(fields: ElectronicLogFields) {
  console.info(JSON.stringify({
    domain: "einvoice-platform",
    organizationId: fields.organizationId,
    documentId: fields.documentId ?? null,
    transmissionId: fields.transmissionId ?? null,
    provider: fields.provider,
    event: fields.event,
  }));
}
