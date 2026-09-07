import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

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
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * The current monthly dues rate, as set by Finance Secretary/Admin — null
   * if this estate hasn't configured one yet, meaning nothing should
   * accrue. There used to be a silent DEFAULT_MONTHLY_DUES_AMOUNT fallback
   * here, which made every newly-created estate look like it already had
   * dues configured (and residents already owing money) before anyone had
   * touched the Dues page — confusing for a fresh estate with real money
   * on the line, so it's gone. Every caller must treat null as "no
   * accrual", not silently substitute a number.
   */
  async getMonthlyDuesAmount(estateId: string): Promise<number | null> {
    const settings = await this.prisma.duesSettings.findUnique({ where: { estateId } });
    return settings?.monthlyAmount ?? null;
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
      select: {
        createdAt: true,
        estateId: true,
        duesLiable: true,
        invitedById: true,
        invitedBy: { select: { fullName: true, createdAt: true } },
      },
    });

    // A household member invited in by another resident doesn't accrue a
    // second, duplicate dues obligation — their household's dues are
    // already covered by whoever invited them. They can still see that
    // household's actual balance/history (read-only), just not pay it
    // themselves — see DuesController's payment endpoints, which stay
    // keyed off the liable resident's own account.
    const liableUserId = user.duesLiable ? userId : user.invitedById;
    const accrualStart = user.duesLiable ? user.createdAt : user.invitedBy?.createdAt;
    if (!liableUserId || !accrualStart) {
      return { balance: 0, monthsPaid: 0, history: [], liable: false, invitedByName: user.invitedBy?.fullName ?? null };
    }

    const [payments, monthlyAmount] = await Promise.all([
      this.prisma.duesLedgerEntry.findMany({
        where: { userId: liableUserId, type: 'PAYMENT' },
        orderBy: { createdAt: 'desc' },
      }),
      this.getMonthlyDuesAmount(user.estateId),
    ]);

    if (monthlyAmount === null) {
      return {
        balance: 0,
        monthsPaid: 0,
        history: payments,
        liable: user.duesLiable,
        invitedByName: user.invitedBy?.fullName ?? null,
      };
    }

    const { balance, monthsPaid, monthsElapsed, accrualStart: rangeStart } = computeDuesAccrual(
      accrualStart,
      payments,
      monthlyAmount,
    );

    // Synthesized, one per elapsed month — dues aren't manually charged, so
    // there's no stored row to show; this is purely a display line.
    const charges = Array.from({ length: monthsElapsed }, (_, i) => {
      const monthDate = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1);
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

    return { balance, monthsPaid, history, liable: user.duesLiable, invitedByName: user.invitedBy?.fullName ?? null };
  }

  /**
   * The security desk's view into who owes dues — same accrual math as a
   * resident's own `getDues()`, run across every resident in the estate at
   * once. Guards can't see amounts residents pay each other or project
   * donations, just this one estate-obligation list, which is the thing
   * they're actually asked about at the gate ("is this house owing?").
   */
  async listOwingResidents(estateId: string) {
    const [residents, monthlyAmount] = await Promise.all([
      this.prisma.user.findMany({
        where: { estateId, role: 'RESIDENT', active: true, duesLiable: true },
        select: {
          id: true,
          fullName: true,
          house: true,
          createdAt: true,
          duesLedgerEntries: {
            where: { type: 'PAYMENT' },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.getMonthlyDuesAmount(estateId),
    ]);

    if (monthlyAmount === null) return [];

    return residents
      .map((r) => {
        const { balance, monthsElapsed, monthsPaid } = computeDuesAccrual(
          r.createdAt,
          r.duesLedgerEntries,
          monthlyAmount,
        );
        return {
          userId: r.id,
          fullName: r.fullName,
          house: r.house,
          balance,
          monthsOwed: Math.max(0, monthsElapsed - monthsPaid),
          lastPaidAt: r.duesLedgerEntries[0]?.createdAt ?? null,
        };
      })
      .filter((r) => r.balance > 0)
      .sort((a, b) => b.monthsOwed - a.monthsOwed);
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
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { duesLiable: true, invitedById: true, invitedBy: { select: { fullName: true } } },
    });
    // Same household-sharing rule as getDues() — a non-liable member sees
    // the actual household levies (read-only), resolved off whoever
    // invited them, not an empty list.
    const liableUserId = user.duesLiable ? userId : user.invitedById;
    if (!liableUserId) {
      return { levies: [], liable: false, invitedByName: user.invitedBy?.fullName ?? null };
    }

    const [levies, payments] = await Promise.all([
      this.prisma.levy.findMany({ where: { estateId } }),
      this.prisma.levyPayment.findMany({
        where: { userId: liableUserId },
        select: { levyId: true },
      }),
    ]);
    const paidIds = new Set(payments.map((p) => p.levyId));
    return {
      levies: levies.map((l) => ({ ...l, paid: paidIds.has(l.id) })),
      liable: user.duesLiable,
      invitedByName: user.invitedBy?.fullName ?? null,
    };
  }

  async payLevy(userId: string, estateId: string, levyId: string, mediaBase64?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { duesLiable: true } });
    if (!user.duesLiable) {
      throw new ConflictException('Dues and levies for this household are managed by the resident who invited you.');
    }

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

  async createLevy(estateId: string, data: { label: string; amount: number; dueDate: string; year: number }) {
    const levy = await this.prisma.levy.create({ data: { ...data, estateId } });
    await this.notifications.notifyNewLevy(estateId, levy.label);
    return levy;
  }

  async deleteLevy(estateId: string, id: string) {
    const levy = await this.prisma.levy.findFirst({ where: { id, estateId } });
    if (!levy) throw new NotFoundException('Levy not found');
    await this.prisma.levy.delete({ where: { id } });
    return { message: 'Levy deleted' };
  }
}
