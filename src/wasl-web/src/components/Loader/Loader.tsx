import { cx } from '../../lib/cx';
import styles from './Loader.module.css';

export type LoaderSize = 'sm' | 'md';

export interface LoaderProps {
  /** 'md' is the system loader at full travel. 'sm' is the reduced travel that
   *  fits inside a 40px control — the same dots, the same 1.45s, the same easing,
   *  a shorter distance. */
  size?: LoaderSize;

  /** ALREADY TRANSLATED by the caller. When given, the loader announces itself as
   *  a live status region. When absent it is decorative and hidden from assistive
   *  technology — which is correct inside a Button, whose accessible name must not
   *  change while it is busy.
   *
   *  A primitive holds no strings, so there is no default. */
  label?: string;
}

/**
 * "Converge" — three dots travelling to a node, the node pulsing as each arrives.
 *
 * This REPLACES the spinner everywhere (design/brand.md §2). The loader appears
 * far more often than the logo does, which makes it the most-seen brand asset in
 * the product; a default spinner wastes it.
 *
 * It lives in components/ rather than inside Button because it is the system's
 * loader, not the button's — the ticket list, the detail page, and every future
 * mutation use the same one. `component-inventory.md` lists "a generic spinner"
 * under *Not built* and names this as what stands in its place, so it is not a
 * ninth primitive competing for the cap.
 */
export function Loader({ size = 'md', label }: LoaderProps) {
  const announced = label !== undefined && label !== '';

  return (
    <span
      className={cx(styles.loader, size === 'sm' && styles.sm)}
      role={announced ? 'status' : undefined}
      aria-label={announced ? label : undefined}
      aria-hidden={announced ? undefined : true}
    >
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.node} />
    </span>
  );
}
