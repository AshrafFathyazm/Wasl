import { formatNumber, type Lang } from '../../lib/formatters';

/* ============================================================================
 * dashboardFormat.ts — the four things this screen renders that nothing else does
 * ============================================================================
 * A bare calendar date, an age, a duration, and the minutes since a timestamp.
 * Every one of them keeps Latin digits in Arabic (BR-8.13) by going through
 * `formatNumber`, and none of them contains a user-facing WORD: the units come
 * from the catalogue at the call site, because "d" and "h" are not the same
 * letters in Arabic.
 * ========================================================================== */

/** Months, by their 1-based number, in both languages. Short forms — the axis
 *  labels and the chart tooltip are the only consumers and both are tight. */
const MONTHS: Record<Lang, readonly string[]> = {
  en: [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ],
  ar: [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ],
};

/**
 * The parts of a bare `yyyy-MM-dd`, or `null` when it is not one.
 *
 * **`new Date("2026-08-10")` IS THE DEFECT THIS FILE EXISTS FOR.** ECMAScript
 * parses a date-only string as UTC midnight, so every browser west of the
 * organisation's timezone renders the day BEFORE — the chart shifts one column,
 * the totals stay right, nothing throws, and the shape still looks like a
 * plausible fortnight. `formatLocalDate.test.ts` carries the `new Date()`
 * implementation as its failing case, so the reason this splits a string by hand
 * is visible in the test rather than only in this comment.
 */
function parts(localDate: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);

  if (!match) return null;

  const [, year, month, day] = match;

  return { year: Number(year), month: Number(month), day: Number(day) };
}

/** The day of the month, for the chart's x axis. Empty for a malformed value —
 *  a missing tick is a gap; `NaN` is a rendering fault on the screen. */
export function formatLocalDay(localDate: string, lang: Lang): string {
  const value = parts(localDate);

  return value === null ? '' : formatNumber(value.day, lang);
}

/** `10 Aug` / `10 أغسطس`. The chart tooltip's heading. */
export function formatLocalDate(localDate: string, lang: Lang): string {
  const value = parts(localDate);

  if (value === null) return '';

  const month = MONTHS[lang][value.month - 1] ?? '';

  return `${formatNumber(value.day, lang)} ${month}`;
}

/**
 * An age, as the design writes it: `9h` under a day, `4d` from a day up.
 *
 * Returns the NUMBER and the UNIT separately so the caller can put them through
 * the catalogue — the design's compact form is "4d" in English and "4 ي" in
 * Arabic, and a function that returned "4d" would have baked one language in.
 */
export function ageParts(hours: number): { unit: 'hours' | 'days'; value: number } {
  return hours < 24
    ? { unit: 'hours', value: Math.max(0, Math.trunc(hours)) }
    : { unit: 'days', value: Math.trunc(hours / 24) };
}

/**
 * A duration in minutes, split the way the design's medians read: `2h 10m`,
 * `1d 4h`, `45m`.
 *
 * **The largest two units, never three.** The design shows `1d 4h`; adding the
 * minutes to that would make the median look like a measurement rather than a
 * summary, and the third unit is below the precision anyone acts on.
 */
export function durationParts(
  minutes: number,
): readonly { unit: 'days' | 'hours' | 'minutes'; value: number }[] {
  const total = Math.max(0, Math.round(minutes));
  const days = Math.trunc(total / 1440);
  const hours = Math.trunc((total % 1440) / 60);
  const rest = total % 60;

  if (days > 0) {
    return hours > 0
      ? [
          { unit: 'days', value: days },
          { unit: 'hours', value: hours },
        ]
      : [{ unit: 'days', value: days }];
  }

  if (hours > 0) {
    return rest > 0
      ? [
          { unit: 'hours', value: hours },
          { unit: 'minutes', value: rest },
        ]
      : [{ unit: 'hours', value: hours }];
  }

  return [{ unit: 'minutes', value: rest }];
}

/**
 * Whole minutes since an instant, floored at zero.
 *
 * Fed from React Query's `dataUpdatedAt` — WHEN THE DATA WAS TRUE, not when the
 * component mounted. `026` records the same distinction on the ticket list: a
 * clock started on mount says "updated now" after a remount that fetched
 * nothing.
 */
export function minutesSince(epochMs: number, now: number = Date.now()): number {
  const minutes = Math.floor((now - epochMs) / 60_000);

  return minutes > 0 ? minutes : 0;
}
