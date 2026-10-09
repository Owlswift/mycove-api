-- CreateEnum
CREATE TYPE "QrScanPlatform" AS ENUM ('IOS', 'ANDROID', 'OTHER');

-- CreateTable
CREATE TABLE "QrScan" (
    "id" TEXT NOT NULL,
    "platform" "QrScanPlatform" NOT NULL,
    "userAgent" TEXT NOT NULL,
    "ip" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QrScan_platform_idx" ON "QrScan"("platform");

-- CreateIndex
CREATE INDEX "QrScan_createdAt_idx" ON "QrScan"("createdAt");
