-- Hand-written (not `prisma migrate dev`-generated) because 29 tables all
-- need the same required-column-on-non-empty-table treatment at once, which
-- would otherwise mean answering an interactive "what default?" prompt per
-- table. Instead: add nullable, backfill every existing row to the one
-- estate seeded so far (PALM001), then tighten to NOT NULL.

-- Section A: add the column, nullable, everywhere.
ALTER TABLE "User" ADD COLUMN "estateId" TEXT;
ALTER TABLE "DeviceToken" ADD COLUMN "estateId" TEXT;
ALTER TABLE "PasswordResetOtp" ADD COLUMN "estateId" TEXT;
ALTER TABLE "Announcement" ADD COLUMN "estateId" TEXT;
ALTER TABLE "AnnouncementRead" ADD COLUMN "estateId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "estateId" TEXT;
ALTER TABLE "CalendarEntry" ADD COLUMN "estateId" TEXT;
ALTER TABLE "DuesLedgerEntry" ADD COLUMN "estateId" TEXT;
ALTER TABLE "DuesSettings" ADD COLUMN "estateId" TEXT;
ALTER TABLE "Levy" ADD COLUMN "estateId" TEXT;
ALTER TABLE "LevyPayment" ADD COLUMN "estateId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "estateId" TEXT;
ALTER TABLE "VisitorPass" ADD COLUMN "estateId" TEXT;
ALTER TABLE "AccessLogEntry" ADD COLUMN "estateId" TEXT;
ALTER TABLE "Project" ADD COLUMN "estateId" TEXT;
ALTER TABLE "ProjectBudgetLine" ADD COLUMN "estateId" TEXT;
ALTER TABLE "ProjectReport" ADD COLUMN "estateId" TEXT;
ALTER TABLE "ProjectDonation" ADD COLUMN "estateId" TEXT;
ALTER TABLE "ProjectPledge" ADD COLUMN "estateId" TEXT;
ALTER TABLE "Spotlight" ADD COLUMN "estateId" TEXT;
ALTER TABLE "ProjectAllocation" ADD COLUMN "estateId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "estateId" TEXT;
ALTER TABLE "Poll" ADD COLUMN "estateId" TEXT;
ALTER TABLE "PollOption" ADD COLUMN "estateId" TEXT;
ALTER TABLE "PollVote" ADD COLUMN "estateId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "estateId" TEXT;
ALTER TABLE "RulesSection" ADD COLUMN "estateId" TEXT;
ALTER TABLE "RuleItem" ADD COLUMN "estateId" TEXT;
ALTER TABLE "Complaint" ADD COLUMN "estateId" TEXT;

-- Section B: backfill every existing row to the one estate that exists so far.
UPDATE "User" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "DeviceToken" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "PasswordResetOtp" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "Announcement" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "AnnouncementRead" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "Meeting" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "CalendarEntry" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "DuesLedgerEntry" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "DuesSettings" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "Levy" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "LevyPayment" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "Payment" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "VisitorPass" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "AccessLogEntry" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "Project" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "ProjectBudgetLine" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "ProjectReport" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "ProjectDonation" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "ProjectPledge" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "Spotlight" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "ProjectAllocation" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "Invoice" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "Poll" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "PollOption" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "PollVote" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "Notification" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "RulesSection" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "RuleItem" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');
UPDATE "Complaint" SET "estateId" = (SELECT id FROM "Estate" WHERE code = 'PALM001');

-- Section C: now that every row has a value, make it required.
ALTER TABLE "User" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "DeviceToken" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "PasswordResetOtp" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "Announcement" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "AnnouncementRead" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "Meeting" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "CalendarEntry" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "DuesLedgerEntry" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "DuesSettings" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "Levy" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "LevyPayment" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "VisitorPass" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "AccessLogEntry" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "ProjectBudgetLine" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "ProjectReport" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "ProjectDonation" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "ProjectPledge" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "Spotlight" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "ProjectAllocation" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "Poll" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "PollOption" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "PollVote" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "RulesSection" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "RuleItem" ALTER COLUMN "estateId" SET NOT NULL;
ALTER TABLE "Complaint" ALTER COLUMN "estateId" SET NOT NULL;

-- Section D: foreign keys back to Estate, cascading on delete like every
-- other relation in this schema does.
ALTER TABLE "User" ADD CONSTRAINT "User_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordResetOtp" ADD CONSTRAINT "PasswordResetOtp_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DuesLedgerEntry" ADD CONSTRAINT "DuesLedgerEntry_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DuesSettings" ADD CONSTRAINT "DuesSettings_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Levy" ADD CONSTRAINT "Levy_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LevyPayment" ADD CONSTRAINT "LevyPayment_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitorPass" ADD CONSTRAINT "VisitorPass_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessLogEntry" ADD CONSTRAINT "AccessLogEntry_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectBudgetLine" ADD CONSTRAINT "ProjectBudgetLine_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectReport" ADD CONSTRAINT "ProjectReport_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectDonation" ADD CONSTRAINT "ProjectDonation_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectPledge" ADD CONSTRAINT "ProjectPledge_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Spotlight" ADD CONSTRAINT "Spotlight_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAllocation" ADD CONSTRAINT "ProjectAllocation_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RulesSection" ADD CONSTRAINT "RulesSection_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RuleItem" ADD CONSTRAINT "RuleItem_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Section E: indexes for the estateId filter every scoped query will use.
-- DuesSettings gets a UNIQUE index (one settings row per estate) instead of
-- a plain one.
CREATE INDEX "User_estateId_idx" ON "User"("estateId");
CREATE INDEX "DeviceToken_estateId_idx" ON "DeviceToken"("estateId");
CREATE INDEX "PasswordResetOtp_estateId_idx" ON "PasswordResetOtp"("estateId");
CREATE INDEX "Announcement_estateId_idx" ON "Announcement"("estateId");
CREATE INDEX "AnnouncementRead_estateId_idx" ON "AnnouncementRead"("estateId");
CREATE INDEX "Meeting_estateId_idx" ON "Meeting"("estateId");
CREATE INDEX "CalendarEntry_estateId_idx" ON "CalendarEntry"("estateId");
CREATE INDEX "DuesLedgerEntry_estateId_idx" ON "DuesLedgerEntry"("estateId");
CREATE UNIQUE INDEX "DuesSettings_estateId_key" ON "DuesSettings"("estateId");
CREATE INDEX "Levy_estateId_idx" ON "Levy"("estateId");
CREATE INDEX "LevyPayment_estateId_idx" ON "LevyPayment"("estateId");
CREATE INDEX "Payment_estateId_idx" ON "Payment"("estateId");
CREATE INDEX "VisitorPass_estateId_idx" ON "VisitorPass"("estateId");
CREATE INDEX "AccessLogEntry_estateId_idx" ON "AccessLogEntry"("estateId");
CREATE INDEX "Project_estateId_idx" ON "Project"("estateId");
CREATE INDEX "ProjectBudgetLine_estateId_idx" ON "ProjectBudgetLine"("estateId");
CREATE INDEX "ProjectReport_estateId_idx" ON "ProjectReport"("estateId");
CREATE INDEX "ProjectDonation_estateId_idx" ON "ProjectDonation"("estateId");
CREATE INDEX "ProjectPledge_estateId_idx" ON "ProjectPledge"("estateId");
CREATE INDEX "Spotlight_estateId_idx" ON "Spotlight"("estateId");
CREATE INDEX "ProjectAllocation_estateId_idx" ON "ProjectAllocation"("estateId");
CREATE INDEX "Invoice_estateId_idx" ON "Invoice"("estateId");
CREATE INDEX "Poll_estateId_idx" ON "Poll"("estateId");
CREATE INDEX "PollOption_estateId_idx" ON "PollOption"("estateId");
CREATE INDEX "PollVote_estateId_idx" ON "PollVote"("estateId");
CREATE INDEX "Notification_estateId_idx" ON "Notification"("estateId");
CREATE INDEX "RulesSection_estateId_idx" ON "RulesSection"("estateId");
CREATE INDEX "RuleItem_estateId_idx" ON "RuleItem"("estateId");
CREATE INDEX "Complaint_estateId_idx" ON "Complaint"("estateId");
