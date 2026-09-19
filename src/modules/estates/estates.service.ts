import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateEmergencyContactsDto } from './dto/update-emergency-contacts.dto';
import { UpdateStreetsDto } from './dto/update-streets.dto';
import { UpdatePassRestrictionDto } from './dto/update-pass-restriction.dto';
import { UpdateTokenSettingsDto } from './dto/update-token-settings.dto';

@Injectable()
export class EstatesService {
  constructor(private prisma: PrismaService) {}

  // address/managedBy/residentCount widen this beyond the original "just
  // confirm the code exists" contract — still unauthenticated, but now
  // shows public-facing marketing info (like a directory listing) so the
  // resident can confirm they found the right estate before logging in.
  async findByCode(code: string) {
    const estate = await this.prisma.estate.findUnique({
      where: { code: code.trim().toUpperCase() },
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        managedBy: true,
        imageBase64: true,
      },
    });
    if (!estate) throw new NotFoundException('No estate found for that code.');

    const residentCount = await this.prisma.user.count({
      where: { estateId: estate.id, role: 'RESIDENT', active: true },
    });

    return { ...estate, residentCount };
  }

  // ── Emergency contacts (SOS screen) ───────────────────────────────────

  /**
   * The security-desk and management-office numbers every resident's SOS
   * screen shows. Deliberately its own authenticated endpoint rather than
   * fields on the unauthenticated findByCode() response — that endpoint is
   * reachable pre-login by anyone with an estate code, and published duty
   * phone numbers are exactly the kind of data you don't hand to callers
   * who've proven nothing.
   */
  async getEmergencyContacts(estateId: string) {
    const estate = await this.prisma.estate.findUnique({
      where: { id: estateId },
      select: { securityGuardPhone: true, estateAdminPhone: true },
    });
    if (!estate) throw new NotFoundException('Estate not found');
    return estate;
  }

  async updateEmergencyContacts(estateId: string, dto: UpdateEmergencyContactsDto) {
    const estate = await this.prisma.estate.findUnique({ where: { id: estateId } });
    if (!estate) throw new NotFoundException('Estate not found');

    // Empty string means "clear the number" — the admin UI sends null-ish
    // edits as '' so a single PATCH can set, change, or remove either field.
    const data = {
      ...(dto.securityGuardPhone !== undefined && {
        securityGuardPhone: dto.securityGuardPhone?.trim() || null,
      }),
      ...(dto.estateAdminPhone !== undefined && {
        estateAdminPhone: dto.estateAdminPhone?.trim() || null,
      }),
    };

    const updated = await this.prisma.estate.update({
      where: { id: estateId },
      data,
      select: { securityGuardPhone: true, estateAdminPhone: true },
    });
    return updated;
  }
  // ── Streets (address preloading) ──────────────────────────────────────

  /** The estate's preloaded street names — empty until the admin sets some, in which case clients fall back to a free-text house address. */
  async getStreets(estateId: string) {
    const estate = await this.prisma.estate.findUnique({
      where: { id: estateId },
      select: { streets: true },
    });
    if (!estate) throw new NotFoundException('Estate not found');
    return { streets: estate.streets };
  }

  async updateStreets(estateId: string, dto: UpdateStreetsDto) {
    const estate = await this.prisma.estate.findUnique({ where: { id: estateId } });
    if (!estate) throw new NotFoundException('Estate not found');

    // Trim, drop blanks, and de-duplicate case-insensitively (keeping the
    // first spelling) so "palm street" and "Palm Street" don't both appear.
    const seen = new Set<string>();
    const streets: string[] = [];
    for (const raw of dto.streets) {
      const name = raw.trim().replace(/\s+/g, ' ');
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      streets.push(name);
    }

    return this.prisma.estate.update({
      where: { id: estateId },
      data: { streets },
      select: { streets: true },
    });
  }

  // ── Paid extra visitor tokens ─────────────────────────────────────────

  private readonly tokenSelect = {
    tokenChargingEnabled: true,
    tokenAllowanceRegular: true,
    tokenAllowanceCommercial: true,
    tokenPriceRegular: true,
    tokenPriceCommercial: true,
  } as const;

  async getTokenSettings(estateId: string) {
    const estate = await this.prisma.estate.findUnique({ where: { id: estateId }, select: this.tokenSelect });
    if (!estate) throw new NotFoundException('Estate not found');
    return estate;
  }

  async updateTokenSettings(estateId: string, dto: UpdateTokenSettingsDto) {
    const estate = await this.prisma.estate.findUnique({ where: { id: estateId } });
    if (!estate) throw new NotFoundException('Estate not found');
    return this.prisma.estate.update({
      where: { id: estateId },
      data: {
        ...(dto.tokenAllowanceRegular !== undefined && { tokenAllowanceRegular: dto.tokenAllowanceRegular }),
        ...(dto.tokenAllowanceCommercial !== undefined && { tokenAllowanceCommercial: dto.tokenAllowanceCommercial }),
        ...(dto.tokenPriceRegular !== undefined && { tokenPriceRegular: dto.tokenPriceRegular }),
        ...(dto.tokenPriceCommercial !== undefined && { tokenPriceCommercial: dto.tokenPriceCommercial }),
      },
      select: this.tokenSelect,
    });
  }

  // ── Visitor-pass dues restriction ─────────────────────────────────────

  async getPassRestriction(estateId: string) {
    const estate = await this.prisma.estate.findUnique({
      where: { id: estateId },
      select: { passRestrictionMonths: true },
    });
    if (!estate) throw new NotFoundException('Estate not found');
    return estate;
  }

  async updatePassRestriction(estateId: string, dto: UpdatePassRestrictionDto) {
    const estate = await this.prisma.estate.findUnique({ where: { id: estateId } });
    if (!estate) throw new NotFoundException('Estate not found');

    // undefined = leave as-is; null = turn the restriction off.
    return this.prisma.estate.update({
      where: { id: estateId },
      data: {
        ...(dto.passRestrictionMonths !== undefined && {
          passRestrictionMonths: dto.passRestrictionMonths,
        }),
      },
      select: { passRestrictionMonths: true },
    });
  }
}
