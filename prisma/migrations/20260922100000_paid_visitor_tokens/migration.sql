-- AlterTable
ALTER TABLE "Estate" ADD COLUMN     "tokenAllowanceCommercial" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "tokenAllowanceRegular" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "tokenChargingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tokenPriceCommercial" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tokenPriceRegular" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VisitorPass" ADD COLUMN     "chargedAmount" INTEGER NOT NULL DEFAULT 0;

