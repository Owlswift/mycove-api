import { Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import * as crypto from 'crypto';
import { PaymentsService } from './payments.service';

interface PaystackWebhookEvent {
  event: string;
  data?: { reference?: string };
}

/**
 * Paystack calls this directly from their servers to confirm a payment —
 * this is the real source of truth (see PaymentsService.confirmByReference),
 * not the client-polled `verify()` endpoint, since a resident can close the
 * app mid-payment or have polling paused while backgrounded. Mirrors
 * UtilitiesCallbackController's shape (separate controller, no
 * JwtAuthGuard, single handler, always acks quickly, idempotent) — but
 * unlike that callback, Paystack signs every webhook and this DOES verify
 * it, since real money is on the other side of a forged request here.
 */
@Controller('payments/webhook')
export class PaymentsWebhookController {
  constructor(private payments: PaymentsService) {}

  @Post('paystack')
  async handlePaystackWebhook(
    @Req() req: Request & { rawBody?: Buffer },
  ): Promise<{ received: true }> {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const signature = req.headers['x-paystack-signature'];
    if (!secret || !signature || !req.rawBody) {
      throw new UnauthorizedException('Missing or unverifiable webhook signature.');
    }
    const expected = crypto
      .createHmac('sha512', secret)
      .update(req.rawBody)
      .digest('hex');
    if (expected !== signature) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }

    const event = req.body as PaystackWebhookEvent;
    const reference = event.data?.reference;
    if (event.event === 'charge.success' && reference) {
      // Best-effort — a reference we don't recognize (or one that's
      // already settled) is a no-op inside confirmByReference, not an
      // error; still ack with 200 either way so Paystack doesn't retry
      // forever over something on our side.
      try {
        await this.payments.confirmByReference(reference);
      } catch {
        // Swallow — see above.
      }
    }

    return { received: true };
  }
}
