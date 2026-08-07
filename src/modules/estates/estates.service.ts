import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class EstatesService {
  constructor(private prisma: PrismaService) {}

  async findByCode(code: string) {
    const estate = await this.prisma.estate.findUnique({
      where: { code: code.trim().toUpperCase() },
      select: { id: true, code: true, name: true },
    });
    if (!estate) throw new NotFoundException('No estate found for that code.');
    return estate;
  }
}
