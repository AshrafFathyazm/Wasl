import { Link } from 'react-router-dom';

import { IconArrowRight } from '../../icons/icons';
import { cx } from '../../lib/cx';
import styles from './Dashboard.module.css';

/* ============================================================================
 * AttentionTile — the first row of the screen
 * ============================================================================
 * `11-dashboard.md`: lead with what needs action, not with totals. The test for
 * a tile is whether somebody does something differently when the number changes,
 * which is why every one of the four is a LINK to the thing it is about.
 *
 * A ZERO IS MUTED, NOT RED (TEST-020-19). Zero unassigned tickets is the good
 * outcome, and a red 0 trains a reader to ignore the colour — after which a red
 * 12 says nothing either. The footnote goes with it: "Nobody owns these" under a
 * zero is a sentence about nothing.
 * ========================================================================== */

export interface AttentionTileProps {
  /** Which family the tile belongs to. `danger` is act-now; `warning` is
   *  watch-this. Nothing here is `info`: a tile that informs belongs lower down
   *  the page or nowhere. */
  tone: 'danger' | 'warning';

  label: string;

  /** Already formatted — a count in Latin digits, or a compact age like `4d`. */
  value: string;

  /** The line under the number. Absent when there is nothing true to say, which
   *  is the case for a tile whose ticket does not exist. */
  footer?: string | undefined;

  /** Whether the number is zero, which mutes it and the footer. Passed rather
   *  than inferred from `value`: the oldest-untouched tile's value is an age
   *  string, and "0h" is a real age while `"0"` is an empty queue. */
  isZero?: boolean | undefined;

  to: string;
}

export function AttentionTile({
  tone,
  label,
  value,
  footer,
  isZero = false,
  to,
}: AttentionTileProps) {
  return (
    <Link to={to} className={styles.tile}>
      <span className={styles.tileHead}>
        <span
          className={cx(styles.dot, tone === 'danger' ? styles.dotDanger : styles.dotWarning)}
          aria-hidden="true"
        />
        {label}
      </span>

      <span className={cx(styles.tileValue, isZero && styles.tileValueZero)}>{value}</span>

      {footer === undefined ? null : (
        <span
          className={cx(
            styles.tileFoot,
            tone === 'danger' && !isZero ? styles.tileFootAct : styles.tileFootMuted,
          )}
        >
          {footer}
          {/* The arrow appears on hover. Decoration: the tile is a link, and a
              screen reader is told that by the element rather than by a glyph.
              `IconArrowRight` rather than a literal `→` — `037` gave the twenty
              directional glyphs one mirroring rule, and a character in JSX would
              point the wrong way in Arabic while also failing the no-literal
              gate. */}
          <IconArrowRight size={12} className={styles.arrow} aria-hidden="true" />
        </span>
      )}
    </Link>
  );
}
