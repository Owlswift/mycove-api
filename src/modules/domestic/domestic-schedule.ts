/**
 * When a domestic staff member is allowed to ask for an entry code. All in
 * the estate's own (Lagos) time. A resident can leave the schedule empty, in
 * which case the staff member can get a code at any time.
 */

/** They may ask this long before their start time — a cleaner arriving at 7:45 for an 8:00 start. */
export const EARLY_MINUTES = 15;

/** How long a generated code stays valid at the gate. */
export const CODE_VALID_MINUTES = 10;

/** How long an approval request waits for the resident before it lapses. */
export const APPROVAL_WAIT_MINUTES = 10;

export interface StaffSchedule {
  /** 0 = Sunday … 6 = Saturday; empty = any day. */
  days: number[];
  /** "HH:mm"; both null = any time of day. */
  startTime: string | null;
  endTime: string | null;
}

export type ScheduleCheck =
  | { allowed: true }
  | { allowed: false; reason: 'WRONG_DAY' | 'TOO_EARLY' | 'TOO_LATE'; message: string };

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function toMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** "08:00" → "8:00 AM" */
export function formatTime(time: string): string {
  const total = toMinutes(time);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Tuesdays and Thursdays" / "every day" */
export function describeDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0 || sorted.length === 7) return 'every day';
  const names = sorted.map((d) => `${DAY_NAMES[d]}s`);
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Tuesdays, 8:00 AM to 2:00 PM" — how the schedule reads to people. */
export function describeSchedule(s: StaffSchedule): string {
  const days = describeDays(s.days);
  if (!s.startTime || !s.endTime) return s.days.length === 0 ? 'any time' : `${days}, any time`;
  return `${days}, ${formatTime(s.startTime)} to ${formatTime(s.endTime)}`;
}

/** The Lagos weekday (0-6) and minutes since midnight for an instant. */
export function estateClock(now: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')!.value;
  const hour = Number(parts.find((p) => p.type === 'hour')!.value);
  const minute = Number(parts.find((p) => p.type === 'minute')!.value);
  return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday), minutes: hour * 60 + minute };
}

export function checkSchedule(schedule: StaffSchedule, now: Date = new Date()): ScheduleCheck {
  const { day, minutes } = estateClock(now);

  if (schedule.days.length > 0 && !schedule.days.includes(day)) {
    return {
      allowed: false,
      reason: 'WRONG_DAY',
      message: `You can only get a code on ${describeDays(schedule.days)}.`,
    };
  }
  if (!schedule.startTime || !schedule.endTime) return { allowed: true };

  const opensAt = toMinutes(schedule.startTime) - EARLY_MINUTES;
  const closesAt = toMinutes(schedule.endTime);
  if (minutes < opensAt) {
    const opens = Math.max(0, opensAt);
    const label = formatTime(`${String(Math.floor(opens / 60)).padStart(2, '0')}:${String(opens % 60).padStart(2, '0')}`);
    return { allowed: false, reason: 'TOO_EARLY', message: `It's too early. You can get a code from ${label}.` };
  }
  if (minutes > closesAt) {
    return {
      allowed: false,
      reason: 'TOO_LATE',
      message: `Your time today ended at ${formatTime(schedule.endTime)}.`,
    };
  }
  return { allowed: true };
}
