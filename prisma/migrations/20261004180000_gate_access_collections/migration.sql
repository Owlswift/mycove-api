-- CreateTable
CREATE TABLE "GateAccessDecision" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outstandingBalance" INTEGER NOT NULL,
    "monthsOwed" INTEGER NOT NULL,
    "offers" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateAccessDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateAccessEntitlement" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decisionId" TEXT,
    "amountPaid" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GateAccessEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GateAccessDecision_estateId_idx" ON "GateAccessDecision"("estateId");

-- CreateIndex
CREATE INDEX "GateAccessDecision_userId_createdAt_idx" ON "GateAccessDecision"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GateAccessEntitlement_userId_expiresAt_idx" ON "GateAccessEntitlement"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "GateAccessEntitlement_estateId_idx" ON "GateAccessEntitlement"("estateId");

-- AddForeignKey
ALTER TABLE "GateAccessDecision" ADD CONSTRAINT "GateAccessDecision_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateAccessDecision" ADD CONSTRAINT "GateAccessDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateAccessEntitlement" ADD CONSTRAINT "GateAccessEntitlement_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateAccessEntitlement" ADD CONSTRAINT "GateAccessEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateAccessEntitlement" ADD CONSTRAINT "GateAccessEntitlement_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "GateAccessDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
