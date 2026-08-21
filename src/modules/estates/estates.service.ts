import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

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
}
