-- CreateTable
CREATE TABLE "SOW" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SOW_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SOWVersion" (
    "id" TEXT NOT NULL,
    "sowId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileBytes" BYTEA NOT NULL,
    "content" JSONB NOT NULL,
    "sowTemplateId" TEXT,
    "sowTemplateVersionId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SOWVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SOW_projectId_key" ON "SOW"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SOWVersion_sowId_versionNumber_key" ON "SOWVersion"("sowId", "versionNumber");

-- AddForeignKey
ALTER TABLE "SOW" ADD CONSTRAINT "SOW_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOWVersion" ADD CONSTRAINT "SOWVersion_sowId_fkey" FOREIGN KEY ("sowId") REFERENCES "SOW"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOWVersion" ADD CONSTRAINT "SOWVersion_sowTemplateId_fkey" FOREIGN KEY ("sowTemplateId") REFERENCES "SOWTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOWVersion" ADD CONSTRAINT "SOWVersion_sowTemplateVersionId_fkey" FOREIGN KEY ("sowTemplateVersionId") REFERENCES "SOWTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOWVersion" ADD CONSTRAINT "SOWVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
