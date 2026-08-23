import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Meeting, MeetingReminderKind } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PushService } from '../push/push.service';

const TEN_MINUTES_MS = 10 * 60 * 1000;

// If the server was down through a meeting's start, a "the meeting has
// started" push arriving long after the fact is worse than none — the
// started reminder only fires within this grace window of the scheduled
// start time.
const START_GRACE_MS = 30 * 60 * 1000;

/**
 * Hour (server-local) at which the day-of reminder fires on a meeting's
 * date — "on the day of the meeting" needs *some* concrete moment, and a
/// fixed morning hour is the least surprising choice for residents.
 */
function dayOfReminderHour(): number {
  const parsed = Number.parseInt(
    process.env.MEETING_DAY_REMINDER_HOUR ?? '8',
    10,
  );
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 8;
}

/**
 * Sends each estate meeting's three push reminders exactly once:
 *
 *   1. DAY_OF             — on the day of the meeting (morning hour)
 *   2. TEN_MINUTES_BEFORE — 10 minutes before commencement
 *   3. STARTED            — when the meeting starts
 *
 * A minute-tick scanner compares every relevant meeting against its
 * already-sent reminders; dedup is enforced by the unique
 * (meetingId, kind) constraint on MeetingReminder, so each reminder fires
 * exactly once per meeting even across server restarts or overlapping
 * ticks — no in-memory state to lose.
 */
@Injectable()
export class MeetingReminderService {
  private readonly logger = new Logger(MeetingReminderService.name);
  private ticking = false;

  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  @Interval(60_000)
  async tick(): Promise<void> {
    // A slow DB round trip must not stack ticks on top of each other.
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.scanDayOf(new Date());
      await this.scanImminent(new Date());
    } catch (e) {
      this.logger.error(
        `Meeting reminder scan failed: ${(e as Error).message}`,
      );
    } finally {
      this.ticking = false;
    }
  }

  /** Reminder 1 — day-of: fires once on the meeting's date, at/after the configured morning hour. */
  private async scanDayOf(now: Date): Promise<void> {
    if (now.getHours() < dayOfReminderHour()) return;
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const meetings = await this.prisma.meeting.findMany({
      where: { scheduledAt: { gte: dayStart, lt: dayEnd } },
      include: { reminders: { where: { kind: 'DAY_OF' } } },
    });
    for (const m of meetings) {
      if (m.reminders.length > 0) continue;
      await this.sendOnce(
        m,
        'DAY_OF',
        `Today: "${m.title}" at ${m.time}, ${m.location}.`,
      );
    }
  }

  /** Reminders 2 & 3 — T-10min and start, for meetings inside their windows. */
  private async scanImminent(now: Date): Promise<void> {
    const meetings = await this.prisma.meeting.findMany({
      where: {
        scheduledAt: {
          gte: new Date(now.getTime() - START_GRACE_MS),
          lte: new Date(now.getTime() + TEN_MINUTES_MS),
        },
      },
      include: { reminders: true },
    });
    for (const m of meetings) {
      const sent = new Set(m.reminders.map((r) => r.kind));
      const startsInMs = m.scheduledAt.getTime() - now.getTime();
      if (!sent.has('TEN_MINUTES_BEFORE') && startsInMs > 0 && startsInMs <= TEN_MINUTES_MS) {
        await this.sendOnce(
          m,
          'TEN_MINUTES_BEFORE',
          `"${m.title}" starts in 10 minutes at ${m.location}.`,
        );
      }
      if (!sent.has('STARTED') && startsInMs <= 0) {
        await this.sendOnce(
          m,
          'STARTED',
          `"${m.title}" is starting now at ${m.location}.`,
        );
      }
    }
  }

  /**
   * The create IS the claim: the unique (meetingId, kind) constraint means
   * exactly one caller ever wins it — every later attempt (next tick,
   * another instance) hits P2002 and returns without sending.
   */
  private async sendOnce(
    meeting: Meeting,
    kind: MeetingReminderKind,
    message: string,
  ): Promise<void> {
    try {
      await this.prisma.meetingReminder.create({
        data: {
          estateId: meeting.estateId,
          meetingId: meeting.id,
          kind,
        },
      });
    } catch {
      return; // already sent
    }
    try {
      // Meetings are estate-wide events — everyone with an active account
      // gets them (residents, guards, admins alike).
      const users = await this.prisma.user.findMany({
        where: { estateId: meeting.estateId, active: true },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);
      if (userIds.length === 0) return;
      await this.prisma.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          estateId: meeting.estateId,
          title: message,
          type: 'meeting',
        })),
      });
      await this.push.sendToUsers(userIds, {
        title: 'CommunityHub',
        body: message,
        data: { type: 'meeting' },
      });
    } catch (e) {
      // The reminder row is already recorded, so a delivery failure here
      // won't cause a duplicate send on the next tick — log and move on.
      this.logger.error(
        `Failed to deliver ${kind} reminder for meeting ${meeting.id}: ${(e as Error).message}`,
      );
    }
  }
}