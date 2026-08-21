-- CreateEnum
CREATE TYPE "UtilityType" AS ENUM ('ELECTRICITY', 'AIRTIME');

-- CreateEnum
CREATE TYPE "UtilityProviderName" AS ENUM ('VTPASS', 'BUYPOWER');

-- CreateEnum
CREATE TYPE "MeterType" AS ENUM ('PREPAID', 'POSTPAID');

-- CreateEnum
CREATE TYPE "UtilityPurchaseStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED');

-- CreateTable
CREATE TABLE "UtilityMeter" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discoCode" TEXT NOT NULL,
    "discoName" TEXT NOT NULL,
    "meterNumber" TEXT NOT NULL,
    "meterType" "MeterType" NOT NULL,
    "customerName" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtilityMeter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtilityPurchase" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "UtilityType" NOT NULL,
    "meterId" TEXT,
    "phone" TEXT,
    "network" TEXT,
    "amount" INTEGER NOT NULL,
    "status" "UtilityPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "UtilityProviderName",
    "attemptedProviders" "UtilityProviderName"[] DEFAULT ARRAY[]::"UtilityProviderName"[],
    "requestId" TEXT NOT NULL,
    "providerRef" TEXT,
    "token" TEXT,
    "units" TEXT,
    "tariff" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtilityPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UtilityMeter_estateId_idx" ON "UtilityMeter"("estateId");

-- CreateIndex
CREATE INDEX "UtilityMeter_userId_idx" ON "UtilityMeter"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UtilityMeter_userId_meterNumber_key" ON "UtilityMeter"("userId", "meterNumber");

-- CreateIndex
CREATE UNIQUE INDEX "UtilityPurchase_requestId_key" ON "UtilityPurchase"("requestId");

-- CreateIndex
CREATE INDEX "UtilityPurchase_estateId_idx" ON "UtilityPurchase"("estateId");

-- CreateIndex
CREATE INDEX "UtilityPurchase_userId_idx" ON "UtilityPurchase"("userId");

-- AddForeignKey
ALTER TABLE "UtilityMeter" ADD CONSTRAINT "UtilityMeter_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityMeter" ADD CONSTRAINT "UtilityMeter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityPurchase" ADD CONSTRAINT "UtilityPurchase_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityPurchase" ADD CONSTRAINT "UtilityPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityPurchase" ADD CONSTRAINT "UtilityPurchase_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "UtilityMeter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
