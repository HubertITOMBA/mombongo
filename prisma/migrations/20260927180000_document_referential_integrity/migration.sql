-- Les documents commerciaux sont des pièces historiques.
-- Une suppression d’organisation ou de devis source ne doit pas les effacer.
ALTER TABLE "Document" DROP CONSTRAINT "Document_organizationId_fkey";
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Document" DROP CONSTRAINT "Document_sourceDocumentId_fkey";
ALTER TABLE "Document" ADD CONSTRAINT "Document_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
