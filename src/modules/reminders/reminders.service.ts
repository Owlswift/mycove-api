import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AnalyticsService } from '../../common/analytics/analytics.service';
import { PrismaService } from '../../database/prisma.service';
import { PushService } from '../push/push.service';
import { computeDuesAccrual } from '../dues/dues.service';

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
    private analytics: AnalyticsService,
  ) {}

  /** Daily at 8:00 server-local time — every estate's owing users get reminded. */
  @Cron('0 8 * * *')
  async dailySweep(): Promise<void> {
    try {
      const estates = await this.prisma.estate.findMany({ select: { id: true } });
      for (const estate of estates) {
        const counts = await this.sendAllForEstate(estate.id);
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
  async sendAllForEstate(estateId: string): Promise<ReminderCounts> {
    const [dues, levies, pledges] = await Promise.all([
      this.sendDuesReminders(estateId),
      this.sendLevyReminders(estateId),
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

  /** Residents whose calendar-accrued dues balance is above zero. */
  private async sendDuesReminders(estateId: string): Promise<number> {
    const [residents, settings] = await Promise.all([
      this.prisma.user.findMany({
        where: { estateId, role: 'RESIDENT', active: true, duesLiable: true },
        select: {
          id: true,
          createdAt: true,
          duesLedgerEntries: { where: { type: 'PAYMENT' } },
        },
      }),
      this.prisma.duesSettings.findUnique({ where: { estateId } }),
    ]);
    if (!settings) return 0;
    const monthlyAmount = settings.monthlyAmount;

    let sent = 0;
    for (const r of residents) {
      const { balance } = computeDuesAccrual(r.createdAt, r.duesLedgerEntries, monthlyAmount);
      if (balance <= 0) continue;
      await this.notify(
        estateId,
        r.id,
        'dues',
        `Reminder: you currently owe ${formatNaira(balance)} in estate dues. Please settle from the Dues tab.`,
      );
      sent++;
    }
    return sent;
  }

  /** Liable residents with at least one unpaid levy — one combined message each. */
  private async sendLevyReminders(estateId: string): Promise<number> {
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
  private async notify(estateId: string, userId: string, type: string, message: string) {
    await this.prisma.notification.create({
      data: { userId, estateId, title: message, type },
    });
    await this.push.sendToUser(userId, {
      title: 'MyCove',
      body: message,
      data: { type },
    });
  }
}