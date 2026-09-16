-- CreateEnum
CREATE TYPE "Capability" AS ENUM ('CLIENT_ENGAGEMENT_AND_DELIVERY', 'CUSTOMER_AND_BUSINESS_STRATEGY', 'BUSINESS_ARCHITECTURE', 'AI_INNOVATION_AND_ENABLEMENT', 'INSIGHTS_AND_OPTIMIZATION', 'EXPERIENCE_STRATEGY', 'EXPERIENCE_DESIGN', 'DATA_SOLUTION_CONSULTING', 'TECH_SOLUTION_CONSULTING', 'TECH_AND_DATA', 'MEDIA_SOLUTION_CONSULTING', 'MARKETING_OPERATIONS');

-- CreateTable
CREATE TABLE "ProjectCapability" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "capability" "Capability" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateBrief" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateBriefVersion" (
    "id" TEXT NOT NULL,
    "estimateBriefId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileBytes" BYTEA NOT NULL,
    "content" JSONB NOT NULL,
    "capabilities" "Capability"[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateBriefVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCapability_projectId_capability_key" ON "ProjectCapability"("projectId", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateBrief_projectId_key" ON "EstimateBrief"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateBriefVersion_estimateBriefId_versionNumber_key" ON "EstimateBriefVersion"("estimateBriefId", "versionNumber");

-- AddForeignKey
ALTER TABLE "ProjectCapability" ADD CONSTRAINT "ProjectCapability_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateBrief" ADD CONSTRAINT "EstimateBrief_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateBriefVersion" ADD CONSTRAINT "EstimateBriefVersion_estimateBriefId_fkey" FOREIGN KEY ("estimateBriefId") REFERENCES "EstimateBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateBriefVersion" ADD CONSTRAINT "EstimateBriefVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
