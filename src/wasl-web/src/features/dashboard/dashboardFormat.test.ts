import { describe, expect, it } from 'vitest';

import {
  ageParts,
  durationParts,
  formatLocalDate,
  formatLocalDay,
  minutesSince,
} from './dashboardFormat';

/*
 * TEST-020-20. The bare calendar date, and the three small formatters beside it.
 *
 * THE FIRST BLOCK IS THE ONE THAT MATTERS, and it carries the WRONG
 * implementation as its own failing case — `new Date("2026-08-10")` — because the
 * reason `formatLocalDate` splits a string by hand is invisible from the code.
 * ECMAScript parses a date-only string as UTC midnight, so every browser west of
 * the organisation's timezone renders the day BEFORE: the chart shifts one
 * column, the totals stay right, nothing throws, and the shape still looks like a
 * plausible fortnight.
 */

describe('a localDate is a calendar date, and never goes through new Date()', () => {
  it('formats the day the server sent, in both languages', () => {
    expect(formatLocalDate('2026-08-10', 'en')).toBe('10 Aug');
    expect(formatLocalDate('2026-08-10', 'ar')).toBe('10 أغسطس');
    expect(formatLocalDay('2026-08-10', 'en')).toBe('10');
  });

  it('DISAGREES with the new Date() implementation west of UTC — the failing case', () => {
    /* The zone is pinned explicitly rather than taken from the process, so this
     * runs the same way on a developer machine in Riyadh and in CI. New York is
     * UTC-4 in August, so UTC midnight on the 10th is 20:00 on the 9th. */
    const viaDate = new Date('2026-08-10').toLocaleDateString('en-GB', {
      timeZone: 'America/New_York',
      day: 'numeric',
      month: 'short',
    });

    expect(viaDate).toBe('9 Aug');

    /* The two must NOT agree. If somebody "simplifies" formatLocalDate into a
     * Date, this assertion is what goes red — and it goes red with the wrong
     * answer printed beside the right one. */
    expect(formatLocalDate('2026-08-10', 'en')).not.toBe(viaDate);
  });

  it('renders nothing for a value that is not a bare date, rather than NaN', () => {
    /* A missing tick is a gap in an axis; `NaN Aug` is a rendering fault the
     * reader reports as a broken screen. */
    for (const bad of ['2026-08-10T00:00:00Z', '10/08/2026', '', 'today', '2026-8-1']) {
      expect(formatLocalDate(bad, 'en'), bad).toBe('');
      expect(formatLocalDay(bad, 'en'), bad).toBe('');
    }
  });

  it('keeps Latin digits in Arabic — BR-8.13', () => {
    expect(formatLocalDay('2026-08-24', 'ar')).toBe('24');
    expect(formatLocalDate('2026-01-03', 'ar')).toBe('3 يناير');
  });
});

describe('an age is hours under a day and days from a day up', () => {
  it.each([
    [0, 'hours', 0],
    [9, 'hours', 9],
    [23, 'hours', 23],
    [24, 'days', 1],
    [51, 'days', 2],
    [99, 'days', 4],
  ])('%i hours is %s %i', (hours, unit, value) => {
    expect(ageParts(hours)).toEqual({ unit, value });
  });

  it('never reports a negative age', () => {
    /* A row created in the same millisecond as the request could otherwise
     * report a negative age once rounding is involved, and a negative age on a
     * support screen reads as data corruption. */
    expect(ageParts(-3)).toEqual({ unit: 'hours', value: 0 });
  });
});

describe('a duration is the largest two units, never three', () => {
  it.each([
    [45, [{ unit: 'minutes', value: 45 }]],
    [130, [{ unit: 'hours', value: 2 }, { unit: 'minutes', value: 10 }]],
    [120, [{ unit: 'hours', value: 2 }]],
    [1680, [{ unit: 'days', value: 1 }, { unit: 'hours', value: 4 }]],
    [1440, [{ unit: 'days', value: 1 }]],
    [0, [{ unit: 'minutes', value: 0 }]],
  ])('%i minutes', (minutes, expected) => {
    expect(durationParts(minutes)).toEqual(expected);
  });

  it('drops the minutes once there are days — a median is a summary', () => {
    /* 1d 4h 37m would read as a measurement. The design shows `1d 4h`, and the
     * third unit is below the precision anybody acts on. */
    expect(durationParts(1717)).toEqual([
      { unit: 'days', value: 1 },
      { unit: 'hours', value: 4 },
    ]);
  });
});

describe('minutesSince measures from when the data was true', () => {
  it('floors at zero and counts whole minutes', () => {
    const now = Date.UTC(2026, 8, 7, 12, 0, 0);

    expect(minutesSince(now, now)).toBe(0);
    expect(minutesSince(now - 59_000, now)).toBe(0);
    expect(minutesSince(now - 60_000, now)).toBe(1);
    expect(minutesSince(now - 3_600_000, now)).toBe(60);

    /* A clock that has gone backwards — a machine syncing time — must not render
     * "updated -3 minutes ago". */
    expect(minutesSince(now + 120_000, now)).toBe(0);
  });
});
