import { cx } from '../../lib/cx';
import styles from './Badge.module.css';

/**
 * The visual axis. NOT a status and NOT a priority.
 *
 * `component-inventory.md` calls Badge "where the domain leaks in" and enumerates
 * twelve domain variants — six ticket statuses, four priorities, escalated,
 * internal. **The leak is deferred, not taken.** Five tones × two appearances
 * covers all twelve without this foundation declaring what a ticket status is.
 *
 * The map from a raw enum value to a tone is a PRODUCT decision, made by the
 * feature that owns the ticket list. It will be keyed on the raw, untranslated
 * enum value: keying it on a displayed label renders neutral for every Arabic
 * user and nothing fails — no exception, no test failure, no visible error in
 * English.
 */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type BadgeAppearance = 'filled' | 'outline';

export interface BadgeProps {
  tone: BadgeTone;

  /** Default 'filled'. */
  appearance?: BadgeAppearance;

  /** REQUIRED, always, with no way to omit it — a Badge without one is a
   *  TypeScript error. Never convey meaning by colour alone: colour fails for
   *  colour-blind users and in a monochrome print of a report (DESIGN-BRIEF
   *  rule 14). Already translated by the caller. */
  label: string;

  /** Default true. */
  dot?: boolean;
}

export function Badge({ tone, appearance = 'filled', label, dot = true }: BadgeProps) {
  return (
    <span
      className={cx(
        styles.badge,
        styles[tone],
        appearance === 'filled' ? styles.filled : styles.outline,
      )}
    >
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {/* No dir="auto": a badge label is interface copy from the catalogue, not
          user content. */}
      {label}
    </span>
  );
}
