import type { ReactNode } from 'react';

import { cx } from '../../lib/cx';
import styles from './Loader.module.css';

/**
 * Nine shapes from one geometry. The tenth — `Skeleton` — is the second export
 * of this module, because it takes no input and shares this contract.
 *
 * `design/loaders.md` §2 is the placement table and it is not advice: a shape
 * used outside its row is a loader that means the wrong thing. The short form:
 *
 *   converge    the default. 0.5–5s, with text beside it
 *   mark        big moments only. A full screen, or a switch of work area
 *   brand       a full screen at first entry. Once per session
 *   path        medium waits, 2–15s
 *   chain       a NAMED multi-step operation. Never a single one
 *   orbit       inside a button, inside a field affix
 *   bars        under 32px. Table cells, chips
 *   bar         background loading that does not block interaction
 *   satellites  waiting on an external channel, >10s. The one teal shape
 */
export type LoaderVariant =
  | 'converge'
  | 'mark'
  | 'brand'
  | 'path'
  | 'chain'
  | 'orbit'
  | 'bars'
  | 'bar'
  | 'satellites';

export type LoaderSize = 'sm' | 'md';

export interface LoaderProps {
  /** Default 'converge'. */
  variant?: LoaderVariant | undefined;

  /** 'md' is full travel. 'sm' is the reduced travel that fits a 40px control —
   *  the same shape, the same duration, the same easing, a shorter distance.
   *  Scaling the container keeps ONE set of keyframes rather than a second,
   *  divergent copy.
   *
   *  `bar` ignores it: it is 100% wide by construction. */
  size?: LoaderSize | undefined;

  /** ALREADY TRANSLATED by the caller. When given, the loader announces itself
   *  as a live status region. When absent it is decorative and hidden from
   *  assistive technology — which is correct inside a Button, whose accessible
   *  name must not change while it is busy.
   *
   *  A primitive holds no strings, so there is no default. */
  label?: string | undefined;
}

/* The mark, drawn once. Both `mark` and `brand` render it and neither mirrors
 * it — brand.md: the mark is directional by construction and keeps its own
 * orientation in Arabic. `--ld-dir` is for abstract shapes and travel.
 *
 * `strokeDasharray` is on the <g> so all three threads share it; the per-path
 * delay is what makes them draw in sequence. */
function MarkThreads({ dash }: { dash: boolean }) {
  return (
    <>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={dash ? 4 : 5}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...(dash ? { strokeDasharray: 46 } : {})}
      >
        <path className={dash ? styles.markThread : undefined} d="M8 9h12c10 0 12 5 17 11" />
        <path className={dash ? styles.markThread : undefined} d="M8 20h29" />
        <path className={dash ? styles.markThread : undefined} d="M8 31h12c10 0 12-5 17-11" />
      </g>
      <circle
        className={dash ? styles.markNode : undefined}
        cx="52"
        cy="20"
        r={dash ? 5.5 : 6}
        fill="currentColor"
      />
    </>
  );
}

export function Loader({ variant = 'converge', size = 'md', label }: LoaderProps) {
  const announced = label !== undefined && label !== '';

  /* One wrapper, one accessibility contract, nine bodies. The alternative —
   * nine components — is nine chances for one of them to forget aria-hidden and
   * announce "image" in the middle of a form. */
  const frame = (body: ReactNode, extra?: string) => (
    <span
      className={cx(
        styles.loader,
        styles[variant],
        size === 'sm' && styles.sm,
        extra,
      )}
      role={announced ? 'status' : undefined}
      aria-label={announced ? label : undefined}
      aria-hidden={announced ? undefined : true}
    >
      {body}
    </span>
  );

  switch (variant) {
    case 'mark':
      return frame(
        <svg viewBox="0 0 64 40" className={styles.svg} focusable="false">
          <MarkThreads dash />
        </svg>,
      );

    case 'brand':
      /* The mark whole, pulsing in opacity. No drawing — a full screen at first
       * entry is not the moment to animate a logo being constructed. */
      return frame(
        <svg viewBox="0 0 64 40" className={styles.svg} focusable="false">
          <MarkThreads dash={false} />
        </svg>,
      );

    case 'path':
      /* Two identical polylines: a static track and a drawn overlay. Drawing
       * over nothing reads as a line appearing; drawing over the track reads as
       * a route being followed. */
      return frame(
        <svg viewBox="0 0 64 24" className={styles.svg} focusable="false">
          <path
            className={styles.pathTrack}
            d="M3 18h11l8-12h13l7 8h8"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className={styles.pathLine}
            d="M3 18h11l8-12h13l7 8h8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="58" cy="14" r="3.5" fill="currentColor" />
        </svg>,
      );

    case 'chain':
      /* Four nodes, three links. The last node is larger: it is the destination,
       * the same way the converge node is. */
      return frame(
        <>
          <span className={styles.chainDot}>
            <i className={styles.chainFill} />
          </span>
          <span className={styles.chainLink}>
            <i className={styles.chainGrow} />
          </span>
          <span className={styles.chainDot}>
            <i className={styles.chainFill} />
          </span>
          <span className={styles.chainLink}>
            <i className={styles.chainGrow} />
          </span>
          <span className={styles.chainDot}>
            <i className={styles.chainFill} />
          </span>
          <span className={styles.chainLink}>
            <i className={styles.chainGrow} />
          </span>
          <span className={cx(styles.chainDot, styles.chainEnd)}>
            <i className={styles.chainFill} />
          </span>
        </>,
      );

    case 'orbit':
      return frame(
        <>
          <span className={styles.orbitRing} />
          <span className={styles.orbitCore} />
        </>,
      );

    case 'bars':
      return frame(
        <>
          <i className={styles.barsBar} />
          <i className={styles.barsBar} />
          <i className={styles.barsBar} />
          <i className={styles.barsBar} />
        </>,
      );

    case 'bar':
      return frame(<span className={styles.sweep} />);

    case 'satellites':
      /* THE ONE TEAL SHAPE. brand.md §4: teal marks presence — the channel is
       * alive — and it never marks outcome. Green appears in no loader at all. */
      return frame(
        <>
          <span className={styles.satCore} />
          <span className={styles.satOrbitOuter}>
            <i className={styles.satDotOuter} />
          </span>
          <span className={styles.satOrbitInner}>
            <i className={styles.satDotInner} />
          </span>
        </>,
      );

    case 'converge':
    default:
      /* THE SLANT COMES FROM THE DELAY, NOT FROM THE START POSITIONS. All three
       * dots begin at the same inline-start; the stagger puts the first ahead.
       * Do not "fix" the positions to make the slant — that freezes it into a
       * static comma. */
      return frame(
        <>
          <i className={styles.dot} />
          <i className={styles.dot} />
          <i className={styles.dot} />
          <span className={styles.ring} />
          <span className={styles.node} />
        </>,
      );
  }
}
