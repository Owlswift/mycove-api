import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MeetingAiStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  MEETING_AI_EXTRACTOR,
  type MeetingAiExtractor,
} from './ai/meeting-ai-extractor.interface';

interface AiFields {
  aiStatus: MeetingAiStatus;
  aiTopics: string[];
  aiDecisions: string[];
  aiActionItems: string[];
  aiError: string | null;
  aiProcessedAt: Date | null;
  approvedAt: null;
  approvedByAdminId: null;
}

function daysAwayLabel(scheduledAt: Date): string {
  const days = Math.ceil(
    (scheduledAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
  if (days <= 0) return 'Happening now';
  if (days === 1) return '1 day away';
  return `${days} days away`;
}

@Injectable()
export class MeetingsService {
  constructor(
    private prisma: PrismaService,
    @Inject(MEETING_AI_EXTRACTOR) private aiExtractor: MeetingAiExtractor,
  ) {}

  async list(estateId: string) {
    const meetings = await this.prisma.meeting.findMany({
      where: { estateId },
      orderBy: { scheduledAt: 'asc' },
    });
    return meetings.map((m) => ({
      id: m.id,
      title: m.title,
      date: m.date,
      time: m.time,
      location: m.location,
      scheduledAt: m.scheduledAt,
      countdown: daysAwayLabel(m.scheduledAt),
    }));
  }

  /**
   * The report itself (Phase 1) is always resident-visible once written —
   * only the AI-derived topics/decisions/action-items (Phase 2) are held
   * back until an admin has reviewed and approved them, so the voice
   * assistant and this endpoint never surface an AI reading of the report
   * nobody's checked yet.
   */
  async get(userId: string, estateId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, estateId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    const calendarEntry = await this.prisma.calendarEntry.findUnique({
      where: { userId_meetingId: { userId, meetingId: id } },
    });
    const approved = !!meeting.approvedAt;
    return {
      ...meeting,
      aiTopics: approved ? meeting.aiTopics : [],
      aiDecisions: approved ? meeting.aiDecisions : [],
      aiActionItems: approved ? meeting.aiActionItems : [],
      countdown: daysAwayLabel(meeting.scheduledAt),
      calendarAdded: !!calendarEntry,
    };
  }

  async addToCalendar(userId: string, estateId: string, meetingId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, estateId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    await this.prisma.calendarEntry.upsert({
      where: { userId_meetingId: { userId, meetingId } },
      create: { userId, meetingId, estateId: meeting.estateId },
      update: {},
    });
    return {
      message: 'Added to device calendar',
      meeting: {
        title: meeting.title,
        date: meeting.date,
        time: meeting.time,
        location: meeting.location,
      },
    };
  }

  async adminList(estateId: string) {
    const meetings = await this.prisma.meeting.findMany({
      where: { estateId },
      orderBy: { scheduledAt: 'asc' },
    });
    return meetings.map((m) => ({
      id: m.id,
      title: m.title,
      date: m.date,
      time: m.time,
      location: m.location,
      agenda: m.agenda,
      report: m.report,
      aiStatus: m.aiStatus,
      aiTopics: m.aiTopics,
      aiDecisions: m.aiDecisions,
      aiActionItems: m.aiActionItems,
      aiError: m.aiError,
      approvedAt: m.approvedAt,
    }));
  }

  /**
   * Runs the (offline, once-per-report) AI extraction and returns the
   * fields to merge into the meeting row — never thrown on failure, since a
   * bad extraction shouldn't block saving the secretary's actual report
   * (the source of truth either way).
   */
  private async _extract(report: string | null): Promise<AiFields> {
    if (!report) {
      return {
        aiStatus: 'NOT_PROCESSED',
        aiTopics: [],
        aiDecisions: [],
        aiActionItems: [],
        aiError: null,
        aiProcessedAt: null,
        approvedAt: null,
        approvedByAdminId: null,
      };
    }
    try {
      const result = await this.aiExtractor.extract(report);
      return {
        aiStatus: 'PROCESSED',
        aiTopics: result.topics,
        aiDecisions: result.decisions,
        aiActionItems: result.actionItems,
        aiError: null,
        aiProcessedAt: new Date(),
        // A freshly (re-)extracted report hasn't been reviewed against
        // this specific extraction yet — any prior approval was for
        // whatever came before it.
        approvedAt: null,
        approvedByAdminId: null,
      };
    } catch (e) {
      return {
        aiStatus: 'FAILED',
        aiTopics: [],
        aiDecisions: [],
        aiActionItems: [],
        aiError: e instanceof Error ? e.message : 'AI extraction failed.',
        aiProcessedAt: new Date(),
        approvedAt: null,
        approvedByAdminId: null,
      };
    }
  }

  async adminCreate(estateId: string, data: { title: string; date: string; time: string; location: string; agenda: string[]; report?: string }) {
    const report = data.report?.trim() || null;
    const aiFields = await this._extract(report);
    const meeting = await this.prisma.meeting.create({
      data: {
        estateId,
        title: data.title,
        date: data.date,
        time: data.time,
        location: data.location,
        scheduledAt: new Date(`${data.date} ${data.time}`),
        agenda: data.agenda,
        report,
        ...aiFields,
      },
    });
    return meeting;
  }

  async adminUpdate(estateId: string, id: string, data: { title: string; date: string; time: string; location: string; agenda: string[]; report?: string }) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, estateId } });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const report = data.report?.trim() || null;
    // Only worth re-running (and invalidating any existing approval) when
    // the text an admin would be approving has actually changed — editing
    // the meeting's title/date/location shouldn't silently re-run AI
    // extraction or un-approve an already-reviewed report.
    const aiFields: Partial<AiFields> = report !== meeting.report ? await this._extract(report) : {};

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: {
        title: data.title,
        date: data.date,
        time: data.time,
        location: data.location,
        scheduledAt: new Date(`${data.date} ${data.time}`),
        agenda: data.agenda,
        report,
        ...aiFields,
      },
    });
    return updated;
  }

  /** Manual re-run — e.g. after a FAILED extraction, without needing to re-save the report text to trigger it again. */
  async adminReprocess(estateId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, estateId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!meeting.report) {
      throw new ConflictException('This meeting has no report to process yet.');
    }
    const aiFields = await this._extract(meeting.report);
    return this.prisma.meeting.update({ where: { id }, data: aiFields });
  }

  /** The secretary/admin correcting anything the AI got wrong before approving it — see Meeting.aiStatus's doc comment. */
  async adminUpdateExtraction(
    estateId: string,
    id: string,
    data: { topics?: string[]; decisions?: string[]; actionItems?: string[] },
  ) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, estateId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return this.prisma.meeting.update({
      where: { id },
      data: {
        aiTopics: data.topics ?? meeting.aiTopics,
        aiDecisions: data.decisions ?? meeting.aiDecisions,
        aiActionItems: data.actionItems ?? meeting.aiActionItems,
        // Edited content hasn't been approved as-is yet, even if the
        // meeting was previously approved before this edit.
        approvedAt: null,
        approvedByAdminId: null,
      },
    });
  }

  async adminApproveExtraction(estateId: string, adminId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, estateId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.aiStatus !== 'PROCESSED') {
      throw new ConflictException('This meeting has no processed AI extraction to approve yet.');
    }
    await this.prisma.meeting.update({
      where: { id },
      data: { approvedAt: new Date(), approvedByAdminId: adminId },
    });
    return { message: 'Meeting report extraction approved.' };
  }

  async adminDelete(estateId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, estateId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    await this.prisma.meeting.delete({ where: { id } });
  }
}
