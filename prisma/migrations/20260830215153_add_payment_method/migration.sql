-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PAYSTACK', 'WALLET');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "method" "PaymentMethod" NOT NULL DEFAULT 'PAYSTACK';
