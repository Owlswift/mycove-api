import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isMonthKey, monthKeyOf, ResidentTypeKey, summarizeResident } from './dues-calc';
import { loadRateBook } from './dues-rates';

@Injectable()
export class DuesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * The estate's dues rates: what each resident type pays this month, and
   * the complete history — every rate ever set, when it was entered, by
   * whom, and which month it took effect. Rows are never edited or
   * removed (see DuesRate), so this is the audit trail.
   */
  async listRates(estateId: string) {
    const rows = await this.prisma.duesRate.findMany({
      where: { estateId },
      orderBy: [{ createdAt: 'desc' }],
      include: { createdBy: { select: { id: true, fullName: true } } },
    });
    const book = await loadRateBook(this.prisma, estateId);
    const currentMonth = monthKeyOf(new Date());

    const current = (type: ResidentTypeKey) => {
      const entry = book.entryFor(type, currentMonth);
      return entry
        ? {
            monthlyAmount: entry.monthlyAmount,
            effectiveMonth: entry.effectiveMonth,
            // Commercial residents are billed at the regular rate until a
            // commercial rate takes effect.
            usesRegularRate: entry.residentType !== type,
          }
        : null;
    };

    return {
      currentMonth,
      current: { REGULAR: current('REGULAR'), COMMERCIAL: current('COMMERCIAL') },
      rates: rows.map((r) => ({
        id: r.id,
        residentType: r.residentType,
        monthlyAmount: r.monthlyAmount,
        effectiveMonth: r.effectiveMonth,
        createdAt: r.createdAt,
        createdBy: r.createdBy,
      })),
    };
  }

  /**
   * Sets the rate a resident type pays from [effectiveMonth] onward. It
   * never rewrites the past: the new row simply starts applying at that
   * month, and every earlier month keeps the rate it already had. A past
   * month is allowed so the estate's earlier rates can be entered when
   * setting up.
   */
  async setRate(
    estateId: string,
    userId: string,
    dto: { residentType: ResidentTypeKey; monthlyAmount: number; effectiveMonth: string },
  ) {
    if (!isMonthKey(dto.effectiveMonth)) {
      throw new BadRequestException('Choose the month the new rate starts, like 2026-10.');
    }
    if (!Number.isInteger(dto.monthlyAmount) || dto.monthlyAmount <= 0) {
      throw new BadRequestException('The monthly amount must be a whole number of naira above zero.');
    }
    const currentYear = new Date().getUTCFullYear();
    if (Number(dto.effectiveMonth.slice(0, 4)) > currentYear + 5) {
      throw new BadRequestException('That start month is too far in the future.');
    }

    await this.prisma.duesRate.create({
      data: {
        estateId,
        residentType: dto.residentType,
        monthlyAmount: dto.monthlyAmount,
        effectiveMonth: dto.effectiveMonth,
        createdById: userId,
      },
    });
    return this.listRates(estateId);
  }

  async getDues(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        createdAt: true,
        moveInMonth: true,
        estateId: true,
        duesLiable: true,
        residentType: true,
        invitedById: true,
        invitedBy: { select: { fullName: true, createdAt: true, moveInMonth: true, residentType: true } },
      },
    });

    // A household member invited in by another resident doesn't accrue a
    // second, duplicate dues obligation — their household's dues are
    // already covered by whoever invited them. They can still see that
    // household's actual balance/history (read-only), just not pay it
    // themselves — see DuesController's payment endpoints, which stay
    // keyed off the liable resident's own account.
    const liable = user.duesLiable ? user : user.invitedBy;
    const liableUserId = user.duesLiable ? userId : user.invitedById;
    if (!liable || !liableUserId) {
      return { balance: 0, monthsPaid: 0, history: [], liable: false, invitedByName: user.invitedBy?.fullName ?? null };
    }

    const [payments, rates] = await Promise.all([
      this.prisma.duesLedgerEntry.findMany({
        where: { userId: liableUserId, type: 'PAYMENT' },
        orderBy: { createdAt: 'desc' },
      }),
      loadRateBook(this.prisma, user.estateId),
    ]);

    const summary = summarizeResident({
      joinedAt: liable.createdAt,
      moveInMonth: liable.moveInMonth,
      residentType: liable.residentType,
      payments,
      rates,
    });

    if (!summary) {
      return {
        balance: 0,
        monthsPaid: 0,
        history: payments,
        liable: user.duesLiable,
        invitedByName: user.invitedBy?.fullName ?? null,
      };
    }

    // Synthesized, one per billed month — dues aren't manually charged, so
    // there's no stored row to show; this is purely a display line. Each
    // month shows the rate that applied in it, so a rate change is visible
    // in the history.
    const thisYear = String(new Date().getUTCFullYear());
    const charges = summary.months.map((m) => {
      const monthDate = new Date(Date.UTC(Number(m.month.slice(0, 4)), Number(m.month.slice(5, 7)) - 1, 1));
      const sameYear = m.month.startsWith(thisYear);
      return {
        id: `charge-${m.month}`,
        date: monthDate.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          ...(sameYear ? {} : { year: 'numeric' as const }),
          timeZone: 'UTC',
        }),
        desc: `${monthDate.toLocaleDateString('en-GB', { month: 'long', ...(sameYear ? {} : { year: 'numeric' as const }), timeZone: 'UTC' })} Estate Dues`,
        type: 'CHARGE' as const,
        amount: m.charge,
        createdAt: monthDate,
      };
    });

    const history = [...charges, ...payments].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    // "Months paid this year" — what the app has always shown; the
    // all-time picture is `balance`.
    const monthsPaid = summary.months.filter((m) => m.month.startsWith(thisYear) && m.paid >= m.charge).length;

    return { balance: summary.balance, monthsPaid, history, liable: user.duesLiable, invitedByName: user.invitedBy?.fullName ?? null };
  }

  /**
   * The security desk's view into who owes dues — same accrual math as a
   * resident's own `getDues()`, run across every resident in the estate at
   * once. Guards can't see amounts residents pay each other or project
   * donations, just this one estate-obligation list, which is the thing
   * they're actually asked about at the gate ("is this house owing?").
   */
  async listOwingResidents(estateId: string) {
    const [residents, rates] = await Promise.all([
      this.prisma.user.findMany({
        where: { estateId, role: 'RESIDENT', active: true, duesLiable: true },
        select: {
          id: true,
          fullName: true,
          house: true,
          createdAt: true,
          moveInMonth: true,
          residentType: true,
          duesLedgerEntries: {
            where: { type: 'PAYMENT' },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      loadRateBook(this.prisma, estateId),
    ]);

    return residents
      .map((r) => {
        const summary = summarizeResident({
          joinedAt: r.createdAt,
          moveInMonth: r.moveInMonth,
          residentType: r.residentType,
          payments: r.duesLedgerEntries,
          rates,
        });
        return {
          userId: r.id,
          fullName: r.fullName,
          house: r.house,
          balance: summary?.balance ?? 0,
          monthsOwed: summary?.monthsOwed ?? 0,
          lastPaidAt: r.duesLedgerEntries[0]?.createdAt ?? null,
        };
      })
      .filter((r) => r.balance > 0)
      .sort((a, b) => b.monthsOwed - a.monthsOwed);
  }

  /**
   * Whether this resident is currently blocked from generating visitor
   * passes for owing dues. The estate's `passRestrictionMonths` sets how
   * many months' dues may be outstanding before the block applies (default
   * 2, so "more than two months"); null means the estate has turned the
   * restriction off. Same household rule as getDues(): a household member
   * is judged on the resident who invited them, since that's whose dues
   * actually accrue.
   */
  async getPassRestriction(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        estateId: true,
        createdAt: true,
        moveInMonth: true,
        duesLiable: true,
        residentType: true,
        invitedById: true,
        invitedBy: { select: { createdAt: true, moveInMonth: true, residentType: true } },
        estate: { select: { passRestrictionMonths: true } },
      },
    });

    const thresholdMonths = user.estate.passRestrictionMonths;
    const unrestricted = { restricted: false, monthsOwed: 0, balance: 0, thresholdMonths };
    if (thresholdMonths === null) return unrestricted;

    const liable = user.duesLiable ? user : user.invitedBy;
    const liableUserId = user.duesLiable ? userId : user.invitedById;
    if (!liable || !liableUserId) return unrestricted;

    const [payments, rates] = await Promise.all([
      this.prisma.duesLedgerEntry.findMany({
        where: { userId: liableUserId, type: 'PAYMENT' },
      }),
      loadRateBook(this.prisma, user.estateId),
    ]);

    const summary = summarizeResident({
      joinedAt: liable.createdAt,
      moveInMonth: liable.moveInMonth,
      residentType: liable.residentType,
      payments,
      rates,
    });
    if (!summary) return unrestricted;

    return {
      restricted: summary.monthsOwed > thresholdMonths,
      monthsOwed: summary.monthsOwed,
      balance: summary.balance,
      thresholdMonths,
    };
  }

  /**
   * A resident's current outstanding dues, broken down by unpaid month —
   * with no passRestrictionMonths gating — used by GateAccessService, which
   * has its own separate amount-based threshold (gateAccessRestrictionAmount)
   * rather than the months-based one above. Same household-liability rule
   * as getPassRestriction/getDues: judged on whoever's dues actually
   * accrue (the inviter, for a household member). The per-month breakdown is
   * what lets the gate-denial notification tell a resident exactly which
   * months they owe for, not just a lump balance. Also carries the data the
   * Collections Intelligence Service needs to generate payment offers and
   * reminder messages (current monthly rate, recent payment history) so
   * every caller works from one consistent snapshot rather than re-querying.
   */
  async getOutstandingSummary(userId: string): Promise<{
    balance: number;
    unpaidMonths: { month: string; amountDue: number }[];
    monthlyRate: number | null;
    recentPayments: { amount: number; daysAgo: number }[];
  }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        estateId: true,
        createdAt: true,
        moveInMonth: true,
        duesLiable: true,
        residentType: true,
        invitedById: true,
        invitedBy: { select: { createdAt: true, moveInMonth: true, residentType: true } },
      },
    });

    const liable = user.duesLiable ? user : user.invitedBy;
    const liableUserId = user.duesLiable ? userId : user.invitedById;
    const empty = { balance: 0, unpaidMonths: [], monthlyRate: null, recentPayments: [] };
    if (!liable || !liableUserId) return empty;

    const [payments, rates] = await Promise.all([
      this.prisma.duesLedgerEntry.findMany({
        where: { userId: liableUserId, type: 'PAYMENT' },
        orderBy: { createdAt: 'desc' },
      }),
      loadRateBook(this.prisma, user.estateId),
    ]);

    const summary = summarizeResident({
      joinedAt: liable.createdAt,
      moveInMonth: liable.moveInMonth,
      residentType: liable.residentType,
      payments,
      rates,
    });
    const monthlyRate = rates.rateFor(liable.residentType, monthKeyOf(new Date()));
    const recentPayments = payments.slice(0, 5).map((p) => ({
      amount: p.amount,
      daysAgo: Math.floor((Date.now() - p.createdAt.getTime()) / 86_400_000),
    }));
    if (!summary) return { ...empty, monthlyRate };

    return {
      balance: summary.balance,
      unpaidMonths: summary.months
        .filter((m) => m.paid < m.charge)
        .map((m) => ({ month: m.month, amountDue: m.charge - m.paid })),
      monthlyRate,
      recentPayments,
    };
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
