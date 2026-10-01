-- CreateEnum
CREATE TYPE "OrganizationEntityKind" AS ENUM ('SOLE_TRADER', 'COMPANY');

-- CreateEnum
CREATE TYPE "CustomerPartyKind" AS ENUM ('PERSON', 'COMPANY');

-- CreateEnum
CREATE TYPE "CustomerCivility" AS ENUM ('MR', 'MRS', 'MX');

-- AlterTable
ALTER TABLE "Organization"
ADD COLUMN     "countryCode" CHAR(2),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "entityKind" "OrganizationEntityKind",
ADD COLUMN     "legalFormLabel" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "siren" TEXT,
ADD COLUMN     "siret" TEXT,
ADD COLUMN     "tradeName" TEXT,
ADD COLUMN     "vatNumber" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "Customer"
ADD COLUMN     "civility" "CustomerCivility",
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "partyKind" "CustomerPartyKind",
ADD COLUMN     "siren" TEXT,
ADD COLUMN     "siret" TEXT,
ADD COLUMN     "tradeName" TEXT,
ADD COLUMN     "vatNumber" TEXT;

-- AlterTable
ALTER TABLE "Address" ALTER COLUMN "customerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
