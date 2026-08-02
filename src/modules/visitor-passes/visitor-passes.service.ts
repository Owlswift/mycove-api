import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { CreateVisitorPassDto } from './dto/create-visitor-pass.dto';
import { NotificationsService } from '../notifications/notifications.service';

function statusOf(pass: {
  revoked: boolean;
  validUntil: Date;
}): 'ACTIVE' | 'EXPIRED' | 'REVOKED' {
  if (pass.revoked) return 'REVOKED';
  return pass.validUntil.getTime() > Date.now() ? 'ACTIVE' : 'EXPIRED';
}

function windowLabel(createdAt: Date, validUntil: Date): string {
  const hours = Math.round(
    (validUntil.getTime() - createdAt.getTime()) / (60 * 60 * 1000),
  );
  return `Today, valid ${hours}h`;
}

@Injectable()
export class VisitorPassesService {
  private readonly logger = new Logger(VisitorPassesService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async listForResident(residentId: string) {
    const passes = await this.prisma.visitorPass.findMany({
      where: { residentId },
      orderBy: { createdAt: 'desc' },
    });
    return passes.map((p) => ({
      ...p,
      status: statusOf(p),
      window: windowLabel(p.createdAt, p.validUntil),
    }));
  }

  async getForResident(residentId: string, id: string) {
    const pass = await this.prisma.visitorPass.findUnique({ where: { id } });
    if (!pass || pass.residentId !== residentId)
      throw new NotFoundException('Visitor pass not found');
    return {
      ...pass,
      status: statusOf(pass),
      window: windowLabel(pass.createdAt, pass.validUntil),
    };
  }

  async create(residentId: string, dto: CreateVisitorPassDto) {
    const code = await this.uniqueCode();
    const createdAt = new Date();
    const validUntil = new Date(
      createdAt.getTime() + dto.validHours * 60 * 60 * 1000,
    );

    const pass = await this.prisma.visitorPass.create({
      data: {
        residentId,
        name: dto.name,
        phone: dto.phone,
        plate: dto.plate || null,
        code,
        validUntil,
        createdAt,
      },
    });
    return {
      ...pass,
      status: statusOf(pass),
      window: windowLabel(pass.createdAt, pass.validUntil),
    };
  }

  async verifyByCode(code: string) {
    const pass = await this.prisma.visitorPass.findUnique({ where: { code } });
    if (!pass) {
      this.logger.log(`verify: code="${code}" -> no matching VisitorPass row`);
      return { pass: null, valid: false };
    }
    const status = statusOf(pass);
    this.logger.log(
      `verify: code="${code}" -> found pass id=${pass.id} name="${pass.name}" status=${status} revoked=${pass.revoked} validUntil=${pass.validUntil.toISOString()}`,
    );
    return {
      pass: { ...pass, status, window: windowLabel(pass.createdAt, pass.validUntil) },
      valid: status === 'ACTIVE',
    };
  }

  async recordEntry(guardId: string, visitorPassId: string) {
    const pass = await this.prisma.visitorPass.findUnique({
      where: { id: visitorPassId },
    });
    if (!pass) throw new NotFoundException('Visitor pass not found');

    const openEntry = await this.prisma.accessLogEntry.findFirst({
      where: { visitorPassId, exitAt: null },
    });
    if (openEntry)
      throw new ConflictException('This visitor is already checked in.');

    const entry = await this.prisma.accessLogEntry.create({
      data: { visitorPassId, guardId },
    });
    await this.notifications.create(
      pass.residentId,
      `${pass.name} has entered the estate`,
      'visitor',
    );
    return entry;
  }

  async recordExit(guardId: string, visitorPassId: string) {
    const openEntry = await this.prisma.accessLogEntry.findFirst({
      where: { visitorPassId, exitAt: null },
      orderBy: { entryAt: 'desc' },
      include: { visitorPass: true },
    });
    if (!openEntry)
      throw new ConflictException(
        'This visitor has no open entry to check out.',
      );

    const entry = await this.prisma.accessLogEntry.update({
      where: { id: openEntry.id },
      data: { exitAt: new Date() },
    });
    await this.notifications.create(
      openEntry.visitorPass.residentId,
      `${openEntry.visitorPass.name} has exited the estate`,
      'visitor',
    );
    return entry;
  }

  async accessLog() {
    const entries = await this.prisma.accessLogEntry.findMany({
      orderBy: { entryAt: 'desc' },
      include: { visitorPass: { select: { name: true } } },
    });
    return entries.map((e) => ({
      id: e.id,
      visitor: e.visitorPass.name,
      entryAt: e.entryAt,
      exitAt: e.exitAt,
    }));
  }

  private async uniqueCode(): Promise<string> {
    for (;;) {
      const code = String(crypto.randomInt(100000, 999999));
      const existing = await this.prisma.visitorPass.findUnique({
        where: { code },
      });
      if (!existing) return code;
    }
  }
}
