-- A clarification email draft written automatically after an update records
-- which update triggered it. Nullable and purely additive.
ALTER TABLE "DocumentVersion" ADD COLUMN     "triggeredByUpdateVersion" INTEGER;
