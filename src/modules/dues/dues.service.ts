import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DuesService {
  constructor(private prisma: PrismaService) {}

  async getDues(userId: string) {
    const history = await this.prisma.duesLedgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const balance = history.reduce(
      (sum, entry) =>
        sum + (entry.type === 'CHARGE' ? entry.amount : -entry.amount),
      0,
    );
    return { balance, history };
  }

  async listLevies(userId: string) {
    const [levies, payments] = await Promise.all([
      this.prisma.levy.findMany(),
      this.prisma.levyPayment.findMany({
        where: { userId },
        select: { levyId: true },
      }),
    ]);
    const paidIds = new Set(payments.map((p) => p.levyId));
    return levies.map((l) => ({ ...l, paid: paidIds.has(l.id) }));
  }

  async payLevy(userId: string, levyId: string) {
    const levy = await this.prisma.levy.findUnique({ where: { id: levyId } });
    if (!levy) throw new NotFoundException('Levy not found');

    const existing = await this.prisma.levyPayment.findUnique({
      where: { userId_levyId: { userId, levyId } },
    });
    if (existing)
      throw new ConflictException('This levy has already been paid.');

    await this.prisma.levyPayment.create({ data: { userId, levyId } });
    return { message: 'Levy paid.' };
  }
}
