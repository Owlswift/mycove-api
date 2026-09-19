-- CreateEnum
CREATE TYPE "DomesticRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED');

-- AlterTable
ALTER TABLE "VisitorPass" ADD COLUMN     "domesticStaffId" TEXT;

-- CreateTable
CREATE TABLE "DomesticStaff" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "startTime" TEXT,
    "endTime" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomesticStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomesticAccessRequest" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "status" "DomesticRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "DomesticAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DomesticStaff_phone_key" ON "DomesticStaff"("phone");

-- CreateIndex
CREATE INDEX "DomesticStaff_residentId_idx" ON "DomesticStaff"("residentId");

-- CreateIndex
CREATE INDEX "DomesticStaff_estateId_idx" ON "DomesticStaff"("estateId");

-- CreateIndex
CREATE INDEX "DomesticAccessRequest_residentId_status_idx" ON "DomesticAccessRequest"("residentId", "status");

-- CreateIndex
CREATE INDEX "DomesticAccessRequest_staffId_idx" ON "DomesticAccessRequest"("staffId");

-- AddForeignKey
ALTER TABLE "VisitorPass" ADD CONSTRAINT "VisitorPass_domesticStaffId_fkey" FOREIGN KEY ("domesticStaffId") REFERENCES "DomesticStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomesticStaff" ADD CONSTRAINT "DomesticStaff_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomesticStaff" ADD CONSTRAINT "DomesticStaff_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomesticAccessRequest" ADD CONSTRAINT "DomesticAccessRequest_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomesticAccessRequest" ADD CONSTRAINT "DomesticAccessRequest_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "DomesticStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomesticAccessRequest" ADD CONSTRAINT "DomesticAccessRequest_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

