import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AnalyticsService } from '../../common/analytics/analytics.service';
import { PrismaService } from '../../database/prisma.service';
import { PushService } from '../push/push.service';
import { ParamBuilder, WhatsappEvent, WhatsappNotifier } from '../whatsapp/whatsapp-notifier';
import { todayInEstate } from '../birthdays/birthday-calc';
import { monthKeyOf, summarizeResident } from '../dues/dues-calc';
import { loadRateBook } from '../dues/dues-rates';
import { CollectionsIntelligenceService } from '../collections/collections-intelligence.service';

function formatNaira(amount: number): string {
  return `₦${new Intl.NumberFormat('en-NG').format(amount)}`;
}

export interface ReminderCounts {
  dues: number;
  levies: number;
  pledges: number;
}

/**
 * Payment reminder pushes — dues, levies, and unfulfilled pledges.
 *
 * A daily 8am cron reminds everyone who owes anything, and admins /
 * Finance Secretaries can trigger the exact same sweep on demand from the
 * dashboard ("Send payment reminders"). Both paths run through
 * [sendAllForEstate], so what the button sends is precisely what the cron
 * sends — no drift between the two.
 *
 * Deliberately repeat-friendly: these are reminders, meant to recur daily
 * until settled, so there's no dedup ledger like the meeting reminders'
 * exactly-once sends.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private whatsapp: WhatsappNotifier,
    private analytics: AnalyticsService,
    private collections: CollectionsIntelligenceService,
  ) {}

  /** Daily at 8:00 server-local time — every estate's owing users get reminded. */
  @Cron('0 8 * * *')
  async dailySweep(): Promise<void> {
    try {
      const estates = await this.prisma.estate.findMany({ select: { id: true } });
      for (const estate of estates) {
        // Push goes out every day; the WhatsApp copy only on Mondays, so an
        // owing resident gets one WhatsApp reminder a week, not thirty a month.
        const counts = await this.sendAllForEstate(estate.id, { whatsapp: todayInEstate().weekday === 1 });
        if (counts.dues + counts.levies + counts.pledges > 0) {
          this.logger.log(
            `Daily payment reminders for estate ${estate.id}: ${JSON.stringify(counts)}`,
          );
          this.analytics.trackSystem('payment_reminder_cron_ran', {
            estate_id: estate.id,
            ...counts,
          });
        }
      }
    } catch (e) {
      this.logger.error(`Daily payment reminder sweep failed: ${(e as Error).message}`);
    }
  }

  /** One full sweep for one estate — shared by the cron and the admin button. */
  async sendAllForEstate(estateId: string, opts: { whatsapp?: boolean } = { whatsapp: true }): Promise<ReminderCounts> {
    const wa = opts.whatsapp === true;
    const [dues, levies, pledges] = await Promise.all([
      this.sendArrearsReminders(estateId),
      this.sendLevyReminders(estateId, wa),
      this.sendPledgeReminders(estateId),
    ]);
    return { dues, levies, pledges };
  }

  /** Called by the admin dashboard's "Send payment reminders" button. */
  async sendManualSweep(estateId: string): Promise<ReminderCounts> {
    const counts = await this.sendAllForEstate(estateId);
    this.analytics.trackSystem('payment_reminders_sent_manual', {
      estate_id: estateId,
      ...counts,
    });
    return counts;
  }

  /**
   * Residents in dues arrears, reminded on the cadence the collections spec
   * calls for: less than 3 months owing gets a reminder roughly every other
   * day (~3x/week); 3 months or more gets one every day. The message itself
   * is AI-composed per resident (see CollectionsIntelligenceService) rather
   * than a fixed template, with a deterministic fallback if the LLM call
   * fails. No WhatsApp copy here — unlike the fixed-template dues/levy
   * reminders below, a freely-generated message can't go through WhatsApp's
   * pre-approved template system.
   */
  private async sendArrearsReminders(estateId: string): Promise<number> {
    const [residents, rates, lastReminders, deniedCounts, entitlementCounts] = await Promise.all([
      this.prisma.user.findMany({
        where: { estateId, role: 'RESIDENT', active: true, duesLiable: true },
        select: {
          id: true,
          fullName: true,
          createdAt: true,
          moveInMonth: true,
          residentType: true,
          duesLedgerEntries: { where: { type: 'PAYMENT' }, orderBy: { createdAt: 'desc' } },
        },
      }),
      loadRateBook(this.prisma, estateId),
      this.prisma.notification.findMany({
        where: { estateId, type: 'arrears_reminder' },
        orderBy: { createdAt: 'desc' },
        select: { userId: true, createdAt: true },
      }),
      // Prior gate denials, batched per resident — lets the reminder mention
      // "you've already been denied at the gate" rather than treating every
      // resident as if this is their first notice (collections spec §6).
      this.prisma.gateAccessAttempt.groupBy({
        by: ['userId'],
        where: { estateId, allowed: false, userId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.gateAccessEntitlement.groupBy({
        by: ['userId'],
        where: { estateId },
        _count: { _all: true },
      }),
    ]);
    if (rates.isEmpty) return 0;

    const lastSentAt = new Map<string, Date>();
    for (const n of lastReminders) {
      if (!lastSentAt.has(n.userId)) lastSentAt.set(n.userId, n.createdAt);
    }
    const priorDeniedByUser = new Map<string, number>();
    for (const d of deniedCounts) {
      if (d.userId) priorDeniedByUser.set(d.userId, d._count._all);
    }
    const priorEntitlementsByUser = new Map<string, number>();
    for (const e of entitlementCounts) {
      priorEntitlementsByUser.set(e.userId, e._count._all);
    }

    let sent = 0;
    for (const r of residents) {
      const summary = summarizeResident({
        joinedAt: r.createdAt,
        moveInMonth: r.moveInMonth,
        residentType: r.residentType,
        payments: r.duesLedgerEntries,
        rates,
      });
      const balance = summary?.balance ?? 0;
      const monthsOwed = summary?.monthsOwed ?? 0;
      if (balance <= 0 || monthsOwed <= 0) continue;

      const last = lastSentAt.get(r.id);
      const daysSinceLast = last ? Math.floor((Date.now() - last.getTime()) / 86_400_000) : Infinity;
      const cadenceDays = monthsOwed >= 3 ? 1 : 2;
      if (daysSinceLast < cadenceDays) continue;

      const monthlyRate = rates.rateFor(r.residentType, monthKeyOf(new Date()));
      const recentPayments = r.duesLedgerEntries.slice(0, 5).map((p) => ({
        amount: p.amount,
        daysAgo: Math.floor((Date.now() - p.createdAt.getTime()) / 86_400_000),
      }));

      const { message } = await this.collections.generateArrearsReminder({
        residentFirstName: r.fullName.split(' ')[0],
        balance,
        monthsOwed,
        monthlyRate,
        recentPayments,
        history: {
          priorDeniedAttempts: priorDeniedByUser.get(r.id) ?? 0,
          priorEntitlementsEarned: priorEntitlementsByUser.get(r.id) ?? 0,
          lastEntitlementAmount: null,
          lastEntitlementDaysAgo: null,
        },
      });

      await this.notify(estateId, r.id, 'arrears_reminder', message);
      sent++;
    }
    return sent;
  }

  /** Liable residents with at least one unpaid levy — one combined message each. */
  private async sendLevyReminders(estateId: string, whatsapp: boolean): Promise<number> {
    const [levies, liableUsers, payments] = await Promise.all([
      this.prisma.levy.findMany({ where: { estateId } }),
      this.prisma.user.findMany({
        where: { estateId, role: 'RESIDENT', active: true, duesLiable: true },
        select: { id: true },
      }),
      this.prisma.levyPayment.findMany({
        where: { levy: { estateId } },
        select: { userId: true, levyId: true },
      }),
    ]);
    if (levies.length === 0) return 0;

    const paidByUser = new Map<string, Set<string>>();
    for (const p of payments) {
      if (!paidByUser.has(p.userId)) paidByUser.set(p.userId, new Set());
      paidByUser.get(p.userId)!.add(p.levyId);
    }

    let sent = 0;
    for (const u of liableUsers) {
      const paidIds = paidByUser.get(u.id) ?? new Set<string>();
      const unpaid = levies.filter((l) => !paidIds.has(l.id));
      if (unpaid.length === 0) continue;
      const total = unpaid.reduce((sum, l) => sum + l.amount, 0);
      const list = unpaid
        .map((l) => `"${l.label}" (${formatNaira(l.amount)}, due ${l.dueDate})`)
        .join(', ');
      await this.notify(
        estateId,
        u.id,
        'levy',
        `Reminder: you have ${unpaid.length} unpaid lev${unpaid.length === 1 ? 'y' : 'ies'} totaling ${formatNaira(total)}: ${list}.`,
        whatsapp
          ? { event: 'levy_reminder', params: (rc) => [rc.firstName, String(unpaid.length), formatNaira(total)] }
          : undefined,
      );
      sent++;
    }
    return sent;
  }

  /** One reminder per unfulfilled pledge (project name included). */
  private async sendPledgeReminders(estateId: string): Promise<number> {
    const pledges = await this.prisma.projectPledge.findMany({
      where: { fulfilledAt: null, project: { estateId } },
      include: {
        project: { select: { title: true } },
        user: { select: { id: true, active: true } },
      },
    });

    let sent = 0;
    for (const p of pledges) {
      if (!p.user.active) continue;
      await this.notify(
        estateId,
        p.userId,
        'pledge',
        `Reminder: your ${formatNaira(p.amount)} pledge to "${p.project.title}" hasn't been fulfilled yet.`,
      );
      sent++;
    }
    return sent;
  }

  /** In-app Notification row + push — same pairing as every other notify path. */
  private async notify(
    estateId: string,
    userId: string,
    type: string,
    message: string,
    whatsapp?: { event: WhatsappEvent; params: ParamBuilder },
  ) {
    await this.prisma.notification.create({
      data: { userId, estateId, title: message, type },
    });
    await this.push.sendToUser(userId, {
      title: 'MyCove',
      body: message,
      data: { type },
    });
    if (whatsapp) await this.whatsapp.toUser(userId, whatsapp.event, whatsapp.params);
  }
}