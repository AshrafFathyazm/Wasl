import { Link } from 'react-router-dom';

import { cx } from '../../lib/cx';
import { formatNumber, type Lang } from '../../lib/formatters';
import styles from './Dashboard.module.css';

/**
 * A whole-number percentage with its sign, Latin digits in both languages.
 *
 * The `%` is appended rather than resolved through the catalogue: it is a symbol,
 * not a word, and it is `%` in Arabic too (BR-8.13's treatment of numerals — an
 * Arabic-Indic `٪` would be the same mistake as Arabic-Indic digits). Written
 * with the number first in both directions, which `dir="auto"` on the row's
 * container handles.
 */
function formatPercent(share: number, lang: Lang): string {
  return `${formatNumber(share, lang)}%`;
}

/* ============================================================================
 * BarRow — label, track, number. Three cards are built from it
 * ============================================================================
 * Open by status, the channel mix, and the team load are one row shape with
 * three sources. Writing it once is what keeps the three cards reading as one
 * system — and it is why the track's geometry is defined in a single place
 * rather than three that drift by a pixel.
 *
 * THE TRACK IS `aria-hidden` AND THE NUMBER IS NOT. A progress bar role here
 * would announce a percentage, and the percentage is not the fact — the count
 * is. The bar is the same number drawn.
 *
 * WHY THE ROW IS A LINK RATHER THAN A BUTTON. Pressing it goes somewhere: the
 * ticket list, filtered. A `<button>` that navigates cannot be opened in a new
 * tab, does not show its destination on hover, and is invisible to a
 * middle-click — three affordances a support agent uses on a list they visit
 * forty times a day.
 * ========================================================================== */

export interface BarRowProps {
  /** The row's own text. Rendered `dir="auto"`, because a team member's name is
   *  user content and may be Arabic on an English screen. */
  label: string;

  /** How the bar is filled — a token reference, e.g. `var(--chart-rank-1)`. */
  fill: string;

  /** A leading dot in the same family as the fill, or none. The status card has
   *  them; the channel and team cards do not. */
  dot?: string | undefined;

  /** 0 to 100. Already rounded by the caller against the card's own maximum. */
  percent: number;

  /** The count, already formatted — Latin digits in both languages (BR-8.13). */
  value: string;

  /** Where the row goes. Omitted makes the row inert, which is what the team
   *  load is: there is no "tickets assigned to this person" screen to send a
   *  reader to, and `?assignee=<id>` is `015`'s parameter for a picker the
   *  dashboard does not have. */
  to?: string | undefined;

  /** The accessible name of the link, which the visible label alone does not
   *  give: "Open" beside a bar is not a destination. */
  linkLabel?: string | undefined;

  /**
   * This row's share of its card's total, 0 to 100, rendered after the count.
   *
   * Added 2026-09-07 with the revised canvas, and only the channel mix passes it:
   * a percentage answers "where does demand come from" and says nothing useful
   * about a status queue, whose four numbers are already a whole.
   */
  share?: number | undefined;

  /** Only needed when <see cref="share"/> is given — the locale the percentage's
   *  digits are formatted in (Latin in both, BR-8.13). */
  shareLang?: Lang | undefined;
}

export function BarRow({
  label,
  fill,
  dot,
  percent,
  value,
  to,
  linkLabel,
  share,
  shareLang = 'en',
}: BarRowProps) {
  const body = (
    <>
      <span className={styles.barLabel}>
        {dot === undefined ? null : (
          <span className={styles.dot} style={{ backgroundColor: dot }} aria-hidden="true" />
        )}
        <span dir="auto">{label}</span>
      </span>

      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ inlineSize: `${percent}%`, backgroundColor: fill }} />
      </span>

      <span className={styles.barValue}>{value}</span>

      {share === undefined ? null : (
        <span className={styles.barShare}>{formatPercent(share, shareLang)}</span>
      )}
    </>
  );

  if (to === undefined) {
    return <div className={styles.barRow}>{body}</div>;
  }

  return (
    <Link to={to} className={cx(styles.barRow, styles.barRowLink)} aria-label={linkLabel}>
      {body}
    </Link>
  );
}
