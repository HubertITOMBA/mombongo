-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- AlterTable
ALTER TABLE "AuthChallenge" ADD COLUMN     "accountType" "AccountType" NOT NULL DEFAULT 'BUSINESS';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountType" "AccountType" NOT NULL DEFAULT 'BUSINESS';
