-- CreateEnum
CREATE TYPE "DocumentEmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');
CREATE TYPE "DocumentEmailProvider" AS ENUM ('LOCAL', 'RESEND');

-- CreateTable
CREATE TABLE "DemoDataset" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoDataset_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "DocumentEmailDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "replyToEmail" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "provider" "DocumentEmailProvider" NOT NULL,
    "providerMessageId" TEXT,
    "status" "DocumentEmailStatus" NOT NULL DEFAULT 'QUEUED',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "sentById" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentEmailDelivery_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "demoDatasetKey" TEXT;
ALTER TABLE "Organization" ADD COLUMN "demoDatasetKey" TEXT;

CREATE INDEX "User_demoDatasetKey_idx" ON "User"("demoDatasetKey");
CREATE INDEX "Organization_demoDatasetKey_idx" ON "Organization"("demoDatasetKey");
CREATE UNIQUE INDEX "DocumentEmailDelivery_organizationId_idempotencyKey_key" ON "DocumentEmailDelivery"("organizationId", "idempotencyKey");
CREATE INDEX "DocumentEmailDelivery_organizationId_documentId_createdAt_idx" ON "DocumentEmailDelivery"("organizationId", "documentId", "createdAt");

ALTER TABLE "User" ADD CONSTRAINT "User_demoDatasetKey_fkey" FOREIGN KEY ("demoDatasetKey") REFERENCES "DemoDataset"("key") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_demoDatasetKey_fkey" FOREIGN KEY ("demoDatasetKey") REFERENCES "DemoDataset"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentEmailDelivery" ADD CONSTRAINT "DocumentEmailDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentEmailDelivery" ADD CONSTRAINT "DocumentEmailDelivery_documentId_organizationId_fkey" FOREIGN KEY ("documentId", "organizationId") REFERENCES "Document"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentEmailDelivery" ADD CONSTRAINT "DocumentEmailDelivery_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
