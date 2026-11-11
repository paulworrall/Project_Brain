-- FB-009: scope summary and journey. Purely additive: one enum value, three
-- nullable Project columns, one nullable EstimateVersion column, two FKs.
-- The deployed code ignores them (no SCOPE_SUMMARY rows exist until it ships).

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'SCOPE_SUMMARY';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "briefAssessment" JSONB,
ADD COLUMN     "clarificationSentAt" TIMESTAMP(3),
ADD COLUMN     "confirmedScopeVersionId" TEXT;

-- AlterTable
ALTER TABLE "EstimateVersion" ADD COLUMN     "sourceScopeVersionId" TEXT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_confirmedScopeVersionId_fkey" FOREIGN KEY ("confirmedScopeVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateVersion" ADD CONSTRAINT "EstimateVersion_sourceScopeVersionId_fkey" FOREIGN KEY ("sourceScopeVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

