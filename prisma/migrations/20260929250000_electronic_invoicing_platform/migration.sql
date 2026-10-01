-- CreateEnum
CREATE TYPE "ElectronicInvoicingProvider" AS ENUM ('MOCK');
CREATE TYPE "ElectronicConnectionStatus" AS ENUM ('INACTIVE', 'READY');
CREATE TYPE "ElectronicConnectionEnvironment" AS ENUM ('TEST', 'PRODUCTION');
CREATE TYPE "ElectronicTransmissionDirection" AS ENUM ('OUTBOUND', 'INBOUND');
CREATE TYPE "ElectronicTransmissionKind" AS ENUM ('INVOICE', 'CREDIT_NOTE', 'E_REPORTING', 'PAYMENT_REPORTING', 'INBOUND_INVOICE');
CREATE TYPE "ElectronicTransmissionStatus" AS ENUM ('PENDING', 'QUEUED', 'SUBMITTED', 'ACCEPTED', 'DELIVERED', 'REJECTED', 'FAILED');
CREATE TYPE "ElectronicTransmissionOperation" AS ENUM ('SUBMIT_INVOICE', 'SUBMIT_CREDIT_NOTE', 'SUBMIT_E_REPORTING', 'PREPARE_PAYMENT_REPORTING', 'RECEIVE_INVOICE');
CREATE TYPE "ElectronicTransmissionEventType" AS ENUM ('CREATED', 'VALIDATED', 'QUEUED', 'SUBMITTED', 'ACCEPTED', 'DELIVERED', 'REJECTED', 'ERROR', 'WEBHOOK_RECEIVED');
CREATE TYPE "ElectronicErrorClass" AS ENUM ('TEMPORARY', 'PERMANENT', 'VALIDATION', 'AUTHENTICATION', 'RATE_LIMIT', 'UNKNOWN');

-- CreateTable
CREATE TABLE "ElectronicInvoicingConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "ElectronicInvoicingProvider" NOT NULL,
    "status" "ElectronicConnectionStatus" NOT NULL DEFAULT 'INACTIVE',
    "environment" "ElectronicConnectionEnvironment" NOT NULL DEFAULT 'TEST',
    "externalAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectronicInvoicingConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectronicInvoicingConnection_organizationId_key" ON "ElectronicInvoicingConnection"("organizationId");
CREATE UNIQUE INDEX "ElectronicInvoicingConnection_provider_externalAccountId_key" ON "ElectronicInvoicingConnection"("provider", "externalAccountId");
CREATE INDEX "ElectronicInvoicingConnection_organizationId_provider_idx" ON "ElectronicInvoicingConnection"("organizationId", "provider");

ALTER TABLE "ElectronicInvoicingConnection" ADD CONSTRAINT "ElectronicInvoicingConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ElectronicTransmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT,
    "paymentId" TEXT,
    "connectionId" TEXT,
    "provider" "ElectronicInvoicingProvider" NOT NULL,
    "direction" "ElectronicTransmissionDirection" NOT NULL,
    "kind" "ElectronicTransmissionKind" NOT NULL,
    "route" TEXT NOT NULL,
    "operation" "ElectronicTransmissionOperation" NOT NULL,
    "status" "ElectronicTransmissionStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "providerTransmissionId" TEXT,
    "providerDocumentId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "lastErrorClass" "ElectronicErrorClass",
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectronicTransmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectronicTransmission_organizationId_operation_idempotencyKey_key" ON "ElectronicTransmission"("organizationId", "operation", "idempotencyKey");
CREATE UNIQUE INDEX "ElectronicTransmission_provider_providerTransmissionId_key" ON "ElectronicTransmission"("provider", "providerTransmissionId");
CREATE INDEX "ElectronicTransmission_organizationId_documentId_idx" ON "ElectronicTransmission"("organizationId", "documentId");
CREATE INDEX "ElectronicTransmission_organizationId_status_createdAt_idx" ON "ElectronicTransmission"("organizationId", "status", "createdAt");
CREATE INDEX "ElectronicTransmission_connectionId_idx" ON "ElectronicTransmission"("connectionId");

ALTER TABLE "ElectronicTransmission" ADD CONSTRAINT "ElectronicTransmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectronicTransmission" ADD CONSTRAINT "ElectronicTransmission_document_fkey" FOREIGN KEY ("documentId", "organizationId") REFERENCES "Document"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectronicTransmission" ADD CONSTRAINT "ElectronicTransmission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectronicTransmission" ADD CONSTRAINT "ElectronicTransmission_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ElectronicInvoicingConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ElectronicTransmissionEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "transmissionId" TEXT NOT NULL,
    "type" "ElectronicTransmissionEventType" NOT NULL,
    "status" "ElectronicTransmissionStatus",
    "providerEventId" TEXT,
    "providerStatus" TEXT,
    "errorClass" "ElectronicErrorClass",
    "errorCode" TEXT,
    "message" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectronicTransmissionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectronicTransmissionEvent_organizationId_providerEventId_key" ON "ElectronicTransmissionEvent"("organizationId", "providerEventId");
CREATE INDEX "ElectronicTransmissionEvent_transmissionId_createdAt_idx" ON "ElectronicTransmissionEvent"("transmissionId", "createdAt");
CREATE INDEX "ElectronicTransmissionEvent_organizationId_createdAt_idx" ON "ElectronicTransmissionEvent"("organizationId", "createdAt");

ALTER TABLE "ElectronicTransmissionEvent" ADD CONSTRAINT "ElectronicTransmissionEvent_transmissionId_fkey" FOREIGN KEY ("transmissionId") REFERENCES "ElectronicTransmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ElectronicInboundDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "transmissionId" TEXT NOT NULL,
    "provider" "ElectronicInvoicingProvider" NOT NULL,
    "providerDocumentId" TEXT NOT NULL,
    "supplierName" TEXT,
    "documentNumber" TEXT,
    "currency" CHAR(3),
    "ttcCents" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectronicInboundDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectronicInboundDocument_transmissionId_key" ON "ElectronicInboundDocument"("transmissionId");
CREATE UNIQUE INDEX "ElectronicInboundDocument_organizationId_provider_providerDocumentId_key" ON "ElectronicInboundDocument"("organizationId", "provider", "providerDocumentId");
CREATE INDEX "ElectronicInboundDocument_organizationId_receivedAt_idx" ON "ElectronicInboundDocument"("organizationId", "receivedAt");

ALTER TABLE "ElectronicInboundDocument" ADD CONSTRAINT "ElectronicInboundDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectronicInboundDocument" ADD CONSTRAINT "ElectronicInboundDocument_transmissionId_fkey" FOREIGN KEY ("transmissionId") REFERENCES "ElectronicTransmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
