import { Injectable, Logger } from '@nestjs/common';
import Mixpanel from 'mixpanel';

/**
 * Server-side Mixpanel tracking — business events only (see
 * docs/analytics-events.md), never request logs. Fire-and-forget by
 * design: an analytics outage must never fail a payment, a vend, or any
 * other real operation, so every send is wrapped and swallowed.
 *
 * No-ops entirely when MIXPANEL_TOKEN isn't set.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private client: Mixpanel.Mixpanel | null = null;

  constructor() {
    const token = process.env.MIXPANEL_TOKEN;
    if (!token) {
      this.logger.warn(
        'MIXPANEL_TOKEN is not set — server-side analytics are disabled.',
      );
      return;
    }
    try {
      this.client = Mixpanel.init(token);
    } catch (e) {
      this.logger.error(`Mixpanel init failed: ${(e as Error).message}`);
    }
  }

  /** Tracks a business event attributed to a user. Never throws. */
  track(
    event: string,
    distinctId: string,
    properties: Record<string, unknown> = {},
  ): void {
    if (!this.client) return;
    try {
      this.client.track(event, { distinct_id: distinctId, ...properties });
    } catch (e) {
      this.logger.warn(`Mixpanel track failed for ${event}: ${(e as Error).message}`);
    }
  }

  /**
   * Tracks a system-level event with no single user actor (cron sweeps,
   * reminder batches) — attributed to a synthetic system identity.
   */
  trackSystem(event: string, properties: Record<string, unknown> = {}): void {
    this.track(event, 'system', properties);
  }
}