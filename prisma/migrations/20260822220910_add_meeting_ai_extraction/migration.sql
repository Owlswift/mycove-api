-- CreateEnum
CREATE TYPE "MeetingAiStatus" AS ENUM ('NOT_PROCESSED', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "aiActionItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "aiDecisions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "aiError" TEXT,
ADD COLUMN     "aiProcessedAt" TIMESTAMP(3),
ADD COLUMN     "aiStatus" "MeetingAiStatus" NOT NULL DEFAULT 'NOT_PROCESSED',
ADD COLUMN     "aiTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByAdminId" TEXT;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_approvedByAdminId_fkey" FOREIGN KEY ("approvedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
