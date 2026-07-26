import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CompleteForceResetDto } from './dto/complete-force-reset.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_PURPOSE = 'password-reset';
const REFRESH_TOKEN_PURPOSE = 'refresh';
const ACCESS_TOKEN_TTL = '15m';
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL = '30d';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const ROLE_LABELS: Record<string, string> = {
  RESIDENT: 'a resident',
  GUARD: 'a security guard',
  ADMIN: 'an admin',
  FINANCE_SECRETARY: 'a finance secretary',
  PROJECT_ADMIN: 'a project admin',
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

    if (dto.role && dto.role !== user.role) {
      throw new UnauthorizedException(
        `This account is registered as ${roleLabel(user.role)}.`,
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid)
      throw new UnauthorizedException('Incorrect phone number or password.');

    return {
      accessToken: await this.signAccessToken(user.id, user.role),
      refreshToken: await this.signRefreshToken(user.id),
      mustResetPassword: user.mustResetPassword,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (!user)
      throw new UnauthorizedException(
        'No account found for that phone number.',
      );

    const code = String(Math.floor(1000 + Math.random() * 9000));
    await this.prisma.passwordResetOtp.create({
      data: {
        userId: user.id,
        code,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    // No SMS provider wired up: the code is echoed back for local/demo use
    // instead of silently doing nothing. Still validated for real on verify.
    const devOtp = process.env.NODE_ENV === 'production' ? undefined : code;
    return { message: 'A one-time code has been sent to your phone.', devOtp };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (!user)
      throw new UnauthorizedException(
        'No account found for that phone number.',
      );

    const otp = await this.prisma.passwordResetOtp.findFirst({
      where: {
        userId: user.id,
        code: dto.code,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp)
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

  async completeForceReset(userId: string, dto: CompleteForceResetDto) {
    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustResetPassword: false,
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.house !== undefined && { house: dto.house }),
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
    return { message: 'Password set. You can now use the app.' };
  }

  /**
   * Rotates a refresh token: the presented one is single-use and gets
   * blacklisted immediately, so a stolen-and-replayed refresh token is
   * only usable once before the legitimate client's next refresh reveals
   * the compromise (its own attempt will fail).
   */
  async refresh(dto: RefreshTokenDto) {
    let payload: { sub: string; jti: string; purpose?: string };
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

    await this.blacklist(payload.jti, REFRESH_TOKEN_TTL_MS);

    return {
      accessToken: await this.signAccessToken(user.id, user.role),
      refreshToken: await this.signRefreshToken(user.id),
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
      } catch {
        // Already invalid/expired — nothing left to revoke.
      }
    }

    return { message: 'Logged out successfully.' };
  }

  private async signAccessToken(userId: string, role: string) {
    const jti = crypto.randomUUID();
    return this.jwt.signAsync(
      { sub: userId, role, jti },
      { secret: process.env.JWT_SECRET, expiresIn: ACCESS_TOKEN_TTL },
    );
  }

  private async signRefreshToken(userId: string) {
    const jti = crypto.randomUUID();
    return this.jwt.signAsync(
      { sub: userId, jti, purpose: REFRESH_TOKEN_PURPOSE },
      { secret: process.env.JWT_SECRET, expiresIn: REFRESH_TOKEN_TTL },
    );
  }

  /** Idempotent — a duplicate blacklist attempt (e.g. a retried request) is a no-op, not an error. */
  private async blacklist(tokenJti: string, ttlMs: number) {
    await this.prisma.blacklistedToken.upsert({
      where: { tokenJti },
      create: { tokenJti, expiresAt: new Date(Date.now() + ttlMs) },
      update: {},
    });
  }
}
