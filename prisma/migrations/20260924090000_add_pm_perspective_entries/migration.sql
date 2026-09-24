
-- CreateTable
CREATE TABLE "PmPerspectiveEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmPerspectiveEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PmPerspectiveEntry_projectId_fieldId_key" ON "PmPerspectiveEntry"("projectId", "fieldId");

-- AddForeignKey
ALTER TABLE "PmPerspectiveEntry" ADD CONSTRAINT "PmPerspectiveEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmPerspectiveEntry" ADD CONSTRAINT "PmPerspectiveEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

