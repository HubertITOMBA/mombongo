import { getDb } from "@/lib/db";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { lockOrganizationDocuments } from "@/lib/documents/lock";
import { inspectOrganizationFacturX } from "@/lib/einvoice/service";
import type {
  ElectronicErrorClass,
  ElectronicInvoicingConnection,
  ElectronicTransmission,
  ElectronicTransmissionEventType,
  ElectronicTransmissionKind,
  ElectronicTransmissionOperation,
  ElectronicTransmissionStatus,
  Prisma,
} from "@/generated/prisma/client";
import { assertCapabilityImplemented, assertEnvironmentAllowed, electronicOperationCapabilities, requireAvailableConnector } from "@/lib/integrations/registry";
import { getEInvoiceAdapter, getEInvoiceAdapterForKey } from "./registry";
import "./mock-adapter";
import { logElectronicPlatform } from "./log";
import {
  isTerminalTransmissionStatus,
  type EInvoiceGateway,
} from "./types";

function uniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function userErrorMessage(code: string | null | undefined, fallback: string) {
  if (code === "MOCK_TEMPORARY") return "La transmission est temporairement indisponible. Vous pouvez réessayer.";
  if (code === "MOCK_REJECTED") return "La plateforme de test a rejeté cette pièce.";
  return fallback;
}

async function appendEvent(tx: Prisma.TransactionClient | ReturnType<typeof getDb>, input: {
  organizationId: string;
  transmissionId: string;
  type: ElectronicTransmissionEventType;
  status?: ElectronicTransmissionStatus | null;
  providerEventId?: string | null;
  providerStatus?: string | null;
  errorClass?: ElectronicErrorClass | null;
  errorCode?: string | null;
  message?: string | null;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
}) {
  try {
    await tx.electronicTransmissionEvent.create({
      data: {
        organizationId: input.organizationId,
        transmissionId: input.transmissionId,
        type: input.type,
        status: input.status ?? null,
        providerEventId: input.providerEventId ?? null,
        providerStatus: input.providerStatus ?? null,
        errorClass: input.errorClass ?? null,
        errorCode: input.errorCode ?? null,
        message: input.message ?? null,
        metadata: input.metadata,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
    return { duplicate: false };
  } catch (error) {
    if (uniqueConflict(error) && input.providerEventId) return { duplicate: true };
    throw error;
  }
}

function operationFor(kind: "INVOICE" | "CREDIT_NOTE", route: "E_INVOICING" | "E_REPORTING"): {
  operation: ElectronicTransmissionOperation;
  transmissionKind: ElectronicTransmissionKind;
} {
  if (route === "E_REPORTING") return { operation: "SUBMIT_E_REPORTING", transmissionKind: "E_REPORTING" };
  if (kind === "CREDIT_NOTE") return { operation: "SUBMIT_CREDIT_NOTE", transmissionKind: "CREDIT_NOTE" };
  return { operation: "SUBMIT_INVOICE", transmissionKind: "INVOICE" };
}

async function requireReadyConnection(organizationId: string) {
  const connection = await getDb().electronicInvoicingConnection.findUnique({ where: { organizationId } });
  if (!connection || connection.status !== "READY") {
    throw new AuthFlowError("Configurez d’abord une connexion de test interne à une plateforme agréée.", 409);
  }
  const descriptor = requireAvailableConnector(connection.connectorKey || connection.provider, "ELECTRONIC_INVOICING");
  assertEnvironmentAllowed(descriptor, connection.environment);
  return connection;
}

function timestampsFor(status: ElectronicTransmissionStatus, at: Date) {
  return {
    submittedAt: status === "SUBMITTED" || status === "ACCEPTED" || status === "DELIVERED" || status === "REJECTED" ? at : undefined,
    acceptedAt: status === "ACCEPTED" || status === "DELIVERED" ? at : undefined,
    deliveredAt: status === "DELIVERED" ? at : undefined,
    rejectedAt: status === "REJECTED" ? at : undefined,
  };
}

async function applyProviderOutcome(transmission: ElectronicTransmission, result: Awaited<ReturnType<ReturnType<typeof getEInvoiceAdapter>["submit"]>>) {
  const db = getDb();
  const at = new Date();
  if (result.outcome === "ERROR") {
    const status: ElectronicTransmissionStatus = "FAILED";
    await db.$transaction(async tx => {
      await tx.electronicTransmission.update({
        where: { id: transmission.id },
        data: {
          status,
          lastErrorClass: result.errorClass,
          lastErrorCode: result.errorCode,
          lastErrorMessage: userErrorMessage(result.errorCode, result.message),
        },
      });
      await appendEvent(tx, {
        organizationId: transmission.organizationId,
        transmissionId: transmission.id,
        type: "ERROR",
        status,
        errorClass: result.errorClass,
        errorCode: result.errorCode,
        message: userErrorMessage(result.errorCode, result.message),
        occurredAt: at,
      });
    });
    logElectronicPlatform({
      organizationId: transmission.organizationId,
      documentId: transmission.documentId,
      transmissionId: transmission.id,
      provider: transmission.provider,
      event: "submit_error",
    });
    return { ...transmission, status, lastErrorClass: result.errorClass, lastErrorCode: result.errorCode };
  }
  const status: ElectronicTransmissionStatus = result.outcome;
  await db.$transaction(async tx => {
    await tx.electronicTransmission.update({
      where: { id: transmission.id },
      data: {
        status,
        providerTransmissionId: result.providerTransmissionId,
        providerDocumentId: result.providerDocumentId ?? null,
        lastErrorClass: result.outcome === "REJECTED" ? "PERMANENT" : null,
        lastErrorCode: result.outcome === "REJECTED" ? "MOCK_REJECTED" : null,
        lastErrorMessage: result.outcome === "REJECTED" ? userErrorMessage("MOCK_REJECTED", result.message ?? "Pièce rejetée.") : null,
        ...timestampsFor(status, at),
      },
    });
    await appendEvent(tx, {
      organizationId: transmission.organizationId,
      transmissionId: transmission.id,
      type: "SUBMITTED",
      status: "SUBMITTED",
      providerStatus: result.providerStatus,
      occurredAt: at,
    });
    if (status === "ACCEPTED" || status === "DELIVERED") {
      await appendEvent(tx, {
        organizationId: transmission.organizationId,
        transmissionId: transmission.id,
        type: status === "DELIVERED" ? "DELIVERED" : "ACCEPTED",
        status,
        providerStatus: result.providerStatus,
        occurredAt: at,
      });
    }
    if (status === "REJECTED") {
      await appendEvent(tx, {
        organizationId: transmission.organizationId,
        transmissionId: transmission.id,
        type: "REJECTED",
        status,
        errorClass: "PERMANENT",
        errorCode: "MOCK_REJECTED",
        message: userErrorMessage("MOCK_REJECTED", result.message ?? "Pièce rejetée."),
        occurredAt: at,
      });
    }
  });
  logElectronicPlatform({
    organizationId: transmission.organizationId,
    documentId: transmission.documentId,
    transmissionId: transmission.id,
    provider: transmission.provider,
    event: `submit_${status.toLowerCase()}`,
  });
  return { ...transmission, status, providerTransmissionId: result.providerTransmissionId };
}

export const eInvoiceGateway: EInvoiceGateway = {
  async submitOutbound(input) {
    const inspected = await inspectOrganizationFacturX(input.organizationId, input.documentId);
    if (!inspected.model || !inspected.available) {
      logElectronicPlatform({
        organizationId: input.organizationId,
        documentId: input.documentId,
        provider: "MOCK",
        event: "submit_blocked_invalid",
      });
      throw inspected.issues.length > 0
        ? new AuthFlowError(inspected.issues.find(item => item.severity === "error")?.message ?? "Facture électronique invalide.", 422)
        : new AuthFlowError("Cette pièce n’est pas admissible à une transmission électronique.", 422);
    }
    const route = inspected.model.context.route;
    if (route !== "E_INVOICING" && route !== "E_REPORTING") {
      throw new AuthFlowError(
        route === "REVIEW_REQUIRED"
          ? "Cette pièce nécessite une revue avant toute transmission électronique."
          : "Cette pièce n’est pas dans le périmètre de transmission électronique.",
        422,
      );
    }
    if (inspected.document.status !== "SENT") {
      throw new AuthFlowError("Seule une pièce émise peut être transmise électroniquement.", 409);
    }
    const { operation, transmissionKind } = operationFor(inspected.model.document.kind, route);
    const idempotencyKey = input.idempotencyKey?.trim() || input.documentId;
    const connection = await requireReadyConnection(input.organizationId);
    const connectorKey = connection.connectorKey || connection.provider;
    assertCapabilityImplemented(connectorKey, electronicOperationCapabilities[operation]);
    const adapter = getEInvoiceAdapterForKey(connectorKey);
    const db = getDb();

    const prepared = await db.$transaction(async tx => {
      await lockOrganizationDocuments(tx, input.organizationId);
      const existing = await tx.electronicTransmission.findUnique({
        where: {
          organizationId_operation_idempotencyKey: {
            organizationId: input.organizationId,
            operation,
            idempotencyKey,
          },
        },
      });
      if (existing) {
        if (isTerminalTransmissionStatus(existing.status, existing.lastErrorClass)) {
          return { transmission: existing, reused: true, submit: false };
        }
        await tx.electronicTransmission.update({
          where: { id: existing.id },
          data: { status: "QUEUED", connectionId: connection.id, provider: connection.provider, connectorKey },
        });
        await appendEvent(tx, {
          organizationId: input.organizationId,
          transmissionId: existing.id,
          type: "QUEUED",
          status: "QUEUED",
        });
        return { transmission: { ...existing, status: "QUEUED" as const, connectionId: connection.id, provider: connection.provider, connectorKey }, reused: true, submit: true };
      }
      const created = await tx.electronicTransmission.create({
        data: {
          organizationId: input.organizationId,
          documentId: input.documentId,
          connectionId: connection.id,
          provider: connection.provider,
          connectorKey,
          direction: "OUTBOUND",
          kind: transmissionKind,
          route,
          operation,
          status: "QUEUED",
          idempotencyKey,
        },
      });
      await appendEvent(tx, { organizationId: input.organizationId, transmissionId: created.id, type: "CREATED", status: "PENDING" });
      await appendEvent(tx, { organizationId: input.organizationId, transmissionId: created.id, type: "VALIDATED", status: "QUEUED" });
      await appendEvent(tx, { organizationId: input.organizationId, transmissionId: created.id, type: "QUEUED", status: "QUEUED" });
      return { transmission: created, reused: false, submit: true };
    }).catch(async (error: unknown) => {
      if (!uniqueConflict(error)) throw error;
      const existing = await db.electronicTransmission.findUniqueOrThrow({
        where: {
          organizationId_operation_idempotencyKey: {
            organizationId: input.organizationId,
            operation,
            idempotencyKey,
          },
        },
      });
      if (isTerminalTransmissionStatus(existing.status, existing.lastErrorClass)) {
        return { transmission: existing, reused: true, submit: false };
      }
      return { transmission: existing, reused: true, submit: true };
    });

    if (!prepared.submit) {
      logElectronicPlatform({
        organizationId: input.organizationId,
        documentId: input.documentId,
        transmissionId: prepared.transmission.id,
        provider: prepared.transmission.provider,
        event: "submit_idempotent_reuse",
      });
      return { id: prepared.transmission.id, status: prepared.transmission.status, reused: true };
    }

    const result = await adapter.submit({
      organizationId: input.organizationId,
      transmissionId: prepared.transmission.id,
      connectionId: connection.id,
      documentId: input.documentId,
      operation,
      kind: transmissionKind,
      route,
    });
    const updated = await applyProviderOutcome(prepared.transmission, result);
    return { id: updated.id, status: updated.status, reused: prepared.reused && isTerminalTransmissionStatus(updated.status, updated.lastErrorClass) };
  },

  async getTransmissionStatus(organizationId, transmissionId) {
    const transmission = await getDb().electronicTransmission.findFirst({
      where: { id: transmissionId, organizationId },
    });
    if (!transmission) throw new AuthFlowError("Cette transmission électronique est introuvable.", 404);
    if (!transmission.providerTransmissionId || !transmission.connectionId) {
      return { id: transmission.id, status: transmission.status };
    }
    if (isTerminalTransmissionStatus(transmission.status, transmission.lastErrorClass) && transmission.status !== "ACCEPTED") {
      return { id: transmission.id, status: transmission.status };
    }
    const adapter = getEInvoiceAdapterForKey(transmission.connectorKey || transmission.provider);
    const remote = await adapter.getStatus({
      providerTransmissionId: transmission.providerTransmissionId,
      connectionId: transmission.connectionId,
    });
    if (remote.status === transmission.status) return { id: transmission.id, status: transmission.status };
    const at = new Date();
    await getDb().$transaction(async tx => {
      await tx.electronicTransmission.update({
        where: { id: transmission.id },
        data: {
          status: remote.status,
          providerDocumentId: remote.providerDocumentId ?? transmission.providerDocumentId,
          ...timestampsFor(remote.status, at),
        },
      });
      await appendEvent(tx, {
        organizationId,
        transmissionId: transmission.id,
        type: remote.status === "DELIVERED" ? "DELIVERED" : remote.status === "REJECTED" ? "REJECTED" : "ACCEPTED",
        status: remote.status,
        providerStatus: remote.providerStatus,
        message: remote.message,
        occurredAt: at,
      });
    });
    return { id: transmission.id, status: remote.status };
  },

  async preparePaymentReporting(input) {
    const connection = await requireReadyConnection(input.organizationId);
    const connectorKey = connection.connectorKey || connection.provider;
    assertCapabilityImplemented(connectorKey, "PAYMENT_REPORTING");
    const payment = await getDb().payment.findFirst({
      where: { id: input.paymentId, organizationId: input.organizationId },
    });
    if (!payment) throw new AuthFlowError("Ce paiement est introuvable.", 404);
    const db = getDb();
    const existing = await db.electronicTransmission.findUnique({
      where: {
        organizationId_operation_idempotencyKey: {
          organizationId: input.organizationId,
          operation: "PREPARE_PAYMENT_REPORTING",
          idempotencyKey: payment.id,
        },
      },
    });
    if (existing) return { id: existing.id, status: existing.status, reused: true };
    const created = await db.electronicTransmission.create({
      data: {
        organizationId: input.organizationId,
        documentId: payment.invoiceId,
        paymentId: payment.id,
        connectionId: connection.id,
        provider: connection.provider,
        connectorKey,
        direction: "OUTBOUND",
        kind: "PAYMENT_REPORTING",
        route: "E_REPORTING",
        operation: "PREPARE_PAYMENT_REPORTING",
        status: "PENDING",
        idempotencyKey: payment.id,
      },
    });
    await appendEvent(db, {
      organizationId: input.organizationId,
      transmissionId: created.id,
      type: "CREATED",
      status: "PENDING",
      metadata: { paymentProvider: payment.provider, preparedOnly: true },
    });
    logElectronicPlatform({
      organizationId: input.organizationId,
      documentId: payment.invoiceId,
      transmissionId: created.id,
      provider: connection.provider,
      event: "payment_reporting_prepared",
    });
    return { id: created.id, status: created.status, reused: false };
  },
};

export async function applyInboundWebhook(input: {
  connection: ElectronicInvoicingConnection;
  providerEventId: string;
  providerDocumentId: string;
  supplierName?: string | null;
  documentNumber?: string | null;
  currency?: string | null;
  ttcCents?: number | null;
  occurredAt?: Date;
}) {
  const db = getDb();
  const existingEvent = await db.electronicTransmissionEvent.findUnique({
    where: {
      organizationId_providerEventId: {
        organizationId: input.connection.organizationId,
        providerEventId: input.providerEventId,
      },
    },
  });
  if (existingEvent) return { duplicate: true, transmissionId: existingEvent.transmissionId };
  const existingDoc = await db.electronicInboundDocument.findUnique({
    where: {
      organizationId_provider_providerDocumentId: {
        organizationId: input.connection.organizationId,
        provider: input.connection.provider,
        providerDocumentId: input.providerDocumentId,
      },
    },
  });
  if (existingDoc) return { duplicate: true, transmissionId: existingDoc.transmissionId };
  const transmission = await db.electronicTransmission.create({
    data: {
        organizationId: input.connection.organizationId,
        connectionId: input.connection.id,
        provider: input.connection.provider,
        connectorKey: input.connection.connectorKey || input.connection.provider,
        direction: "INBOUND",
      kind: "INBOUND_INVOICE",
      route: "E_INVOICING",
      operation: "RECEIVE_INVOICE",
      status: "DELIVERED",
      idempotencyKey: input.providerDocumentId,
      providerDocumentId: input.providerDocumentId,
      deliveredAt: input.occurredAt ?? new Date(),
    },
  });
  await db.electronicInboundDocument.create({
    data: {
      organizationId: input.connection.organizationId,
      transmissionId: transmission.id,
      provider: input.connection.provider,
      providerDocumentId: input.providerDocumentId,
      supplierName: input.supplierName ?? null,
      documentNumber: input.documentNumber ?? null,
      currency: input.currency ?? null,
      ttcCents: input.ttcCents ?? null,
      receivedAt: input.occurredAt ?? new Date(),
    },
  });
  await appendEvent(db, {
    organizationId: input.connection.organizationId,
    transmissionId: transmission.id,
    type: "WEBHOOK_RECEIVED",
    status: "DELIVERED",
    providerEventId: input.providerEventId,
    occurredAt: input.occurredAt,
    metadata: { inbound: true },
  });
  logElectronicPlatform({
    organizationId: input.connection.organizationId,
    transmissionId: transmission.id,
    provider: input.connection.provider,
    event: "inbound_received",
  });
  return { duplicate: false, transmissionId: transmission.id };
}

export async function applyStatusWebhook(input: {
  connection: ElectronicInvoicingConnection;
  providerEventId: string;
  providerTransmissionId: string;
  status: ElectronicTransmissionStatus;
  providerStatus?: string;
  message?: string;
  occurredAt?: Date;
}) {
  const db = getDb();
  const existingEvent = await db.electronicTransmissionEvent.findUnique({
    where: {
      organizationId_providerEventId: {
        organizationId: input.connection.organizationId,
        providerEventId: input.providerEventId,
      },
    },
  });
  if (existingEvent) return { duplicate: true, transmissionId: existingEvent.transmissionId };
  const transmission = await db.electronicTransmission.findFirst({
    where: {
      provider: input.connection.provider,
      providerTransmissionId: input.providerTransmissionId,
    },
  });
  if (!transmission || transmission.organizationId !== input.connection.organizationId) {
    throw new AuthFlowError("Transmission inconnue pour ce compte fournisseur.", 404);
  }
  const at = input.occurredAt ?? new Date();
  await db.$transaction(async tx => {
    await tx.electronicTransmission.update({
      where: { id: transmission.id },
      data: {
        status: input.status,
        lastErrorMessage: input.status === "REJECTED" || input.status === "FAILED" ? userErrorMessage(null, input.message ?? "Transmission mise à jour.") : null,
        lastErrorClass: input.status === "REJECTED" ? "PERMANENT" : input.status === "FAILED" ? "UNKNOWN" : null,
        ...timestampsFor(input.status, at),
      },
    });
    await appendEvent(tx, {
      organizationId: transmission.organizationId,
      transmissionId: transmission.id,
      type: "WEBHOOK_RECEIVED",
      status: input.status,
      providerEventId: input.providerEventId,
      providerStatus: input.providerStatus,
      message: input.message,
      occurredAt: at,
    });
    if (input.status === "DELIVERED" || input.status === "ACCEPTED" || input.status === "REJECTED") {
      await appendEvent(tx, {
        organizationId: transmission.organizationId,
        transmissionId: transmission.id,
        type: input.status === "DELIVERED" ? "DELIVERED" : input.status === "REJECTED" ? "REJECTED" : "ACCEPTED",
        status: input.status,
        occurredAt: at,
      });
    }
  });
  logElectronicPlatform({
    organizationId: transmission.organizationId,
    documentId: transmission.documentId,
    transmissionId: transmission.id,
    provider: transmission.provider,
    event: "webhook_status",
  });
  return { duplicate: false, transmissionId: transmission.id };
}
