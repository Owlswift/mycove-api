-- CreateEnum
CREATE TYPE "MeetingReminderKind" AS ENUM ('DAY_OF', 'TEN_MINUTES_BEFORE', 'STARTED');

-- CreateTable
CREATE TABLE "MeetingReminder" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "kind" "MeetingReminderKind" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingReminder_estateId_idx" ON "MeetingReminder"("estateId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingReminder_meetingId_kind_key" ON "MeetingReminder"("meetingId", "kind");

-- AddForeignKey
ALTER TABLE "MeetingReminder" ADD CONSTRAINT "MeetingReminder_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
