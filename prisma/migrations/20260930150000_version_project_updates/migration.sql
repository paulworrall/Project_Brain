-- Project updates become versions of the brief (brief = v1, updates v2+),
-- with a source and an AI change summary. Additive: existing rows get
-- source CLIENT, and versionNumber stays null until the backfill
-- (scripts/backfill-update-versions.mts) numbers them by uploadedAt.

-- CreateEnum
CREATE TYPE "UpdateSource" AS ENUM ('CLIENT', 'INTERNAL_TEAM');

-- AlterTable
ALTER TABLE "KnowledgeItem" ADD COLUMN     "changeSummary" TEXT,
ADD COLUMN     "source" "UpdateSource" NOT NULL DEFAULT 'CLIENT',
ADD COLUMN     "versionNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeItem_projectId_versionNumber_key" ON "KnowledgeItem"("projectId", "versionNumber");

-- Versions are immutable once saved: only the after-save AI summaries (and
-- the uploader link, which a user deletion nulls) may change, and a version
-- number may be set once.
CREATE FUNCTION "knowledge_item_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."content" IS DISTINCT FROM OLD."content"
     OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."title" IS DISTINCT FROM OLD."title"
     OR NEW."originalFileName" IS DISTINCT FROM OLD."originalFileName"
     OR NEW."source" IS DISTINCT FROM OLD."source"
     OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
     OR NEW."uploadedAt" IS DISTINCT FROM OLD."uploadedAt"
     OR (OLD."versionNumber" IS NOT NULL AND NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber")
  THEN
    RAISE EXCEPTION 'Project updates are immutable once saved; add a new update instead.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "knowledge_item_immutable"
BEFORE UPDATE ON "KnowledgeItem"
FOR EACH ROW EXECUTE FUNCTION "knowledge_item_immutable"();
