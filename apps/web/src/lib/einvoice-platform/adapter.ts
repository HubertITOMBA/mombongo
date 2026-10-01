import type { ElectronicInvoicingConnection, ElectronicInvoicingProvider } from "@/generated/prisma/client";
import type {
  ParsedWebhookEvent,
  ProviderStatusResult,
  ProviderSubmitRequest,
  ProviderSubmitResult,
  WebhookConnectionHint,
} from "./types";

/**
 * Traduit le modèle Mombongo vers un contrat fournisseur.
 * Aucun type Sage / Docoon / WeInvoice ne doit remonter dans le domaine.
 */
export type EInvoiceProviderAdapter = {
  readonly provider: ElectronicInvoicingProvider;
  submit(request: ProviderSubmitRequest): Promise<ProviderSubmitResult>;
  getStatus(request: { providerTransmissionId: string; connectionId: string }): Promise<ProviderStatusResult>;
  resolveWebhookConnection(headers: Headers): WebhookConnectionHint | null;
  verifyWebhook(input: {
    headers: Headers;
    rawBody: string;
    connection: Pick<ElectronicInvoicingConnection, "id" | "provider" | "externalAccountId">;
  }): boolean;
  parseWebhook(rawBody: string): ParsedWebhookEvent;
  testConnection(connection: Pick<ElectronicInvoicingConnection, "id" | "organizationId" | "provider">): Promise<{ ok: boolean; message: string }>;
};
