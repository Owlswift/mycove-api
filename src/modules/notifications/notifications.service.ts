import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PushService } from '../push/push.service';
import { ParamBuilder, WhatsappEvent, WhatsappNotifier } from '../whatsapp/whatsapp-notifier';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private whatsapp: WhatsappNotifier,
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
  async create(
    userId: string,
    message: string,
    type: string,
    whatsapp?: { event: WhatsappEvent; params: ParamBuilder },
  ) {
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
    // The WhatsApp copy, when this event has an approved template — in
    // addition to the push above, never instead of it.
    if (whatsapp) await this.whatsapp.toUser(userId, whatsapp.event, whatsapp.params);
  }

  /** Notifies every resident (in-app + push, and WhatsApp when set up) that a new announcement was published. */
  async notifyAnnouncement(estateId: string, title: string) {
    const userIds = await this.notifyAllResidents(estateId, `New announcement: ${title}`, 'announcement');
    await this.whatsapp.toUsers(userIds, 'estate_notice', (r) => [r.firstName, r.estateName, title]);
  }

  /** Notifies every resident (in-app + push) that a project has a new update. */
  async notifyProjectUpdate(estateId: string, title: string) {
    await this.notifyAllResidents(estateId, `Project update: ${title}`, 'project');
  }

  /** Notifies every resident (in-app + push) that a new poll is open for voting. */
  async notifyNewPoll(estateId: string, question: string) {
    await this.notifyAllResidents(estateId, `New poll: ${question}`, 'poll');
  }

  /** Notifies every resident (in-app + push) that a new levy has been raised. */
  async notifyNewLevy(estateId: string, label: string) {
    await this.notifyAllResidents(estateId, `New levy: ${label}`, 'levy');
  }

  private async notifyAllResidents(estateId: string, message: string, type: string): Promise<string[]> {
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
    return userIds;
  }
}
