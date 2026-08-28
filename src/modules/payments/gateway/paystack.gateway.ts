import { Injectable, Logger } from '@nestjs/common';
import type {
  PaymentGateway,
  PaymentGatewayStatus,
} from './payment-gateway.interface';

interface PaystackInitializeResponse {
  status: boolean;
  message?: string;
  data?: {
    authorization_url?: string;
    access_code?: string;
    reference?: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message?: string;
  data?: {
    status?: string; // 'success' | 'failed' | 'abandoned' | 'reversed' | 'pending' | 'queued' | 'ongoing'
  };
}

/**
 * Real Paystack client behind the PaymentGateway interface — see that
 * interface's doc comment. Plain fetch(), no HTTP client dependency, same
 * style as VtpassProvider.
 */
@Injectable()
export class PaystackGateway implements PaymentGateway {
  private readonly logger = new Logger(PaystackGateway.name);
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly secretKey = process.env.PAYSTACK_SECRET_KEY;

  get configured(): boolean {
    return !!this.secretKey;
  }

  async initialize(params: {
    reference: string;
    amount: number;
    email: string;
  }): Promise<{ authorizationUrl: string }> {
    if (!this.configured) {
      throw new Error('Paystack is not configured (missing PAYSTACK_SECRET_KEY).');
    }
    const data = await this.post<PaystackInitializeResponse>(
      '/transaction/initialize',
      {
        email: params.email,
        // Paystack amounts are in kobo, not naira.
        amount: params.amount * 100,
        reference: params.reference,
      },
    );
    const authorizationUrl = data.data?.authorization_url;
    if (!data.status || !authorizationUrl) {
      throw new Error(data.message || 'Paystack could not initialize this transaction.');
    }
    return { authorizationUrl };
  }

  async verify(reference: string): Promise<{ status: PaymentGatewayStatus }> {
    if (!this.configured) {
      throw new Error('Paystack is not configured (missing PAYSTACK_SECRET_KEY).');
    }
    const data = await this.get<PaystackVerifyResponse>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    return { status: this.mapStatus(data.data?.status) };
  }

  private mapStatus(raw: string | undefined): PaymentGatewayStatus {
    if (raw === 'success') return 'success';
    if (raw === 'failed' || raw === 'abandoned' || raw === 'reversed') {
      return 'failed';
    }
    // pending | queued | ongoing | anything unrecognized — still in flight.
    return 'pending';
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (e) {
      throw new Error(`Paystack request failed: ${(e as Error).message}`);
    }
    const data = (await response.json()) as T;
    if (!response.ok) {
      this.logger.warn(`Paystack ${path} returned HTTP ${response.status}`);
    }
    return data;
  }
}
