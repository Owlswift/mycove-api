import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MEETING_AI_EXTRACTOR } from './ai/meeting-ai-extractor.interface';
import { MockMeetingAiExtractor } from './ai/mock-meeting-ai-extractor';

@Module({
  controllers: [MeetingsController],
  providers: [
    MeetingsService,
    MockMeetingAiExtractor,
    { provide: MEETING_AI_EXTRACTOR, useClass: MockMeetingAiExtractor },
  ],
})
export class MeetingsModule {}
