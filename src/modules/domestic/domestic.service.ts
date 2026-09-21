import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { DomesticStaff, User } from '@prisma/client';
import { normalizePhone } from '../../common/utils/normalize-phone';
import { PrismaService } from '../../database/prisma.service';
import { DuesService } from '../dues/dues.service';
import { PushService } from '../push/push.service';
import { VisitorPassesService } from '../visitor-passes/visitor-passes.service';
import { WhatsappClient } from '../whatsapp/whatsapp-client';
import {
  APPROVAL_WAIT_MINUTES,
  checkSchedule,
  CODE_VALID_MINUTES,
  describeSchedule,
  isValidTime,
  toMinutes,
} from './domestic-schedule';
import { CreateDomesticStaffDto, UpdateDomesticStaffDto } from './dto/domestic-staff.dto';

type StaffWithResident = DomesticStaff & { resident: Pick<User, 'id' | 'fullName' | 'estateId'> & { house?: string | null } };

/** How long a "which household?" question stays open. */
const CHOICE_WAIT_MINUTES = 10;

const first = (fullName: string) => fullName.split(' ')[0] ?? fullName;

/**
 * Domestic staff (a cleaner, cook, driver…) get their own entry code over
 * WhatsApp, so the resident isn't asked each time. The resident registers the
 * staff member's WhatsApp number, optionally with the days and hours they're
 * expected, and can require their approval before each code. Every step
 * notifies the resident.
 */
@Injectable()
export class DomesticService {
  private readonly logger = new Logger(DomesticService.name);

  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private whatsapp: WhatsappClient,
    private passes: VisitorPassesService,
    private dues: DuesService,
  ) {}

  // ── The resident's list ────────────────────────────────────────────────

  async list(residentId: string) {
    const staff = await this.prisma.domesticStaff.findMany({
      where: { residentId },
      orderBy: { createdAt: 'asc' },
    });
    // Who is inside the estate right now (a guard has let them in and not yet out).
    const inside = await this.prisma.accessLogEntry.findMany({
      where: { exitAt: null, visitorPass: { domesticStaffId: { in: staff.map((s) => s.id) } } },
      select: { visitorPass: { select: { domesticStaffId: true } } },
    });
    const insideIds = new Set(inside.map((e) => e.visitorPass.domesticStaffId));
    return staff.map((s) => ({ ...this.present(s), insideNow: insideIds.has(s.id) }));
  }

  /**
   * The gate log for a resident's domestic staff: every time a guard let one
   * in or out. [staffId] narrows it to one person; newest first.
   */
  async log(residentId: string, staffId?: string, limit = 100) {
    if (staffId) await this.owned(residentId, staffId);
    const entries = await this.prisma.accessLogEntry.findMany({
      where: {
        visitorPass: {
          residentId,
          domesticStaffId: staffId ?? { not: null },
        },
      },
      orderBy: { entryAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: { visitorPass: { select: { name: true, domesticStaffId: true } } },
    });
    return entries.map((e) => ({
      id: e.id,
      staffId: e.visitorPass.domesticStaffId,
      staffName: e.visitorPass.name,
      entryAt: e.entryAt,
      exitAt: e.exitAt,
      insideNow: e.exitAt === null,
      minutesInside: e.exitAt ? Math.max(0, Math.round((e.exitAt.getTime() - e.entryAt.getTime()) / 60_000)) : null,
    }));
  }

  async create(residentId: string, estateId: string, dto: CreateDomesticStaffDto) {
    const resident = await this.prisma.user.findUniqueOrThrow({ where: { id: residentId } });
    const phone = normalizePhone(dto.phone);
    if (!/^\+\d{10,15}$/.test(phone)) throw new BadRequestException('That does not look like a phone number.');
    if (phone === resident.phone) throw new BadRequestException('That is your own number.');
    const schedule = this.validatedSchedule(dto);

    // The same person may work for several households, so only a repeat
    // within THIS resident's own list is a duplicate.
    const existing = await this.prisma.domesticStaff.findFirst({ where: { residentId, phone } });
    if (existing) throw new ConflictException('You have already added this number.');

    const staff = await this.prisma.domesticStaff.create({
      data: {
        estateId,
        residentId,
        name: dto.name.trim(),
        phone,
        ...schedule,
        requiresApproval: dto.requiresApproval ?? false,
      },
    });
    return this.present(staff);
  }

  async update(residentId: string, id: string, dto: UpdateDomesticStaffDto) {
    const current = await this.owned(residentId, id);
    const schedule =
      dto.days !== undefined || dto.startTime !== undefined || dto.endTime !== undefined
        ? this.validatedSchedule({
            days: dto.days ?? current.days,
            startTime: dto.startTime !== undefined ? dto.startTime : current.startTime,
            endTime: dto.endTime !== undefined ? dto.endTime : current.endTime,
          })
        : {};
    const staff = await this.prisma.domesticStaff.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.requiresApproval !== undefined && { requiresApproval: dto.requiresApproval }),
        ...schedule,
      },
    });
    return this.present(staff);
  }

  async remove(residentId: string, id: string) {
    await this.owned(residentId, id);
    await this.prisma.domesticStaff.delete({ where: { id } });
    return { message: 'Removed. They can no longer get a code.' };
  }

  private async owned(residentId: string, id: string) {
    const staff = await this.prisma.domesticStaff.findFirst({ where: { id, residentId } });
    if (!staff) throw new NotFoundException('Domestic staff not found');
    return staff;
  }

  private validatedSchedule(input: { days?: number[]; startTime?: string | null; endTime?: string | null }) {
    const days = [...new Set(input.days ?? [])].sort((a, b) => a - b);
    const startTime = input.startTime ?? null;
    const endTime = input.endTime ?? null;
    if ((startTime === null) !== (endTime === null)) {
      throw new BadRequestException('Give both a start time and an end time, or neither.');
    }
    if (startTime && endTime) {
      if (!isValidTime(startTime) || !isValidTime(endTime)) {
        throw new BadRequestException('Times must look like 08:00.');
      }
      if (toMinutes(endTime) <= toMinutes(startTime)) {
        throw new BadRequestException('The end time must be after the start time.');
      }
    }
    return { days, startTime, endTime };
  }

  private present(s: DomesticStaff) {
    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      days: s.days,
      startTime: s.startTime,
      endTime: s.endTime,
      requiresApproval: s.requiresApproval,
      scheduleLabel: describeSchedule(s),
    };
  }

  // ── Approvals (resident side) ──────────────────────────────────────────

  async pendingRequests(residentId: string) {
    const cutoff = new Date(Date.now() - APPROVAL_WAIT_MINUTES * 60_000);
    const requests = await this.prisma.domesticAccessRequest.findMany({
      where: { residentId, status: 'PENDING', createdAt: { gte: cutoff } },
      include: { staff: { select: { name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => ({
      id: r.id,
      staffName: r.staff.name,
      staffPhone: r.staff.phone,
      requestedAt: r.createdAt,
      expiresAt: new Date(r.createdAt.getTime() + APPROVAL_WAIT_MINUTES * 60_000),
    }));
  }

  async decide(residentId: string, requestId: string, approve: boolean) {
    const request = await this.prisma.domesticAccessRequest.findFirst({
      where: { id: requestId, residentId },
      include: { staff: { include: { resident: { select: { id: true, fullName: true, estateId: true } } } } },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        request.status === 'EXPIRED' ? 'This request has expired.' : 'You have already answered this request.',
      );
    }
    if (request.createdAt.getTime() < Date.now() - APPROVAL_WAIT_MINUTES * 60_000) {
      await this.expire(request.id, request.staff);
      throw new BadRequestException('This request has expired.');
    }

    if (!approve) {
      await this.prisma.domesticAccessRequest.update({
        where: { id: request.id },
        data: { status: 'DENIED', decidedAt: new Date() },
      });
      await this.whatsapp.sendText(request.staff.phone, `Sorry ${first(request.staff.name)}, your request wasn't approved. Please speak to ${first(request.staff.resident.fullName)}.`);
      return { status: 'DENIED' as const };
    }

    await this.prisma.domesticAccessRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', decidedAt: new Date() },
    });
    const pass = await this.issueCode(request.staff);
    return { status: 'APPROVED' as const, code: pass.code };
  }

  // ── WhatsApp: a staff member asks for a code ───────────────────────────

  /** Called by the WhatsApp webhook for every text message that arrives. */
  async handleIncoming(msg: { from: string; messageId: string; text: string }) {
    try {
      await this.prisma.whatsappMessage.create({ data: { id: msg.messageId } });
    } catch {
      return; // already handled — Meta redelivers webhooks it thinks failed
    }

    const phone = normalizePhone(msg.from);
    const staffRows = await this.prisma.domesticStaff.findMany({
      where: { phone },
      include: { resident: { select: { id: true, fullName: true, estateId: true, house: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (staffRows.length === 0) {
      await this.whatsapp.sendText(
        phone,
        "This number isn't registered with MyCove. Ask the resident you work for to add your number in the MyCove app.",
      );
      return;
    }

    const text = msg.text.trim();

    // A staff member who works for several households was asked which one
    // they're visiting — a number picks it.
    const pending = await this.prisma.whatsappChoice.findUnique({ where: { phone } });
    if (pending) {
      const fresh = Date.now() - pending.createdAt.getTime() < CHOICE_WAIT_MINUTES * 60_000;
      const picked = /^\d{1,2}$/.test(text) ? Number(text) : 0;
      if (fresh && picked >= 1 && picked <= pending.staffIds.length) {
        const chosen = staffRows.find((s) => s.id === pending.staffIds[picked - 1]);
        await this.prisma.whatsappChoice.deleteMany({ where: { phone } });
        if (chosen) {
          await this.requestCode(chosen);
          return;
        }
      }
    }

    const wantsCode = /\b(access|code|entry|enter)\b/i.test(text);
    if (!wantsCode) {
      await this.whatsapp.sendText(phone, `Hi ${first(staffRows[0]!.name)}, send the word ACCESS to get your entry code.`);
      return;
    }

    if (staffRows.length === 1) {
      await this.requestCode(staffRows[0]!);
      return;
    }
    await this.requestCodeForSeveral(phone, staffRows);
  }

  /**
   * One person, several employers. Whoever they're expected by right now is
   * the household; if that isn't clear-cut they're asked which one.
   */
  private async requestCodeForSeveral(phone: string, rows: StaffWithResident[]) {
    const expectedNow = rows.filter((s) => checkSchedule(s).allowed);

    if (expectedNow.length === 1) {
      await this.requestCode(expectedNow[0]!);
      return;
    }

    if (expectedNow.length === 0) {
      // Not expected anywhere at this moment — say so, and tell each employer.
      const lines = rows.map((s) => `• ${first(s.resident.fullName)}: ${describeSchedule(s)}`).join('\n');
      await this.whatsapp.sendText(phone, `Hi ${first(rows[0]!.name)}, you aren't expected at any household right now.\n${lines}`);
      for (const s of rows) {
        await this.notifyResident(
          s.resident,
          `${s.name} tried to get an entry code outside their set times (${describeSchedule(s)}). No code was sent.`,
          'domestic_refused',
        );
      }
      return;
    }

    // Expected at more than one place at once — ask which.
    await this.prisma.whatsappChoice.upsert({
      where: { phone },
      create: { phone, staffIds: expectedNow.map((s) => s.id) },
      update: { staffIds: expectedNow.map((s) => s.id), createdAt: new Date() },
    });
    const options = expectedNow
      .map((s, i) => `${i + 1}. ${s.resident.fullName}${s.resident.house ? ` (${s.resident.house})` : ''}`)
      .join('\n');
    await this.whatsapp.sendText(
      phone,
      `Hi ${first(rows[0]!.name)}, which household are you visiting?\nReply with the number:\n${options}`,
    );
  }

  private async requestCode(staff: StaffWithResident) {
    const resident = staff.resident;
    const who = first(staff.name);

    const timing = checkSchedule(staff);
    if (!timing.allowed) {
      await this.whatsapp.sendText(staff.phone, `Hi ${who}. ${timing.message}`);
      await this.notifyResident(
        resident,
        `${staff.name} tried to get an entry code outside their set times (${describeSchedule(staff)}). No code was sent.`,
        'domestic_refused',
      );
      return;
    }

    const restriction = await this.dues.getPassRestriction(resident.id);
    if (restriction.restricted) {
      await this.whatsapp.sendText(staff.phone, `Sorry ${who}, we couldn't give you a code right now. Please speak to ${first(resident.fullName)}.`);
      await this.notifyResident(
        resident,
        `${staff.name} asked for an entry code but your outstanding dues are blocking new codes. Pay your dues to allow it.`,
        'domestic_refused',
      );
      return;
    }

    // A code they already have that hasn't been used or expired — send it again.
    const live = await this.prisma.visitorPass.findFirst({
      where: {
        domesticStaffId: staff.id,
        revoked: false,
        validUntil: { gt: new Date() },
        accessLogEntries: { none: {} },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (live) {
      await this.sendCode(staff, live.code, live.validUntil);
      return;
    }

    if (staff.requiresApproval) {
      const pending = await this.prisma.domesticAccessRequest.findFirst({
        where: {
          staffId: staff.id,
          status: 'PENDING',
          createdAt: { gte: new Date(Date.now() - APPROVAL_WAIT_MINUTES * 60_000) },
        },
      });
      if (pending) {
        await this.whatsapp.sendText(staff.phone, `Hi ${who}, we're still waiting for ${first(resident.fullName)} to approve. You'll get your code as soon as they do.`);
        return;
      }
      const request = await this.prisma.domesticAccessRequest.create({
        data: { estateId: resident.estateId, staffId: staff.id, residentId: resident.id },
      });
      await this.whatsapp.sendText(staff.phone, `Hi ${who}, we've asked ${first(resident.fullName)} to approve. You'll get your code here as soon as they do.`);
      await this.notifyResident(
        resident,
        `${staff.name} is asking for an entry code. Open MyCove to approve or decline.`,
        'domestic_approval',
        { requestId: request.id },
      );
      return;
    }

    await this.issueCode(staff);
  }

  /** Makes the code, sends it to the staff member and tells the resident. */
  private async issueCode(staff: StaffWithResident) {
    const pass = await this.passes.issueDomesticPass(staff, CODE_VALID_MINUTES);
    await this.sendCode(staff, pass.code, pass.validUntil);
    await this.notifyResident(
      staff.resident,
      `${staff.name} has been sent an entry code, valid for ${CODE_VALID_MINUTES} minutes.`,
      'domestic_code',
    );
    return pass;
  }

  private async sendCode(staff: DomesticStaff, code: string, validUntil: Date) {
    const minutes = Math.max(1, Math.ceil((validUntil.getTime() - Date.now()) / 60_000));
    const estate = await this.prisma.estate.findUnique({ where: { id: staff.estateId }, select: { name: true } });
    await this.whatsapp.sendText(
      staff.phone,
      `${estate?.name ?? 'MyCove'}\nYour access code is ${code}.\nThis code is valid for ${minutes} minute${minutes === 1 ? '' : 's'}.\nPlease present it at the gate for entry.`,
    );
  }

  private async notifyResident(
    resident: Pick<User, 'id' | 'estateId'>,
    message: string,
    type: string,
    data: Record<string, string> = {},
  ) {
    await this.prisma.notification.create({
      data: { userId: resident.id, estateId: resident.estateId, title: message, type },
    });
    await this.push.sendToUser(resident.id, { title: 'MyCove', body: message, data: { type, ...data } });
  }

  // ── Approval requests that were never answered ────────────────────────

  @Cron('* * * * *')
  async expireStaleRequests(): Promise<void> {
    try {
      const stale = await this.prisma.domesticAccessRequest.findMany({
        where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - APPROVAL_WAIT_MINUTES * 60_000) } },
        include: { staff: { include: { resident: { select: { id: true, fullName: true, estateId: true } } } } },
      });
      for (const request of stale) await this.expire(request.id, request.staff);
    } catch (e) {
      this.logger.error(`Expiring domestic requests failed: ${(e as Error).message}`);
    }
  }

  private async expire(requestId: string, staff: StaffWithResident) {
    const result = await this.prisma.domesticAccessRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: { status: 'EXPIRED', decidedAt: new Date() },
    });
    if (result.count === 0) return;
    await this.whatsapp.sendText(
      staff.phone,
      `Hi ${first(staff.name)}, ${first(staff.resident.fullName)} hasn't approved yet. Send ACCESS again to ask once more.`,
    );
    await this.notifyResident(
      staff.resident,
      `You didn't answer ${staff.name}'s request for an entry code in time, so it expired.`,
      'domestic_expired',
    );
  }
}
