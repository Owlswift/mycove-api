import { Injectable, Logger } from '@nestjs/common';
import Mixpanel from 'mixpanel';
import { PrismaService } from '../../database/prisma.service';

/**
 * Server-side Mixpanel tracking — business events only (see
 * docs/analytics-events.md), never request logs. Fire-and-forget by
 * design: an analytics outage must never fail a payment, a vend, or any
 * other real operation, so every send is wrapped and swallowed.
 *
 * No-ops entirely when MIXPANEL_TOKEN isn't set.
 *
 * Global properties (request_id, service, environment) are auto-attached
 * to every event via [withCommonProps] — callers only pass business-specific
 * properties.
 *
 * People profiles: every event attributed to a real user must go through
 * [trackUser] — full name, phone number, and the estate they belong to are
 * then written to that user's Mixpanel people record via [peopleSet] /
 * [setUserProfile], so Mixpanel's "Identified Users" are always complete.
 * Plain [track] stays reserved for system/synthetic identities only.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private client: Mixpanel.Mixpanel | null = null;

  constructor(private readonly prisma: PrismaService) {
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

  /**
   * Merges global properties (request_id, service, environment) into the
   * event-specific [properties]. Callers should always use this wrapper
   * rather than calling [track] directly, so every event carries the
   * common context automatically.
   */
  withCommonProps(
    properties: Record<string, unknown>,
    requestId?: string,
  ): Record<string, unknown> {
    return {
      ...properties,
      request_id: requestId ?? 'unknown',
      service: 'mycove-api',
      environment: process.env.NODE_ENV ?? 'development',
    };
  }

  /** Tracks a business event attributed to a user. Never throws. */
  track(
    event: string,
    distinctId: string,
    properties: Record<string, unknown> = {},
    requestId?: string,
  ): void {
    if (!this.client) return;
    try {
      this.client.track(event, {
        distinct_id: distinctId,
        ...this.withCommonProps(properties, requestId),
      });
    } catch (e) {
      this.logger.warn(`Mixpanel track failed for ${event}: ${(e as Error).message}`);
    }
  }

  /**
   * Tracks a system-level event with no single user actor (cron sweeps,
   * reminder batches) — attributed to a synthetic system identity.
   */
  trackSystem(event: string, properties: Record<string, unknown> = {}, requestId?: string): void {
    this.track(event, 'system', properties, requestId);
  }

  /**
   * Tracks a business event attributed to a real user AND guarantees their
   * Mixpanel people profile exists (fullname, phone number, estate they
   * belong to). Every user-attributed event must use this instead of
   * [track] so person objects stay complete for every estate. The profile
   * lookup is fire-and-forget like [track]; never throws or rejects.
   */
  trackUser(
    event: string,
    userId: string,
    properties: Record<string, unknown> = {},
    requestId?: string,
  ): void {
    this.track(event, userId, properties, requestId);
    this.setUserProfile(userId);
  }

  /**
   * Fetches the user's fullname, phone number, and estate from the database
   * and writes their Mixpanel people profile via [peopleSet]. A no-op when
   * analytics are disabled. Fire-and-forget; never throws.
   */
  setUserProfile(userId: string): void {
    if (!this.client) return;
    this.prisma.user
      .findUnique({
        where: { id: userId },
        select: {
          fullName: true,
          phone: true,
          estateId: true,
          estate: { select: { name: true } },
        },
      })
      .then((user) => {
        if (!user) return;
        this.peopleSet(userId, {
          fullName: user.fullName,
          phone: user.phone,
          estateId: user.estateId,
          estateName: user.estate?.name,
        });
      })
      .catch((e: unknown) => {
        this.logger.warn(
          `Mixpanel profile lookup failed for ${userId}: ${(e as Error).message}`,
        );
      });
  }

  /**
   * Creates/updates the Mixpanel people profile for a user so every person
   * object carries their full name, phone number, and the estate they
   * belong to ($name/$phone mirror these into Mixpanel's reserved props).
   * Fire-and-forget like [track]; never throws.
   */
  peopleSet(
    distinctId: string,
    profile: {
      fullName: string;
      phone: string;
      estateId: string;
      estateName?: string;
    },
  ): void {
    if (!this.client) return;
    try {
      this.client.people.set(distinctId, {
        $name: profile.fullName,
        $phone: profile.phone,
        full_name: profile.fullName,
        phone: profile.phone,
        estate_id: profile.estateId,
        ...(profile.estateName ? { estate_name: profile.estateName } : {}),
      });
    } catch (e) {
      this.logger.warn(
        `Mixpanel people.set failed for ${distinctId}: ${(e as Error).message}`,
      );
    }
  }
}
