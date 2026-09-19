import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CompleteForceResetDto } from './dto/complete-force-reset.dto';
import { resolveAddress } from '../../common/utils/address';
import { RefreshTokenDto } from './dto/refresh-token.dto';

const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_PURPOSE = 'password-reset';
const REFRESH_TOKEN_PURPOSE = 'refresh';
// Long-lived on purpose: a resident or officer stays signed in for a month
// at a time, and a refresh token quietly renews that for up to a year. This
// stays safe because JwtAuthGuard re-checks every request against the
// database (revoked token, deactivated account, role no longer held).
const ACCESS_TOKEN_TTL = '30d';
const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL = '365d';
const REFRESH_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

const ROLE_LABELS: Record<string, string> = {
  RESIDENT: 'a resident',
  GUARD: 'a security guard',
  ADMIN: 'an admin',
  FINANCE_SECRETARY: 'a finance secretary',
  PROJECT_ADMIN: 'a project admin',
  CHAIRMAN: 'the estate chairman',
};
function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (!user)
      throw new UnauthorizedException('Incorrect phone number or password.');

    // One account can hold several roles (a resident who is also the
    // chairman): the sign-in screen says which one this session is for.
    const heldRoles: string[] = [user.role, ...user.staffRoles];
    if (dto.role && !heldRoles.includes(dto.role)) {
      throw new UnauthorizedException(
        `This account is registered as ${roleLabel(user.role)}.`,
      );
    }
    const loginRole = dto.role ?? user.role;

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid)
      throw new UnauthorizedException('Incorrect phone number or password.');

    if (!user.active) {
      throw new UnauthorizedException({
        message: 'This account has been deactivated. Contact your estate admin.',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    const { accessToken, refreshToken } = await this.issueSessionTokens(
      user.id,
      loginRole,
      user.estateId,
      dto.platform,
      dto.deviceName,
    );

    return {
      accessToken,
      refreshToken,
      mustResetPassword: user.mustResetPassword,
    };
  }

  /** Shared by login() and by household-invite acceptance (HouseholdService) — anywhere a user needs to walk away logged in without having gone through the password-check step above. */
  async issueSessionTokens(
    userId: string,
    role: string,
    estateId: string,
    platform?: 'ANDROID' | 'IOS',
    deviceName?: string,
  ) {
    const accessToken = await this.signAccessToken(userId, role, estateId);
    const refresh = await this.signRefreshToken(userId, role);

    // Web/admin logins don't send a platform — there's no "device" to
    // track a session for in that case, so this stays mobile-only.
    if (platform) {
      await this.prisma.session.create({
        data: {
          userId,
          estateId,
          jti: refresh.jti,
          platform,
          deviceName,
        },
      });
    }

    return { accessToken, refreshToken: refresh.token };
  }

  // Always returns the same shape regardless of whether the phone number
  // belongs to a real (and active) account — branching the response would
  // let a caller enumerate registered phone numbers just by probing this
  // endpoint. An OTP is only actually created (and, outside production,
  // echoed back as devOtp) when there's a real active user to send it to.
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    let devOtp: string | undefined;
    if (user?.active) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await this.prisma.passwordResetOtp.create({
        data: {
          userId: user.id,
          estateId: user.estateId,
          code,
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      });
      // No SMS provider wired up: the code is echoed back for local/demo
      // use instead of silently doing nothing. Still validated for real
      // on verify.
      devOtp = process.env.NODE_ENV === 'production' ? undefined : code;
    }

    return {
      message: 'If that phone number is registered, a one-time code has been sent.',
      devOtp,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    // Same enumeration concern as forgotPassword: an unknown phone number
    // must fail exactly like a wrong/expired code, not with a distinct
    // "no account" error.
    const otp = user
      ? await this.prisma.passwordResetOtp.findFirst({
          where: {
            userId: user.id,
            code: dto.code,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    if (!user || !otp)
      throw new BadRequestException('That code is invalid or has expired.');

    await this.prisma.passwordResetOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const resetToken = await this.jwt.signAsync(
      { sub: user.id, purpose: RESET_TOKEN_PURPOSE },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    return { resetToken };
  }

  async resetPassword(dto: ResetPasswordDto) {
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwt.verify(dto.resetToken, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException(
        'That reset link has expired. Please start again.',
      );
    }
    if (payload.purpose !== RESET_TOKEN_PURPOSE) {
      throw new UnauthorizedException('Invalid reset token.');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { passwordHash, mustResetPassword: false },
    });
    return { message: 'Password reset successfully.' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Your current password is not correct.');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Choose a password different from your current one.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(dto.newPassword), mustResetPassword: false },
    });
    return { message: 'Password changed.' };
  }

  async completeForceReset(userId: string, dto: CompleteForceResetDto) {
    const passwordHash = await argon2.hash(dto.newPassword);
    const { estateId } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { estateId: true },
    });
    const address = await resolveAddress(this.prisma, estateId, dto);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustResetPassword: false,
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...address,
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.emergencyContactName !== undefined && {
          emergencyContactName: dto.emergencyContactName,
        }),
        ...(dto.emergencyContactPhone !== undefined && {
          emergencyContactPhone: dto.emergencyContactPhone,
        }),
        ...(dto.vehiclePlates !== undefined && {
          vehiclePlates: dto.vehiclePlates,
        }),
      },
    });

    // If this account exists because a household invite was approved (see
    // HouseholdService.approveInvite), completing this same force-reset
    // flow is exactly the "invitee actually logged in" moment — clear the
    // one-time access code so it can't be reused/re-shown, and record the
    // real join date for the inviter/admin's "who joined and when" views.
    await this.prisma.householdInvite.updateMany({
      where: { acceptedUserId: userId, status: 'APPROVED' },
      data: { status: 'ACCEPTED', acceptedAt: new Date(), accessCode: null },
    });

    return { message: 'Password set. You can now use the app.' };
  }

  /**
   * Rotates a refresh token: the presented one is single-use and gets
   * blacklisted immediately, so a stolen-and-replayed refresh token is
   * only usable once before the legitimate client's next refresh reveals
   * the compromise (its own attempt will fail).
   */
  async refresh(dto: RefreshTokenDto) {
    let payload: { sub: string; jti: string; purpose?: string; role?: string };
    try {
      payload = this.jwt.verify(dto.refreshToken, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }
    if (payload.purpose !== REFRESH_TOKEN_PURPOSE) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const blacklisted = await this.prisma.blacklistedToken.findUnique({
      where: { tokenJti: payload.jti },
    });
    if (blacklisted) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }
    if (!user.active) {
      throw new UnauthorizedException({
        message: 'This account has been deactivated. Contact your estate admin.',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    // Keep the role this session was opened for (RESIDENT on the phone,
    // CHAIRMAN on the website, …) as long as the account still holds it.
    // Refresh tokens from before multi-role support carry none, so they
    // fall back to the primary role exactly as they always did.
    const sessionRole =
      payload.role && [user.role, ...user.staffRoles].includes(payload.role as Role)
        ? payload.role
        : user.role;

    await this.blacklist(payload.jti, REFRESH_TOKEN_TTL_MS);
    const refresh = await this.signRefreshToken(user.id, sessionRole);

    // Rotate the existing session in place (same device, new jti) rather
    // than inserting a new row — this token belongs to one continuous
    // login, not a fresh one. No row to update is fine too (e.g. a web
    // session that never had one to begin with).
    await this.prisma.session
      .update({
        where: { jti: payload.jti },
        data: { jti: refresh.jti, lastUsedAt: new Date() },
      })
      .catch(() => undefined);

    return {
      accessToken: await this.signAccessToken(user.id, sessionRole, user.estateId),
      refreshToken: refresh.token,
    };
  }

  async logout(userId: string, accessJti: string, refreshToken?: string) {
    await this.blacklist(accessJti, ACCESS_TOKEN_TTL_MS);

    if (refreshToken) {
      try {
        const payload = this.jwt.verify<{ jti: string }>(refreshToken, {
          secret: process.env.JWT_SECRET,
        });
        await this.blacklist(payload.jti, REFRESH_TOKEN_TTL_MS);
        await this.prisma.session.delete({ where: { jti: payload.jti } }).catch(() => undefined);
      } catch {
        // Already invalid/expired — nothing left to revoke.
      }
    }

    return { message: 'Logged out successfully.' };
  }

  private async signAccessToken(userId: string, role: string, estateId: string) {
    const jti = crypto.randomUUID();
    return this.jwt.signAsync(
      { sub: userId, role, estateId, jti },
      { secret: process.env.JWT_SECRET, expiresIn: ACCESS_TOKEN_TTL },
    );
  }

  private async signRefreshToken(userId: string, role: string) {
    const jti = crypto.randomUUID();
    const token = await this.jwt.signAsync(
      { sub: userId, jti, purpose: REFRESH_TOKEN_PURPOSE, role },
      { secret: process.env.JWT_SECRET, expiresIn: REFRESH_TOKEN_TTL },
    );
    return { token, jti };
  }

  /** Idempotent — a duplicate blacklist attempt (e.g. a retried request) is a no-op, not an error. */
  private async blacklist(tokenJti: string, ttlMs: number) {
    await this.prisma.blacklistedToken.upsert({
      where: { tokenJti },
      create: { tokenJti, expiresAt: new Date(Date.now() + ttlMs) },
      update: {},
    });
  }

  listSessions(userId: string, estateId: string) {
    return this.prisma.session.findMany({
      where: { userId, estateId },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async revokeSession(userId: string, estateId: string, id: string) {
    const session = await this.prisma.session.findFirst({ where: { id, estateId } });
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    await this.blacklist(session.jti, REFRESH_TOKEN_TTL_MS);
    await this.prisma.session.delete({ where: { id } });
    return { message: 'Device logged out.' };
  }

  async setPin(userId: string, pin: string) {
    const pinHash = await argon2.hash(pin);
    await this.prisma.user.update({ where: { id: userId }, data: { pinHash } });
    return { message: 'Transaction PIN set.' };
  }

  async verifyPin(userId: string, pin: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.pinHash) return false;
    return argon2.verify(user.pinHash, pin);
  }
}
