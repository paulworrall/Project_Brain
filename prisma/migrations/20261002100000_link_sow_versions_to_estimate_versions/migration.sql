-- SOW ↔ estimate sync, Phase 1: each SOW version links to the exact estimate
-- version its commercials came from, with a snapshot (total, currency,
-- capabilities) taken at generation time. Purely additive: every column is
-- nullable or defaulted, so existing rows and the code currently deployed are
-- unaffected. Existing SOW versions are linked afterwards, only where that's
-- unambiguous, by scripts/backfill-sow-estimate-links.mts (idempotent, dry run
-- by default) — not here, so what it links vs. leaves unlinked is logged.

-- AlterTable
ALTER TABLE "SOWVersion" ADD COLUMN     "sourceEstimateCapabilities" "Capability"[] DEFAULT ARRAY[]::"Capability"[],
ADD COLUMN     "sourceEstimateCurrency" TEXT,
ADD COLUMN     "sourceEstimateTotal" DECIMAL(14,2),
ADD COLUMN     "sourceEstimateVersionId" TEXT;

-- CreateIndex
CREATE INDEX "SOWVersion_sourceEstimateVersionId_idx" ON "SOWVersion"("sourceEstimateVersionId");

-- AddForeignKey
ALTER TABLE "SOWVersion" ADD CONSTRAINT "SOWVersion_sourceEstimateVersionId_fkey" FOREIGN KEY ("sourceEstimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
