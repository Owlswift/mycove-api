import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { ComplaintStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  SUBMITTED: 'submitted',
  IN_REVIEW: 'in review',
  RESOLVED: 'resolved',
};

@Injectable()
export class ComplaintsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  list(userId: string) {
    return this.prisma.complaint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, estateId: string, dto: CreateComplaintDto) {
    const ref = `CMP-${Date.now().toString().slice(-6)}`;
    const complaint = await this.prisma.complaint.create({
      data: {
        userId,
        estateId,
        category: dto.category,
        description: dto.description,
        ref,
      },
    });
    return { ref: complaint.ref };
  }

  async adminList(estateId: string) {
    const complaints = await this.prisma.complaint.findMany({
      where: { estateId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { fullName: true, phone: true, house: true },
        },
      },
    });
    return complaints;
  }

  async updateStatus(estateId: string, id: string, status: string) {
    const complaint = await this.prisma.complaint.findFirst({ where: { id, estateId } });
    if (!complaint) throw new NotFoundException('Complaint not found');
    const updated = await this.prisma.complaint.update({
      where: { id },
      data: { status: status as ComplaintStatus },
    });
    await this.notifications.create(
      complaint.userId,
      `Your complaint ${complaint.ref} is now ${STATUS_LABELS[updated.status]}.`,
      'complaint',
    );
    return updated;
  }
}