-- AlterTable
ALTER TABLE "Estate" ADD COLUMN     "streets" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "passRestrictionMonths" INTEGER DEFAULT 2;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "street" TEXT,
ADD COLUMN     "houseNumber" TEXT;
