/*
  Warnings:

  - You are about to drop the column `otpCode` on the `HouseholdInvite` table. All the data in the column will be lost.
  - You are about to drop the column `otpConsumedAt` on the `HouseholdInvite` table. All the data in the column will be lost.
  - You are about to drop the column `otpExpiresAt` on the `HouseholdInvite` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "HouseholdInvite" DROP COLUMN "otpCode",
DROP COLUMN "otpConsumedAt",
DROP COLUMN "otpExpiresAt",
ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedUserId" TEXT,
ADD COLUMN     "accessCode" TEXT;

-- AddForeignKey
ALTER TABLE "HouseholdInvite" ADD CONSTRAINT "HouseholdInvite_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
