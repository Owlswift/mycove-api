import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { normalizePhone } from '../../common/utils/normalize-phone';
import { PrismaService } from '../../database/prisma.service';
import {
  formatMonth,
  monthKeyOf,
  parseAmount,
  parsePeriod,
  ResidentTypeKey,
  summarizeResident,
} from './dues-calc';
import { loadRateBook } from './dues-rates';

export interface ImportRowInput {
  phone: string;
  amount: string | number;
  /** Optional — informational; billing starts from the resident's move-in month. */
  period?: string;
  name?: string;
}

export type ImportRowStatus = 'OK' | 'DUPLICATE' | 'ERROR';

export interface ImportRowResult {
  /** 1-based data row (not counting the CSV header). */
  line: number;
  status: ImportRowStatus;
  message: string | null;
  phone: string;
  residentId: string | null;
  residentName: string | null;
  house: string | null;
  residentType: ResidentTypeKey | null;
  amount: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  months: number | null;
  /** What dues for the stated period add up to at the rates that applied — null without a period or rates. */
  expected: number | null;
  /** Paid minus expected for the stated period: negative means short, positive means ahead. */
  difference: number | null;
  /** The month billing starts from for this resident, or null if unknown. */
  billingStart: string | null;
  /** Whether that month was recorded on the resident's profile (otherwise it's the month they joined the app). */
  moveInSet: boolean;
  /** Resident's balance once this and earlier rows are counted: positive owes, negative is ahead. null if the estate has no rates. */
  balanceAfter: number | null;
}

/**
 * Brings in payments residents made before the app existed. Each row says
 * who paid and how much in total. Billing starts from the month recorded
 * on the resident's profile as when they moved in, so the app adds up every
 * month's dues from then until today at the rate that applied in each
 * month and subtracts everything paid. A Period column ("Jan 2024 - Dec
 * 2025") is optional: when given it's kept with the payment and checked
 * against what those months cost, but it doesn't decide where billing starts.
 *
 * Without a period there's nothing to tell two genuine payments of the same
 * amount from an upload repeated by mistake, so a row matching an earlier
 * import (same resident, same amount) is held back unless [allowRepeats].
 */
@Injectable()
export class DuesImportService {
  constructor(private prisma: PrismaService) {}

  /** Checks every row and reports what would happen — writes nothing. */
  async preview(estateId: string, rows: ImportRowInput[], allowRepeats = false) {
    return this.evaluate(estateId, rows, allowRepeats);
  }

  async commit(estateId: string, rows: ImportRowInput[], allowRepeats = false) {
    const { results, summary } = await this.evaluate(estateId, rows, allowRepeats);
    const importable = results.filter((r) => r.status === 'OK');
    if (importable.length === 0) {
      throw new BadRequestException('There is nothing to import — every row has a problem or was already imported.');
    }

    const batchId = crypto.randomUUID();
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    await this.prisma.duesLedgerEntry.createMany({
      data: importable.map((r) => ({
        userId: r.residentId!,
        estateId,
        date,
        desc: r.periodStart
          ? `Imported payment — ${formatMonth(r.periodStart)} to ${formatMonth(r.periodEnd!)}`
          : 'Imported payment — made before the app',
        type: 'PAYMENT' as const,
        amount: r.amount!,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        importBatchId: batchId,
      })),
    });

    return {
      batchId,
      imported: importable.length,
      skipped: summary.total - importable.length,
      totalAmount: importable.reduce((sum, r) => sum + (r.amount ?? 0), 0),
    };
  }

  private async evaluate(estateId: string, rows: ImportRowInput[], allowRepeats: boolean) {
    const phones = rows.map((r) => normalizePhone(String(r.phone ?? '')));
    const [users, rates] = await Promise.all([
      this.prisma.user.findMany({
        where: { estateId, phone: { in: phones } },
        select: {
          id: true,
          phone: true,
          fullName: true,
          house: true,
          createdAt: true,
          moveInMonth: true,
          role: true,
          active: true,
          duesLiable: true,
          residentType: true,
          invitedBy: { select: { fullName: true } },
        },
      }),
      loadRateBook(this.prisma, estateId),
    ]);
    const byPhone = new Map(users.map((u) => [u.phone, u]));

    // Rows already imported earlier — so uploading the same file twice
    // doesn't count the same payment twice.
    const earlier = await this.prisma.duesLedgerEntry.findMany({
      where: { userId: { in: users.map((u) => u.id) }, type: 'PAYMENT' },
      select: { userId: true, amount: true, periodStart: true, importBatchId: true },
    });
    const seen = new Set(earlier.filter((e) => e.importBatchId).map((e) => `${e.userId}|${e.amount}`));
    // Payments per resident so far — earlier ones plus this file's rows as
    // they're counted — for the balance shown on each row.
    const paymentsByUser = new Map<string, { amount: number; periodStart: string | null }[]>();
    for (const e of earlier) {
      const list = paymentsByUser.get(e.userId) ?? [];
      list.push({ amount: e.amount, periodStart: e.periodStart });
      paymentsByUser.set(e.userId, list);
    }

    const results: ImportRowResult[] = rows.map((row, i) => {
      const phone = phones[i]!;
      const base: ImportRowResult = {
        line: i + 1,
        status: 'ERROR',
        message: null,
        phone,
        residentId: null,
        residentName: row.name?.trim() || null,
        house: null,
        residentType: null,
        amount: null,
        periodStart: null,
        periodEnd: null,
        months: null,
        expected: null,
        difference: null,
        billingStart: null,
        moveInSet: false,
        balanceAfter: null,
      };
      const fail = (message: string): ImportRowResult => ({ ...base, status: 'ERROR', message });

      if (!/^\+\d{10,15}$/.test(phone)) return fail('That phone number does not look right.');

      const user = byPhone.get(phone);
      if (!user) return fail('No one in this estate has that phone number.');
      base.residentId = user.id;
      base.residentName = user.fullName;
      base.house = user.house;
      base.residentType = user.residentType;

      if (user.role !== 'RESIDENT') return fail('That phone number belongs to a staff or guard account, not a resident.');
      if (!user.active) return fail('That resident account has been deactivated.');
      if (!user.duesLiable) {
        return fail(
          `A household member — dues are recorded against ${user.invitedBy?.fullName ?? 'the resident who invited them'}.`,
        );
      }

      const amount = parseAmount(row.amount);
      if (!amount.ok) return fail(amount.error);
      base.amount = amount.amount;

      if (row.period?.trim()) {
        const period = parsePeriod(row.period);
        if (!period.ok) return fail(period.error);
        base.periodStart = period.start;
        base.periodEnd = period.end;
        base.months = period.months;
        base.expected = rates.chargeForPeriod(user.residentType, period.start, period.end);
        base.difference = base.expected === null ? null : amount.amount - base.expected;
      }

      const key = `${user.id}|${amount.amount}`;
      const repeat = seen.has(key);
      seen.add(key);
      if (repeat && !allowRepeats) {
        return {
          ...base,
          status: 'DUPLICATE',
          message: 'This resident already has an imported payment of the same amount. Import repeats if it is a genuine second payment.',
        };
      }

      const payments = paymentsByUser.get(user.id) ?? [];
      payments.push({ amount: amount.amount, periodStart: base.periodStart });
      paymentsByUser.set(user.id, payments);
      const summary = summarizeResident({
        joinedAt: user.createdAt,
        moveInMonth: user.moveInMonth,
        residentType: user.residentType,
        payments,
        rates,
      });
      base.billingStart = summary?.startMonth ?? user.moveInMonth ?? monthKeyOf(user.createdAt);
      base.moveInSet = user.moveInMonth !== null;
      base.balanceAfter = summary ? summary.balance - summary.credit : null;

      return {
        ...base,
        status: 'OK',
        message: user.moveInMonth
          ? null
          : `No move-in month recorded yet, so billing counts from ${formatMonth(base.billingStart)}. Set it on the resident's profile.`,
      };
    });

    return {
      results,
      summary: {
        total: results.length,
        ok: results.filter((r) => r.status === 'OK').length,
        duplicates: results.filter((r) => r.status === 'DUPLICATE').length,
        errors: results.filter((r) => r.status === 'ERROR').length,
        noRates: rates.isEmpty,
      },
    };
  }
}
