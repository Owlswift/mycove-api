import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSpotlightDto } from './dto/create-spotlight.dto';

@Injectable()
export class SpotlightsService {
  constructor(private prisma: PrismaService) {}

  list(estateId: string) {
    return this.prisma.spotlight.findMany({ where: { estateId }, orderBy: { createdAt: 'desc' } });
  }

  /** Every active spotlight — the app picks which one to show, at random, each time it pops one up. */
  active(estateId: string) {
    return this.prisma.spotlight.findMany({
      where: { estateId, active: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * One active spotlight chosen at random, for app versions that ask for a
   * single one. When several are active (say two birthdays on the same day)
   * each request can land on a different one, so no one is always hidden.
   */
  async current(estateId: string) {
    const all = await this.active(estateId);
    return all.length === 0 ? null : all[Math.floor(Math.random() * all.length)]!;
  }

  create(estateId: string, dto: CreateSpotlightDto) {
    return this.prisma.spotlight.create({
      data: {
        estateId,
        name: dto.name,
        category: dto.category,
        description: dto.description,
        imageBase64: dto.imageBase64,
        phone: dto.phone,
      },
    });
  }

  async toggle(estateId: string, id: string) {
    const spotlight = await this.prisma.spotlight.findFirst({ where: { id, estateId } });
    if (!spotlight) throw new NotFoundException('Spotlight not found');
    return this.prisma.spotlight.update({
      where: { id },
      data: { active: !spotlight.active },
    });
  }

  async remove(estateId: string, id: string) {
    const spotlight = await this.prisma.spotlight.findFirst({ where: { id, estateId } });
    if (!spotlight) throw new NotFoundException('Spotlight not found');
    await this.prisma.spotlight.delete({ where: { id } });
    return { message: 'Spotlight removed' };
  }
}
