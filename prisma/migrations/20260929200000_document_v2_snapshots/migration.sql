-- CreateEnum
CREATE TYPE "LineItemKind" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "OperationCategory" AS ENUM ('GOODS', 'SERVICES', 'MIXED');

-- AlterTable Organization: fiscal defaults snapshotable at issue
ALTER TABLE "Organization"
ADD COLUMN     "earlyPaymentDiscountTerms" TEXT,
ADD COLUMN     "invoiceDueDays" INTEGER,
ADD COLUMN     "latePaymentPenaltyTerms" TEXT,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "recoveryFeeMention" TEXT,
ADD COLUMN     "vatOnDebits" BOOLEAN;

-- AlterTable Document: dates, terms, A7 snapshots (all nullable, no live backfill)
ALTER TABLE "Document"
ADD COLUMN     "customerAddressJsonSnapshot" JSONB,
ADD COLUMN     "customerCivilitySnapshot" TEXT,
ADD COLUMN     "customerCountryCodeSnapshot" CHAR(2),
ADD COLUMN     "customerDeliveryAddressJsonSnapshot" JSONB,
ADD COLUMN     "customerDeliveryAddressSnapshot" TEXT,
ADD COLUMN     "customerFirstNameSnapshot" TEXT,
ADD COLUMN     "customerLastNameSnapshot" TEXT,
ADD COLUMN     "customerLegalNameSnapshot" TEXT,
ADD COLUMN     "customerOrderNumber" TEXT,
ADD COLUMN     "customerPartyKindSnapshot" TEXT,
ADD COLUMN     "customerSirenSnapshot" TEXT,
ADD COLUMN     "customerSiretSnapshot" TEXT,
ADD COLUMN     "customerTradeNameSnapshot" TEXT,
ADD COLUMN     "customerVatNumberSnapshot" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "earlyPaymentDiscountTermsSnapshot" TEXT,
ADD COLUMN     "issuerAddressJsonSnapshot" JSONB,
ADD COLUMN     "issuerAddressSnapshot" TEXT,
ADD COLUMN     "issuerCountryCodeSnapshot" CHAR(2),
ADD COLUMN     "issuerEmailSnapshot" TEXT,
ADD COLUMN     "issuerEntityKindSnapshot" TEXT,
ADD COLUMN     "issuerLegalFormLabelSnapshot" TEXT,
ADD COLUMN     "issuerLegalNameSnapshot" TEXT,
ADD COLUMN     "issuerPhoneSnapshot" TEXT,
ADD COLUMN     "issuerSirenSnapshot" TEXT,
ADD COLUMN     "issuerSiretSnapshot" TEXT,
ADD COLUMN     "issuerTradeNameSnapshot" TEXT,
ADD COLUMN     "issuerVatNumberSnapshot" TEXT,
ADD COLUMN     "issuerVatOnDebitsSnapshot" BOOLEAN,
ADD COLUMN     "latePaymentPenaltyTermsSnapshot" TEXT,
ADD COLUMN     "operationCategory" "OperationCategory",
ADD COLUMN     "paymentTermsSnapshot" TEXT,
ADD COLUMN     "recoveryFeeMentionSnapshot" TEXT,
ADD COLUMN     "supplyDate" TIMESTAMP(3),
ADD COLUMN     "vatBreakdownSnapshot" JSONB;

-- AlterTable DocumentLine: decimal quantity, unit, discount, item kind
ALTER TABLE "DocumentLine" ALTER COLUMN "quantity" TYPE DECIMAL(12,3) USING ("quantity"::decimal);

ALTER TABLE "DocumentLine"
ADD COLUMN     "discountBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "itemKind" "LineItemKind",
ADD COLUMN     "unit" TEXT DEFAULT 'unité';
