import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PUSH_GATEWAY } from './gateway/push-gateway.interface';
import type {
  PushGateway,
  PushPayload,
} from './gateway/push-gateway.interface';

@Injectable()
export class PushService {
  constructor(
    private prisma: PrismaService,
    @Inject(PUSH_GATEWAY) private gateway: PushGateway,
  ) {}

  async registerToken(
    userId: string,
    token: string,
    platform: 'ANDROID' | 'IOS',
  ) {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
    return { message: 'Device token registered.' };
  }

  async unregisterToken(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token, userId } });
    return { message: 'Device token unregistered.' };
  }

  async sendToUser(userId: string, payload: PushPayload) {
    return this.sendToUsers([userId], payload);
  }

  /** One token lookup + one gateway call for many users, instead of N of each. */
  async sendToUsers(userIds: string[], payload: PushPayload) {
    if (userIds.length === 0) return;
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    if (tokens.length === 0) return;
    await this.gateway.send(
      tokens.map((t) => t.token),
      payload,
    );
  }
}
