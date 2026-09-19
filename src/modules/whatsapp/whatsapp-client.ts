import { Injectable, Logger } from '@nestjs/common';

/**
 * Sends WhatsApp messages through Meta's Cloud API. Needs
 * WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN; without them nothing
 * is sent and the message is only logged, so the rest of the system can run
 * (and be tested) before the WhatsApp account is fully set up.
 *
 * Only plain text is used: every message we send is a reply to someone who
 * just wrote to us, which falls inside WhatsApp's 24-hour conversation
 * window — no pre-approved template needed.
 */
@Injectable()
export class WhatsappClient {
  private readonly logger = new Logger(WhatsappClient.name);

  get configured(): boolean {
    return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
  }

  /** [to] is an E.164 number like +2348012345678. Returns whether WhatsApp accepted it. */
  async sendText(to: string, body: string): Promise<boolean> {
    if (!this.configured) {
      this.logger.warn(`WhatsApp not configured — would have sent to ${to}: ${body}`);
      return false;
    }
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to.replace(/^\+/, ''),
            type: 'text',
            text: { body },
          }),
        },
      );
      if (!response.ok) {
        this.logger.error(`WhatsApp send to ${to} failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.error(`WhatsApp send to ${to} failed: ${(e as Error).message}`);
      return false;
    }
  }
}
