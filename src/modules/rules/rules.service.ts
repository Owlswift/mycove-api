import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateRulesSectionDto } from './dto/create-rules-section.dto';

@Injectable()
export class RulesService {
  constructor(private prisma: PrismaService) {}

  async list(estateId: string) {
    const sections = await this.prisma.rulesSection.findMany({
      where: { estateId },
      orderBy: { order: 'asc' },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    return sections.map((s) => ({
      id: s.id,
      title: s.title,
      items: s.items.map((i) => i.text),
    }));
  }

  async adminList(estateId: string) {
    return this.prisma.rulesSection.findMany({
      where: { estateId },
      orderBy: { order: 'asc' },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async create(estateId: string, dto: CreateRulesSectionDto) {
    const items = (dto.items ?? []).map((item, i) => ({
      text: item.text,
      order: item.order ?? i,
      estateId,
    }));
    return this.prisma.rulesSection.create({
      data: {
        estateId,
        title: dto.title,
        order: dto.order ?? 0,
        items: { create: items },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async update(estateId: string, id: string, dto: CreateRulesSectionDto) {
    const existing = await this.prisma.rulesSection.findFirst({ where: { id, estateId } });
    if (!existing) throw new NotFoundException('Rules section not found');

    // Update section fields, delete old items, and recreate from the DTO.
    return this.prisma.$transaction(async (tx) => {
      await tx.rulesSection.update({
        where: { id },
        data: { title: dto.title, order: dto.order ?? existing.order },
      });
      await tx.ruleItem.deleteMany({ where: { sectionId: id } });
      const items = (dto.items ?? []).map((item, i) => ({
        sectionId: id,
        text: item.text,
        order: item.order ?? i,
        estateId: existing.estateId,
      }));
      await tx.ruleItem.createMany({ data: items });

      return tx.rulesSection.findUnique({
        where: { id },
        include: { items: { orderBy: { order: 'asc' } } },
      });
    });
  }

  async remove(estateId: string, id: string) {
    const existing = await this.prisma.rulesSection.findFirst({ where: { id, estateId } });
    if (!existing) throw new NotFoundException('Rules section not found');
    await this.prisma.rulesSection.delete({ where: { id } });
    return { message: 'Rules section deleted' };
  }
}