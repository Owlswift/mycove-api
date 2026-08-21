import { Injectable, Logger } from '@nestjs/common';
import type {
  AirtimeNetwork,
  AirtimeVendResult,
  ElectricityVendResult,
  MeterType,
  MeterVerification,
  UtilityProvider,
} from './utility-provider.interface';
import {
  UtilityProviderPendingError,
  UtilityProviderUnavailableError,
  UtilityRequestRejectedError,
} from './utility-provider.interface';

// BuyPower's DISCO codes are short, uppercase, and unrelated to VTpass's
// slug style — UtilityMeter.discoCode is stored canonically in VTpass's
// format (e.g. "ikeja-electric", see nigerianDiscos in the mobile app), so
// this provider translates at the boundary. Confirmed against the Postman
// collection's /discos/status and /providers/reliability-index example
// responses; BENIN/ABAPOWER/YOLA came from the reliability-index list only
// (not exercised in /discos/status) so double-check these three in prod.
const DISCO_CODE_MAP: Record<string, string> = {
  'ikeja-electric': 'IKEJA',
  'eko-electric': 'EKO',
  'abuja-electric': 'ABUJA',
  'kano-electric': 'KANO',
  'portharcourt-electric': 'PH',
  'jos-electric': 'JOS',
  'ibadan-electric': 'IBADAN',
  'kaduna-electric': 'KADUNA',
  'enugu-electric': 'ENUGU',
  'benin-electric': 'BENIN',
  'aba-electric': 'ABAPOWER',
  'yola-electric': 'YOLA',
};

const NETWORK_CODE_MAP: Record<AirtimeNetwork, string> = {
  mtn: 'MTN',
  airtel: 'AIRTEL',
  glo: 'GLO',
  etisalat: '9MOBILE',
};

interface CheckMeterResponse {
  error?: boolean;
  message?: string;
  responseCode?: number;
  name?: string;
  address?: string;
  tariff?: string;
}

interface VendData {
  id?: string;
  orderId?: string;
  receiptNo?: string;
  vendRef?: string;
  token?: string | null;
  units?: string | null;
  tariff?: string | null;
}

interface VendResponse {
  status?: boolean;
  error?: boolean;
  message?: string;
  responseCode?: number;
  data?: VendData;
}

@Injectable()
export class BuypowerProvider implements UtilityProvider {
  readonly name = 'BUYPOWER' as const;
  private readonly logger = new Logger(BuypowerProvider.name);
  private readonly baseUrl =
    process.env.BUYPOWER_BASE_URL || 'https://idev.buypower.ng/v2';
  private readonly apiToken = process.env.BUYPOWER_API_TOKEN;

  private get configured(): boolean {
    return !!this.apiToken;
  }

  async verifyMeter(
    discoCode: string,
    meterNumber: string,
    meterType: MeterType,
  ): Promise<MeterVerification> {
    const disco = this.mapDisco(discoCode);
    const data = await this.get<CheckMeterResponse>('/check/meter', {
      meter: meterNumber,
      disco,
      vendType: meterType,
      vertical: 'ELECTRICITY',
    });
    if (data.error) {
      throw new UtilityRequestRejectedError(
        data.message || 'Could not verify this meter.',
      );
    }
    return {
      customerName: data.name ?? '',
      address: data.address || null,
      canVend: true,
    };
  }

  async vendElectricity(params: {
    discoCode: string;
    meterNumber: string;
    meterType: MeterType;
    amount: number;
    phone: string;
    requestId: string;
  }): Promise<ElectricityVendResult> {
    const disco = this.mapDisco(params.discoCode);
    const result = await this.post('/vend', {
      orderId: params.requestId,
      vendType: params.meterType,
      amount: params.amount,
      phone: params.phone,
      meter: params.meterNumber,
      disco,
      vertical: 'ELECTRICITY',
      paymentType: 'B2B',
    });
    this.assertVended(result);
    const data = result.body.data ?? {};
    return {
      providerRef: data.receiptNo ?? data.orderId ?? params.requestId,
      token: data.token || null,
      units: data.units ? `${data.units} kWh` : null,
      tariff: data.tariff ?? null,
    };
  }

  async buyAirtime(params: {
    network: AirtimeNetwork;
    phone: string;
    amount: number;
    requestId: string;
  }): Promise<AirtimeVendResult> {
    const disco = NETWORK_CODE_MAP[params.network];
    const result = await this.post('/vend', {
      orderId: params.requestId,
      vendType: 'PREPAID',
      amount: params.amount,
      phone: params.phone,
      meter: params.phone,
      disco,
      vertical: 'VTU',
      paymentType: 'B2B',
    });
    this.assertVended(result);
    const data = result.body.data ?? {};
    return {
      providerRef: data.receiptNo ?? data.orderId ?? params.requestId,
    };
  }

  /**
   * BuyPower's /vend response codes closely mirror HTTP status codes (both
   * in the HTTP status itself and echoed as `responseCode` in the body):
   * 200 success, 202 accepted/still processing, 400 validation error,
   * 409/422/500/501/502/503 provider- or biller-side trouble. 202 must map
   * to Pending (not Unavailable) for the same reason as VTpass's 099 — the
   * transaction may still complete, so failing over risks a double vend.
   */
  private assertVended(result: {
    ok: boolean;
    status: number;
    body: VendResponse;
  }): void {
    const { status, body } = result;
    if (body.status === true && (status === 200 || status === 201)) return;
    if (status === 202) {
      throw new UtilityProviderPendingError(
        body.message || 'Transaction is still processing.',
      );
    }
    if (status === 400) {
      throw new UtilityRequestRejectedError(
        body.message || 'BuyPower rejected the request.',
      );
    }
    throw new UtilityProviderUnavailableError(
      body.message || `BuyPower vend failed (HTTP ${status}).`,
    );
  }

  private mapDisco(discoCode: string): string {
    const mapped = DISCO_CODE_MAP[discoCode];
    if (!mapped) {
      throw new UtilityProviderUnavailableError(
        `BuyPower does not have a known DISCO mapping for "${discoCode}".`,
      );
    }
    return mapped;
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async get<T>(
    path: string,
    query: Record<string, string>,
  ): Promise<T> {
    if (!this.configured) {
      throw new UtilityProviderUnavailableError(
        'BuyPower is not configured (missing BUYPOWER_API_TOKEN).',
      );
    }
    const qs = new URLSearchParams(query).toString();
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}?${qs}`, {
        method: 'GET',
        headers: this.authHeaders(),
      });
    } catch (e) {
      throw new UtilityProviderUnavailableError(
        `BuyPower request failed: ${(e as Error).message}`,
      );
    }
    const body = (await response.json().catch(() => ({}))) as T;
    // BuyPower may return a well-formed { error: ..., message: ... } body
    // alongside a non-2xx status for check/meter — trust the parsed body's
    // own error field when present rather than the raw HTTP status, so a
    // genuine "invalid meter" rejection doesn't get flattened into a vague
    // "HTTP 4xx" unavailable error.
    if (
      !response.ok &&
      typeof (body as CheckMeterResponse).error !== 'boolean'
    ) {
      this.logger.warn(`BuyPower ${path} returned HTTP ${response.status}`);
      throw new UtilityProviderUnavailableError(
        `BuyPower returned HTTP ${response.status}`,
      );
    }
    return body;
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; status: number; body: VendResponse }> {
    if (!this.configured) {
      throw new UtilityProviderUnavailableError(
        'BuyPower is not configured (missing BUYPOWER_API_TOKEN).',
      );
    }
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new UtilityProviderUnavailableError(
        `BuyPower request failed: ${(e as Error).message}`,
      );
    }
    const responseBody = (await response
      .json()
      .catch(() => ({}))) as VendResponse;
    return { ok: response.ok, status: response.status, body: responseBody };
  }
}
