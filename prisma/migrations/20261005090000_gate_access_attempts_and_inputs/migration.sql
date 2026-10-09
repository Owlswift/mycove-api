-- AlterTable
ALTER TABLE "GateAccessDecision" ADD COLUMN     "inputs" JSONB NOT NULL;

-- CreateTable
CREATE TABLE "GateAccessAttempt" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "userId" TEXT,
    "rfidTag" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateAccessAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GateAccessAttempt_estateId_createdAt_idx" ON "GateAccessAttempt"("estateId", "createdAt");

-- CreateIndex
CREATE INDEX "GateAccessAttempt_userId_createdAt_idx" ON "GateAccessAttempt"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "GateAccessAttempt" ADD CONSTRAINT "GateAccessAttempt_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateAccessAttempt" ADD CONSTRAINT "GateAccessAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
