import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DuesService } from '../dues/dues.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CollectionsHistory, CollectionsIntelligenceService, CollectionsInput, GateOffer } from '../collections/collections-intelligence.service';

function formatNaira(amount: number): string {
  return `₦${new Intl.NumberFormat('en-NG').format(amount)}`;
}

export interface GateAccessResult {
  allowed: boolean;
  reason?: string;
  residentName?: string;
}

/**
 * Called by an estate's own gate/barrier hardware (see EstateApiKeyGuard) —
 * MyCove never opens or closes anything itself, it only answers allow/deny
 * for a scanned RFID tag. The allow/deny decision itself is a plain
 * threshold check against the resident's current dues balance (with a
 * carve-out for a live temporary-access entitlement earned by a partial
 * payment), not an AI model — gate access needs to be deterministic,
 * auditable, and fast, not something that waits on a 10-20 second local LLM
 * call. What happens *after* a deny — the personalized payment tiers and
 * the message the resident sees — is where the Collections Intelligence
 * Service (an LLM) steps in, per the collections spec. That work runs in
 * the background, after this method has already answered the gate.
 */
@Injectable()
export class GateAccessService {
  private readonly logger = new Logger(GateAccessService.name);

  constructor(
    private prisma: PrismaService,
    private dues: DuesService,
    private notifications: NotificationsService,
    private collections: CollectionsIntelligenceService,
  ) {}

  async checkAccess(estateId: string, rfidTag: string): Promise<GateAccessResult> {
    const [user, estate] = await Promise.all([
      this.prisma.user.findFirst({
        where: { rfidTag, estateId, active: true },
        select: { id: true, fullName: true },
      }),
      this.prisma.estate.findUniqueOrThrow({
        where: { id: estateId },
        select: { gateAccessRestrictionAmount: true },
      }),
    ]);

    if (!user) {
      this.logger.warn(`Gate access check: unrecognized tag "${rfidTag}" for estate ${estateId}`);
      void this.logAttempt(estateId, null, rfidTag, false, 'Tag not recognized');
      return { allowed: false, reason: 'Tag not recognized' };
    }

    const threshold = estate.gateAccessRestrictionAmount;
    if (threshold === null) {
      void this.logAttempt(estateId, user.id, rfidTag, true, 'No gate restriction configured');
      return { allowed: true, residentName: user.fullName };
    }

    const { balance, unpaidMonths, monthlyRate, recentPayments } = await this.dues.getOutstandingSummary(user.id);
    if (balance <= threshold) {
      void this.logAttempt(estateId, user.id, rfidTag, true, 'Balance within limit');
      return { allowed: true, residentName: user.fullName };
    }

    const entitlement = await this.prisma.gateAccessEntitlement.findFirst({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
    });
    if (entitlement) {
      void this.logAttempt(estateId, user.id, rfidTag, true, 'Active temporary access entitlement');
      return { allowed: true, residentName: user.fullName };
    }

    // Deny now, immediately — the barrier can't wait on an LLM call. History
    // is captured before logging *this* attempt so its counts reflect
    // everything prior, not a race against the insert below. The resident's
    // notification with personalized payment offers is composed and sent in
    // the background; see generateAndNotify.
    const monthsOwed = unpaidMonths.length;
    const reason = `Outstanding balance ${formatNaira(balance)} exceeds the estate's ${formatNaira(threshold)} limit`;
    const history = await this.getHistory(user.id);
    void this.logAttempt(estateId, user.id, rfidTag, false, reason);
    void this.generateAndNotify(estateId, user.id, user.fullName, { balance, monthsOwed, monthlyRate, recentPayments, history }).catch((e) => {
      this.logger.error(`Collections flow failed for user ${user.id}: ${(e as Error).message}`);
    });

    return { allowed: false, reason, residentName: user.fullName };
  }

  /**
   * Every gate scan, allowed or denied, per the collections spec's "Data
   * Required" list (§13) — not just denials. Fire-and-forget: a logging
   * failure must never affect the gate's answer.
   */
  private async logAttempt(estateId: string, userId: string | null, rfidTag: string, allowed: boolean, reason: string): Promise<void> {
    try {
      await this.prisma.gateAccessAttempt.create({
        data: { estateId, userId, rfidTag, allowed, reason },
      });
    } catch (e) {
      this.logger.error(`Failed to log gate access attempt: ${(e as Error).message}`);
    }
  }

  /**
   * This resident's track record with the collections system — how many
   * times they've been denied before and how many of those denials they
   * actually paid their way out of. Lets the AI tell a resident who always
   * follows through apart from one who never does, instead of treating
   * every decision as cold start (collections spec §6, §10).
   */
  private async getHistory(userId: string): Promise<CollectionsHistory> {
    const [priorDeniedAttempts, lastEntitlement, priorEntitlementsEarned] = await Promise.all([
      this.prisma.gateAccessAttempt.count({ where: { userId, allowed: false } }),
      this.prisma.gateAccessEntitlement.findFirst({ where: { userId }, orderBy: { grantedAt: 'desc' } }),
      this.prisma.gateAccessEntitlement.count({ where: { userId } }),
    ]);
    return {
      priorDeniedAttempts,
      priorEntitlementsEarned,
      lastEntitlementAmount: lastEntitlement?.amountPaid ?? null,
      lastEntitlementDaysAgo: lastEntitlement ? Math.floor((Date.now() - lastEntitlement.grantedAt.getTime()) / 86_400_000) : null,
    };
  }

  /** Runs after the gate has already been answered — generates offers, records the decision, notifies the resident. */
  private async generateAndNotify(
    estateId: string,
    userId: string,
    fullName: string,
    data: {
      balance: number;
      monthsOwed: number;
      monthlyRate: number | null;
      recentPayments: { amount: number; daysAgo: number }[];
      history: CollectionsHistory;
    },
  ): Promise<void> {
    const input: CollectionsInput = {
      residentFirstName: fullName.split(' ')[0],
      balance: data.balance,
      monthsOwed: data.monthsOwed,
      monthlyRate: data.monthlyRate,
      recentPayments: data.recentPayments,
      history: data.history,
    };
    const result = await this.collections.generateGateOffers(input);

    await this.prisma.gateAccessDecision.create({
      data: {
        estateId,
        userId,
        outstandingBalance: data.balance,
        monthsOwed: data.monthsOwed,
        offers: result.offers as unknown as Prisma.InputJsonValue,
        // The exact input sent to the LLM — the collections spec's own
        // design principle (§16): record what information was used to
        // reach the decision, not just the outcome.
        inputs: input as unknown as Prisma.InputJsonValue,
        message: result.message,
        reasoning: result.reasoning,
      },
    });

    await this.notifications.create(userId, result.message, 'gate_access');
  }

  /**
   * Called after a DUES payment settles (see PaymentsService, FinanceService)
   * — the AI evaluates the payment and decides whether it earns temporary
   * gate access and for how long, per the collections spec §8 ("AI
   * evaluates the payment... AI determines whether it qualifies... AI
   * determines the duration"), using the offer tiers from the resident's
   * most recent gate-denial decision as context rather than a rigid lookup.
   * A payment that fully settles the balance needs no entitlement: the
   * ordinary threshold check in checkAccess already allows them through once
   * the balance updates. Decisions older than 30 days are treated as stale.
   *
   * This can take up to ~45s (the LLM call), so every caller fires this
   * without awaiting it — the payment-confirmation response must not wait on
   * it. Every failure is caught and logged internally so callers never need
   * their own catch.
   */
  async evaluateEntitlementAfterPayment(userId: string, estateId: string, amountPaid: number): Promise<void> {
    try {
      const [decision, { balance: balanceAfterPayment, monthlyRate }, history] = await Promise.all([
        this.prisma.gateAccessDecision.findFirst({
          where: { userId, createdAt: { gt: new Date(Date.now() - 30 * 86_400_000) } },
          orderBy: { createdAt: 'desc' },
        }),
        this.dues.getOutstandingSummary(userId),
        this.getHistory(userId),
      ]);

      const result = await this.collections.evaluatePayment({
        balanceBeforePayment: balanceAfterPayment + amountPaid,
        amountPaid,
        balanceAfterPayment,
        monthlyRate,
        priorOffers: decision ? (decision.offers as unknown as GateOffer[]) : [],
        history,
      });
      if (!result.qualifies) return;

      await this.prisma.gateAccessEntitlement.create({
        data: {
          estateId,
          userId,
          decisionId: decision?.id,
          amountPaid,
          expiresAt: new Date(Date.now() + result.hours * 3_600_000),
        },
      });

      await this.notifications.create(
        userId,
        `Payment received — your gate access is restored for the next ${result.hours >= 24 && result.hours % 24 === 0 ? `${result.hours / 24} day(s)` : `${result.hours} hour(s)`}.`,
        'gate_access',
      );
    } catch (e) {
      this.logger.error(`Failed to evaluate gate-access entitlement after payment for user ${userId}: ${(e as Error).message}`);
    }
  }

  /**
   * "The resident can receive a reminder before expiration" (collections
   * spec §9). Runs every 30 minutes; a window scaled to the grant's own
   * length (10%, clamped to 1-24h) so a 24-hour grant gets reminded with a
   * couple hours left and a 30-day grant gets reminded a day out rather than
   * three days out. remindedAt ensures exactly one reminder per entitlement.
   */
  @Cron('*/30 * * * *')
  async sendExpiringAccessReminders(): Promise<void> {
    try {
      const now = new Date();
      const candidates = await this.prisma.gateAccessEntitlement.findMany({
        where: { expiresAt: { gt: now }, remindedAt: null },
      });
      for (const e of candidates) {
        const totalHours = (e.expiresAt.getTime() - e.grantedAt.getTime()) / 3_600_000;
        const windowHours = Math.min(24, Math.max(1, totalHours * 0.1));
        const hoursLeft = (e.expiresAt.getTime() - now.getTime()) / 3_600_000;
        if (hoursLeft > windowHours) continue;

        await this.notifications.create(
          e.userId,
          `Your temporary gate access expires in about ${Math.max(1, Math.round(hoursLeft))} hour(s). Pay your outstanding balance to keep it from lapsing.`,
          'gate_access',
        );
        await this.prisma.gateAccessEntitlement.update({ where: { id: e.id }, data: { remindedAt: now } });
      }
    } catch (e) {
      this.logger.error(`Pre-expiry access reminder sweep failed: ${(e as Error).message}`);
    }
  }
}
