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

const ACCESS_TOKEN_TTL = '12h';

@Injectable()
export class PlatformService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
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
}
