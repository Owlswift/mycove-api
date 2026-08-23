import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingReminderService } from './meeting-reminder.service';
import { PushModule } from '../push/push.module';
import { MEETING_AI_EXTRACTOR } from './ai/meeting-ai-extractor.interface';
import { MockMeetingAiExtractor } from './ai/mock-meeting-ai-extractor';

@Module({
  imports: [PushModule],
  controllers: [MeetingsController],
  providers: [
    MeetingsService,
    MeetingReminderService,
    MockMeetingAiExtractor,
    { provide: MEETING_AI_EXTRACTOR, useClass: MockMeetingAiExtractor },
  ],
})
export class MeetingsModule {}
