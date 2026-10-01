-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'QUOTE';

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('QUOTE', 'INVOICE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REFUSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "organizationId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("organizationId","kind","year")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdById" TEXT,
    "kind" "DocumentKind" NOT NULL DEFAULT 'QUOTE',
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "number" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "validUntil" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "htCents" INTEGER NOT NULL DEFAULT 0,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "ttcCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "vatBps" INTEGER NOT NULL,
    "htCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "ttcCents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_organizationId_kind_number_key" ON "Document"("organizationId", "kind", "number");

-- CreateIndex
CREATE INDEX "Document_organizationId_status_createdAt_idx" ON "Document"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Document_organizationId_customerId_idx" ON "Document"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "DocumentLine_documentId_position_idx" ON "DocumentLine"("documentId", "position");

-- AddForeignKey
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_customerId_organizationId_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLine" ADD CONSTRAINT "DocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
