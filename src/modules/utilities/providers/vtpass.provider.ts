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

// https://vtpass.com/documentation/response-codes/
// "still processing" — never treated as a failure to fail over on (see
// UtilityProviderPendingError's doc comment for why).
const PENDING_CODE = '099';
// Codes that mean VTpass itself (or the biller behind it) is the problem,
// not the request — safe to fail over to the next provider.
const UNAVAILABLE_CODES = new Set(['030', '083', '016']);

interface VtpassResponse {
  code?: string;
  response_description?: string;
  content?: {
    Customer_Name?: string;
    Address?: string;
    Can_Vend?: string;
    WrongBillersCode?: boolean;
    // Some DISCOs signal a bad meter this way instead of WrongBillersCode
    // — still `code: '000'` at the top level, so this has to be checked
    // explicitly or it reads as a successful (but empty) verification.
    error?: string;
    transactions?: { transactionId?: string; status?: string };
  };
  requestId?: string;
  token?: string;
  units?: string;
  tariff?: string;
}

@Injectable()
export class VtpassProvider implements UtilityProvider {
  readonly name = 'VTPASS' as const;
  private readonly logger = new Logger(VtpassProvider.name);
  private readonly baseUrl =
    process.env.VTPASS_BASE_URL || 'https://sandbox.vtpass.com/api';
  private readonly apiKey = process.env.VTPASS_API_KEY;
  private readonly publicKey = process.env.VTPASS_PUBLIC_KEY;
  private readonly secretKey = process.env.VTPASS_SECRET_KEY;

  private get configured(): boolean {
    return !!(this.apiKey && this.publicKey && this.secretKey);
  }

  async verifyMeter(
    discoCode: string,
    meterNumber: string,
    meterType: MeterType,
  ): Promise<MeterVerification> {
    const data = await this.post('/merchant-verify', {
      billersCode: meterNumber,
      serviceID: discoCode,
      type: meterType.toLowerCase(),
    });
    if (data.code !== '000') {
      throw new UtilityRequestRejectedError(
        data.response_description || 'Could not verify this meter.',
      );
    }
    const content = data.content ?? {};
    if (content.WrongBillersCode || content.error) {
      throw new UtilityRequestRejectedError(
        content.error || 'That meter number was not recognized.',
      );
    }
    return {
      customerName: content.Customer_Name ?? '',
      address: content.Address || null,
      canVend: content.Can_Vend === 'yes',
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
    const data = await this.post('/pay', {
      request_id: params.requestId,
      serviceID: params.discoCode,
      billersCode: params.meterNumber,
      variation_code: params.meterType.toLowerCase(),
      amount: params.amount,
      phone: params.phone,
    });
    this.assertVended(data);
    return {
      providerRef:
        data.content?.transactions?.transactionId ?? params.requestId,
      token: this.extractToken(data.token),
      units: data.units ?? null,
      tariff: data.tariff ?? null,
    };
  }

  async buyAirtime(params: {
    network: AirtimeNetwork;
    phone: string;
    amount: number;
    requestId: string;
  }): Promise<AirtimeVendResult> {
    const data = await this.post('/pay', {
      request_id: params.requestId,
      serviceID: params.network,
      amount: params.amount,
      phone: params.phone,
    });
    this.assertVended(data);
    return {
      providerRef:
        data.content?.transactions?.transactionId ?? params.requestId,
    };
  }

  private assertVended(data: VtpassResponse): void {
    const code = data.code;
    if (code === PENDING_CODE) {
      throw new UtilityProviderPendingError(
        data.response_description || 'Transaction is still processing.',
      );
    }
    if (code && UNAVAILABLE_CODES.has(code)) {
      throw new UtilityProviderUnavailableError(
        data.response_description || `VTpass error ${code}`,
      );
    }
    if (code !== '000') {
      throw new UtilityRequestRejectedError(
        data.response_description || `VTpass rejected the request (${code}).`,
      );
    }
  }

  /** VTpass returns e.g. "Token : 26362054405982757802" — strip the label. */
  private extractToken(raw: string | undefined): string | null {
    if (!raw) return null;
    const match = raw.match(/[\d-]{10,}/);
    return match ? match[0] : raw;
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<VtpassResponse> {
    if (!this.configured) {
      throw new UtilityProviderUnavailableError(
        'VTpass is not configured (missing API keys).',
      );
    }
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey!,
          'secret-key': this.secretKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new UtilityProviderUnavailableError(
        `VTpass request failed: ${(e as Error).message}`,
      );
    }
    if (!response.ok) {
      this.logger.warn(`VTpass ${path} returned HTTP ${response.status}`);
      throw new UtilityProviderUnavailableError(
        `VTpass returned HTTP ${response.status}`,
      );
    }
    const data = (await response.json()) as VtpassResponse;
    // Temporary diagnostic logging — "Invalid token" showing up as a
    // meter-verification error is suspicious (that phrasing usually means
    // an auth/key problem, not a bad meter number), so log the exact
    // request/response until the real cause is confirmed.
    this.logger.log(`VTpass ${path} request: ${JSON.stringify(body)}`);
    this.logger.log(`VTpass ${path} response: ${JSON.stringify(data)}`);
    return data;
  }
}
