import { Injectable } from '@nestjs/common';
import type {
  PaymentGateway,
  PaymentGatewayStatus,
} from './payment-gateway.interface';

const SETTLE_DELAY_MS = 1400;

/**
 * No real Paystack account is wired up — this simulates one. Every
 * transaction "succeeds" ~1.4s after being initialized, matching the delay
 * the Flutter app already fakes locally (AppNotifier.confirmPayment).
 */
@Injectable()
export class MockPaystackGateway implements PaymentGateway {
  private readonly statuses = new Map<string, PaymentGatewayStatus>();

  initialize(params: { reference: string; amount: number; email: string }) {
    this.statuses.set(params.reference, 'pending');
    setTimeout(
      () => this.statuses.set(params.reference, 'success'),
      SETTLE_DELAY_MS,
    );
    return Promise.resolve({
      authorizationUrl: `https://mock-paystack.local/pay/${params.reference}`,
    });
  }

  verify(reference: string) {
    return Promise.resolve({
      status: this.statuses.get(reference) ?? 'failed',
    });
  }
}
