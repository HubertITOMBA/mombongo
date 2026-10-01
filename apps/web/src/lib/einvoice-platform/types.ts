import type {
  ElectronicErrorClass,
  ElectronicTransmissionKind,
  ElectronicTransmissionOperation,
  ElectronicTransmissionStatus,
} from "@/generated/prisma/client";

export type ProviderSubmitRequest = {
  organizationId: string;
  transmissionId: string;
  connectionId: string;
  documentId: string | null;
  operation: ElectronicTransmissionOperation;
  kind: ElectronicTransmissionKind;
  route: string;
};

export type ProviderSubmitResult =
  | {
    outcome: "SUBMITTED" | "ACCEPTED" | "DELIVERED" | "REJECTED";
    providerTransmissionId: string;
    providerDocumentId?: string | null;
    providerStatus?: string;
    message?: string;
  }
  | {
    outcome: "ERROR";
    errorClass: ElectronicErrorClass;
    errorCode: string;
    message: string;
    retryable: boolean;
  };

export type ProviderStatusResult = {
  status: ElectronicTransmissionStatus;
  providerStatus?: string;
  providerDocumentId?: string | null;
  message?: string;
};

export type ParsedWebhookEvent =
  | {
    type: "STATUS";
    providerEventId: string;
    providerTransmissionId: string;
    status: ElectronicTransmissionStatus;
    providerStatus?: string;
    message?: string;
    occurredAt?: Date;
    claimedOrganizationId?: unknown;
  }
  | {
    type: "INBOUND_INVOICE";
    providerEventId: string;
    providerDocumentId: string;
    supplierName?: string | null;
    documentNumber?: string | null;
    currency?: string | null;
    ttcCents?: number | null;
    occurredAt?: Date;
    claimedOrganizationId?: unknown;
  }
  | {
    type: "UNKNOWN";
    providerEventId?: string;
    claimedOrganizationId?: unknown;
  };

export type WebhookConnectionHint = {
  externalAccountId: string;
};

export type SubmitOutboundInput = {
  organizationId: string;
  documentId: string;
  idempotencyKey?: string;
};

export type PreparePaymentReportingInput = {
  organizationId: string;
  paymentId: string;
};

/** Contrat métier indépendant de tout SDK fournisseur. */
export type EInvoiceGateway = {
  submitOutbound(input: SubmitOutboundInput): Promise<{ id: string; status: ElectronicTransmissionStatus; reused: boolean }>;
  getTransmissionStatus(organizationId: string, transmissionId: string): Promise<{ id: string; status: ElectronicTransmissionStatus }>;
  preparePaymentReporting(input: PreparePaymentReportingInput): Promise<{ id: string; status: ElectronicTransmissionStatus; reused: boolean }>;
};

export const retryableErrorClasses: readonly ElectronicErrorClass[] = ["TEMPORARY", "RATE_LIMIT"];

export function isRetryableErrorClass(value: ElectronicErrorClass | null | undefined) {
  return value != null && retryableErrorClasses.includes(value);
}

export function isTerminalTransmissionStatus(status: ElectronicTransmissionStatus, errorClass?: ElectronicErrorClass | null) {
  if (status === "DELIVERED" || status === "ACCEPTED" || status === "REJECTED") return true;
  if (status === "FAILED" && !isRetryableErrorClass(errorClass)) return true;
  return false;
}

export const outboundDocumentOperations: ElectronicTransmissionOperation[] = [
  "SUBMIT_INVOICE",
  "SUBMIT_CREDIT_NOTE",
  "SUBMIT_E_REPORTING",
];
