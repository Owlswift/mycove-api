export const UTILITY_PROVIDERS = Symbol('UTILITY_PROVIDERS');

export type MeterType = 'PREPAID' | 'POSTPAID';
export type AirtimeNetwork = 'mtn' | 'airtel' | 'glo' | 'etisalat';

export interface MeterVerification {
  customerName: string;
  address: string | null;
  canVend: boolean;
}

export interface ElectricityVendResult {
  providerRef: string;
  /** Prepaid only — null for postpaid, which has nothing to load onto the meter. */
  token: string | null;
  units: string | null;
  tariff: string | null;
}

export interface AirtimeVendResult {
  providerRef: string;
}

/**
 * The three ways a provider call can end up, each demanding a different
 * response from the orchestrator (see UtilitiesService) — conflating any
 * two of these is exactly how you'd end up double-vending a resident or
 * silently swallowing a real failure:
 *
 * - Rejected: the provider looked at the request and said no (bad meter,
 *   amount out of range, ...). The other provider would very likely reject
 *   the same input too, so this propagates straight to the caller instead
 *   of being retried anywhere.
 * - Unavailable: the provider itself is the problem (network error,
 *   non-2xx, "biller unreachable", "system error", missing API keys). Safe
 *   to fail over to the next configured provider.
 * - Pending: the provider accepted the request but hasn't confirmed the
 *   outcome yet (VTpass's 099 "still processing"). This must NOT trigger a
 *   fallback to the next provider — if the first one actually succeeds
 *   moments later, a second attempt would vend twice for one purchase.
 */
export class UtilityRequestRejectedError extends Error {}
export class UtilityProviderUnavailableError extends Error {}
export class UtilityProviderPendingError extends Error {}

export interface UtilityProvider {
  readonly name: 'VTPASS' | 'BUYPOWER';

  verifyMeter(
    discoCode: string,
    meterNumber: string,
    meterType: MeterType,
  ): Promise<MeterVerification>;

  vendElectricity(params: {
    discoCode: string;
    meterNumber: string;
    meterType: MeterType;
    amount: number;
    phone: string;
    requestId: string;
  }): Promise<ElectricityVendResult>;

  buyAirtime(params: {
    network: AirtimeNetwork;
    phone: string;
    amount: number;
    requestId: string;
  }): Promise<AirtimeVendResult>;
}
