import {
  billingStartMonth,
  computeDues,
  formatMonth,
  monthsInclusive,
  parseAmount,
  parsePeriod,
  RateBook,
  summarizeResident,
} from './dues-calc';

const at = (iso: string) => new Date(iso);
const rate = (residentType: 'REGULAR' | 'COMMERCIAL', monthlyAmount: number, effectiveMonth: string, created = '2026-01-01') => ({
  residentType,
  monthlyAmount,
  effectiveMonth,
  createdAt: at(created),
});

describe('RateBook', () => {
  const book = new RateBook([
    rate('REGULAR', 40000, '2024-01'),
    rate('REGULAR', 45000, '2026-01'),
    rate('COMMERCIAL', 90000, '2025-06'),
  ]);

  it('prices each month at the rate in effect for it', () => {
    expect(book.rateFor('REGULAR', '2025-12')).toBe(40000);
    expect(book.rateFor('REGULAR', '2026-01')).toBe(45000);
    expect(book.rateFor('REGULAR', '2030-05')).toBe(45000);
  });

  it('uses the first regular rate for months before it was set', () => {
    expect(book.rateFor('REGULAR', '2022-03')).toBe(40000);
  });

  it('bills commercial residents at the regular rate until their own rate takes effect', () => {
    // commercial 90,000 starts 2025-06; before that, regular applied
    expect(book.rateFor('COMMERCIAL', '2025-05')).toBe(40000);
    expect(book.rateFor('COMMERCIAL', '2025-06')).toBe(90000);
    expect(book.rateFor('COMMERCIAL', '2026-03')).toBe(90000);
    expect(book.entryFor('COMMERCIAL', '2025-05')?.residentType).toBe('REGULAR');
    expect(book.entryFor('COMMERCIAL', '2025-06')?.residentType).toBe('COMMERCIAL');
  });

  it('bills commercial at the regular rate for every month when no commercial rate exists', () => {
    const onlyRegular = new RateBook([rate('REGULAR', 45000, '2000-01')]);
    expect(onlyRegular.rateFor('COMMERCIAL', '2026-09')).toBe(45000);
  });

  it('setting a commercial rate for NEXT month leaves this and earlier months untouched', () => {
    const b = new RateBook([rate('REGULAR', 45000, '2000-01'), rate('COMMERCIAL', 120000, '2026-10')]);
    expect(b.rateFor('COMMERCIAL', '2026-09')).toBe(45000);
    expect(b.rateFor('COMMERCIAL', '2025-01')).toBe(45000);
    expect(b.rateFor('COMMERCIAL', '2026-10')).toBe(120000);
  });

  it('lets a newer entry for the same month replace an older one', () => {
    const corrected = new RateBook([
      rate('REGULAR', 45000, '2026-10', '2026-09-01'),
      rate('REGULAR', 47000, '2026-10', '2026-09-15'),
    ]);
    expect(corrected.rateFor('REGULAR', '2026-10')).toBe(47000);
  });

  it('has no rate at all when nothing was ever set', () => {
    expect(new RateBook([]).rateFor('REGULAR', '2026-01')).toBeNull();
    expect(new RateBook([]).chargeForPeriod('REGULAR', '2026-01', '2026-03')).toBeNull();
  });

  it('adds up a period month by month across a rate change', () => {
    // Nov + Dec 2025 at 40,000, Jan + Feb 2026 at 45,000
    expect(book.chargeForPeriod('REGULAR', '2025-11', '2026-02')).toBe(40000 * 2 + 45000 * 2);
  });
});

describe('computeDues', () => {
  const flat = new RateBook([rate('REGULAR', 45000, '2000-01')]);

  it('bills every month from the start month through the current month, inclusive', () => {
    const d = computeDues({ startMonth: '2026-07', endMonth: '2026-09', residentType: 'REGULAR', rates: flat, totalPaid: 0 })!;
    expect(d.monthsElapsed).toBe(3);
    expect(d.billed).toBe(135000);
    expect(d.balance).toBe(135000);
    expect(d.monthsOwed).toBe(3);
    expect(d.monthsCovered).toBe(0);
  });

  it('counts payments against the oldest months first', () => {
    const d = computeDues({ startMonth: '2026-07', endMonth: '2026-09', residentType: 'REGULAR', rates: flat, totalPaid: 100000 })!;
    expect(d.balance).toBe(35000);
    expect(d.monthsCovered).toBe(2); // Jul + Aug covered; Sep partly
    expect(d.monthsOwed).toBe(1);
    expect(d.months.map((m) => m.paid)).toEqual([45000, 45000, 10000]);
  });

  it('shows a credit, not a negative balance, when paid ahead', () => {
    const d = computeDues({ startMonth: '2026-09', endMonth: '2026-09', residentType: 'REGULAR', rates: flat, totalPaid: 100000 })!;
    expect(d.balance).toBe(0);
    expect(d.credit).toBe(55000);
    expect(d.monthsOwed).toBe(0);
  });

  it('carries unpaid months across years instead of resetting each January', () => {
    const d = computeDues({ startMonth: '2025-11', endMonth: '2026-02', residentType: 'REGULAR', rates: flat, totalPaid: 45000 })!;
    expect(d.monthsElapsed).toBe(4);
    expect(d.balance).toBe(135000);
  });

  it('charges commercial residents their own rate', () => {
    const book = new RateBook([rate('REGULAR', 45000, '2000-01'), rate('COMMERCIAL', 120000, '2000-01')]);
    const reg = computeDues({ startMonth: '2026-09', endMonth: '2026-09', residentType: 'REGULAR', rates: book, totalPaid: 0 })!;
    const com = computeDues({ startMonth: '2026-09', endMonth: '2026-09', residentType: 'COMMERCIAL', rates: book, totalPaid: 0 })!;
    expect(reg.balance).toBe(45000);
    expect(com.balance).toBe(120000);
  });

  it('a rate change only affects months from its effective month onward', () => {
    const book = new RateBook([rate('REGULAR', 40000, '2000-01'), rate('REGULAR', 50000, '2026-10')]);
    const before = computeDues({ startMonth: '2026-08', endMonth: '2026-09', residentType: 'REGULAR', rates: book, totalPaid: 0 })!;
    const after = computeDues({ startMonth: '2026-08', endMonth: '2026-11', residentType: 'REGULAR', rates: book, totalPaid: 0 })!;
    expect(before.billed).toBe(80000); // unchanged by the future rise
    expect(after.billed).toBe(40000 * 2 + 50000 * 2);
  });

  it('accrues nothing when the estate has no rate', () => {
    expect(computeDues({ startMonth: '2026-09', endMonth: '2026-09', residentType: 'REGULAR', rates: new RateBook([]), totalPaid: 0 })).toBeNull();
  });
});

describe('billing start and imported payments', () => {
  const flat = new RateBook([rate('REGULAR', 45000, '2000-01')]);
  const NOW = at('2026-09-19T12:00:00Z');

  it('starts billing when they joined the app if nothing older is known', () => {
    expect(billingStartMonth(at('2026-09-05T10:00:00Z'), [])).toBe('2026-09');
  });

  it('starts billing at the earliest imported period, so earlier move-ins are not lost', () => {
    expect(billingStartMonth(at('2026-09-05T10:00:00Z'), [{ periodStart: '2026-01' }, { periodStart: '2024-01' }, { periodStart: null }])).toBe('2024-01');
  });

  it('does not push billing later than the join month', () => {
    expect(billingStartMonth(at('2026-09-05T10:00:00Z'), [{ periodStart: '2027-01' }])).toBe('2026-09');
  });

  it('starts billing at the recorded move-in month, whatever the join date or imported periods say', () => {
    expect(billingStartMonth(at('2026-09-05T10:00:00Z'), [{ periodStart: '2024-01' }], '2025-03')).toBe('2025-03');
    expect(billingStartMonth(at('2026-09-05T10:00:00Z'), [], '2019-11')).toBe('2019-11');
  });

  it('with a move-in month and a payment with no period: owes what is billed since move-in less what was paid', () => {
    const s = summarizeResident({
      joinedAt: at('2026-08-01T00:00:00Z'),
      moveInMonth: '2026-01',
      residentType: 'REGULAR',
      payments: [{ amount: 45000 * 6, periodStart: null }],
      rates: flat,
      now: NOW,
    })!;
    expect(s.startMonth).toBe('2026-01');
    expect(s.monthsElapsed).toBe(9);
    expect(s.balance).toBe(45000 * 3);
    expect(s.monthsOwed).toBe(3);
  });

  it('a rate rise after move-in means the same old payment covers fewer months', () => {
    const book = new RateBook([rate('REGULAR', 30000, '2000-01'), rate('REGULAR', 45000, '2026-07')]);
    const s = summarizeResident({
      joinedAt: at('2026-08-01T00:00:00Z'),
      moveInMonth: '2026-01',
      residentType: 'REGULAR',
      payments: [{ amount: 30000 * 6, periodStart: null }],
      rates: book,
      now: NOW,
    })!;
    expect(s.billed).toBe(30000 * 6 + 45000 * 3);
    expect(s.balance).toBe(45000 * 3);
  });

  it('moved in Oct 2025, paid in full for Oct 2025 - Jun 2026: owes Jul-Sep 2026', () => {
    const s = summarizeResident({
      joinedAt: at('2026-09-05T10:00:00Z'),
      residentType: 'REGULAR',
      payments: [{ amount: 45000 * 9, periodStart: '2025-10' }],
      rates: flat,
      now: NOW,
    })!;
    expect(s.startMonth).toBe('2025-10');
    expect(s.monthsElapsed).toBe(12); // Oct 2025 .. Sep 2026
    expect(s.balance).toBe(45000 * 3);
    expect(s.monthsOwed).toBe(3);
  });

  it('paid Jan 2024 - Dec 2025 in full: owes only what accrued since', () => {
    const s = summarizeResident({
      joinedAt: at('2026-09-05T10:00:00Z'),
      residentType: 'REGULAR',
      payments: [{ amount: 45000 * 24, periodStart: '2024-01' }],
      rates: flat,
      now: NOW,
    })!;
    expect(s.balance).toBe(45000 * 9); // Jan-Sep 2026
    expect(s.monthsOwed).toBe(9);
  });

  it('a partial payment for a period leaves the shortfall owed', () => {
    const s = summarizeResident({
      joinedAt: at('2026-09-05T10:00:00Z'),
      residentType: 'REGULAR',
      payments: [{ amount: 300000, periodStart: '2025-10' }],
      rates: flat,
      now: NOW,
    })!;
    expect(s.balance).toBe(45000 * 12 - 300000);
  });

  it('adds later app payments on top of imported ones', () => {
    const s = summarizeResident({
      joinedAt: at('2026-09-05T10:00:00Z'),
      residentType: 'REGULAR',
      payments: [
        { amount: 45000 * 9, periodStart: '2025-10' },
        { amount: 45000 * 3 },
      ],
      rates: flat,
      now: NOW,
    })!;
    expect(s.balance).toBe(0);
    expect(s.monthsOwed).toBe(0);
  });
});

describe('parsePeriod', () => {
  const ok = (text: string) => {
    const r = parsePeriod(text);
    if (!r.ok) throw new Error(`expected "${text}" to parse: ${r.error}`);
    return r;
  };

  it.each([
    ['Jan 2024 - Dec 2025', '2024-01', '2025-12', 24],
    ['Oct 2025 – Jun 2026', '2025-10', '2026-06', 9],
    ['October 2025 to June 2026', '2025-10', '2026-06', 9],
    ['2024-01 to 2025-12', '2024-01', '2025-12', 24],
    ['2024-01 - 2025-12', '2024-01', '2025-12', 24],
    ['01/2024 - 12/2025', '2024-01', '2025-12', 24],
    ['Jan-2024 to Dec-2025', '2024-01', '2025-12', 24],
    ['Sept 2025 - Sep 2025', '2025-09', '2025-09', 1],
    ['Mar 2025', '2025-03', '2025-03', 1],
  ])('reads %s', (text, start, end, months) => {
    const r = ok(text);
    expect([r.start, r.end, r.months]).toEqual([start, end, months]);
  });

  it.each([['', 'empty'], ['soon', 'no months'], ['Dec 2025 - Jan 2024', 'ends before it starts'], ['Foo 2024 - Bar 2025', 'not months'], ['Jan 2000 - Jan 2020', 'longer than 10 years']])(
    'rejects "%s" (%s)',
    (text) => {
      expect(parsePeriod(text).ok).toBe(false);
    },
  );
});

describe('parseAmount', () => {
  it.each([
    ['45000', 45000],
    ['₦45,000', 45000],
    ['NGN 1,200,000', 1200000],
    ['45000.00', 45000],
    [45000, 45000],
  ])('reads %s', (raw, amount) => {
    expect(parseAmount(raw)).toEqual({ ok: true, amount });
  });

  it.each([['abc'], [''], ['0'], ['-5'], ['45000.50']])('rejects "%s"', (raw) => {
    expect(parseAmount(raw).ok).toBe(false);
  });
});

describe('month helpers', () => {
  it('counts months inclusively and formats them', () => {
    expect(monthsInclusive('2024-01', '2025-12')).toBe(24);
    expect(monthsInclusive('2026-09', '2026-08')).toBe(0);
    expect(formatMonth('2024-01')).toBe('Jan 2024');
  });
});
