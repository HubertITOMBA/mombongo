-- CreateEnum
CREATE TYPE "CustomerKind" AS ENUM ('PROSPECT', 'CLIENT');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "kind" "CustomerKind" NOT NULL DEFAULT 'CLIENT';
ALTER TABLE "Customer" ADD COLUMN "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Customer" ADD COLUMN "notes" TEXT;
ALTER TABLE "Customer" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Customer_organizationId_status_kind_idx" ON "Customer"("organizationId", "status", "kind");
