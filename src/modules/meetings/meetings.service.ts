import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

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
  constructor(private prisma: PrismaService) {}

  async list() {
    const meetings = await this.prisma.meeting.findMany({
      orderBy: { scheduledAt: 'asc' },
    });
    return meetings.map((m) => ({
      id: m.id,
      title: m.title,
      date: m.date,
      time: m.time,
      location: m.location,
      countdown: daysAwayLabel(m.scheduledAt),
    }));
  }

  async get(userId: string, id: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    const calendarEntry = await this.prisma.calendarEntry.findUnique({
      where: { userId_meetingId: { userId, meetingId: id } },
    });
    return {
      ...meeting,
      countdown: daysAwayLabel(meeting.scheduledAt),
      calendarAdded: !!calendarEntry,
    };
  }

  async addToCalendar(userId: string, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    await this.prisma.calendarEntry.upsert({
      where: { userId_meetingId: { userId, meetingId } },
      create: { userId, meetingId },
      update: {},
    });
    return { message: 'Added to device calendar' };
  }
}
