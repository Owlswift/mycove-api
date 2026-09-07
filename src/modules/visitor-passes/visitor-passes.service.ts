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

// Validity is temporarily ignored — status is solely driven by whether the
// pass was revoked. The guard still shows "Record Entry" for a first scan
// (not checked in) and "Record Exit" for someone already inside.
function statusOf(pass: {
  revoked: boolean;
  // validUntil: Date; // commented out — validity is ignored for now
}): 'ACTIVE' | 'REVOKED' {
  if (pass.revoked) return 'REVOKED';
  return 'ACTIVE';
}

function checkedInOf(pass: {
  accessLogEntries?: { exitAt: Date | null }[];
}): boolean {
  return (pass.accessLogEntries ?? []).some((e) => e.exitAt === null);
}

function hasEnteredOf(pass: {
  accessLogEntries?: { entryAt: Date; exitAt: Date | null }[];
}): boolean {
  return (pass.accessLogEntries ?? []).length > 0;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Returns visit-time info for the resident side.
//   isInside=true  -> visitor is currently in the estate
//   label          -> "In estate · 2h 15m" or "Spent 3h 30m in estate"
function visitInfo(pass: {
  accessLogEntries?: { entryAt: Date; exitAt: Date | null }[];
}): { label: string; isInside: boolean } {
  const entries = pass.accessLogEntries ?? [];
  if (entries.length === 0) return { label: 'Not yet arrived', isInside: false };

  const openEntry = entries.find((e) => e.exitAt === null);
  if (openEntry) {
    const minutes = Math.max(
      0,
      Math.floor((Date.now() - openEntry.entryAt.getTime()) / 60000),
    );
    return { label: `In estate · ${formatDuration(minutes)}`, isInside: true };
  }

  // Visitor has left — sum up all completed visits.
  const totalMs = entries.reduce(
    (sum, e) => sum + (e.exitAt!.getTime() - e.entryAt.getTime()),
    0,
  );
  const minutes = Math.max(0, Math.floor(totalMs / 60000));
  return { label: `Spent ${formatDuration(minutes)} in estate`, isInside: false };
}

@Injectable()
export class VisitorPassesService {
  private readonly logger = new Logger(VisitorPassesService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async listForResident(residentId: string, estateId: string) {
    const passes = await this.prisma.visitorPass.findMany({
      where: { residentId, estateId },
      orderBy: { createdAt: 'desc' },
      include: { accessLogEntries: { select: { entryAt: true, exitAt: true } } },
    });
    return passes.map((p) => {
      const visit = visitInfo(p);
      return {
        ...p,
        status: statusOf(p),
        checkedIn: checkedInOf(p),
        hasEntered: hasEnteredOf(p),
        isInside: visit.isInside,
        visitLabel: visit.label,
      };
    });
  }

  async getForResident(residentId: string, estateId: string, id: string) {
    const pass = await this.prisma.visitorPass.findFirst({
      where: { id, estateId },
      include: { accessLogEntries: { select: { entryAt: true, exitAt: true } } },
    });
    if (!pass || pass.residentId !== residentId)
      throw new NotFoundException('Visitor pass not found');
    const visit = visitInfo(pass);
    return {
      ...pass,
      status: statusOf(pass),
      checkedIn: checkedInOf(pass),
      hasEntered: hasEnteredOf(pass),
      isInside: visit.isInside,
      visitLabel: visit.label,
    };
  }

  async create(residentId: string, estateId: string, dto: CreateVisitorPassDto) {
    const code = await this.uniqueCode();
    const createdAt = new Date();
    const validHours = dto.validHours ?? 24;
    const validUntil = new Date(
      createdAt.getTime() + validHours * 60 * 60 * 1000,
    );

    const pass = await this.prisma.visitorPass.create({
      data: {
        residentId,
        estateId,
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
      checkedIn: false,
      hasEntered: false,
      isInside: false,
      visitLabel: 'Not yet arrived',
    };
  }

  async verifyByCode(estateId: string, code: string) {
    const pass = await this.prisma.visitorPass.findFirst({
      where: { code, estateId },
      include: { accessLogEntries: { select: { entryAt: true, exitAt: true } } },
    });
    if (!pass) {
      this.logger.log(`verify: code="${code}" estateId="${estateId}" -> no matching VisitorPass row`);
      return { pass: null, valid: false, reason: 'NOT_FOUND' };
    }
    const status = statusOf(pass);
    const checkedIn = checkedInOf(pass);
    const hasEntered = hasEnteredOf(pass);
    const visit = visitInfo(pass);

    // A pass is single-use — once the visitor has completed their visit
    // (entered AND exited), the code can't be used again. However, if the
    // visitor is currently inside (checked in with an open entry), the code
    // must remain valid so the guard can record the exit.
    let valid = !pass.revoked;
    let reason: string | undefined;
    if (pass.revoked) {
      valid = false;
      reason = 'REVOKED';
    } else if (hasEntered && !checkedIn) {
      valid = false;
      reason = 'USED';
    }

    this.logger.log(
      `verify: code="${code}" -> found pass id=${pass.id} name="${pass.name}" status=${status} checkedIn=${checkedIn} hasEntered=${hasEntered} revoked=${pass.revoked} valid=${valid} reason=${reason ?? 'OK'}`,
    );
    return {
      pass: {
        ...pass,
        status,
        checkedIn,
        hasEntered,
        isInside: visit.isInside,
        visitLabel: visit.label,
      },
      valid,
      reason,
    };
  }

  async revoke(residentId: string, estateId: string, id: string) {
    const pass = await this.prisma.visitorPass.findFirst({
      where: { id, estateId },
    });
    if (!pass || pass.residentId !== residentId)
      throw new NotFoundException('Visitor pass not found');

    const updated = await this.prisma.visitorPass.update({
      where: { id },
      data: { revoked: true },
    });
    return {
      ...updated,
      status: statusOf(updated),
      checkedIn: false,
      hasEntered: false,
      isInside: false,
      visitLabel: 'Not yet arrived',
    };
  }

  async recordEntry(guardId: string, estateId: string, visitorPassId: string) {
    const pass = await this.prisma.visitorPass.findFirst({
      where: { id: visitorPassId, estateId },
    });
    if (!pass) throw new NotFoundException('Visitor pass not found');

    // A pass is single-use — reject if it has already been used before.
    const priorUse = await this.prisma.accessLogEntry.findFirst({
      where: { visitorPassId },
    });
    if (priorUse)
      throw new ConflictException('This visitor pass has already been used.');

    const openEntry = await this.prisma.accessLogEntry.findFirst({
      where: { visitorPassId, exitAt: null },
    });
    if (openEntry)
      throw new ConflictException('This visitor is already checked in.');

    const entry = await this.prisma.accessLogEntry.create({
      data: { visitorPassId, guardId, estateId: pass.estateId },
    });
    await this.notifications.create(
      pass.residentId,
      `${pass.name} has arrived at the estate gate`,
      'visitor',
    );
    return entry;
  }

  async recordExit(guardId: string, estateId: string, visitorPassId: string) {
    const openEntry = await this.prisma.accessLogEntry.findFirst({
      where: { visitorPassId, exitAt: null, estateId },
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

  async accessLog(estateId: string) {
    const entries = await this.prisma.accessLogEntry.findMany({
      where: { estateId },
      orderBy: { entryAt: 'desc' },
      include: {
        visitorPass: {
          select: {
            name: true,
            resident: {
              select: {
                id: true,
                fullName: true,
                house: true,
                phone: true,
              },
            },
          },
        },
      },
    });
    return entries.map((e) => ({
      id: e.id,
      visitor: e.visitorPass.name,
      entryAt: e.entryAt,
      exitAt: e.exitAt,
      resident: e.visitorPass.resident,
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