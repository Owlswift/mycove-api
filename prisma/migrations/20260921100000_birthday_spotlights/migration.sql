-- AlterEnum
ALTER TYPE "SpotlightCategory" ADD VALUE 'BIRTHDAY';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "birthDay" INTEGER,
ADD COLUMN     "birthMonth" INTEGER;

-- CreateTable
CREATE TABLE "BirthdayCelebration" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "photoBase64" TEXT,
    "hasParty" BOOLEAN,
    "partyAt" TIMESTAMP(3),
    "partyVenue" TEXT,
    "respondedAt" TIMESTAMP(3),
    "promptedAt" TIMESTAMP(3),
    "partyAnnouncedAt" TIMESTAMP(3),
    "wishSentAt" TIMESTAMP(3),
    "spotlightId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BirthdayCelebration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BirthdayCelebration_spotlightId_key" ON "BirthdayCelebration"("spotlightId");

-- CreateIndex
CREATE INDEX "BirthdayCelebration_estateId_year_idx" ON "BirthdayCelebration"("estateId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "BirthdayCelebration_userId_year_key" ON "BirthdayCelebration"("userId", "year");

-- AddForeignKey
ALTER TABLE "BirthdayCelebration" ADD CONSTRAINT "BirthdayCelebration_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirthdayCelebration" ADD CONSTRAINT "BirthdayCelebration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirthdayCelebration" ADD CONSTRAINT "BirthdayCelebration_spotlightId_fkey" FOREIGN KEY ("spotlightId") REFERENCES "Spotlight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

