import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSpotlightDto } from './dto/create-spotlight.dto';

@Injectable()
export class SpotlightsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.spotlight.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /** The single spotlight shown on the resident dashboard — most recently created active one, if any. */
  current() {
    return this.prisma.spotlight.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: CreateSpotlightDto) {
    return this.prisma.spotlight.create({
      data: {
        name: dto.name,
        category: dto.category,
        description: dto.description,
        imageBase64: dto.imageBase64,
        phone: dto.phone,
      },
    });
  }

  async toggle(id: string) {
    const spotlight = await this.prisma.spotlight.findUnique({ where: { id } });
    if (!spotlight) throw new NotFoundException('Spotlight not found');
    return this.prisma.spotlight.update({
      where: { id },
      data: { active: !spotlight.active },
    });
  }

  async remove(id: string) {
    const spotlight = await this.prisma.spotlight.findUnique({ where: { id } });
    if (!spotlight) throw new NotFoundException('Spotlight not found');
    await this.prisma.spotlight.delete({ where: { id } });
    return { message: 'Spotlight removed' };
  }
}
