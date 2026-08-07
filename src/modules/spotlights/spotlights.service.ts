import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSpotlightDto } from './dto/create-spotlight.dto';

@Injectable()
export class SpotlightsService {
  constructor(private prisma: PrismaService) {}

  list(estateId: string) {
    return this.prisma.spotlight.findMany({ where: { estateId }, orderBy: { createdAt: 'desc' } });
  }

  /** The single spotlight shown on the resident dashboard — most recently created active one, if any. */
  current(estateId: string) {
    return this.prisma.spotlight.findFirst({
      where: { estateId, active: true },
      orderBy: { createdAt: 'desc' },
    });
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
