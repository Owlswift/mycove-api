-- AlterTable
ALTER TABLE "DuesLedgerEntry" ADD COLUMN     "mediaBase64" TEXT;

-- AlterTable
ALTER TABLE "LevyPayment" ADD COLUMN     "mediaBase64" TEXT;

-- CreateTable
CREATE TABLE "Estate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Estate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Estate_code_key" ON "Estate"("code");
