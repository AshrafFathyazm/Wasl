/* ============================================================================
 * formatters.ts
 * ============================================================================
 * The product's first date formatter. `014-language-preference-and-rtl` owns
 * this file; `026` is the first caller.
 *
 * TWO SILENT DEFAULTS, and both are why this is a module rather than an
 * `Intl.DateTimeFormat` at each call site.
 *
 *   1. `ar` DEFAULTS TO ARABIC-INDIC DIGITS. `new Intl.DateTimeFormat('ar')`
 *      renders ٢٩/٠٨/٢٠٢٦. BR-8.13 pins Latin digits to identifiers and
 *      timestamps, so a table showing `TCK-2026-001042` beside `٢٩/٠٨/٢٠٢٦` is
 *      two numeral systems in one row. `-nu-latn` is what stops that, and
 *      dropping it produces a screen that looks deliberate.
 *
 *   2. `ar-SA` DEFAULTS TO THE ISLAMIC CALENDAR. `new Intl.DateTimeFormat('ar-SA')`
 *      returns a Hijri date — a different YEAR, not a different format. Nothing
 *      throws, nothing looks broken, and a ticket created in 2026 reads as 1448.
 *      `-ca-gregory` pins it, and it must be pinned even though the locale here
 *      is plain `ar`, because a future `ar-SA` preference would otherwise change
 *      the calendar silently.
 *
 * Neither default announces itself. Both are asserted in formatters.test.ts.
 * ============================================================================ */

export type Lang = 'ar' | 'en';

/** `-ca-gregory` and `-nu-latn` are load-bearing. See the header. */
const DATE_LOCALE: Record<Lang, string> = {
  ar: 'ar-u-ca-gregory-nu-latn',
  en: 'en-GB',
};

/** Latin digits under `ar` too — a page number is not an identifier, but a
 *  COUNT beside a Latin-digit date is the same mixed-numeral problem. `014`
 *  may revisit this for body copy; a table is not body copy. */
const NUMBER_LOCALE: Record<Lang, string> = {
  ar: 'ar-u-nu-latn',
  en: 'en-GB',
};

/* ICU embeds bidi control characters in some locales — LRM (U+200E), RLM
 * (U+200F) and ALM (U+061C). They are invisible, they survive a copy/paste into
 * a search box, and they make an equality assertion fail against a string that
 * looks identical. Stripped at the boundary rather than at each assertion. */
const BIDI_MARKS = /[‎‏؜]/g;

const strip = (s: string) => s.replace(BIDI_MARKS, '');

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(lang: Lang, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  /* Constructing Intl.DateTimeFormat is expensive and a table calls this once
   * per row per render. Keyed on the locale AND the options, because two
   * different shapes in one language must not share an instance. */
  const key = `${lang}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(DATE_LOCALE[lang], options);
    cache.set(key, f);
  }
  return f;
}

/** `dd/MM/yyyy` — the same width in every month and both languages, which is
 *  what lets a date column carry a fixed share of the table. */
export function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return strip(
    formatter(lang, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d),
  );
}

/**
 * LONG FORM — `24 August 2026` / `24 أغسطس 2026`.
 *
 * Not a nicety. The localization settings screen previews a date so the reader
 * can see the format change BEFORE committing to a language they may not be
 * able to read. With `formatDate` that preview shows `24/08/2026` in both,
 * because BR-8.13 pins Latin digits and the numeric form is identical — the
 * callout renders, changes nothing, and quietly claims it did something.
 *
 * The month NAME is the only part of a date that differs between these two
 * locales once the digits are pinned, so it is the only thing the preview can
 * honestly show. The screen design says `24 August 2026`; the numeric form was
 * mine and it was wrong.
 */
export function formatDateLong(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return strip(
    formatter(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(d),
  );
}

/** Date and time. For a timeline entry, where the hour is the point. */
export function formatDateTime(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return strip(
    formatter(lang, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d),
  );
}

/** Counts, page numbers, totals. NOT identifiers — a ticket number is a string
 *  and never reaches a number formatter (BR-8.13). */
export function formatNumber(value: number, lang: Lang): string {
  return strip(new Intl.NumberFormat(NUMBER_LOCALE[lang]).format(value));
}

/* ============================================================================
 * formatPhone — DISPLAY ONLY, added by `032`
 * ============================================================================
 * The server stores and returns E.164: `+966501234567`. That is correct on the
 * wire and hard to read in a strip beside a name, so the design groups it —
 * `+966 50 123 4567`.
 *
 * WHAT IS COPIED IS STILL THE RAW VALUE. `CopyValue` takes the API's string and
 * renders this one, which is the whole reason that split exists: a grouped
 * number pasted into a dialler or a form field fails validation. `032` AC-4
 * asserts the clipboard against the API value rather than against the DOM, and
 * this function is what makes that assertion mean something for the phone rather
 * than only for the truncated id.
 *
 * SAUDI NUMBERS ONLY, AND EVERYTHING ELSE IS RETURNED UNCHANGED. Grouping is
 * per-country — `+44 20 7123 4567` and `+1 415 555 0132` break differently — and
 * a wrong grouping is worse than none: it reads as a typo in someone's number.
 * `POST /api/customers` accepts any parseable E.164 (BR-4.3), so the general case
 * is real and is left alone deliberately rather than guessed at.
 *
 * NOT LOCALE-DEPENDENT, and it takes no `lang`. The digits stay Latin in both
 * languages (BR-8.13) and the grouping of a phone number is a property of the
 * number, not of the reader.
 * ========================================================================== */
export function formatPhone(e164: string): string {
  /* `+966` + `5` + eight digits — a Saudi mobile, which is every number the
   * product's own seed data and both design documents use. */
  const saudiMobile = /^\+966(5\d)(\d{3})(\d{4})$/.exec(e164);
  if (saudiMobile) {
    return `+966 ${saudiMobile[1]} ${saudiMobile[2]} ${saudiMobile[3]}`;
  }

  return e164;
}
