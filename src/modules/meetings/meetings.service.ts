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

  async get(userId: string, estateId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, estateId } });
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
    }));
  }

  async adminCreate(estateId: string, data: { title: string; date: string; time: string; location: string; agenda: string[] }) {
    const meeting = await this.prisma.meeting.create({
      data: {
        estateId,
        title: data.title,
        date: data.date,
        time: data.time,
        location: data.location,
        scheduledAt: new Date(`${data.date} ${data.time}`),
        agenda: data.agenda,
      },
    });
    return meeting;
  }

  async adminUpdate(estateId: string, id: string, data: { title: string; date: string; time: string; location: string; agenda: string[] }) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, estateId } });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: {
        title: data.title,
        date: data.date,
        time: data.time,
        location: data.location,
        scheduledAt: new Date(`${data.date} ${data.time}`),
        agenda: data.agenda,
      },
    });
    return updated;
  }

  async adminDelete(estateId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, estateId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    await this.prisma.meeting.delete({ where: { id } });
  }
}