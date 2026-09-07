import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DashboardDay } from '../../lib/api-types.provisional';
import { formatNumber, type Lang } from '../../lib/formatters';
import { formatLocalDate, formatLocalDay } from './dashboardFormat';
import styles from './Dashboard.module.css';

/* ============================================================================
 * CreatedResolvedChart — paired bars, one pair per local day
 * ============================================================================
 * TWO BARS PER DAY, NOT A RATIO. `11-dashboard.md`: a ratio hides volume, and
 * "we resolved 90% of what arrived" reads identically on a day with ten tickets
 * and a day with a hundred.
 *
 * NO CHART LIBRARY. The figure is two rectangles per day and a tooltip; a
 * charting dependency would arrive with its own colour scale, its own tooltip
 * DOM, its own RTL story and its own opinion about fonts — four things this
 * design already decides. Heights are percentages of the range's own maximum, so
 * the tallest bar always reaches the top and a quiet fortnight is not a row of
 * stubs.
 *
 * THE BARS ARE `aria-hidden` AND THE NUMBERS ARE A REAL TABLE. A screen reader
 * gets the table; the eye gets the bars. `030` uses the same split for its
 * charts — a `div` with an `aria-label` describing a fortnight is a sentence
 * nobody can navigate.
 * ========================================================================== */

/** Above this many days the axis labels every fourth tick. At 30 days every
 *  label would collide at the width the card has; at 14 they all fit. */
const CROWDED_DAY_COUNT = 14;

export function CreatedResolvedChart({
  days,
  lang,
}: {
  days: readonly DashboardDay[];
  lang: Lang;
}) {
  const { t } = useTranslation('dashboard');

  /* WHICH COLUMN IS HOVERED, and it is state rather than CSS because the tooltip
   * has to say the day's two numbers. A CSS-only `:hover` tooltip would need the
   * text in a `data-` attribute per column, which puts a translated string into
   * markup the stylesheet reads. */
  const [active, setActive] = useState<number | null>(null);

  /* The scale is the RANGE's maximum across both series, so the two are
   * comparable — a per-series maximum would draw a day that resolved 2 and
   * created 10 as two bars of the same height. `|| 1` keeps an all-zero
   * fortnight from dividing by zero and rendering `NaN%`, which in a
   * `style.blockSize` is silently dropped and looks like a chart that failed to
   * load. */
  const observed = Math.max(1, ...days.map((day) => Math.max(day.created, day.resolved)));

  /* THE SCALE IS ROUNDED UP TO A READABLE STEP, and the revised canvas is why.
   *
   * It puts a 0 / 5 / 10 axis behind the bars, which only reads as a scale if the
   * top gridline is a round number: an axis labelled 0 / 4.5 / 9 is arithmetic
   * rather than furniture. Rounding to the next multiple of five also stops the
   * tallest bar touching the top line, so "the busiest day" and "the ceiling" are
   * not the same pixel. */
  const step = observed <= 5 ? 1 : observed <= 10 ? 5 : observed <= 50 ? 10 : 25;
  const max = Math.ceil(observed / step) * step;

  const everyNth = days.length > CROWDED_DAY_COUNT ? 4 : 1;

  /* Three lines: zero, the middle and the top. More than three turns a 124px card
     into a ruled page, and the middle one is what makes a bar readable as "about
     half of a busy day" without counting. */
  const gridlines = [max, max / 2, 0];

  return (
    <div className={styles.chartWrap}>
      {/* THE AXIS IS `aria-hidden` LIKE THE BARS. It is the same numbers again,
          and the sr-only table below already carries them per day — an axis read
          aloud is three unlabelled figures. */}
      <div className={styles.axis} aria-hidden="true">
        {gridlines.map((value) => (
          <span key={value} className={styles.axisRow}>
            <span className={styles.axisLabel}>{formatNumber(value, lang)}</span>
            <span className={styles.gridline} />
          </span>
        ))}
      </div>

      <div className={styles.chart} aria-hidden="true">
        {days.map((day, index) => (
          <div
            key={day.localDate}
            className={styles.column}
            onPointerEnter={() => setActive(index)}
            onPointerLeave={() => setActive((current) => (current === index ? null : current))}
          >
            <div className={styles.bars}>
              <span
                className={styles.barCreated}
                style={{ blockSize: `${Math.round((day.created / max) * 100)}%` }}
              />
              <span
                className={styles.barResolved}
                style={{ blockSize: `${Math.round((day.resolved / max) * 100)}%` }}
              />
            </div>
            <span className={styles.tick}>
              {index % everyNth === 0 ? formatLocalDay(day.localDate, lang) : ''}
            </span>
          </div>
        ))}

        {/* ONE TOOLTIP, MOVED — not one per column. Thirty absolutely-positioned
            boxes with translated text in each is thirty times the DOM for a
            surface that shows one at a time. Positioned by percentage so it
            follows the column in both directions without a measurement. */}
        {active !== null && days[active] !== undefined ? (
          <div
            className={styles.tooltip}
            style={{ insetInlineStart: `${((active + 0.5) / days.length) * 100}%` }}
          >
            <strong>{formatLocalDate(days[active].localDate, lang)}</strong>
            <span>
              {t('chart.tooltip', {
                created: formatNumber(days[active].created, lang),
                resolved: formatNumber(days[active].resolved, lang),
              })}
            </span>
          </div>
        ) : null}
      </div>

      {/* The same figures, navigable. Not a summary sentence: a reader who wants
          the eleventh day should be able to go to the eleventh row. */}
      <table className="sr-only">
        <caption>{t('chart.tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('chart.day')}</th>
            <th scope="col">{t('chart.created')}</th>
            <th scope="col">{t('chart.resolved')}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.localDate}>
              <th scope="row">{formatLocalDate(day.localDate, lang)}</th>
              <td>{formatNumber(day.created, lang)}</td>
              <td>{formatNumber(day.resolved, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
