-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "EstimateInputSource" AS ENUM ('PASTE', 'FILE');

-- CreateEnum
CREATE TYPE "RoleMatchType" AS ENUM ('NO_MATCH', 'ROLE_ONLY', 'ROLE_AND_LEVEL');

-- CreateTable
CREATE TABLE "RateCardLineItem" (
    "id" TEXT NOT NULL,
    "rateCardVersionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "level" TEXT,
    "rateType" "RateType" NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateCardLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rateCardVersionId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateCapabilityInput" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "capability" "Capability" NOT NULL,
    "otherLabel" TEXT,
    "source" "EstimateInputSource" NOT NULL,
    "rawContent" TEXT NOT NULL,
    "sourceFileName" TEXT,
    "addedById" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateCapabilityInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleResolution" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "estimateCapabilityInputId" TEXT NOT NULL,
    "rawRoleText" TEXT NOT NULL,
    "extractedRole" TEXT NOT NULL,
    "extractedLevel" TEXT,
    "extractedQuantity" DECIMAL(10,2) NOT NULL,
    "extractedUnit" TEXT NOT NULL,
    "matchType" "RoleMatchType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "suggestedRateCardLineId" TEXT,
    "resolvedRateCardLineId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateVersion" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "rateCardVersionId" TEXT NOT NULL,
    "capabilitiesIncluded" "Capability"[],
    "totalValue" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileBytes" BYTEA NOT NULL,
    "content" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLineItem" (
    "id" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "capability" "Capability" NOT NULL,
    "role" TEXT NOT NULL,
    "level" TEXT,
    "rateType" "RateType" NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "feeSubtotal" DECIMAL(14,2) NOT NULL,
    "roleResolutionId" TEXT,
    "rateCardLineItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateCardLineItem_rateCardVersionId_idx" ON "RateCardLineItem"("rateCardVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateCapabilityInput_estimateId_capability_key" ON "EstimateCapabilityInput"("estimateId", "capability");

-- CreateIndex
CREATE INDEX "RoleResolution_estimateId_resolvedAt_idx" ON "RoleResolution"("estimateId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateVersion_estimateId_versionNumber_key" ON "EstimateVersion"("estimateId", "versionNumber");

-- AddForeignKey
ALTER TABLE "RateCardLineItem" ADD CONSTRAINT "RateCardLineItem_rateCardVersionId_fkey" FOREIGN KEY ("rateCardVersionId") REFERENCES "RateCardVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_rateCardVersionId_fkey" FOREIGN KEY ("rateCardVersionId") REFERENCES "RateCardVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateCapabilityInput" ADD CONSTRAINT "EstimateCapabilityInput_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateCapabilityInput" ADD CONSTRAINT "EstimateCapabilityInput_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleResolution" ADD CONSTRAINT "RoleResolution_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleResolution" ADD CONSTRAINT "RoleResolution_estimateCapabilityInputId_fkey" FOREIGN KEY ("estimateCapabilityInputId") REFERENCES "EstimateCapabilityInput"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleResolution" ADD CONSTRAINT "RoleResolution_suggestedRateCardLineId_fkey" FOREIGN KEY ("suggestedRateCardLineId") REFERENCES "RateCardLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleResolution" ADD CONSTRAINT "RoleResolution_resolvedRateCardLineId_fkey" FOREIGN KEY ("resolvedRateCardLineId") REFERENCES "RateCardLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleResolution" ADD CONSTRAINT "RoleResolution_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateVersion" ADD CONSTRAINT "EstimateVersion_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateVersion" ADD CONSTRAINT "EstimateVersion_rateCardVersionId_fkey" FOREIGN KEY ("rateCardVersionId") REFERENCES "RateCardVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateVersion" ADD CONSTRAINT "EstimateVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_rateCardLineItemId_fkey" FOREIGN KEY ("rateCardLineItemId") REFERENCES "RateCardLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_roleResolutionId_fkey" FOREIGN KEY ("roleResolutionId") REFERENCES "RoleResolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
