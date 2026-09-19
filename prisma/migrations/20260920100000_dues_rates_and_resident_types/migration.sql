-- CreateEnum
CREATE TYPE "ResidentType" AS ENUM ('REGULAR', 'COMMERCIAL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "residentType" "ResidentType" NOT NULL DEFAULT 'REGULAR',
ADD COLUMN     "moveInMonth" TEXT;

-- AlterTable
ALTER TABLE "DuesLedgerEntry" ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "periodEnd" TEXT,
ADD COLUMN     "periodStart" TEXT;

-- CreateTable
CREATE TABLE "DuesRate" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "residentType" "ResidentType" NOT NULL,
    "monthlyAmount" INTEGER NOT NULL,
    "effectiveMonth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "DuesRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DuesRate_estateId_residentType_effectiveMonth_idx" ON "DuesRate"("estateId", "residentType", "effectiveMonth");

-- AddForeignKey
ALTER TABLE "DuesRate" ADD CONSTRAINT "DuesRate_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesRate" ADD CONSTRAINT "DuesRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Carry every estate's existing single dues rate over as its REGULAR rate,
-- effective from the beginning of time so all past months keep the amount
-- they were already being calculated with (nothing changes until the
-- finance secretary sets a new rate).
INSERT INTO "DuesRate" ("id", "estateId", "residentType", "monthlyAmount", "effectiveMonth", "createdAt")
SELECT 'legacy_' || "id", "estateId", 'REGULAR', "monthlyAmount", '2000-01', CURRENT_TIMESTAMP
FROM "DuesSettings";
