import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PushService } from '../push/push.service';
import { BroadcastDto } from './dto/broadcast.dto';

const BROADCAST_ROLES: Record<BroadcastDto['target'], ('RESIDENT' | 'GUARD')[]> = {
  RESIDENTS: ['RESIDENT'],
  GUARDS: ['GUARD'],
  ALL: ['RESIDENT', 'GUARD'],
};

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
    await this.prisma.notification.create({
      data: { userId, title: message, type },
    });
    await this.push.sendToUser(userId, {
      title: 'CommunityHub',
      body: message,
      data: { type },
    });
  }

  /** An admin-initiated message to every resident/guard/both, not tied to any one user's event. */
  async broadcast(dto: BroadcastDto) {
    const users = await this.prisma.user.findMany({
      where: { role: { in: BROADCAST_ROLES[dto.target] } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, title: dto.message, type: 'broadcast' })),
    });
    await this.push.sendToUsers(userIds, {
      title: 'CommunityHub',
      body: dto.message,
      data: { type: 'broadcast' },
    });

    return { message: `Sent to ${userIds.length} recipient(s).` };
  }
}
