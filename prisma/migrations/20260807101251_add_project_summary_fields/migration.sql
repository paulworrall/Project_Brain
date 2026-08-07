-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "jobCode" TEXT,
ADD COLUMN     "kickOffDate" TIMESTAMP(3),
ADD COLUMN     "projectManagerId" TEXT,
ADD COLUMN     "targetCompletionDate" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_projectManagerId_fkey" FOREIGN KEY ("projectManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
