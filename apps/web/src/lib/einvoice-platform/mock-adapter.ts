import { createHmac } from "node:crypto";
import { digest } from "@/lib/auth/crypto";
import type { ElectronicErrorClass, ElectronicTransmissionStatus } from "@/generated/prisma/client";
import { equalHex, timestampsAreFresh } from "@/lib/integrations/webhook-security";
import type { EInvoiceProviderAdapter } from "./adapter";
import { registerEInvoiceAdapter } from "./registry";
import type { ProviderSubmitResult } from "./types";

export type MockSubmitBehavior = "success" | "reject" | "temporary" | "temporary-then-success";

const behaviors = new Map<string, MockSubmitBehavior>();
const attempts = new Map<string, number>();

export function setMockSubmitBehavior(organizationId: string, behavior: MockSubmitBehavior) {
  behaviors.set(organizationId, behavior);
}

export function resetMockAdapterState() {
  behaviors.clear();
  attempts.clear();
}

export function mockWebhookSecret(connectionId: string) {
  return digest(`einvoice-webhook:${connectionId}`);
}

export function signMockWebhook(connectionId: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", mockWebhookSecret(connectionId)).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function mockWebhookHeaders(
  connection: { id: string; externalAccountId: string | null },
  rawBody: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const stamp = String(timestamp);
  return {
    "x-mombongo-account": connection.externalAccountId ?? "",
    "x-mombongo-timestamp": stamp,
    "x-mombongo-signature": signMockWebhook(connection.id, stamp, rawBody),
  };
}

function success(transmissionId: string, documentId: string | null): ProviderSubmitResult {
  return {
    outcome: "ACCEPTED",
    providerTransmissionId: `mock-tx-${transmissionId}`,
    providerDocumentId: documentId ? `mock-doc-${documentId}` : `mock-doc-${transmissionId}`,
    providerStatus: "MOCK_ACCEPTED",
    message: "Le fournisseur de test interne a accepté la pièce.",
  };
}

function errorResult(errorClass: ElectronicErrorClass, errorCode: string, message: string, retryable: boolean): ProviderSubmitResult {
  return { outcome: "ERROR", errorClass, errorCode, message, retryable };
}

export const mockEInvoiceAdapter: EInvoiceProviderAdapter = {
  provider: "MOCK",
  async submit(request) {
    const behavior = behaviors.get(request.organizationId) ?? "success";
    if (behavior === "reject") {
      return {
        outcome: "REJECTED",
        providerTransmissionId: `mock-tx-${request.transmissionId}`,
        providerDocumentId: request.documentId ? `mock-doc-${request.documentId}` : null,
        providerStatus: "MOCK_REJECTED",
        message: "Le fournisseur de test interne a rejeté la pièce.",
      };
    }
    if (behavior === "temporary") {
      return errorResult("TEMPORARY", "MOCK_TEMPORARY", "Le fournisseur de test interne est temporairement indisponible.", true);
    }
    if (behavior === "temporary-then-success") {
      const count = attempts.get(request.transmissionId) ?? 0;
      attempts.set(request.transmissionId, count + 1);
      if (count === 0) {
        return errorResult("TEMPORARY", "MOCK_TEMPORARY", "Le fournisseur de test interne est temporairement indisponible.", true);
      }
      return success(request.transmissionId, request.documentId);
    }
    return success(request.transmissionId, request.documentId);
  },
  async getStatus(request) {
    return {
      status: "ACCEPTED",
      providerStatus: "MOCK_ACCEPTED",
      providerDocumentId: `mock-doc-${request.providerTransmissionId}`,
    };
  },
  resolveWebhookConnection(headers) {
    const externalAccountId = headers.get("x-mombongo-account")?.trim();
    if (!externalAccountId) return null;
    return { externalAccountId };
  },
  verifyWebhook({ headers, rawBody, connection }) {
    const timestamp = headers.get("x-mombongo-timestamp")?.trim() ?? "";
    const signature = headers.get("x-mombongo-signature")?.trim() ?? "";
    if (!/^[0-9a-f]{64}$/i.test(signature) || !timestampsAreFresh(timestamp)) return false;
    return equalHex(signature, signMockWebhook(connection.id, timestamp, rawBody));
  },
  parseWebhook(rawBody) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { type: "UNKNOWN", claimedOrganizationId: undefined };
    }
    const claimedOrganizationId = payload.organizationId;
    const providerEventId = typeof payload.eventId === "string" ? payload.eventId : undefined;
    const occurredAt = typeof payload.occurredAt === "string" ? new Date(payload.occurredAt) : undefined;
    if (payload.type === "STATUS" && typeof payload.providerTransmissionId === "string" && typeof payload.status === "string") {
      return {
        type: "STATUS",
        providerEventId: providerEventId ?? `mock-status-${payload.providerTransmissionId}`,
        providerTransmissionId: payload.providerTransmissionId,
        status: payload.status as ElectronicTransmissionStatus,
        providerStatus: typeof payload.providerStatus === "string" ? payload.providerStatus : undefined,
        message: typeof payload.message === "string" ? payload.message : undefined,
        occurredAt,
        claimedOrganizationId,
      };
    }
    if (payload.type === "INBOUND_INVOICE" && typeof payload.providerDocumentId === "string") {
      return {
        type: "INBOUND_INVOICE",
        providerEventId: providerEventId ?? `mock-in-${payload.providerDocumentId}`,
        providerDocumentId: payload.providerDocumentId,
        supplierName: typeof payload.supplierName === "string" ? payload.supplierName : null,
        documentNumber: typeof payload.documentNumber === "string" ? payload.documentNumber : null,
        currency: typeof payload.currency === "string" ? payload.currency : null,
        ttcCents: typeof payload.ttcCents === "number" ? payload.ttcCents : null,
        occurredAt,
        claimedOrganizationId,
      };
    }
    return { type: "UNKNOWN", providerEventId, claimedOrganizationId };
  },
  async testConnection() {
    return {
      ok: true,
      message: "Le connecteur interne de test est disponible. Ce n’est pas une plateforme agréée.",
    };
  },
};

registerEInvoiceAdapter(mockEInvoiceAdapter);
