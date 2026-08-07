import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

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
  constructor(private prisma: PrismaService) {}

  listUsers(estateId: string) {
    return this.prisma.user.findMany({
      where: { estateId },
      select: {
        id: true,
        phone: true,
        fullName: true,
        role: true,
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

    const passwordToUse = isGuard ? dto.password! : defaultPasswordFor(dto.fullName);
    const passwordHash = await argon2.hash(passwordToUse);
    const user = await this.prisma.user.create({
      data: {
        estateId,
        phone: dto.phone,
        fullName: dto.fullName,
        role: dto.role,
        house: dto.house,
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
    return { message: active ? 'Access restored.' : 'Access revoked.' };
  }
}
