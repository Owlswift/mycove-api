import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import { DomesticService } from '../domestic/domestic.service';

/**
 * Meta's WhatsApp Cloud API calls this from its own servers — no JwtAuthGuard.
 *
 * GET  — the one-off verification when the webhook is saved in the Meta
 *        dashboard: Meta sends hub.mode=subscribe, hub.verify_token and
 *        hub.challenge; echoing the challenge back (only if the token is
 *        the one we chose) proves the URL is ours.
 * POST — incoming message and status events. Always acknowledged fast with
 *        200 so Meta doesn't retry; for now they are only logged, ready for
 *        the features that will act on them.
 *
 * Configured by WHATSAPP_VERIFY_TOKEN (required) and WHATSAPP_APP_SECRET
 * (the Meta app's secret; when set, every POST must carry a valid
 * X-Hub-Signature-256 over the raw body).
 */
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(private domestic: DomesticService) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!expected || mode !== 'subscribe' || !token || !safeEqual(token, expected)) {
      throw new ForbiddenException('Webhook verification failed.');
    }
    // Meta wants the challenge echoed back as plain text.
    res.status(200).type('text/plain').send(challenge ?? '');
  }

  @Post()
  @HttpCode(200)
  receive(@Req() req: Request & { rawBody?: Buffer }): { received: true } {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (secret) {
      const header = req.headers['x-hub-signature-256'];
      const signature = Array.isArray(header) ? header[0] : header;
      if (!signature || !req.rawBody) {
        throw new UnauthorizedException('Missing webhook signature.');
      }
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
      if (!safeEqual(signature, expected)) {
        throw new UnauthorizedException('Invalid webhook signature.');
      }
    }

    const body = req.body as WhatsappWebhookBody;
    let messages = 0;
    let statuses = 0;
    for (const entry of body?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        statuses += change.value?.statuses?.length ?? 0;
        for (const message of change.value?.messages ?? []) {
          messages++;
          if (message.type === 'text' && message.from && message.id && message.text?.body) {
            // Acknowledge Meta straight away; the reply to the staff member
            // is sent in the background, and any failure is logged, not thrown.
            void this.domestic
              .handleIncoming({ from: message.from, messageId: message.id, text: message.text.body })
              .catch((e: Error) => this.logger.error(`Handling WhatsApp message ${message.id} failed: ${e.message}`));
          }
        }
      }
    }
    this.logger.log(`WhatsApp event received: ${messages} message(s), ${statuses} status update(s)`);
    return { received: true };
  }
}

interface WhatsappWebhookBody {
  entry?: {
    changes?: {
      value?: {
        messages?: { id?: string; from?: string; type?: string; text?: { body?: string } }[];
        statuses?: unknown[];
      };
    }[];
  }[];
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
