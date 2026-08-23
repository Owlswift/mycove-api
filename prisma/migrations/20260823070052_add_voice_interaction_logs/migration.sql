-- CreateTable
CREATE TABLE "VoiceInteractionLog" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "intent" TEXT,
    "matchedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parameters" JSONB,
    "response" TEXT,
    "navigationTarget" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceInteractionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceInteractionLog_estateId_createdAt_idx" ON "VoiceInteractionLog"("estateId", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceInteractionLog_userId_idx" ON "VoiceInteractionLog"("userId");

-- AddForeignKey
ALTER TABLE "VoiceInteractionLog" ADD CONSTRAINT "VoiceInteractionLog_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceInteractionLog" ADD CONSTRAINT "VoiceInteractionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
