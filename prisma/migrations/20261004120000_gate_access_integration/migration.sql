-- AlterTable
ALTER TABLE "Estate" ADD COLUMN     "gateAccessRestrictionAmount" INTEGER,
ADD COLUMN     "gateApiKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "rfidTag" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Estate_gateApiKey_key" ON "Estate"("gateApiKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_rfidTag_key" ON "User"("rfidTag");
