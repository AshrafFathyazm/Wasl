import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { IconCalendar, IconChevronDown } from '../../icons/icons';
import { cx } from '../../lib/cx';
import type { Lang } from '../../lib/formatters';
import styles from './DateField.module.css';

/* ============================================================================
 * PROMOTED OUT OF `features/tickets` on 2026-09-01 — `033` §7.1
 * ============================================================================
 * It was `TicketDateField`. The customers directory needs the same control, and
 * a range filter cannot be expressed by any built primitive — `033` §7.1 refuses
 * the native `<input type="date">` for three measured reasons and names this the
 * ninth component with its written justification.
 *
 * WHAT CHANGED IN THE MOVE, and it is only these three things:
 *   the name          `TicketDateField` -> `DateField` (a range is two of them)
 *   the stylesheet    extracted by selector, not rewritten
 *   the catalogue     `tickets:` -> `common:cal.*`, because a calendar is not a
 *                     ticket and two callers of one control must not read two
 *                     vocabularies
 *
 * The BEHAVIOUR is untouched, including the three defects the product owner
 * reported against it on the ticket list: the Hijri toggle lives on the FIELD
 * (its state used to die with the popover, so a Hijri pick wrote the Gregorian
 * form into the trigger), the trigger text is composed from `formatToParts`
 * (`format()` chose the month NAME and the mixed runs reordered), and the
 * calendar opens upward over its own panel rather than over the table.
 * ========================================================================= */

/* =============================================================================
 * DateField — the panel's date input, PORTED from the 026 preview
 * =============================================================================
 * The calendar below is the preview's `Calendar` promoted to the product: the
 * preview proved the pieces the frames ask for — Monday-first clipped-word
 * weekdays, the day→month→decade drill through the title, Latin digits in BOTH
 * calendars, and a Hijri toggle that changes the DISPLAY ONLY. Its copy map
 * becomes catalogue keys; nothing else changed shape.
 *
 * THE VALUE IS ALWAYS THE ISO GREGORIAN DAY. `?createdFrom=` carries it, the
 * server's DateOnly parses it, and the Hijri toggle never touches it — a value
 * that changed calendars with the toggle would filter by a different day than
 * the one on screen.
 *
 * IT WAS FEATURE-LOCAL AND THIS PARAGRAPH SAID SO — corrected 2026-09-01 rather
 * than deleted, because the condition it named is what happened. It read: *"one
 * consumer, and the cap on the component set requires a written reason for a
 * ninth — it moves the day a second screen needs a date."* `033` is that second
 * screen, the written reason is its §7.1, and the move is the one at the top of
 * this file.
 * ========================================================================== */

const CAL_ROWS = 6;
const CAL_COLS = 7;

/* =============================================================================
 * THE CALENDAR'S DIGITS FOLLOW THE INTERFACE LANGUAGE — a ruled deviation
 * =============================================================================
 * BR-8.13 pins Latin digits to dates product-wide, and the first version obeyed
 * it here too. The product owner overruled it FOR THE CALENDAR POPOVER with two
 * example frames on 2026-09-01: Arabic interface → Arabic-Indic digits (١٤٤٨),
 * English interface → Latin digits and English month names (Rabi' al-awwal).
 * The deviation's scope is exactly the grid and its title:
 *
 *   - the VALUE never moves — `?createdFrom=` carries the ISO Gregorian day
 *   - the TRIGGER stays dd/mm/yyyy in Latin digits, which is what the panel
 *     frames themselves draw inside an Arabic interface
 *   - every date COLUMN in the product keeps BR-8.13 untouched
 *
 * Wrapped, because `islamic-umalqura` is not guaranteed: an engine without it
 * throws on CONSTRUCTION, and a locale gap must degrade to "no toggle", never
 * take the panel down. */
const hijriLocale = (lang: Lang) =>
  lang === 'ar'
    ? 'ar-SA-u-ca-islamic-umalqura'
    : 'en-u-ca-islamic-umalqura-nu-latn';

function makeHijri(
  lang: Lang,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat(hijriLocale(lang), options);
  } catch {
    return null;
  }
}

/** A bare number in the interface's own numerals — the grid's day and year
 *  cells. No grouping: ١٬٤٤٨ is a quantity, ١٤٤٨ is a year. */
function uiDigits(lang: Lang, value: number): string {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en', {
    useGrouping: false,
  }).format(value);
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

/** dd/mm/yyyy for the trigger — the shape the placeholder promises. */
const prettyDay = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/**
 * The Hijri form of the trigger text, COMPOSED FROM PARTS: dd/mm/yyyy هـ.
 *
 * `format()` was tried first and produced `18-ربيع الأول-1448` — the engine
 * chose the month NAME, and inside the trigger's LTR box the mixed Arabic/digit
 * runs reordered into a date nobody wrote (reported: "ترتيب التاريخ في
 * الهجري"). `formatToParts` with numeric fields hands over three plain numbers,
 * and composing them keeps the string ASCII-ordered — same shape as the
 * Gregorian form, same slot, with هـ marking which calendar it is.
 */
function hijriDay(iso: string): string | null {
  /* 'en' on purpose: the trigger keeps Latin dd/mm/yyyy in both interface
   * languages — that is what the panel frames draw — and هـ carries which
   * calendar it is. */
  const fmt = makeHijri('en', { day: 'numeric', month: 'numeric', year: 'numeric' });
  if (!fmt) return null;

  const parts = new Map(
    fmt.formatToParts(new Date(`${iso}T00:00:00`)).map((p) => [p.type, p.value]),
  );
  const day = parts.get('day');
  const month = parts.get('month');
  const year = parts.get('year');
  if (!day || !month || !year) return null;

  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year} هـ`;
}

/* Monday-first, seven CLIPPED WORDS from the catalogue — the preview measured
 * why no Intl width produces them: ar `short` and `long` are identical full
 * names, ar `narrow` is seven bare letters, and the design asks for إثنين …
 * أحد, which is neither. Catalogue copy, so a translator owns it. */
const WEEKDAY_KEYS = [
  'cal.mon',
  'cal.tue',
  'cal.wed',
  'cal.thu',
  'cal.fri',
  'cal.sat',
  'cal.sun',
] as const;

function monthNames(lang: Lang): string[] {
  const fmt = new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', {
    month: 'long',
  });
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2026, i, 15)));
}

export interface DateFieldProps {
  label: string;
  /** ISO day or `''`. */
  value: string;
  onChange: (iso: string) => void;
  lang: Lang;
}

export function DateField({ label, value, onChange, lang }: DateFieldProps) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);

  /* THE HIJRI TOGGLE LIVES ON THE FIELD, NOT IN THE CALENDAR — reported
   * 2026-09-01: with the toggle on, picking a day wrote the Gregorian form into
   * the trigger, because the toggle's state died with the popover and the
   * trigger never knew it existed. The VALUE is still the ISO Gregorian day in
   * every case; this state only decides which calendar the READER sees it in,
   * here and in the grid. */
  const [hijri, setHijri] = useState(false);

  const triggerText =
    value === '' ? null : hijri ? hijriDay(value) ?? prettyDay(value) : prettyDay(value);

  const rootRef = useRef<HTMLDivElement | null>(null);

  /* Closed on an outside pointer, the same contract every popover here keeps.
   * `pointerdown`, so a click that OPENS another control does not first count
   * as "outside" and reopen this one on its own trigger. */
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div ref={rootRef} className={styles.dateField}>
      <span className={styles.facetLabel}>{label}</span>
      <button
        type="button"
        className={styles.dateBtn}
        /* THE NAME IS THE LABEL, EXPLICITLY. The visible label above is a plain
           span — `htmlFor` cannot point at a button — so without this the
           control's accessible name was its CONTENT: "dd/mm/yyyy", and both
           date fields announced identically. Found by the test that queried the
           trigger by its field name and could not. */
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {/* The VALUE is LTR always: dd/mm/yyyy is digits and slashes, all
            directionally weak, and an RTL line reorders the runs — the same
            defect the list's date column had, avoided rather than re-measured. */}
        <span className={styles.dateBtnValue} dir="ltr">
          {triggerText === null ? (
            <span className={styles.dateBtnPlaceholder}>
              {t('cal.placeholder')}
            </span>
          ) : (
            triggerText
          )}
        </span>
        <IconCalendar size={16} aria-hidden="true" />
      </button>

      {open ? (
        <Calendar
          lang={lang}
          label={label}
          value={value}
          hijri={hijri}
          onHijri={setHijri}
          onApply={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function Calendar({
  lang,
  label,
  value,
  hijri,
  onHijri,
  onApply,
  onCancel,
}: {
  lang: Lang;
  label: string;
  value: string;
  hijri: boolean;
  onHijri: (next: boolean) => void;
  onApply: (iso: string) => void;
  onCancel: () => void;
}) {
  /* ONE NAMESPACE, and it is `common`. This read `tickets` for its own strings
     and `common` for the shared ones; a promoted primitive must not read a
     FEATURE's catalogue at all — the customers directory has no `tickets`
     namespace loaded, and every string it named moved with it. */
  const { t } = useTranslation('common');
  const tc = t;

  const start = value ? new Date(`${value}T00:00:00`) : new Date();
  const [month, setMonth] = useState(
    () => new Date(start.getFullYear(), start.getMonth(), 1),
  );
  const [sel, setSel] = useState(value || isoDay(new Date()));
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');

  const months = useMemo(() => monthNames(lang), [lang]);
  const dayFmt = useMemo(
    () =>
      hijri
        ? makeHijri(lang, { day: 'numeric' })
        : new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en', { day: 'numeric' }),
    [hijri, lang],
  );
  const titleFmt = useMemo(
    () => (hijri ? makeHijri(lang, { month: 'long', year: 'numeric' }) : null),
    [hijri, lang],
  );
  /* The toggle only renders when the engine can honour it — a switch that
   * flips and changes nothing is a broken control, not a degradation. */
  const hijriAvailable = useMemo(() => makeHijri(lang, { day: 'numeric' }) !== null, [lang]);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const today = isoDay(new Date());

  const step = (n: number) => {
    const jump = mode === 'years' ? n * 12 : mode === 'months' ? n : 0;
    setMonth(
      jump === 0
        ? new Date(year, monthIndex + n, 1)
        : new Date(year + jump, monthIndex, 1),
    );
  };

  const title =
    mode === 'years'
      ? (() => {
          const base = year - (((year % 12) + 12) % 12);
          return `${uiDigits(lang, base)} – ${uiDigits(lang, base + 11)}`;
        })()
      : mode === 'months'
        ? uiDigits(lang, year)
        : (titleFmt?.format(new Date(year, monthIndex, 15)) ??
          `${months[monthIndex] ?? ''} ${uiDigits(lang, year)}`);

  /* role="dialog" with the FIELD's name: two تطبيق buttons can be on screen at
   * once — the panel's and this one's — and without a named container they are
   * indistinguishable to anything reading rather than looking. */
  return (
    <div className={styles.calendar} role="dialog" aria-label={label}>
      <div className={styles.calHead}>
        <button
          type="button"
          className={styles.calNav}
          aria-label={t('cal.prevMonth')}
          onClick={() => step(-1)}
        >
          <IconChevronDown size={18} className={styles.chevPrev} />
        </button>
        <button
          type="button"
          className={styles.calTitle}
          onClick={() => setMode(mode === 'days' ? 'years' : 'days')}
        >
          {title}
          <IconChevronDown
            size={14}
            className={mode === 'days' ? undefined : styles.calCaretUp}
          />
        </button>
        <button
          type="button"
          className={styles.calNav}
          aria-label={t('cal.nextMonth')}
          onClick={() => step(1)}
        >
          <IconChevronDown size={18} className={styles.chevNext} />
        </button>
      </div>

      {mode === 'days' ? (
        <div className={styles.calWeek}>
          {WEEKDAY_KEYS.map((key) => (
            <span key={key} className={styles.calWeekday}>
              {t(key)}
            </span>
          ))}
        </div>
      ) : null}

      <div className={cx(styles.calGrid, mode !== 'days' && styles.calGridWide)}>
        {mode === 'days'
          ? (() => {
              const firstDow = (new Date(year, monthIndex, 1).getDay() + 6) % CAL_COLS;
              return Array.from({ length: CAL_ROWS * CAL_COLS }, (_, i) => {
                const d = new Date(year, monthIndex, 1 - firstDow + i);
                const key = isoDay(d);
                const inMonth = d.getMonth() === monthIndex;
                return (
                  <button
                    key={key}
                    type="button"
                    className={cx(
                      styles.calCell,
                      !inMonth && styles.calCellOutside,
                      key === today && styles.calCellToday,
                      key === sel && styles.calCellOn,
                    )}
                    onClick={() => {
                      setSel(key);
                      if (!inMonth) {
                        setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                      }
                    }}
                  >
                    {dayFmt?.format(d) ?? String(d.getDate())}
                  </button>
                );
              });
            })()
          : (() => {
              const years = mode === 'years';
              const base = years ? year - (((year % 12) + 12) % 12) : 0;
              return Array.from({ length: 12 }, (_, i) => {
                const on = years ? base + i === year : i === monthIndex;
                return (
                  <button
                    key={years ? base + i : i}
                    type="button"
                    className={cx(
                      styles.calCell,
                      styles.calCellWide,
                      on && styles.calCellOn,
                    )}
                    onClick={() => {
                      setMonth(
                        years
                          ? new Date(base + i, monthIndex, 1)
                          : new Date(year, i, 1),
                      );
                      setMode(years ? 'months' : 'days');
                    }}
                  >
                    {years ? uiDigits(lang, base + i) : (months[i] ?? '')}
                  </button>
                );
              });
            })()}
      </div>

      <div className={styles.calFoot}>
        {hijriAvailable ? (
          <button
            type="button"
            role="switch"
            aria-checked={hijri}
            className={cx(styles.hijriSwitch, hijri && styles.hijriSwitchOn)}
            onClick={() => onHijri(!hijri)}
          >
            <span className={styles.switchTrack}>
              <span className={styles.switchKnob} />
            </span>
            {t('cal.hijri')}
          </button>
        ) : null}
        <button
          type="button"
          className={cx(styles.calLinkBtn, styles.calPushEnd)}
          onClick={onCancel}
        >
          {tc('cancel')}
        </button>
        <button
          type="button"
          className={styles.calSolidBtn}
          onClick={() => onApply(sel)}
        >
          {t('cal.apply')}
        </button>
      </div>
    </div>
  );
}
