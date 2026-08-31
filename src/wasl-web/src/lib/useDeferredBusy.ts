import { useEffect, useRef, useState } from 'react';

/* ============================================================================
 * useDeferredBusy — the four timing gates, in one place
 * ============================================================================
 *
 * `design/loaders.md` §3 and `design/motion.md`:
 *
 *   < 200ms     no loader at all
 *   200ms – 1s  appear after a 150ms delay, so it cannot flash
 *   once shown  stay at least 400ms before content replaces it
 *   > 10s       a line of text naming the step — NOT a bigger loader
 *
 * THE 400ms FLOOR DELIBERATELY MAKES THE PRODUCT SLOWER. A response that
 * arrived in 160ms is held until 550ms. That is the trade, and it is the right
 * one: a loader that appears and vanishes inside three frames reads as a glitch,
 * and the reader spends more attention deciding whether something broke than
 * the wait ever cost them. It is written here rather than discovered later as a
 * performance regression.
 *
 * IT TAKES THE BOOLEAN, NOT THE QUERY. TanStack Query's `isPending` is already
 * a boolean, and `Button` — the highest-traffic caller — never sees a query at
 * all. A hook that wrapped a query would be unusable by exactly the component
 * that needs it most.
 *
 * ONE implementation, never a copy per call site: four numbers duplicated
 * across a dozen components are four numbers that drift, and the drift is
 * invisible because each one still works.
 * ============================================================================ */

/** Below this, nothing is shown at all. */
export const BUSY_APPEAR_AFTER_MS = 150;

/** Once visible, the minimum time on screen. */
export const BUSY_MIN_VISIBLE_MS = 400;

/** After this, the caller should name the current step in words. */
export const BUSY_LONG_WAIT_MS = 10_000;

export interface DeferredBusy {
  /** Render a loader when true. */
  visible: boolean;

  /** True once the wait has run past 10s. The caller adds a line of text
   *  naming the step — it does NOT swap in a bigger loader, which says the
   *  same nothing more loudly. */
  isLongWait: boolean;
}

/**
 * Turn a raw busy flag into one the gates allow to be rendered.
 *
 * ```tsx
 * const { visible, isLongWait } = useDeferredBusy(query.isPending);
 * ```
 */
export function useDeferredBusy(isBusy: boolean): DeferredBusy {
  const [visible, setVisible] = useState(false);
  const [isLongWait, setIsLongWait] = useState(false);

  /* When the loader actually appeared. A ref, not state: writing it must not
   * schedule a render, and reading it in the teardown must see the latest
   * value rather than the one captured when the effect ran. */
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (isBusy) {
      /* Already on screen — a second `true` (a refetch inside a refetch) must
       * not restart the appear delay and blink it. */
      if (shownAt.current !== null) return undefined;

      const appear = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, BUSY_APPEAR_AFTER_MS);

      const long = setTimeout(() => setIsLongWait(true), BUSY_LONG_WAIT_MS);

      return () => {
        clearTimeout(appear);
        clearTimeout(long);
      };
    }

    /* Not busy any more. */
    setIsLongWait(false);

    /* Never appeared — the answer arrived inside 150ms. Nothing to hide, and
     * nothing to hold: this is the < 200ms row, and it is the common case. */
    if (shownAt.current === null) {
      setVisible(false);
      return undefined;
    }

    const elapsed = Date.now() - shownAt.current;
    const remaining = BUSY_MIN_VISIBLE_MS - elapsed;

    if (remaining <= 0) {
      shownAt.current = null;
      setVisible(false);
      return undefined;
    }

    const hold = setTimeout(() => {
      shownAt.current = null;
      setVisible(false);
    }, remaining);

    return () => clearTimeout(hold);
  }, [isBusy]);

  return { visible, isLongWait };
}
