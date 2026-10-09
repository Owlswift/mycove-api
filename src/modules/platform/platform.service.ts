import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { normalizePhone } from '../../common/utils/normalize-phone';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { CreateEstateDto } from './dto/create-estate.dto';
import { CreateDiscoDto } from './dto/create-disco.dto';
import { UpdateDiscoDto } from './dto/update-disco.dto';
import { CreateWebsiteLeadDto } from './dto/create-website-lead.dto';
import { UpdateWebsiteLeadDto } from './dto/update-website-lead.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { SetUserRoleDto } from './dto/set-user-role.dto';
import { RecordQrScanDto } from './dto/record-qr-scan.dto';
import { AnalyticsService } from '../../common/analytics/analytics.service';
import * as geoip from 'geoip-lite';

const ACCESS_TOKEN_TTL = '12h';

@Injectable()
export class PlatformService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private analytics: AnalyticsService,
  ) {}

  async login(dto: PlatformLoginDto) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!admin) {
      throw new UnauthorizedException('Incorrect email or password.');
    }
    const valid = await argon2.verify(admin.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Incorrect email or password.');
    }
    if (!admin.active) {
      throw new UnauthorizedException('This account has been deactivated.');
    }

    const jti = crypto.randomUUID();
    const accessToken = await this.jwt.signAsync(
      { sub: admin.id, jti, scope: 'PLATFORM' },
      { secret: process.env.JWT_SECRET, expiresIn: ACCESS_TOKEN_TTL },
    );

    return {
      accessToken,
      admin: { id: admin.id, email: admin.email, fullName: admin.fullName },
    };
  }

  // ── Estates ──────────────────────────────────────────────────────────
  listEstates() {
    return this.prisma.estate.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async setTokenCharging(estateId: string, enabled: boolean) {
    const estate = await this.prisma.estate.findUnique({ where: { id: estateId } });
    if (!estate) throw new NotFoundException('Estate not found');
    return this.prisma.estate.update({
      where: { id: estateId },
      data: { tokenChargingEnabled: enabled },
      select: { id: true, name: true, tokenChargingEnabled: true },
    });
  }

  async createEstate(dto: CreateEstateDto) {
    const existing = await this.prisma.estate.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException('An estate with this code already exists.');
    }

    const { adminPhone, adminPassword, adminFullName, ...estateData } = dto;

    if (adminPhone && !adminPassword) {
      throw new ConflictException('adminPassword is required when adminPhone is set.');
    }

    if (!adminPhone || !adminPassword) {
      return this.prisma.estate.create({ data: estateData });
    }

    const normalizedPhone = normalizePhone(adminPhone);
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });
    if (existingUser) {
      throw new ConflictException('A user with that phone number already exists.');
    }

    const passwordHash = await argon2.hash(adminPassword);
    const estate = await this.prisma.estate.create({
      data: {
        ...estateData,
        users: {
          create: {
            phone: normalizedPhone,
            fullName: adminFullName ?? 'Estate Admin',
            role: 'ADMIN',
            passwordHash,
            mustResetPassword: false,
          },
        },
      },
      include: { users: { select: { id: true, phone: true, fullName: true, role: true } } },
    });
    return estate;
  }

  /**
   * Cross-estate password reset — for when an estate's own admin account
   * is itself the one that's locked out (so the normal `/admin/users/:id/
   * reset-password` flow, which requires an already-working admin JWT for
   * that estate, isn't usable), or for platform-side account recovery in
   * general. Looks the user up by phone only, not scoped to an estateId.
   */
  async resetUserPassword(dto: ResetUserPasswordDto) {
    const phone = normalizePhone(dto.phone);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new NotFoundException('No user found with that phone number.');

    const passwordHash = await argon2.hash(dto.password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustResetPassword: false },
    });
    return { message: 'Password reset.', userId: user.id, fullName: user.fullName, role: user.role };
  }

  /**
   * Cross-estate role change — a blunt platform-level tool for account
   * recovery/support (e.g. promoting an existing resident to ADMIN) that
   * bypasses the normal `/admin/users` flow, which can only create a NEW
   * account rather than re-role an existing one, and requires an
   * already-working admin JWT for that same estate. Only touches `role`;
   * password/passwordHash are never read or written here.
   */
  async setUserRole(dto: SetUserRoleDto) {
    const phone = normalizePhone(dto.phone);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new NotFoundException('No user found with that phone number.');

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { role: dto.role },
      select: { id: true, phone: true, fullName: true, role: true },
    });
    return { message: 'Role updated.', ...updated };
  }

  // ── DISCOs ───────────────────────────────────────────────────────────
  // Not estate-scoped — see ElectricityDisco's schema doc comment. Includes
  // inactive ones here (unlike the mobile-facing endpoint), since a
  // platform admin needs to see and re-enable them, not just what's live.
  listDiscos() {
    return this.prisma.electricityDisco.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createDisco(dto: CreateDiscoDto) {
    const existing = await this.prisma.electricityDisco.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException('A DISCO with this code already exists.');
    }
    return this.prisma.electricityDisco.create({ data: dto });
  }

  async updateDisco(id: string, dto: UpdateDiscoDto) {
    const existing = await this.prisma.electricityDisco.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('DISCO not found.');
    return this.prisma.electricityDisco.update({ where: { id }, data: dto });
  }

  // ── Website leads (contact form / "Request a Demo") ─────────────────────
  // createLead is called from the public marketing site with no auth — it's
  // a prospect submitting an inquiry, not an existing platform admin.
  createLead(dto: CreateWebsiteLeadDto) {
    return this.prisma.websiteLead.create({ data: dto });
  }

  listLeads() {
    return this.prisma.websiteLead.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateLead(id: string, dto: UpdateWebsiteLeadDto) {
    const existing = await this.prisma.websiteLead.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Lead not found.');
    return this.prisma.websiteLead.update({ where: { id }, data: dto });
  }

  // ── QR scans ("download the app" code on the marketing site) ────────────
  // recordQrScan is called from mycove-website's /get redirect route with
  // no auth — an anonymous visitor scanning a code, not a platform admin.
  // Geolocation is an offline, bundled-database lookup (geoip-lite) rather
  // than a call to an external API: approximate is fine for this, and it
  // means recording a scan never adds latency or a point of failure to the
  // redirect the visitor is actually waiting on (mycove-website fires this
  // without awaiting it anyway, but there's no reason to make it slow).
  async recordQrScan(dto: RecordQrScanDto) {
    const geo = dto.ip ? geoip.lookup(dto.ip) : null;
    const scan = await this.prisma.qrScan.create({
      data: {
        platform: dto.platform,
        userAgent: dto.userAgent,
        ip: dto.ip,
        country: geo?.country,
        region: geo?.region,
        city: geo?.city,
      },
    });
    this.analytics.trackSystem('qr_scan_recorded', {
      platform: dto.platform,
      country: geo?.country,
      region: geo?.region,
      city: geo?.city,
    });
    return { id: scan.id };
  }

  listQrScans() {
    return this.prisma.qrScan.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getQrScanStats() {
    const [total, byPlatform, byCountry, recent] = await Promise.all([
      this.prisma.qrScan.count(),
      this.prisma.qrScan.groupBy({ by: ['platform'], _count: { _all: true } }),
      this.prisma.qrScan.groupBy({
        by: ['country'],
        where: { country: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { country: 'desc' } },
        take: 10,
      }),
      this.prisma.qrScan.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

    return {
      total,
      byPlatform: byPlatform.map((p) => ({ platform: p.platform, count: p._count._all })),
      byCountry: byCountry.map((c) => ({ country: c.country, count: c._count._all })),
      recent,
    };
  }
}
