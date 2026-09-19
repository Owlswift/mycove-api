/**
 * Paid extra visitor tokens. When an estate has switched the feature on,
 * each resident gets a free number of tokens a day; past that, every extra
 * token costs a set price, charged to their wallet. Commercial residents
 * have their own allowance and price.
 */

export type ChargeResidentType = 'REGULAR' | 'COMMERCIAL';

export interface TokenChargeSettings {
  enabled: boolean;
  allowanceRegular: number;
  allowanceCommercial: number;
  priceRegular: number;
  priceCommercial: number;
}

export interface TokenAllowance {
  enabled: boolean;
  /** Free tokens per day for this resident. */
  allowance: number;
  usedToday: number;
  freeRemaining: number;
  /** What the next token costs; 0 while free allowance remains (or if no price is set). */
  nextTokenPrice: number;
  /** The per-token price once the allowance is used up. */
  extraPrice: number;
}

export function tokenAllowance(
  settings: TokenChargeSettings,
  residentType: ChargeResidentType,
  usedToday: number,
): TokenAllowance {
  const commercial = residentType === 'COMMERCIAL';
  const allowance = commercial ? settings.allowanceCommercial : settings.allowanceRegular;
  const extraPrice = commercial ? settings.priceCommercial : settings.priceRegular;
  const freeRemaining = Math.max(0, allowance - usedToday);
  return {
    enabled: settings.enabled,
    allowance,
    usedToday,
    freeRemaining,
    nextTokenPrice: settings.enabled && freeRemaining === 0 ? extraPrice : 0,
    extraPrice,
  };
}

/** Midnight at the start of the given Lagos calendar day, as an instant (Lagos is UTC+1 all year). */
export function lagosDayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - 60 * 60 * 1000);
}
