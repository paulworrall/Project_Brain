-- Stage 1: add nullable
ALTER TABLE "RoleResolution" ADD COLUMN "capability" "Capability";

-- Stage 2: backfill from the batch's (soon-to-be-dropped) capability
UPDATE "RoleResolution" rr
SET "capability" = COALESCE(eci."capability", 'CLIENT_ENGAGEMENT_AND_DELIVERY')
FROM "EstimateCapabilityInput" eci
WHERE eci.id = rr."estimateCapabilityInputId";

-- Stage 3: make required
ALTER TABLE "RoleResolution" ALTER COLUMN "capability" SET NOT NULL;

-- Stage 4: drop the now-obsolete unique index + columns
DROP INDEX "EstimateCapabilityInput_estimateId_capability_key";
ALTER TABLE "EstimateCapabilityInput" DROP COLUMN "capability";
ALTER TABLE "EstimateCapabilityInput" DROP COLUMN "otherLabel";
