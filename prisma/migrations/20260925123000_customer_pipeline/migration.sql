-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'MEETING', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CREATED', 'NOTE', 'EMAIL', 'CALL', 'MEETING', 'STAGE', 'CONVERTED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "stage" "PipelineStage" NOT NULL DEFAULT 'NEW';
ALTER TABLE "Customer" ADD COLUMN "source" TEXT;
ALTER TABLE "Customer" ADD COLUMN "ownerUserId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "estimatedCents" INTEGER;
ALTER TABLE "Customer" ADD COLUMN "probability" INTEGER;
ALTER TABLE "Customer" ADD COLUMN "nextAction" TEXT;
ALTER TABLE "Customer" ADD COLUMN "nextActionAt" TIMESTAMP(3);

UPDATE "Customer" SET "stage" = 'WON' WHERE "kind" = 'CLIENT';

-- CreateTable
CREATE TABLE "CustomerActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_organizationId_stage_idx" ON "Customer"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "CustomerActivity_organizationId_customerId_createdAt_idx" ON "CustomerActivity"("organizationId", "customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_customerId_organizationId_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
