import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/** Used only if Finance Secretary hasn't set a rate yet (see DuesSettings). */
export const DEFAULT_MONTHLY_DUES_AMOUNT = 45000;

interface DuesPayment {
  amount: number;
  createdAt: Date;
}

/** Whole calendar months between two dates, inclusive of the start month — clamped to [0, 12] since a dues year never spans more than that. */
function monthsBetweenInclusive(start: Date, end: Date): number {
  if (end < start) return 0;
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return Math.min(12, Math.max(0, months));
}

/**
 * Dues accrue automatically by the calendar rather than needing anyone to
 * manually charge a resident each month: the amount owed for a given dues
 * year is (months elapsed that year, up to now or year-end for a past year)
 * × the monthly rate, minus what's actually been paid within that same
 * year. A resident who pays the full annual amount up front immediately
 * reads as owing nothing for the rest of the year; a resident who skips
 * months sees each missed month's charge pile onto the balance. Each dues
 * year is self-contained — a prior year's unpaid balance doesn't carry
 * forward into this one.
 */
export function computeDuesAccrual(
  residentSince: Date,
  payments: DuesPayment[],
  monthlyAmount: number,
  year: number = new Date().getFullYear(),
  today: Date = new Date(),
) {
  const duesYearStart = new Date(year, 0, 1);
  const duesYearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  // For a past year, accrual runs through Dec 31; for the current year, only
  // up to today; a future year hasn't started accruing at all.
  const accrualEnd = today < duesYearStart ? new Date(year, 0, 0) : today < duesYearEnd ? today : duesYearEnd;
  const accrualStart = residentSince > duesYearStart ? residentSince : duesYearStart;

  const monthsElapsed = monthsBetweenInclusive(accrualStart, accrualEnd);
  const accrued = monthsElapsed * monthlyAmount;

  const paidThisDuesYear = payments
    .filter((p) => p.createdAt >= duesYearStart && p.createdAt <= duesYearEnd)
    .reduce((sum, p) => sum + p.amount, 0);
  const monthsPaid = Math.min(12, Math.floor(paidThisDuesYear / monthlyAmount));

  return {
    accrued,
    paid: paidThisDuesYear,
    balance: Math.max(0, accrued - paidThisDuesYear),
    monthsElapsed,
    monthsPaid,
    accrualStart,
  };
}

@Injectable()
export class DuesService {
  constructor(private prisma: PrismaService) {}

  /** The current monthly dues rate, as set by Finance Secretary — falls back to the default if never configured. */
  async getMonthlyDuesAmount(estateId: string): Promise<number> {
    const settings = await this.prisma.duesSettings.findUnique({ where: { estateId } });
    return settings?.monthlyAmount ?? DEFAULT_MONTHLY_DUES_AMOUNT;
  }

  async setMonthlyDuesAmount(estateId: string, monthlyAmount: number) {
    await this.prisma.duesSettings.upsert({
      where: { estateId },
      create: { estateId, monthlyAmount },
      update: { monthlyAmount },
    });
    return { message: 'Monthly dues rate updated.' };
  }

  async getDues(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { createdAt: true, estateId: true },
    });
    const [payments, monthlyAmount] = await Promise.all([
      this.prisma.duesLedgerEntry.findMany({
        where: { userId, type: 'PAYMENT' },
        orderBy: { createdAt: 'desc' },
      }),
      this.getMonthlyDuesAmount(user.estateId),
    ]);

    const { balance, monthsPaid, monthsElapsed, accrualStart } = computeDuesAccrual(
      user.createdAt,
      payments,
      monthlyAmount,
    );

    // Synthesized, one per elapsed month — dues aren't manually charged, so
    // there's no stored row to show; this is purely a display line.
    const charges = Array.from({ length: monthsElapsed }, (_, i) => {
      const monthDate = new Date(accrualStart.getFullYear(), accrualStart.getMonth() + i, 1);
      return {
        id: `charge-${monthDate.getFullYear()}-${monthDate.getMonth()}`,
        date: monthDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        desc: `${monthDate.toLocaleDateString('en-GB', { month: 'long' })} Estate Dues`,
        type: 'CHARGE' as const,
        amount: monthlyAmount,
        createdAt: monthDate,
      };
    });

    const history = [...charges, ...payments].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    return { balance, monthsPaid, history };
  }

  /** Finance Secretary reconciling a payment that didn't come through Paystack — cash, bank transfer, etc. paid directly into the estate's account. A receipt image is the evidence; the note is just an optional label. */
  async recordManualDuesPayment(
    userId: string,
    amount: number,
    note: string | undefined,
    mediaBase64: string | undefined,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.prisma.duesLedgerEntry.create({
      data: {
        userId,
        estateId: user.estateId,
        date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        desc: note ? `Manual payment — ${note}` : 'Manual payment recorded by Finance',
        type: 'PAYMENT',
        amount,
        mediaBase64,
      },
    });
    return { message: 'Payment recorded.' };
  }

  async listLevies(userId: string, estateId: string) {
    const [levies, payments] = await Promise.all([
      this.prisma.levy.findMany({ where: { estateId } }),
      this.prisma.levyPayment.findMany({
        where: { userId },
        select: { levyId: true },
      }),
    ]);
    const paidIds = new Set(payments.map((p) => p.levyId));
    return levies.map((l) => ({ ...l, paid: paidIds.has(l.id) }));
  }

  async payLevy(userId: string, estateId: string, levyId: string, mediaBase64?: string) {
    const levy = await this.prisma.levy.findFirst({ where: { id: levyId, estateId } });
    if (!levy) throw new NotFoundException('Levy not found');

    const existing = await this.prisma.levyPayment.findUnique({
      where: { userId_levyId: { userId, levyId } },
    });
    if (existing)
      throw new ConflictException('This levy has already been paid.');

    await this.prisma.levyPayment.create({
      data: { userId, levyId, mediaBase64, estateId: levy.estateId },
    });
    return { message: 'Levy paid.' };
  }

  createLevy(estateId: string, data: { label: string; amount: number; dueDate: string; year: number }) {
    return this.prisma.levy.create({ data: { ...data, estateId } });
  }

  async deleteLevy(estateId: string, id: string) {
    const levy = await this.prisma.levy.findFirst({ where: { id, estateId } });
    if (!levy) throw new NotFoundException('Levy not found');
    await this.prisma.levy.delete({ where: { id } });
    return { message: 'Levy deleted' };
  }
}
