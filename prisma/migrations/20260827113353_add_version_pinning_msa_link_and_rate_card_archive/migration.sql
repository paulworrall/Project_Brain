-- Phase 1 of the MSA / Rate Card / SOW Template version-pinning work (see
-- audit findings in progress.md/agent.md). Schema + backfill only — no
-- Server Action or UI in this repo writes rateCardVersionId,
-- sowTemplateVersionId, or masterServiceAgreementId yet; that's phase 2.
--
-- Step 1: Project gains three new nullable link columns.
--   - masterServiceAgreementId: no historical source exists to backfill this
--     for pre-existing projects (nothing previously recorded which MSA a
--     project was created under) — left null for every existing row.
--   - rateCardVersionId / sowTemplateVersionId: pin the specific Version row
--     in effect at selection time, instead of resolving through the parent
--     document's "whichever version is currently ENABLED" state, which
--     silently changes out from under a Project when a newer version is
--     published. Backfilled below from each Project's existing
--     rateCardId/sowTemplateId + that document's current ENABLED version.
--   rateCardId and sowTemplateId are left in place, unchanged — existing
--   Server Actions still read/write them; phase 2 decides their fate.
ALTER TABLE "Project" ADD COLUMN     "masterServiceAgreementId" TEXT,
ADD COLUMN     "rateCardVersionId" TEXT,
ADD COLUMN     "sowTemplateVersionId" TEXT;

-- Step 2: RateCard gains a standalone retirement flag, distinct from the
-- version-currency (ENABLED/DISABLED) mechanism — lets an admin action (not
-- built in this phase) hide a whole named Rate Card from end-user selectors
-- without touching any RateCardVersion's status.
ALTER TABLE "RateCard" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- Step 3: backfill rateCardVersionId / sowTemplateVersionId for existing
-- Projects, from whichever version is currently ENABLED for the document
-- each Project already references. Projects with no rateCardId/sowTemplateId
-- set are untouched (both columns stay null, matched by the WHERE clause).
-- Projects whose referenced document has no ENABLED version at all (should
-- not happen given the existing upload/revert Server Actions always leave
-- exactly one ENABLED version — confirmed by the Step 4 check below) simply
-- find no matching row and are left null by the LEFT JOIN.
UPDATE "Project" p
SET "rateCardVersionId" = rv.id
FROM "RateCardVersion" rv
WHERE p."rateCardId" IS NOT NULL
  AND rv."rateCardId" = p."rateCardId"
  AND rv."status" = 'ENABLED'::"VersionStatus";

UPDATE "Project" p
SET "sowTemplateVersionId" = sv.id
FROM "SOWTemplateVersion" sv
WHERE p."sowTemplateId" IS NOT NULL
  AND sv."sowTemplateId" = p."sowTemplateId"
  AND sv."status" = 'ENABLED'::"VersionStatus";

-- Step 4: foreign keys for the three new Project link columns.
ALTER TABLE "Project" ADD CONSTRAINT "Project_rateCardVersionId_fkey" FOREIGN KEY ("rateCardVersionId") REFERENCES "RateCardVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_sowTemplateVersionId_fkey" FOREIGN KEY ("sowTemplateVersionId") REFERENCES "SOWTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_masterServiceAgreementId_fkey" FOREIGN KEY ("masterServiceAgreementId") REFERENCES "MasterServiceAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 5: enforce "at most one ENABLED version per parent document" as a DB
-- constraint, not just the application-code transactions in
-- clients/[clientId]/actions.ts and sow-templates/actions.ts that currently
-- provide the only guarantee. Partial unique indexes, since Prisma's schema
-- DSL has no way to express a filtered constraint directly.
--
-- Verified via a manual pre-check against this migration's target database
-- before adding these (see phase 1 report) — zero parent documents currently
-- have more than one ENABLED version across all three tables. Re-run the
-- same check against any other environment before applying this migration
-- there; if a violation exists, these CREATE UNIQUE INDEX statements will
-- fail the whole migration and must be resolved first (disable all but one
-- ENABLED version per offending document) rather than skipped.
CREATE UNIQUE INDEX "MasterServiceAgreementVersion_one_enabled_per_msa" ON "MasterServiceAgreementVersion" ("masterServiceAgreementId") WHERE "status" = 'ENABLED'::"VersionStatus";

CREATE UNIQUE INDEX "RateCardVersion_one_enabled_per_rate_card" ON "RateCardVersion" ("rateCardId") WHERE "status" = 'ENABLED'::"VersionStatus";

CREATE UNIQUE INDEX "SOWTemplateVersion_one_enabled_per_template" ON "SOWTemplateVersion" ("sowTemplateId") WHERE "status" = 'ENABLED'::"VersionStatus";
