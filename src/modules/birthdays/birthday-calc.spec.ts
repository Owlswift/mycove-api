import {
  birthdayIn,
  daysUntil,
  isValidBirthday,
  nextBirthday,
  partyAnnouncement,
  spotlightMessage,
  todayInEstate,
} from './birthday-calc';

const d = (year: number, month: number, day: number) => ({ year, month, day });

describe('birthday dates', () => {
  it('accepts real days, including 29 Feb, and rejects impossible ones', () => {
    expect(isValidBirthday(3, 12)).toBe(true);
    expect(isValidBirthday(2, 29)).toBe(true);
    expect(isValidBirthday(2, 30)).toBe(false);
    expect(isValidBirthday(4, 31)).toBe(false);
    expect(isValidBirthday(13, 1)).toBe(false);
    expect(isValidBirthday(1, 0)).toBe(false);
  });

  it("uses the estate's calendar, not UTC: 23:30 UTC on 11 Sep is already 12 Sep in Lagos", () => {
    expect(todayInEstate(new Date('2026-09-11T23:30:00Z'))).toEqual(d(2026, 9, 12));
    expect(todayInEstate(new Date('2026-09-11T10:00:00Z'))).toEqual(d(2026, 9, 11));
  });

  it('finds the next birthday this year or the following one', () => {
    expect(nextBirthday(d(2026, 9, 19), 12, 25)).toEqual(d(2026, 12, 25));
    expect(nextBirthday(d(2026, 9, 19), 9, 19)).toEqual(d(2026, 9, 19));
    expect(nextBirthday(d(2026, 9, 19), 9, 18)).toEqual(d(2027, 9, 18));
  });

  it('counts days across a year end', () => {
    expect(daysUntil(d(2026, 12, 28), nextBirthday(d(2026, 12, 28), 1, 2))).toBe(5);
    expect(daysUntil(d(2026, 9, 19), d(2026, 9, 19))).toBe(0);
  });

  it('observes 29 Feb on 28 Feb in a year without one', () => {
    expect(birthdayIn(2027, 2, 29)).toEqual(d(2027, 2, 28));
    expect(birthdayIn(2028, 2, 29)).toEqual(d(2028, 2, 29));
  });
});

describe('automatic messages', () => {
  const base = { firstName: 'Ada', birthday: { month: 3, day: 12 }, isToday: false, hasParty: false, partyAt: null, partyVenue: null };

  it('before the day, with no party', () => {
    expect(spotlightMessage(base)).toBe("Ada's birthday is on 12 March! 🎂");
  });

  it('on the day, with no party, asks the estate to say happy birthday', () => {
    expect(spotlightMessage({ ...base, isToday: true })).toContain('Wish them a very happy birthday');
  });

  it('a party adds the time and venue', () => {
    const msg = spotlightMessage({ ...base, hasParty: true, partyAt: new Date('2026-03-14T15:00:00Z'), partyVenue: 'the clubhouse' });
    expect(msg).toContain('Sat 14 Mar, 4:00 PM at the clubhouse');
    expect(msg).toContain('everyone is invited');
  });

  it('the estate-wide party notice carries name, time and venue', () => {
    const msg = partyAnnouncement({ fullName: 'Ada Obi', partyAt: new Date('2026-03-14T15:00:00Z'), partyVenue: 'Block C clubhouse', updated: false });
    expect(msg).toBe('Birthday party: Ada Obi is having a birthday party on Sat 14 Mar, 4:00 PM at Block C clubhouse. Everyone is invited!');
    expect(partyAnnouncement({ fullName: 'Ada Obi', partyAt: new Date('2026-03-14T15:00:00Z'), partyVenue: null, updated: true })).toContain('Party update');
  });
});
