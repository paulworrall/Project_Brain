-- Hand-authored data-preserving migration (not machine-generated) — see
-- agent.md/progress.md for why: Prisma's own `migrate dev` diff would DROP
-- the file/status columns being moved onto new Version tables, losing data.
-- Strategy: rename the old tables out of the way, build the new document +
-- version shape, copy every existing row across as history, then drop the
-- old tables. No row is ever deleted — see the "Step 5" data migration below.

-- Step 1: preserve old data by renaming tables/constraints out of the way
-- (renaming, not dropping, keeps every row and lets us COPY it forward).
ALTER TABLE "MasterServiceAgreement" RENAME TO "_old_MasterServiceAgreement";
ALTER TABLE "_old_MasterServiceAgreement" RENAME CONSTRAINT "MasterServiceAgreement_pkey" TO "_old_MasterServiceAgreement_pkey";

ALTER TABLE "RateCard" RENAME TO "_old_RateCard";
ALTER TABLE "_old_RateCard" RENAME CONSTRAINT "RateCard_pkey" TO "_old_RateCard_pkey";

-- Drop the FK from Project into the old RateCard table so the old table can
-- be dropped later once its data has been copied into the new RateCard shape.
ALTER TABLE "Project" DROP CONSTRAINT "Project_rateCardId_fkey";

-- Step 2: new shared/enum types
CREATE TYPE "VersionStatus" AS ENUM ('ENABLED', 'DISABLED');
CREATE TYPE "SOWTemplateScope" AS ENUM ('GLOBAL', 'CLIENT_SPECIFIC');

-- Step 3: new "document" (metadata-only) + "version" (file/status/uploader)
-- tables, shared shape across all three commercial document types.
CREATE TABLE "MasterServiceAgreement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterServiceAgreement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MasterServiceAgreementVersion" (
    "id" TEXT NOT NULL,
    "masterServiceAgreementId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileBytes" BYTEA NOT NULL,
    "extractedText" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "VersionStatus" NOT NULL DEFAULT 'ENABLED',
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterServiceAgreementVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateCard" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateCardVersion" (
    "id" TEXT NOT NULL,
    "rateCardId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileBytes" BYTEA NOT NULL,
    "extractedText" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "VersionStatus" NOT NULL DEFAULT 'ENABLED',
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateCardVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SOWTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "SOWTemplateScope" NOT NULL,
    "clientId" TEXT,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SOWTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SOWTemplateVersion" (
    "id" TEXT NOT NULL,
    "sowTemplateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileBytes" BYTEA NOT NULL,
    "extractedText" TEXT NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'ENABLED',
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SOWTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- Step 4: Project gains the SOW Template selection field
ALTER TABLE "Project" ADD COLUMN "sowTemplateId" TEXT;

-- Step 5: data migration — every existing row is preserved, none deleted.
--
-- MSA: the old model allowed multiple rows per Client (one ACTIVE plus any
-- number of SUPERSEDED, from the old replace-history convention). Consolidate
-- into exactly one MasterServiceAgreement document per Client (the new
-- model's shape — an MSA is unnamed and singular per Client), converting
-- every old row into a Version underneath it (oldest = version 1),
-- preserving ACTIVE -> ENABLED / SUPERSEDED -> DISABLED.
INSERT INTO "MasterServiceAgreement" ("id", "clientId", "createdAt", "updatedAt")
SELECT 'msa_' || "clientId", "clientId", now(), now()
FROM "_old_MasterServiceAgreement"
GROUP BY "clientId";

INSERT INTO "MasterServiceAgreementVersion"
  ("id", "masterServiceAgreementId", "versionNumber", "fileName", "fileBytes", "extractedText", "effectiveFrom", "effectiveTo", "status", "uploadedById", "uploadedAt")
SELECT
  "id",
  'msa_' || "clientId",
  ROW_NUMBER() OVER (PARTITION BY "clientId" ORDER BY "uploadedAt" ASC),
  "fileName",
  "fileBytes",
  "extractedText",
  "effectiveFrom",
  "effectiveTo",
  CASE WHEN "status" = 'ACTIVE' THEN 'ENABLED'::"VersionStatus" ELSE 'DISABLED'::"VersionStatus" END,
  "uploadedById",
  "uploadedAt"
FROM "_old_MasterServiceAgreement";

-- Rate Card: each existing row already represents its own named document
-- (distinguished by name/currency), so it maps 1:1 onto a new RateCard
-- document. The new document reuses the OLD row's id, so every existing
-- Project.rateCardId reference stays valid with no rewrite needed.
INSERT INTO "RateCard" ("id", "clientId", "name", "currency", "createdAt", "updatedAt")
SELECT "id", "clientId", "name", "currency", now(), now()
FROM "_old_RateCard";

INSERT INTO "RateCardVersion"
  ("id", "rateCardId", "versionNumber", "fileName", "fileBytes", "extractedText", "effectiveFrom", "effectiveTo", "status", "uploadedById", "uploadedAt")
SELECT
  'v1_' || "id",
  "id",
  1,
  "fileName",
  "fileBytes",
  "extractedText",
  "effectiveFrom",
  "effectiveTo",
  CASE WHEN "status" = 'ACTIVE' THEN 'ENABLED'::"VersionStatus" ELSE 'DISABLED'::"VersionStatus" END,
  "uploadedById",
  "uploadedAt"
FROM "_old_RateCard";

-- Step 6: drop the old tables (now fully migrated) and their unused enums
DROP TABLE "_old_MasterServiceAgreement";
DROP TABLE "_old_RateCard";
DROP TYPE "MasterServiceAgreementStatus";
DROP TYPE "RateCardStatus";

-- Step 7: unique constraints
ALTER TABLE "MasterServiceAgreement" ADD CONSTRAINT "MasterServiceAgreement_clientId_key" UNIQUE ("clientId");
ALTER TABLE "MasterServiceAgreementVersion" ADD CONSTRAINT "MasterServiceAgreementVersion_masterServiceAgreementId_versionNumber_key" UNIQUE ("masterServiceAgreementId", "versionNumber");
ALTER TABLE "RateCardVersion" ADD CONSTRAINT "RateCardVersion_rateCardId_versionNumber_key" UNIQUE ("rateCardId", "versionNumber");
ALTER TABLE "SOWTemplateVersion" ADD CONSTRAINT "SOWTemplateVersion_sowTemplateId_versionNumber_key" UNIQUE ("sowTemplateId", "versionNumber");

-- Step 8: foreign keys
ALTER TABLE "MasterServiceAgreement" ADD CONSTRAINT "MasterServiceAgreement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MasterServiceAgreementVersion" ADD CONSTRAINT "MasterServiceAgreementVersion_masterServiceAgreementId_fkey" FOREIGN KEY ("masterServiceAgreementId") REFERENCES "MasterServiceAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MasterServiceAgreementVersion" ADD CONSTRAINT "MasterServiceAgreementVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RateCardVersion" ADD CONSTRAINT "RateCardVersion_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "RateCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RateCardVersion" ADD CONSTRAINT "RateCardVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SOWTemplate" ADD CONSTRAINT "SOWTemplate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SOWTemplateVersion" ADD CONSTRAINT "SOWTemplateVersion_sowTemplateId_fkey" FOREIGN KEY ("sowTemplateId") REFERENCES "SOWTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SOWTemplateVersion" ADD CONSTRAINT "SOWTemplateVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "RateCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_sowTemplateId_fkey" FOREIGN KEY ("sowTemplateId") REFERENCES "SOWTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
