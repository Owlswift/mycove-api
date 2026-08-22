-- CreateEnum
CREATE TYPE "HouseholdInviteStatus" AS ENUM ('PENDING_ADMIN_APPROVAL', 'APPROVED', 'REJECTED', 'ACCEPTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "duesLiable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "invitedById" TEXT;

-- CreateTable
CREATE TABLE "HouseholdInvite" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "invitedPhone" TEXT NOT NULL,
    "invitedFullName" TEXT NOT NULL,
    "status" "HouseholdInviteStatus" NOT NULL DEFAULT 'PENDING_ADMIN_APPROVAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "respondedByAdminId" TEXT,
    "otpCode" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpConsumedAt" TIMESTAMP(3),

    CONSTRAINT "HouseholdInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HouseholdInvite_estateId_idx" ON "HouseholdInvite"("estateId");

-- CreateIndex
CREATE INDEX "HouseholdInvite_invitedPhone_idx" ON "HouseholdInvite"("invitedPhone");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdInvite" ADD CONSTRAINT "HouseholdInvite_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdInvite" ADD CONSTRAINT "HouseholdInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdInvite" ADD CONSTRAINT "HouseholdInvite_respondedByAdminId_fkey" FOREIGN KEY ("respondedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
