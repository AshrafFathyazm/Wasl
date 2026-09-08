import { useTranslation } from 'react-i18next';

import { cx } from '../../lib/cx';
import { formatNumber, type Lang } from '../../lib/formatters';
import styles from './Dashboard.module.css';

/* ============================================================================
 * TrendArrow — "▲ 3 vs prev" under a tile. `020b`
 * ============================================================================
 * THE DIRECTION IS DECLARED, NEVER INFERRED FROM THE SIGN. This is the banned
 * shape, and an AC exists to keep it out:
 *
 *     const tone = delta > 0 ? 'bad' : 'good';    // FORBIDDEN
 *
 * Three reasons, and the third is why it became a ruling rather than a taste:
 *
 *   1. It is already false for the metrics this product has. More unassigned is
 *      worse; more resolved would be better. A generic rule is wrong for half of
 *      any dashboard that grows.
 *   2. A rule inside a renderer is a rule the next renderer re-derives, and the
 *      two disagree silently — `013`'s discriminator argument, applied to colour.
 *   3. `oldestUntouchedHours` breaks the analogy even where the direction holds.
 *      Lower IS better for it, but a fall can mean the oldest ticket was answered
 *      — or that it was CLOSED and left the set. Both render the same arrow.
 *
 * So the tile passes `higherIsWorse`, and the copy for the age tile says the AGE
 * changed rather than that the backlog improved.
 * ========================================================================== */

export interface TrendArrowProps {
  /** Today's level. */
  current: number;

  /**
   * The baseline. `undefined` renders NOTHING — no dash, no zero, no grey arrow.
   *
   * Ruled 2026-09-07: for the first fortnight after the capture starts running
   * there is no answer, and the tile should look exactly as it does today rather
   * than implying a comparison it cannot make.
   */
  previous?: number | null | undefined;

  /**
   * Which way is bad for THIS metric. Required, with no default — a default would
   * be the inference this component exists to refuse, hidden one level down.
   */
  higherIsWorse: boolean;

  /**
   * How the magnitude is rendered. `count` for the three tallies, `hours` for the
   * oldest-untouched age — whose copy is deliberately about the age and not about
   * the workload.
   */
  unit: 'count' | 'hours';

  lang: Lang;
}

export function TrendArrow({
  current,
  previous,
  higherIsWorse,
  unit,
  lang,
}: TrendArrowProps) {
  const { t } = useTranslation('dashboard');

  /* NO BASELINE, NO ARROW. `null` and `undefined` are both "no answer": the
     server omits `previous` entirely when the snapshot is missing, and
     `oldestUntouchedHours` is null inside a snapshot that exists when nothing
     was untouched that day. Neither is a comparison. */
  if (previous === undefined || previous === null) {
    return null;
  }

  const delta = current - previous;

  /* UNCHANGED IS ITS OWN STATE, not an arrow of length zero. "▲ 0 vs prev" reads
     as a rise that happens to be nothing, and a flat glyph beside a real one is
     the clearest thing to draw for "the same". */
  if (delta === 0) {
    return (
      <span className={cx(styles.trend, styles.trendFlat)}>
        {t('trend.unchanged')}
      </span>
    );
  }

  const rose = delta > 0;
  const worse = rose === higherIsWorse;
  const magnitude = Math.abs(delta);

  return (
    <span
      className={cx(styles.trend, worse ? styles.trendWorse : styles.trendBetter)}
      /* THE GLYPH IS DECORATION AND THE SENTENCE IS THE FACT. A screen reader
         reads "up 3 versus the previous period", not "triangle 3" — and the
         visible text alone would leave the direction to the colour, which is
         exactly what a colour-blind reader cannot use. */
      title={t(rose ? 'trend.roseTitle' : 'trend.fellTitle')}
    >
      <span aria-hidden="true" className={styles.trendGlyph}>
        {rose ? '▲' : '▼'}
      </span>

      {t(rose ? `trend.rose.${unit}` : `trend.fell.${unit}`, {
        count: magnitude,
        formatted: formatNumber(magnitude, lang),
      })}
    </span>
  );
}
