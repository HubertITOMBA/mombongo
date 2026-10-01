-- AlterEnum
ALTER TYPE "ElectronicConnectionStatus" ADD VALUE 'ERROR';
ALTER TYPE "ElectronicConnectionStatus" ADD VALUE 'DISABLED';

-- AlterTable
ALTER TABLE "ElectronicInvoicingConnection" ADD COLUMN "connectorKey" TEXT NOT NULL DEFAULT 'MOCK';
ALTER TABLE "ElectronicInvoicingConnection" ADD COLUMN "credentialRef" TEXT;
ALTER TABLE "ElectronicInvoicingConnection" ADD COLUMN "lastCheckedAt" TIMESTAMP(3);
ALTER TABLE "ElectronicInvoicingConnection" ADD COLUMN "lastCheckOk" BOOLEAN;

CREATE INDEX "ElectronicInvoicingConnection_organizationId_connectorKey_idx" ON "ElectronicInvoicingConnection"("organizationId", "connectorKey");

ALTER TABLE "ElectronicTransmission" ADD COLUMN "connectorKey" TEXT NOT NULL DEFAULT 'MOCK';

-- CreateEnum
CREATE TYPE "PaymentConnectionStatus" AS ENUM ('DISABLED', 'CONFIGURED', 'READY', 'ERROR');
CREATE TYPE "PaymentConnectionEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateTable
CREATE TABLE "PaymentConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectorKey" TEXT NOT NULL,
    "status" "PaymentConnectionStatus" NOT NULL DEFAULT 'DISABLED',
    "environment" "PaymentConnectionEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "credentialRef" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentConnection_organizationId_connectorKey_environment_key" ON "PaymentConnection"("organizationId", "connectorKey", "environment");
CREATE INDEX "PaymentConnection_organizationId_connectorKey_idx" ON "PaymentConnection"("organizationId", "connectorKey");

ALTER TABLE "PaymentConnection" ADD CONSTRAINT "PaymentConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
