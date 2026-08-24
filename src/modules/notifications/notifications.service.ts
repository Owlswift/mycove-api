import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PushService } from '../push/push.service';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { message: 'All notifications marked as read' };
  }

  /**
   * Writes the in-app Notification row and sends a push for the same
   * event — the one place both need to happen together, so callers
   * (visitor-pass entry/exit, payment success) only need this one method.
   */
  async create(userId: string, message: string, type: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { estateId: true },
    });
    await this.prisma.notification.create({
      data: { userId, estateId: user.estateId, title: message, type },
    });
    await this.push.sendToUser(userId, {
      title: 'MyCove',
      body: message,
      data: { type },
    });
  }

  /** Notifies every resident (in-app + push) that a new announcement was published. */
  async notifyAnnouncement(estateId: string, title: string) {
    await this.notifyAllResidents(estateId, `New announcement: ${title}`, 'announcement');
  }

  /** Notifies every resident (in-app + push) that a project has a new update. */
  async notifyProjectUpdate(estateId: string, title: string) {
    await this.notifyAllResidents(estateId, `Project update: ${title}`, 'project');
  }

  private async notifyAllResidents(estateId: string, message: string, type: string) {
    const residents = await this.prisma.user.findMany({
      where: { role: 'RESIDENT', estateId, active: true },
      select: { id: true },
    });
    const userIds = residents.map((u) => u.id);

    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, estateId, title: message, type })),
    });
    await this.push.sendToUsers(userIds, {
      title: 'MyCove',
      body: message,
      data: { type },
    });
  }
}
