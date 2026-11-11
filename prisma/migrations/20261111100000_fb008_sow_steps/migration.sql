-- FB-008: SOW journey steps. Purely additive: two enums, two nullable Project
-- columns, one defaulted ChecklistItem column (existing items become 'brief')
-- and one new table. The deployed code ignores all of it.

-- CreateEnum
CREATE TYPE "ProjectStep" AS ENUM ('brief', 'estimate', 'sow');

-- CreateEnum
CREATE TYPE "SpecialistInputStatus" AS ENUM ('not_requested', 'requested', 'received');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "scopeConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "scopeConfirmedByUserId" TEXT;

-- AlterTable
ALTER TABLE "ChecklistItem" ADD COLUMN     "step" "ProjectStep" NOT NULL DEFAULT 'brief';

-- CreateTable
CREATE TABLE "SpecialistInput" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "capability" "Capability" NOT NULL,
    "status" "SpecialistInputStatus" NOT NULL DEFAULT 'not_requested',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "SpecialistInput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpecialistInput_projectId_capability_key" ON "SpecialistInput"("projectId", "capability");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_scopeConfirmedByUserId_fkey" FOREIGN KEY ("scopeConfirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialistInput" ADD CONSTRAINT "SpecialistInput_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialistInput" ADD CONSTRAINT "SpecialistInput_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

