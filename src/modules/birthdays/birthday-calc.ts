/**
 * Birthday maths, free of database access. Everything is in Lagos time —
 * the estate's own calendar — so a birthday "today" means today there.
 */

export const ESTATE_TIME_ZONE = 'Africa/Lagos';

/** How many days before the birthday the celebrant is asked for a photo and whether there'll be a party. */
export const PROMPT_DAYS_BEFORE = 7;

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export interface EstateToday extends CalendarDate {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

/** Today's date on the estate's calendar. */
export function todayInEstate(now: Date = new Date()): EstateToday {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ESTATE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: ESTATE_TIME_ZONE, weekday: 'short' }).format(now);
  return { year: get('year'), month: get('month'), day: get('day'), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday) };
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(month: number, year: number): number {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

/** A real day-of-year — 29 Feb is accepted (it happens in leap years). */
export function isValidBirthday(month: number, day: number): boolean {
  return Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(month, 2024);
}

function utcDays(d: CalendarDate): number {
  return Math.round(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000);
}

/**
 * The date the birthday is observed in [year]. Someone born on 29 Feb
 * celebrates on 28 Feb in years that have none.
 */
export function birthdayIn(year: number, month: number, day: number): CalendarDate {
  if (month === 2 && day === 29 && !isLeap(year)) return { year, month: 2, day: 28 };
  return { year, month, day };
}

/** The birthday still to come (or happening today) — this year's, else next year's. */
export function nextBirthday(today: CalendarDate, month: number, day: number): CalendarDate {
  const thisYear = birthdayIn(today.year, month, day);
  return utcDays(thisYear) >= utcDays(today) ? thisYear : birthdayIn(today.year + 1, month, day);
}

export function daysUntil(today: CalendarDate, target: CalendarDate): number {
  return utcDays(target) - utcDays(today);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "12 March" */
export function formatBirthday(d: { month: number; day: number }): string {
  return `${d.day} ${MONTHS[d.month - 1]}`;
}

/** "Sat 12 Sep, 4:00 PM" in Lagos time. */
export function formatPartyTime(at: Date): string {
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: ESTATE_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(at);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: ESTATE_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
  return `${date.replace(',', '')}, ${time}`;
}

export interface CelebrationMessageInput {
  firstName: string;
  birthday: { month: number; day: number };
  isToday: boolean;
  hasParty: boolean | null;
  partyAt: Date | null;
  partyVenue: string | null;
}

/** The automatic line shown on the spotlight card. */
export function spotlightMessage(input: CelebrationMessageInput): string {
  const { firstName, isToday, hasParty, partyAt, partyVenue } = input;
  const lead = isToday
    ? `Today is ${firstName}'s birthday! 🎂 Wish them a very happy birthday.`
    : `${firstName}'s birthday is on ${formatBirthday(input.birthday)}! 🎂`;
  if (hasParty && partyAt) {
    const where = partyVenue ? ` at ${partyVenue}` : '';
    return `${lead} There's a party on ${formatPartyTime(partyAt)}${where} — everyone is invited.`;
  }
  return lead;
}

/** The estate-wide notification when a celebrant says there will be a party. */
export function partyAnnouncement(input: {
  fullName: string;
  partyAt: Date;
  partyVenue: string | null;
  updated: boolean;
}): string {
  const where = input.partyVenue ? ` at ${input.partyVenue}` : '';
  const prefix = input.updated ? 'Party update' : 'Birthday party';
  return `${prefix}: ${input.fullName} is having a birthday party on ${formatPartyTime(input.partyAt)}${where}. Everyone is invited!`;
}
