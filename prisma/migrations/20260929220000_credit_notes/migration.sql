-- AlterEnum
ALTER TYPE "DocumentKind" ADD VALUE 'CREDIT_NOTE';
ALTER TYPE "ActivityType" ADD VALUE 'CREDIT_NOTE';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "creditReason" TEXT;
ALTER TABLE "Document" ADD COLUMN "creditedInvoiceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Document_id_organizationId_key" ON "Document"("id", "organizationId");
CREATE INDEX "Document_organizationId_creditedInvoiceId_idx" ON "Document"("organizationId", "creditedInvoiceId");

-- AddForeignKey: Invoice → CreditNotes, same organization, A4 RESTRICT
ALTER TABLE "Document" ADD CONSTRAINT "Document_creditedInvoiceId_organizationId_fkey" FOREIGN KEY ("creditedInvoiceId", "organizationId") REFERENCES "Document"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "DocumentLine" ADD COLUMN "sourceInvoiceLineId" TEXT;

-- CreateIndex
CREATE INDEX "DocumentLine_sourceInvoiceLineId_idx" ON "DocumentLine"("sourceInvoiceLineId");

-- AddForeignKey
ALTER TABLE "DocumentLine" ADD CONSTRAINT "DocumentLine_sourceInvoiceLineId_fkey" FOREIGN KEY ("sourceInvoiceLineId") REFERENCES "DocumentLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
