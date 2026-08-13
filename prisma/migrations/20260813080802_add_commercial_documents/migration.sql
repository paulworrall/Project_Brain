-- CreateEnum
CREATE TYPE "MasterServiceAgreementStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "RateCardStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "rateCardId" TEXT;

-- CreateTable
CREATE TABLE "MasterServiceAgreement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileBytes" BYTEA NOT NULL,
    "extractedText" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "MasterServiceAgreementStatus" NOT NULL DEFAULT 'ACTIVE',
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterServiceAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCard" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileBytes" BYTEA NOT NULL,
    "extractedText" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "RateCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "RateCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterServiceAgreement" ADD CONSTRAINT "MasterServiceAgreement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterServiceAgreement" ADD CONSTRAINT "MasterServiceAgreement_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
