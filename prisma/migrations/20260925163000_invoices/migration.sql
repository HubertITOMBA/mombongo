-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'INVOICE';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "sourceDocumentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Document_sourceDocumentId_key" ON "Document"("sourceDocumentId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
