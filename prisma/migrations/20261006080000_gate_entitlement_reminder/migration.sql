-- AlterTable
ALTER TABLE "GateAccessEntitlement" ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "GateAccessEntitlement_expiresAt_remindedAt_idx" ON "GateAccessEntitlement"("expiresAt", "remindedAt");
