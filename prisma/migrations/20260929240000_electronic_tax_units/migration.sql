-- CreateEnum
CREATE TYPE "LineTaxCategory" AS ENUM ('STANDARD', 'ZERO_RATED', 'EXEMPT', 'REVERSE_CHARGE', 'OUT_OF_SCOPE');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "taxablePerson" BOOLEAN;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "customerTaxablePersonSnapshot" BOOLEAN;

-- AlterTable
ALTER TABLE "DocumentLine" ADD COLUMN "unitCode" TEXT,
ADD COLUMN "taxCategory" "LineTaxCategory",
ADD COLUMN "taxExemptionReason" TEXT,
ADD COLUMN "taxExemptionReasonCode" TEXT;

-- AlterTable
ALTER TABLE "CatalogItem" ADD COLUMN "unitCode" TEXT,
ADD COLUMN "taxCategory" "LineTaxCategory",
ADD COLUMN "taxExemptionReason" TEXT,
ADD COLUMN "taxExemptionReasonCode" TEXT;

-- Backfill only unambiguous structured units. "forfait" and unknown labels stay null.
UPDATE "DocumentLine" SET "unitCode" = 'HUR' WHERE lower(btrim(coalesce("unit", ''))) = 'heure' AND "unitCode" IS NULL;
UPDATE "DocumentLine" SET "unitCode" = 'DAY' WHERE lower(btrim(coalesce("unit", ''))) = 'jour' AND "unitCode" IS NULL;
UPDATE "DocumentLine" SET "unitCode" = 'KGM' WHERE lower(btrim(coalesce("unit", ''))) = 'kg' AND "unitCode" IS NULL;
UPDATE "DocumentLine" SET "unitCode" = 'H87' WHERE lower(btrim(coalesce("unit", ''))) IN ('pièce', 'piece') AND "unitCode" IS NULL;
UPDATE "DocumentLine" SET "unitCode" = 'C62' WHERE lower(btrim(coalesce("unit", ''))) IN ('unité', 'unite', '') AND "unitCode" IS NULL;

UPDATE "CatalogItem" SET "unitCode" = 'HUR' WHERE lower(btrim("unit")) = 'heure' AND "unitCode" IS NULL;
UPDATE "CatalogItem" SET "unitCode" = 'DAY' WHERE lower(btrim("unit")) = 'jour' AND "unitCode" IS NULL;
UPDATE "CatalogItem" SET "unitCode" = 'KGM' WHERE lower(btrim("unit")) = 'kg' AND "unitCode" IS NULL;
UPDATE "CatalogItem" SET "unitCode" = 'H87' WHERE lower(btrim("unit")) IN ('pièce', 'piece') AND "unitCode" IS NULL;
UPDATE "CatalogItem" SET "unitCode" = 'C62' WHERE lower(btrim("unit")) IN ('unité', 'unite') AND "unitCode" IS NULL;

-- Positive VAT rate has a single EN 16931 mapping (S). Zero-rate history is left unqualified.
UPDATE "DocumentLine" SET "taxCategory" = 'STANDARD' WHERE "vatBps" > 0 AND "taxCategory" IS NULL;
UPDATE "CatalogItem" SET "taxCategory" = 'STANDARD' WHERE "vatBps" > 0 AND "taxCategory" IS NULL;
