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

  /**
   * Sends an approved template — the only way to message someone who hasn't
   * written to us in the last 24 hours. [bodyParams] fill {{1}}, {{2}}… in
   * order; [codeButton] fills the Copy code button of an authentication template.
   */
  async sendTemplate(to: string, name: string, language: string, bodyParams: string[], codeButton?: string): Promise<boolean> {
    if (!this.configured) {
      this.logger.warn(`WhatsApp not configured — would have sent template ${name} to ${to}: ${bodyParams.join(' | ')}`);
      return false;
    }
    const components: unknown[] = [];
    if (bodyParams.length > 0) {
      components.push({ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) });
    }
    if (codeButton) {
      components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codeButton }] });
    }
    return this.post(to, { type: 'template', template: { name, language: { code: language }, components } });
  }

  private async post(to: string, message: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), ...message }),
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

  /** [to] is an E.164 number like +2348012345678. Returns whether WhatsApp accepted it. */
  async sendText(to: string, body: string): Promise<boolean> {
    if (!this.configured) {
      this.logger.warn(`WhatsApp not configured — would have sent to ${to}: ${body}`);
      return false;
    }
    return this.post(to, { type: 'text', text: { body } });
  }
}
