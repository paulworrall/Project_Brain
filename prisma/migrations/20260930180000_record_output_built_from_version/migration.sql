-- Each generated output records the brief version it was built from, so it
-- can be flagged stale when newer information arrives. Nullable: outputs made
-- before this are worked out from their createdAt. Purely additive.
ALTER TABLE "DocumentVersion" ADD COLUMN     "builtFromVersion" INTEGER;
ALTER TABLE "EstimateBriefVersion" ADD COLUMN     "builtFromVersion" INTEGER;
ALTER TABLE "SOWVersion" ADD COLUMN     "builtFromVersion" INTEGER;
