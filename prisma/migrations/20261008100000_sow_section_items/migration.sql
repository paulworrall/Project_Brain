-- PM-validated SOW content: per-project section items (Deliverables, Services,
-- Assumptions, Out of Scope, Risks), the per-project review-overlay state, and
-- a snapshot of the validated items on each SOW version. Purely additive: new
-- tables plus one nullable column, so existing rows and the deployed code are
-- unaffected.

-- CreateEnum
CREATE TYPE "SowSection" AS ENUM ('DELIVERABLES', 'SERVICES', 'ASSUMPTIONS', 'OUT_OF_SCOPE', 'RISKS');

-- CreateEnum
CREATE TYPE "SowItemSource" AS ENUM ('AGENT', 'PM_EDITED', 'PM_ADDED');

-- AlterTable
ALTER TABLE "SOWVersion" ADD COLUMN     "itemsSnapshot" JSONB;

-- CreateTable
CREATE TABLE "SowSectionItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "section" "SowSection" NOT NULL,
    "text" TEXT NOT NULL,
    "agentOriginalText" TEXT,
    "source" "SowItemSource" NOT NULL DEFAULT 'AGENT',
    "included" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,
    "isNewSinceLastReview" BOOLEAN NOT NULL DEFAULT false,
    "pendingAgentSuggestion" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SowSectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SowReviewState" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "inProgress" BOOLEAN NOT NULL DEFAULT false,
    "lastCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SowReviewState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SowSectionItem_projectId_section_position_idx" ON "SowSectionItem"("projectId", "section", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SowReviewState_projectId_key" ON "SowReviewState"("projectId");

-- AddForeignKey
ALTER TABLE "SowSectionItem" ADD CONSTRAINT "SowSectionItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowSectionItem" ADD CONSTRAINT "SowSectionItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowSectionItem" ADD CONSTRAINT "SowSectionItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowReviewState" ADD CONSTRAINT "SowReviewState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
