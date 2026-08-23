import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateEmergencyContactsDto } from './dto/update-emergency-contacts.dto';

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
}
