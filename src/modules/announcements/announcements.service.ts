import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(estateId: string, dto: CreateAnnouncementDto) {
    const announcement = await this.prisma.announcement.create({
      data: { ...dto, estateId },
    });
    await this.notifications.notifyAnnouncement(announcement.estateId, announcement.title);
    return announcement;
  }

  async list(userId: string, estateId: string) {
    const [announcements, reads] = await Promise.all([
      this.prisma.announcement.findMany({
        where: { estateId },
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.announcementRead.findMany({
        where: { userId },
        select: { announcementId: true },
      }),
    ]);
    const readIds = new Set(reads.map((r) => r.announcementId));

    return announcements.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      body: a.body,
      publishedAt: a.publishedAt,
      unread: !readIds.has(a.id),
    }));
  }

  async get(id: string, estateId: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id, estateId },
    });
    if (!announcement) throw new NotFoundException('Announcement not found');
    return announcement;
  }

  async markRead(userId: string, estateId: string, announcementId: string) {
    const announcement = await this.get(announcementId, estateId);
    await this.prisma.announcementRead.upsert({
      where: { userId_announcementId: { userId, announcementId } },
      create: { userId, announcementId, estateId: announcement.estateId },
      update: {},
    });
    return { message: 'Marked as read' };
  }
}
