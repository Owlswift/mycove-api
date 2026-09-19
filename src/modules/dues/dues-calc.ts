/**
 * Dues accounting, kept free of any database access so the rules can be
 * tested on their own.
 *
 * The model: a resident is billed one monthly charge for every calendar
 * month from the month their billing began through the current month
 * (inclusive). The charge for a month is the rate in effect for that month
 * for their resident type. Everything they have paid — payments made in the
 * app and payments imported from before it existed — is added up and
 * counted against those charges, oldest month first. What's left is what
 * they owe; months that are fully covered are "paid".
 *
 * Months are 'YYYY-MM' strings (UTC), which sort correctly as text and keep
 * the maths clear of time-zone surprises.
 */

export type MonthKey = string;
export type ResidentTypeKey = 'REGULAR' | 'COMMERCIAL';

export interface RateEntry {
  residentType: ResidentTypeKey;
  monthlyAmount: number;
  /** First month this rate is charged for. */
  effectiveMonth: MonthKey;
  createdAt: Date;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isMonthKey(value: string): boolean {
  return MONTH_RE.test(value);
}

export function monthKeyOf(date: Date): MonthKey {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthIndex(key: MonthKey): number {
  return Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1);
}

function monthFromIndex(index: number): MonthKey {
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function nextMonthKey(key: MonthKey): MonthKey {
  return monthFromIndex(monthIndex(key) + 1);
}

/** Whole months from start to end, counting both ends — 0 if end is before start. */
export function monthsInclusive(start: MonthKey, end: MonthKey): number {
  return Math.max(0, monthIndex(end) - monthIndex(start) + 1);
}

/** 'Jan 2024' */
export function formatMonth(key: MonthKey): string {
  return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

/**
 * The estate's rate history for every resident type.
 *
 * A month's rate is the latest entry effective on or before it (if two were
 * entered for the same month, the newer one wins). Regular is the base: a
 * month earlier than the first regular entry uses that first entry, so
 * setting the estate's first rate covers earlier months too.
 *
 * A commercial rate only applies from its own effective month on. Any month
 * before that — or every month, if no commercial rate has been set — is
 * billed at the regular rate for that month, so setting a commercial rate
 * never rewrites what a commercial resident was already charged.
 */
export class RateBook {
  private readonly chains: Record<ResidentTypeKey, RateEntry[]>;

  constructor(entries: RateEntry[]) {
    const sorted = [...entries].sort(
      (a, b) =>
        a.effectiveMonth.localeCompare(b.effectiveMonth) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    this.chains = {
      REGULAR: sorted.filter((e) => e.residentType === 'REGULAR'),
      COMMERCIAL: sorted.filter((e) => e.residentType === 'COMMERCIAL'),
    };
  }

  get isEmpty(): boolean {
    return this.chains.REGULAR.length === 0 && this.chains.COMMERCIAL.length === 0;
  }

  /** The latest entry in a chain effective on or before [month]; ties go to the newest. */
  private latestBy(chain: RateEntry[], month: MonthKey): RateEntry | undefined {
    let found: RateEntry | undefined;
    for (const entry of chain) {
      if (entry.effectiveMonth <= month) found = entry;
      else break;
    }
    return found;
  }

  /**
   * The history entry that prices [month] for [type] — null if there's no
   * rate at all. For commercial it can be a REGULAR entry (see above), which
   * is how a screen can tell a commercial resident is still on the regular rate.
   */
  entryFor(type: ResidentTypeKey, month: MonthKey): RateEntry | null {
    const regular = this.chains.REGULAR;
    if (type === 'REGULAR') {
      return this.latestBy(regular, month) ?? regular[0] ?? null;
    }

    const own = this.chains.COMMERCIAL;
    const ownHit = this.latestBy(own, month);
    if (ownHit) return ownHit;
    // Before its own first rate (or with none): whatever regular charged that month.
    if (regular.length > 0) return this.latestBy(regular, month) ?? regular[0];
    // No regular rate anywhere: the earliest commercial one is all there is.
    return own[0] ?? null;
  }

  rateFor(type: ResidentTypeKey, month: MonthKey): number | null {
    return this.entryFor(type, month)?.monthlyAmount ?? null;
  }

  /** Total dues for every month in [start, end] at the rates that applied in each. */
  chargeForPeriod(type: ResidentTypeKey, start: MonthKey, end: MonthKey): number | null {
    if (this.isEmpty) return null;
    let total = 0;
    for (let i = monthIndex(start); i <= monthIndex(end); i++) {
      total += this.rateFor(type, monthFromIndex(i)) ?? 0;
    }
    return total;
  }
}

export interface DuesMonth {
  month: MonthKey;
  /** What that month costs at the rate in effect for it. */
  charge: number;
  /** How much of the resident's total payments went against this month. */
  paid: number;
}

export interface DuesSummary {
  startMonth: MonthKey;
  endMonth: MonthKey;
  months: DuesMonth[];
  /** Total charged from the start month through the current month. */
  billed: number;
  /** Everything they've paid, from any source. */
  paid: number;
  /** What they still owe. */
  balance: number;
  /** Paid ahead of what's been billed so far. */
  credit: number;
  monthsElapsed: number;
  /** Months fully covered by payments. */
  monthsCovered: number;
  /** Months not yet fully covered — what the visitor-pass restriction counts. */
  monthsOwed: number;
}

/** null when the estate has no rate at all yet — meaning nothing accrues. */
export function computeDues(input: {
  startMonth: MonthKey;
  endMonth: MonthKey;
  residentType: ResidentTypeKey;
  rates: RateBook;
  totalPaid: number;
}): DuesSummary | null {
  const { startMonth, endMonth, residentType, rates, totalPaid } = input;
  if (rates.isEmpty) return null;

  const months: DuesMonth[] = [];
  let remaining = totalPaid;
  let billed = 0;
  for (let i = monthIndex(startMonth); i <= monthIndex(endMonth); i++) {
    const month = monthFromIndex(i);
    const charge = rates.rateFor(residentType, month) ?? 0;
    const paid = Math.min(charge, Math.max(0, remaining));
    remaining -= paid;
    billed += charge;
    months.push({ month, charge, paid });
  }

  const monthsCovered = months.filter((m) => m.paid >= m.charge).length;
  return {
    startMonth,
    endMonth,
    months,
    billed,
    paid: totalPaid,
    balance: Math.max(0, billed - totalPaid),
    credit: Math.max(0, totalPaid - billed),
    monthsElapsed: months.length,
    monthsCovered,
    monthsOwed: months.length - monthsCovered,
  };
}

/**
 * The month a resident's billing begins: the month they moved in (or began
 * operating) as recorded on their profile. For a resident without one
 * recorded yet: when they joined the app, or earlier if a payment imported from before the app says it covers an
 * earlier month (residents moved in at different times, and shouldn't be
 * billed for months before they lived there — nor lose the months they've
 * already paid for from before the app).
 */
export function billingStartMonth(
  joinedAt: Date,
  payments: { periodStart?: string | null }[],
  moveInMonth?: MonthKey | null,
): MonthKey {
  if (moveInMonth) return moveInMonth;
  let start = monthKeyOf(joinedAt);
  for (const p of payments) {
    if (p.periodStart && p.periodStart < start) start = p.periodStart;
  }
  return start;
}

/** The one call every screen and job uses to work out a resident's dues. */
export function summarizeResident(input: {
  joinedAt: Date;
  /** 'YYYY-MM' the resident moved in — billing starts here when set. */
  moveInMonth?: MonthKey | null;
  residentType: ResidentTypeKey;
  payments: { amount: number; periodStart?: string | null }[];
  rates: RateBook;
  now?: Date;
}): DuesSummary | null {
  return computeDues({
    startMonth: billingStartMonth(input.joinedAt, input.payments, input.moveInMonth),
    endMonth: monthKeyOf(input.now ?? new Date()),
    residentType: input.residentType,
    rates: input.rates,
    totalPaid: input.payments.reduce((sum, p) => sum + p.amount, 0),
  });
}

// ── CSV import parsing ──────────────────────────────────────────────────

const MONTH_LOOKUP: Record<string, number> = Object.fromEntries(
  MONTH_NAMES.map((name, i) => [name.toLowerCase(), i + 1]),
);

function toMonthKey(year: number, month: number): MonthKey | null {
  if (month < 1 || month > 12 || year < 1990 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** One month written any of the ways people write them: Jan 2024, January 2024, Jan-2024, 2024-01, 01/2024. */
function parseMonthToken(token: string): MonthKey | null {
  const t = token.trim();
  let m = /^([A-Za-z]{3,9})\.?[\s\-/]*(\d{4})$/.exec(t);
  if (m) {
    const month = MONTH_LOOKUP[m[1].slice(0, 3).toLowerCase()];
    return month ? toMonthKey(Number(m[2]), month) : null;
  }
  m = /^(\d{4})[-/](\d{1,2})$/.exec(t);
  if (m) return toMonthKey(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})[-/](\d{4})$/.exec(t);
  if (m) return toMonthKey(Number(m[2]), Number(m[1]));
  return null;
}

const MONTH_TOKEN_RE =
  /[A-Za-z]{3,9}\.?[\s\-/]*\d{4}|\d{4}[-/]\d{1,2}|\d{1,2}[-/]\d{4}/g;

export type PeriodParse =
  | { ok: true; start: MonthKey; end: MonthKey; months: number }
  | { ok: false; error: string };

/**
 * "Jan 2024 - Dec 2025", "Oct 2025 – Jun 2026", "2024-01 to 2025-12" …
 * A single month is a one-month period.
 */
export function parsePeriod(text: string): PeriodParse {
  const tokens = (text ?? '').match(MONTH_TOKEN_RE) ?? [];
  if (tokens.length === 0 || tokens.length > 2) {
    return { ok: false, error: 'Period should look like "Jan 2024 - Dec 2025".' };
  }
  const start = parseMonthToken(tokens[0]!);
  const end = parseMonthToken(tokens[tokens.length - 1]!);
  if (!start || !end) {
    return { ok: false, error: `Couldn't read the months in "${text}".` };
  }
  if (end < start) {
    return { ok: false, error: 'The period ends before it starts.' };
  }
  const months = monthsInclusive(start, end);
  if (months > 120) {
    return { ok: false, error: 'A period can cover at most 10 years.' };
  }
  return { ok: true, start, end, months };
}

export type AmountParse = { ok: true; amount: number } | { ok: false; error: string };

/** "45000", "₦45,000", "NGN 1,200,000.00" → whole naira. */
export function parseAmount(raw: string | number): AmountParse {
  const text = String(raw ?? '')
    .replace(/[₦,\s]/g, '')
    .replace(/^NGN/i, '');
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: 'Amount must be a number.' };
  const value = Number(text);
  if (!Number.isInteger(value)) {
    return { ok: false, error: 'Amount must be a whole number of naira.' };
  }
  if (value <= 0) return { ok: false, error: 'Amount must be more than zero.' };
  if (value > 2_000_000_000) return { ok: false, error: 'That amount is too large.' };
  return { ok: true, amount: value };
}
