import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { IconCalendar, IconChevronDown } from '../../icons/icons';
import { cx } from '../../lib/cx';
import type { Lang } from '../../lib/formatters';
import styles from './TicketFilterBar.module.css';

/* =============================================================================
 * TicketDateField — the panel's date input, PORTED from the 026 preview
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
 * FEATURE-LOCAL, not a primitive. One consumer, and the cap on the component
 * set requires a written reason for a ninth — this is the CustomerPicker
 * precedent, and it moves the day a second screen needs a date.
 * ========================================================================== */

const CAL_ROWS = 6;
const CAL_COLS = 7;

/* Wrapped, because `islamic-umalqura` is not guaranteed: an engine without it
 * throws on CONSTRUCTION, and a locale gap must degrade to "no toggle", never
 * take the panel down. `-nu-latn` pins Latin digits — BR-8.13, and a picker
 * writing ١٤٤٨ beside a column showing 2026 is two numeral systems in one flow. */
const HIJRI_LOCALE = 'ar-SA-u-ca-islamic-umalqura-nu-latn';

function makeHijri(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat(HIJRI_LOCALE, options);
  } catch {
    return null;
  }
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
  const fmt = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', {
    month: 'long',
  });
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2026, i, 15)));
}

export interface TicketDateFieldProps {
  label: string;
  /** ISO day or `''`. */
  value: string;
  onChange: (iso: string) => void;
  lang: Lang;
}

export function TicketDateField({ label, value, onChange, lang }: TicketDateFieldProps) {
  const { t } = useTranslation('tickets');
  const [open, setOpen] = useState(false);
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
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {/* The VALUE is LTR always: dd/mm/yyyy is digits and slashes, all
            directionally weak, and an RTL line reorders the runs — the same
            defect the list's date column had, avoided rather than re-measured. */}
        <span className={styles.dateBtnValue} dir="ltr">
          {value === '' ? (
            <span className={styles.dateBtnPlaceholder}>
              {t('list.datePlaceholder')}
            </span>
          ) : (
            prettyDay(value)
          )}
        </span>
        <IconCalendar size={16} aria-hidden="true" />
      </button>

      {open ? (
        <Calendar
          lang={lang}
          label={label}
          value={value}
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
  onApply,
  onCancel,
}: {
  lang: Lang;
  label: string;
  value: string;
  onApply: (iso: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('tickets');
  const { t: tc } = useTranslation('common');

  const start = value ? new Date(`${value}T00:00:00`) : new Date();
  const [month, setMonth] = useState(
    () => new Date(start.getFullYear(), start.getMonth(), 1),
  );
  const [sel, setSel] = useState(value || isoDay(new Date()));
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const [hijri, setHijri] = useState(false);

  const months = useMemo(() => monthNames(lang), [lang]);
  const dayFmt = useMemo(() => (hijri ? makeHijri({ day: 'numeric' }) : null), [hijri]);
  const titleFmt = useMemo(
    () => (hijri ? makeHijri({ month: 'long', year: 'numeric' }) : null),
    [hijri],
  );
  /* The toggle only renders when the engine can honour it — a switch that
   * flips and changes nothing is a broken control, not a degradation. */
  const hijriAvailable = useMemo(() => makeHijri({ day: 'numeric' }) !== null, []);

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
          return `${base} – ${base + 11}`;
        })()
      : mode === 'months'
        ? String(year)
        : (titleFmt?.format(new Date(year, monthIndex, 15)) ??
          `${months[monthIndex] ?? ''} ${year}`);

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
                    {years ? base + i : (months[i] ?? '')}
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
            onClick={() => setHijri(!hijri)}
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
          {t('list.apply')}
        </button>
      </div>
    </div>
  );
}
