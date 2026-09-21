-- DropIndex
DROP INDEX "DomesticStaff_phone_key";

-- CreateTable
CREATE TABLE "WhatsappChoice" (
    "phone" TEXT NOT NULL,
    "staffIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappChoice_pkey" PRIMARY KEY ("phone")
);

-- CreateIndex
CREATE INDEX "DomesticStaff_phone_idx" ON "DomesticStaff"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "DomesticStaff_residentId_phone_key" ON "DomesticStaff"("residentId", "phone");

