import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';

@Injectable()
export class ComplaintsService {
  constructor(private prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.complaint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateComplaintDto) {
    const ref = `CMP-${Date.now().toString().slice(-6)}`;
    const complaint = await this.prisma.complaint.create({
      data: {
        userId,
        category: dto.category,
        description: dto.description,
        ref,
      },
    });
    return { ref: complaint.ref };
  }
}
