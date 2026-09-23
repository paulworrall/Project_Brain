-- Estimate unit conversion: quantities carry an explicit unit (hours/days/
-- weeks) and are converted to hours before pricing. Additive and
-- non-destructive for saved history: every existing free-text unit is kept
-- verbatim in rawUnitText, and saved versions' totals/content/files are left
-- untouched — they are only flagged needsRecalculation.

-- CreateEnum
CREATE TYPE "EstimateUnit" AS ENUM ('HOURS', 'DAYS', 'WEEKS');

-- RoleResolution: keep the original text, then map it to the enum.
-- Mirrors parseEstimateUnit() in src/services/pricing/unit-conversion.ts;
-- anything unrecognised (e.g. 'unspecified') becomes NULL = held for PM
-- review, never defaulted to hours.
ALTER TABLE "RoleResolution" RENAME COLUMN "extractedUnit" TO "rawUnitText";
ALTER TABLE "RoleResolution" ALTER COLUMN "rawUnitText" DROP NOT NULL;
ALTER TABLE "RoleResolution" ADD COLUMN "extractedUnit" "EstimateUnit";
UPDATE "RoleResolution" SET "extractedUnit" = CASE
  WHEN lower(trim("rawUnitText")) IN ('h', 'hr', 'hrs', 'hour', 'hours', 'person-hour', 'person-hours', 'man-hour', 'man-hours') THEN 'HOURS'::"EstimateUnit"
  WHEN lower(trim("rawUnitText")) IN ('d', 'day', 'days', 'pd', 'pds', 'person-day', 'person-days', 'man-day', 'man-days') THEN 'DAYS'::"EstimateUnit"
  WHEN lower(trim("rawUnitText")) IN ('w', 'wk', 'wks', 'week', 'weeks', 'person-week', 'person-weeks', 'man-week', 'man-weeks') THEN 'WEEKS'::"EstimateUnit"
  ELSE NULL
END;

-- EstimateLineItem: immutable history — same keep-then-map treatment, no
-- hours backfill (legacy lines were never priced from hours).
ALTER TABLE "EstimateLineItem" RENAME COLUMN "unit" TO "rawUnitText";
ALTER TABLE "EstimateLineItem" ALTER COLUMN "rawUnitText" DROP NOT NULL;
ALTER TABLE "EstimateLineItem" ADD COLUMN "unit" "EstimateUnit";
ALTER TABLE "EstimateLineItem" ADD COLUMN "hours" DECIMAL(12,4);
UPDATE "EstimateLineItem" SET "unit" = CASE
  WHEN lower(trim("rawUnitText")) IN ('h', 'hr', 'hrs', 'hour', 'hours', 'person-hour', 'person-hours', 'man-hour', 'man-hours') THEN 'HOURS'::"EstimateUnit"
  WHEN lower(trim("rawUnitText")) IN ('d', 'day', 'days', 'pd', 'pds', 'person-day', 'person-days', 'man-day', 'man-days') THEN 'DAYS'::"EstimateUnit"
  WHEN lower(trim("rawUnitText")) IN ('w', 'wk', 'wks', 'week', 'weeks', 'person-week', 'person-weeks', 'man-week', 'man-weeks') THEN 'WEEKS'::"EstimateUnit"
  ELSE NULL
END;

-- EstimateVersion: conversion factors used (NULL on legacy versions) and
-- the recalculation flag. Every version that exists before this migration
-- was priced as quantity x rate regardless of unit, so all are flagged; new
-- versions default to false.
ALTER TABLE "EstimateVersion" ADD COLUMN "hoursPerDay" DECIMAL(5,2);
ALTER TABLE "EstimateVersion" ADD COLUMN "daysPerWeek" DECIMAL(5,2);
ALTER TABLE "EstimateVersion" ADD COLUMN "needsRecalculation" BOOLEAN NOT NULL DEFAULT false;
UPDATE "EstimateVersion" SET "needsRecalculation" = true;
