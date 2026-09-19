import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { SetStaffRolesDto } from './dto/set-staff-roles.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveAddress } from '../../common/utils/address';

/**
 * The estate has no self-registration — an admin creates every account with
 * just the essentials, and the default password is the resident's own
 * surname in caps (the last word of their full name), communicated to them
 * out-of-band (no SMS provider is wired up). They're forced to change it,
 * and complete the rest of their profile, on first login.
 *
 * Security guards are the exception: they share a duty phone at the gate
 * rather than a personal device, so there's no "first login, own profile"
 * moment to hang a self-service reset off of — the admin sets a real
 * password directly and the guard just logs in and starts scanning.
 */
function defaultPasswordFor(fullName: string): string {
  const surname = fullName.trim().split(/\s+/).pop();
  return (surname ?? fullName).toUpperCase();
}

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  listUsers(estateId: string) {
    return this.prisma.user.findMany({
      where: { estateId },
      select: {
        id: true,
        phone: true,
        fullName: true,
        role: true,
        staffRoles: true,
        house: true,
        email: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        vehiclePlates: true,
        mustResetPassword: true,
        active: true,
        createdAt: true,
      },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
  }

  async getUser(estateId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, estateId },
      select: {
        id: true,
        phone: true,
        fullName: true,
        role: true,
        staffRoles: true,
        house: true,
        email: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        vehiclePlates: true,
        mustResetPassword: true,
        active: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  duesHistory(estateId: string, userId: string) {
    return this.prisma.duesLedgerEntry.findMany({
      where: { estateId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  levyPayments(estateId: string, userId: string) {
    return this.prisma.levyPayment.findMany({
      where: { estateId, userId },
      include: { levy: { select: { label: true, amount: true, dueDate: true, year: true } } },
      orderBy: { paidAt: 'desc' },
    });
  }

  donations(estateId: string, userId: string) {
    return this.prisma.projectDonation.findMany({
      where: { estateId, userId },
      include: { project: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  pledges(estateId: string, userId: string) {
    return this.prisma.projectPledge.findMany({
      where: { estateId, userId },
      include: { project: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUser(estateId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException(
        'A user with that phone number already exists.',
      );
    }

    const isGuard = dto.role === 'GUARD';
    if (isGuard && !dto.password) {
      throw new BadRequestException(
        'A password is required for security guard accounts.',
      );
    }

    const address = await resolveAddress(this.prisma, estateId, dto);
    const passwordToUse = isGuard ? dto.password! : defaultPasswordFor(dto.fullName);
    const passwordHash = await argon2.hash(passwordToUse);
    const user = await this.prisma.user.create({
      data: {
        estateId,
        phone: dto.phone,
        fullName: dto.fullName,
        role: dto.role,
        ...address,
        passwordHash,
        mustResetPassword: !isGuard,
      },
      select: {
        id: true,
        phone: true,
        fullName: true,
        role: true,
        house: true,
      },
    });
    // Guards typed their own password in — nothing to reveal back to the admin.
    return { ...user, defaultPassword: isGuard ? null : passwordToUse };
  }

  /**
   * Lets a resident also act as finance secretary / project admin /
   * chairman. It's the same account and password — they choose which role
   * to sign in as (the website's role dropdown, or the mobile app as a
   * resident). Only residents can be given staff roles; the admin role
   * itself is deliberately not grantable this way.
   */
  async setStaffRoles(estateId: string, userId: string, dto: SetStaffRolesDto) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, estateId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'RESIDENT') {
      throw new BadRequestException('Staff roles can only be added to resident accounts.');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { staffRoles: [...new Set(dto.staffRoles)] },
      select: { id: true, role: true, staffRoles: true },
    });
  }

  async resetPassword(estateId: string, userId: string, newPassword?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.estateId !== estateId)
      throw new NotFoundException('User not found');

    const isGuard = user.role === 'GUARD';
    if (isGuard && !newPassword) {
      throw new BadRequestException(
        'A new password is required to reset a security guard account.',
      );
    }

    const passwordToUse = isGuard ? newPassword! : defaultPasswordFor(user.fullName);
    const passwordHash = await argon2.hash(passwordToUse);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustResetPassword: !isGuard },
    });
    return { defaultPassword: isGuard ? null : passwordToUse };
  }

  /**
   * Revoking sets `active: false` — it doesn't delete the account or its
   * history (dues, complaints, visitor passes, etc. all stay intact for
   * record-keeping), it just blocks every future login/refresh and, via the
   * JwtAuthGuard's per-request check, kills any session they're already in
   * within one request. Restoring flips it back on; nothing else changes.
   */
  async setActive(estateId: string, callerId: string, userId: string, active: boolean) {
    if (userId === callerId && !active) {
      throw new BadRequestException('You cannot revoke your own access.');
    }
    const user = await this.prisma.user.findFirst({ where: { id: userId, estateId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({ where: { id: userId }, data: { active } });
    // Best-effort — PushService.sendToUsers only pushes to accounts with
    // `active: true`, so a revoke never actually reaches the device (by
    // design, see its own comment); the in-app row still gets written and
    // is there waiting if the account is restored later.
    await this.notifications.create(
      userId,
      active
        ? 'Your access has been restored — you can log in again.'
        : 'Your access to MyCove has been revoked.',
      'account',
    );
    return { message: active ? 'Access restored.' : 'Access revoked.' };
  }
}
