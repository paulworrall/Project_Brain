-- FB-005: client approval of Estimate / SOW versions. Purely additive: two enums
-- and one new table. Existing estimates and SOWs simply have no approval row, so
-- they are drafts — no backfill. The deployed code ignores the table.

-- CreateEnum
CREATE TYPE "CommercialDocumentType" AS ENUM ('ESTIMATE', 'SOW');

-- CreateEnum
CREATE TYPE "ApprovalRevokeKind" AS ENUM ('UNDO', 'ADMIN_REVERT');

-- CreateTable
CREATE TABLE "CommercialApproval" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentType" "CommercialDocumentType" NOT NULL,
    "estimateVersionId" TEXT,
    "sowVersionId" TEXT,
    "clientApprovedOn" DATE NOT NULL,
    "clientApproverName" TEXT NOT NULL,
    "reference" TEXT,
    "fileSha256" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokeReason" TEXT,
    "revokeKind" "ApprovalRevokeKind",

    CONSTRAINT "CommercialApproval_pkey" PRIMARY KEY ("id"),
    -- Exactly one version FK, matching the document type.
    CONSTRAINT "CommercialApproval_one_version_check" CHECK (
      ("documentType" = 'ESTIMATE' AND "estimateVersionId" IS NOT NULL AND "sowVersionId" IS NULL)
      OR ("documentType" = 'SOW' AND "sowVersionId" IS NOT NULL AND "estimateVersionId" IS NULL)
    ),
    -- A revoked row always says how.
    CONSTRAINT "CommercialApproval_revoke_check" CHECK (
      ("revokedAt" IS NULL AND "revokeKind" IS NULL)
      OR ("revokedAt" IS NOT NULL AND "revokeKind" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "CommercialApproval_projectId_documentType_idx" ON "CommercialApproval"("projectId", "documentType");
CREATE INDEX "CommercialApproval_estimateVersionId_idx" ON "CommercialApproval"("estimateVersionId");
CREATE INDEX "CommercialApproval_sowVersionId_idx" ON "CommercialApproval"("sowVersionId");

-- Invariants enforced in the database (Prisma cannot express partial indexes):
-- at most one ACTIVE approval per project per document type, and per version.
CREATE UNIQUE INDEX "CommercialApproval_active_project_type_key"
  ON "CommercialApproval"("projectId", "documentType") WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX "CommercialApproval_active_estimate_version_key"
  ON "CommercialApproval"("estimateVersionId") WHERE "revokedAt" IS NULL AND "estimateVersionId" IS NOT NULL;
CREATE UNIQUE INDEX "CommercialApproval_active_sow_version_key"
  ON "CommercialApproval"("sowVersionId") WHERE "revokedAt" IS NULL AND "sowVersionId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "CommercialApproval" ADD CONSTRAINT "CommercialApproval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialApproval" ADD CONSTRAINT "CommercialApproval_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialApproval" ADD CONSTRAINT "CommercialApproval_sowVersionId_fkey" FOREIGN KEY ("sowVersionId") REFERENCES "SOWVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialApproval" ADD CONSTRAINT "CommercialApproval_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialApproval" ADD CONSTRAINT "CommercialApproval_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
