import { cx } from '../../lib/cx';
import styles from './Skeleton.module.css';

/**
 * The tenth shape, and the second export of the loader module.
 *
 * NOT a ninth primitive, and `component-inventory.md` carries the written reason
 * the cap requires: it takes no input. The cap counts controls — things with a
 * keyboard model, a focus ring, a value and a disabled state — and a skeleton
 * has none of those and cannot acquire them.
 *
 * It lives here rather than beside `Table` because it had three callers before
 * it existed: `Table` implemented one privately, `Select` needs one over its
 * trigger, `Input` needs one for its own first load. Three private copies of one
 * shape is the drift a system exists to prevent — and the two that existed had
 * ALREADY diverged, 1.4s against 1.5s and opacity .45 against .4. Neither was
 * wrong. That is the problem.
 *
 * **Always better than a spinner in a table** (`design/loaders.md` §2). A
 * spinner says *something is happening*; a skeleton says *this much is coming,
 * in this shape* — and it does not move the layout when the data lands.
 */
export type SkeletonShape = 'text' | 'pill' | 'avatar' | 'icon' | 'block';

export interface SkeletonProps {
  /** Default 'text'. The shape stands in for what will replace it, so the row
   *  does not jump: a pill becomes a badge, an avatar becomes an avatar. */
  shape?: SkeletonShape | undefined;

  /** Overrides the shape's own width. A ratio or a length — `'72%'`, `'104px'`.
   *  Varying it across rows is what stops a skeleton reading as a bar chart. */
  width?: string | undefined;

  /** Overrides the shape's own height. `block` has no intrinsic height, so it
   *  is the one shape that usually needs this. */
  height?: string | undefined;

  /** ALREADY TRANSLATED. Same contract as `Loader`: with a label it is a live
   *  status region, without one it is decorative and hidden.
   *
   *  Usually absent, and that is correct — a table of eight skeleton rows must
   *  announce ONCE, from the region that owns them, not eight times. */
  label?: string | undefined;
}

export function Skeleton({ shape = 'text', width, height, label }: SkeletonProps) {
  const announced = label !== undefined && label !== '';

  return (
    <span
      className={cx(styles.skeleton, styles[shape])}
      role={announced ? 'status' : undefined}
      aria-label={announced ? label : undefined}
      aria-hidden={announced ? undefined : true}
      style={{
        ...(width === undefined ? {} : { inlineSize: width }),
        ...(height === undefined ? {} : { blockSize: height }),
      }}
    />
  );
}
