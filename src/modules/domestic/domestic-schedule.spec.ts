import { checkSchedule, describeSchedule, formatTime } from './domestic-schedule';

// Tuesday 22 Sep 2026. Lagos is UTC+1, so 08:00 Lagos = 07:00Z.
const tue = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 22, h - 1, m));
const wed = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 23, h - 1, m));
const cleaner = { days: [2], startTime: '08:00', endTime: '14:00' };

describe('domestic staff schedule', () => {
  it('allows a code from 15 minutes before the start time', () => {
    expect(checkSchedule(cleaner, tue(7, 45)).allowed).toBe(true);
    expect(checkSchedule(cleaner, tue(8, 0)).allowed).toBe(true);
    expect(checkSchedule(cleaner, tue(14, 0)).allowed).toBe(true);
  });

  it('refuses before the early window and after the end, saying when', () => {
    const early = checkSchedule(cleaner, tue(7, 44));
    expect(early).toMatchObject({ allowed: false, reason: 'TOO_EARLY' });
    expect(early.allowed === false && early.message).toContain('7:45 AM');
    const late = checkSchedule(cleaner, tue(14, 1));
    expect(late).toMatchObject({ allowed: false, reason: 'TOO_LATE' });
    expect(late.allowed === false && late.message).toContain('2:00 PM');
  });

  it('refuses on the wrong day', () => {
    const r = checkSchedule(cleaner, wed(9));
    expect(r).toMatchObject({ allowed: false, reason: 'WRONG_DAY' });
    expect(r.allowed === false && r.message).toContain('Tuesdays');
  });

  it('with no schedule set, any day and time is allowed', () => {
    const open = { days: [], startTime: null, endTime: null };
    expect(checkSchedule(open, wed(3)).allowed).toBe(true);
    expect(checkSchedule(open, tue(23, 59)).allowed).toBe(true);
  });

  it('days only: any time on those days; times only: every day within them', () => {
    expect(checkSchedule({ days: [2], startTime: null, endTime: null }, tue(23)).allowed).toBe(true);
    expect(checkSchedule({ days: [2], startTime: null, endTime: null }, wed(9)).allowed).toBe(false);
    const hours = { days: [], startTime: '09:00', endTime: '17:00' };
    expect(checkSchedule(hours, wed(12)).allowed).toBe(true);
    expect(checkSchedule(hours, wed(18)).allowed).toBe(false);
  });

  it('reads the schedule back in plain words', () => {
    expect(describeSchedule(cleaner)).toBe('Tuesdays, 8:00 AM to 2:00 PM');
    expect(describeSchedule({ days: [1, 3, 5], startTime: null, endTime: null })).toBe('Mondays, Wednesdays and Fridays, any time');
    expect(describeSchedule({ days: [], startTime: null, endTime: null })).toBe('any time');
    expect(formatTime('00:05')).toBe('12:05 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
  });
});
