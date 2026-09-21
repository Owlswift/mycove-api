import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsappClient } from './whatsapp-client';

/** The messages MyCove can send over WhatsApp, each backed by one approved template. */
export type WhatsappEvent =
  | 'password_reset'
  | 'visitor_arrived'
  | 'visitor_left'
  | 'payment_received'
  | 'dues_reminder'
  | 'levy_reminder'
  | 'domestic_staff_approval'
  | 'domestic_staff_code_sent'
  | 'domestic_staff_refused'
  | 'meeting_reminder'
  | 'estate_notice'
  | 'account_access_changed';

export interface Recipient {
  id: string;
  phone: string;
  fullName: string;
  firstName: string;
  estateName: string;
}

export type ParamBuilder = string[] | ((r: Recipient) => string[]);

/**
 * WhatsApp messages that go out IN ADDITION to the push notification for the
 * same event.
 *
 * Each event maps to an approved template name in WHATSAPP_TEMPLATES, e.g.
 *   {"visitor_arrived":"visitor_arrived","password_reset":"mycove_password_reset_code"}
 * If an event has no template listed (or WhatsApp isn't configured at all)
 * nothing is sent and the push notification is the only channel. A resident
 * can switch these messages off (whatsappOptOut); the password code always
 * goes out, since it is a security message they asked for.
 *
 * Never throws — a WhatsApp problem must not affect the request or the push.
 */
@Injectable()
export class WhatsappNotifier {
  private readonly logger = new Logger(WhatsappNotifier.name);

  constructor(
    private prisma: PrismaService,
    private client: WhatsappClient,
  ) {}

  /** The approved template name for [event], or null when none is set up. */
  templateFor(event: WhatsappEvent): string | null {
    const raw = process.env.WHATSAPP_TEMPLATES;
    if (!raw) return null;
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      const name = map[event];
      return typeof name === 'string' && name.trim() ? name.trim() : null;
    } catch {
      this.logger.error('WHATSAPP_TEMPLATES is not valid JSON — WhatsApp templates are disabled.');
      return null;
    }
  }

  private get language(): string {
    return process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'en';
  }

  /** A template variable can't be empty, hold line breaks/tabs or run past 1,024 characters. */
  private clean(value: string): string {
    const v = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 1024);
    return v || '-';
  }

  private enabled(event: WhatsappEvent): string | null {
    if (!this.client.configured) return null;
    return this.templateFor(event);
  }

  async toUser(userId: string, event: WhatsappEvent, params: ParamBuilder): Promise<void> {
    await this.toUsers([userId], event, params);
  }

  async toUsers(userIds: string[], event: WhatsappEvent, params: ParamBuilder): Promise<void> {
    const template = this.enabled(event);
    if (!template || userIds.length === 0) return;
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds }, whatsappOptOut: false },
        select: { id: true, phone: true, fullName: true, estate: { select: { name: true } } },
      });
      const recipients: Recipient[] = users.map((u) => ({
        id: u.id,
        phone: u.phone,
        fullName: u.fullName,
        firstName: u.fullName.split(' ')[0] ?? u.fullName,
        estateName: u.estate.name,
      }));
      // A few at a time, so a big estate-wide notice doesn't open hundreds of connections at once.
      for (let i = 0; i < recipients.length; i += 10) {
        await Promise.allSettled(
          recipients.slice(i, i + 10).map((r) =>
            this.client.sendTemplate(
              r.phone,
              template,
              this.language,
              (typeof params === 'function' ? params(r) : params).map((p) => this.clean(p)),
            ),
          ),
        );
      }
    } catch (e) {
      this.logger.error(`WhatsApp ${event} failed: ${(e as Error).message}`);
    }
  }

  /**
   * A message to a bare phone number (the password code) — [codeButton] is the
   * code again, for templates with a Copy code button.
   */
  async toPhone(phone: string, event: WhatsappEvent, params: string[], codeButton?: string): Promise<void> {
    const template = this.enabled(event);
    if (!template) return;
    try {
      await this.client.sendTemplate(phone, template, this.language, params.map((p) => this.clean(p)), codeButton);
    } catch (e) {
      this.logger.error(`WhatsApp ${event} failed: ${(e as Error).message}`);
    }
  }
}
