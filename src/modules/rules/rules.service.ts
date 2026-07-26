import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class RulesService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const sections = await this.prisma.rulesSection.findMany({
      orderBy: { order: 'asc' },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    return sections.map((s) => ({
      id: s.id,
      title: s.title,
      items: s.items.map((i) => i.text),
    }));
  }
}
