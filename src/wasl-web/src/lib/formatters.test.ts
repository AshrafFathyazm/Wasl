import { describe, expect, it } from 'vitest';

import { formatDate, formatDateLong, formatDateTime, formatNumber } from './formatters';

/*
 * TEST-026-02. Two of these assert a DEFAULT, not our code — and that is the
 * point. Both defaults are silent, both produce a plausible screen, and both
 * would be reintroduced by anyone "simplifying" the locale string back to `ar`.
 * So each is asserted twice: once that we do the right thing, and once that the
 * bare locale does the wrong one. Without the second half the test passes on an
 * engine where the default happens to agree with us.
 */

const ISO = '2026-08-29T14:07:00Z';

describe('AC-026-14 — Latin digits under ar, and a Gregorian year', () => {
  it('formats dd/MM/yyyy with Latin digits in Arabic', () => {
    expect(formatDate(ISO, 'ar')).toBe('29/08/2026');
  });

  it('formats the same instant identically in English', () => {
    /* The FORMAT is the same in both languages, deliberately: a date column
     * whose width changes with the locale cannot carry a fixed share of the
     * table. Only the digits were ever at risk. */
    expect(formatDate(ISO, 'en')).toBe('29/08/2026');
  });

  /* NEGATIVE CONTROL, PERMANENT — AND IT FAILED THE FIRST TIME IT RAN.
   *
   * It asserted that bare `ar` renders Arabic-Indic digits. In this ICU build
   * it does not: `ar` returns 29‏/08‏/2026 — Latin digits, with RLM
   * marks embedded. So the -nu-latn extension is doing nothing HERE, and a test
   * written to prove it was needed would have proved the opposite.
   *
   * The risk is still real, and `ar-EG` is where it shows: same language, same
   * code, Arabic-Indic digits. Which is the actual argument for pinning — not
   * that today's engine flips, but that the numbering system is a LOCALE
   * DEFAULT and a different build or a regional preference changes it under a
   * screen that nobody re-tested.
   *
   * Both halves are asserted: that the flip is a real behaviour of the platform,
   * and that our formatter does not flip regardless of which locale it is given. */
  it('is protecting against a real default — ar-EG flips to Arabic-Indic', () => {
    const flipped = new Intl.DateTimeFormat('ar-EG', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(ISO));
    expect(flipped).toMatch(/[٠-٩]/);
  });

  it('measured: bare ar is Latin in THIS engine, but carries RLM marks', () => {
    const bare = new Intl.DateTimeFormat('ar', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(ISO));
    /* Recorded so the next person does not read the pinning as pointless. */
    expect(bare).toMatch(/[0-9]/);
    expect(bare).toMatch(/[‎‏؜]/);
    /* And ours differs from it — the marks are gone. */
    expect(formatDate(ISO, 'ar')).not.toBe(bare);
  });

  /* The second silent default, and the more expensive one: a different YEAR. */
  it('is protecting against a real default — bare ar-SA gives a Hijri year', () => {
    const bare = new Intl.DateTimeFormat('ar-SA', { year: 'numeric' }).format(
      new Date(ISO),
    );
    expect(bare).not.toContain('2026');
  });

  it('pins the Gregorian calendar even though the locale is plain ar', () => {
    expect(formatDate(ISO, 'ar')).toContain('2026');
    expect(formatDateTime(ISO, 'ar')).toContain('2026');
  });
});

describe('the output carries no invisible characters', () => {
  /* ICU embeds LRM / RLM / ALM in some locales. They survive a copy into a
   * search box and they make an equality assertion fail against a string that
   * looks identical on screen — which is how this cost an hour once. */
  it('strips bidi control marks from every formatter', () => {
    const marks = /[‎‏؜]/;
    expect(formatDate(ISO, 'ar')).not.toMatch(marks);
    expect(formatDateTime(ISO, 'ar')).not.toMatch(marks);
    expect(formatNumber(1234, 'ar')).not.toMatch(marks);
  });
});

describe('numbers are counts, never identifiers', () => {
  it('uses Latin digits for counts in Arabic', () => {
    expect(formatNumber(1234, 'ar')).toBe('1,234');
    expect(formatNumber(1234, 'en')).toBe('1,234');
  });
});

describe('a malformed instant returns empty, not "Invalid Date"', () => {
  /* The server sends ISO 8601 and this should never fire. It exists because the
   * failure mode of not having it is the string "Invalid Date" rendered into a
   * table cell, in English, in an Arabic UI — which reads as a data problem
   * rather than a parsing one. */
  it.each(['', 'not-a-date', '2026-13-45T99:99:99Z'])('returns empty for %j', (bad) => {
    expect(formatDate(bad, 'ar')).toBe('');
    expect(formatDateTime(bad, 'en')).toBe('');
  });
});

/*
 * THE PREVIEW CALLOUT'S WHOLE JOB, asserted.
 *
 * `/settings/localization` shows a formatted date so the reader can see the
 * format change before committing to a language they may not be able to read
 * the rest of. That only works if the two locales actually produce different
 * strings — and with `formatDate` they do NOT: BR-8.13 pins Latin digits, so
 * `24/08/2026` is byte-identical in both. The callout would render, change
 * nothing, and claim it had.
 */
describe('formatDateLong — the one format that differs once digits are pinned', () => {
  it('produces DIFFERENT strings for ar and en', () => {
    const ar = formatDateLong(ISO, 'ar');
    const en = formatDateLong(ISO, 'en');
    expect(ar).not.toBe(en);
    /* The month name is the difference — everything else is pinned. */
    expect(en).toContain('August');
    expect(ar).not.toContain('August');
  });

  it('still writes Latin digits and a Gregorian year in Arabic', () => {
    const ar = formatDateLong(ISO, 'ar');
    expect(ar).toContain('2026');
    expect(ar).not.toMatch(/[٠-٩]/);
  });

  /* The negative half: this is why the callout cannot use `formatDate`. */
  it('is needed BECAUSE the numeric form is identical in both', () => {
    expect(formatDate(ISO, 'ar')).toBe(formatDate(ISO, 'en'));
  });
});
