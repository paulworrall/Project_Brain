-- FB-010: Add project information. Purely additive: one enum and two nullable
-- KnowledgeItem columns (category, occurredOn). The deployed code ignores them.

-- CreateEnum
CREATE TYPE "ProjectInfoCategory" AS ENUM ('MEETING_NOTES', 'CLIENT_CLARIFICATION', 'PRESENTATION_OR_DOCUMENT', 'OTHER');

-- AlterTable
ALTER TABLE "KnowledgeItem" ADD COLUMN     "category" "ProjectInfoCategory",
ADD COLUMN     "occurredOn" DATE;

