
-- CreateEnum
CREATE TYPE "BriefAttributeValueKind" AS ENUM ('SUGGESTION', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "BriefAttributeSource" AS ENUM ('BRIEF', 'UPDATE', 'CLARIFICATION_ANSWER', 'PM_ENTRY');

-- CreateTable
CREATE TABLE "BriefAttributeValue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "kind" "BriefAttributeValueKind" NOT NULL,
    "source" "BriefAttributeSource" NOT NULL,
    "values" JSONB NOT NULL,
    "evidence" TEXT,
    "knowledgeItemId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BriefAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BriefAttributeValue_projectId_attributeId_createdAt_idx" ON "BriefAttributeValue"("projectId", "attributeId", "createdAt");

-- AddForeignKey
ALTER TABLE "BriefAttributeValue" ADD CONSTRAINT "BriefAttributeValue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefAttributeValue" ADD CONSTRAINT "BriefAttributeValue_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefAttributeValue" ADD CONSTRAINT "BriefAttributeValue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

