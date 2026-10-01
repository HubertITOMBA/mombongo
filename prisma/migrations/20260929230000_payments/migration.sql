-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'PAYMENT';

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD', 'CASH', 'CHECK', 'DIRECT_DEBIT', 'PAYPAL', 'OTHER');
CREATE TYPE "PaymentStatus" AS ENUM ('CONFIRMED', 'CANCELLED');
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'STRIPE', 'PAYPAL');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
    "providerPaymentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Payment_amountCents_positive" CHECK ("amountCents" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_provider_providerPaymentId_key" ON "Payment"("organizationId", "provider", "providerPaymentId");
CREATE INDEX "Payment_organizationId_invoiceId_idx" ON "Payment"("organizationId", "invoiceId");
CREATE INDEX "Payment_organizationId_status_paidAt_idx" ON "Payment"("organizationId", "status", "paidAt");

-- AddForeignKey: same organization as invoice, A4 RESTRICT
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_organizationId_fkey" FOREIGN KEY ("invoiceId", "organizationId") REFERENCES "Document"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
