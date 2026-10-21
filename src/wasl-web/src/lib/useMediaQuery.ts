import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

import { BREAKPOINTS, type BreakpointName } from '../styles/breakpoints';

/* ============================================================================
 * useMediaQuery / useBreakpoint — `041`
 * ============================================================================
 * THE FIRST RENDER ALREADY KNOWS THE ANSWER. `useState`'s initialiser reads
 * `matchMedia` synchronously, so a list that is cards on a phone never paints as
 * a table for one frame and then swaps — the flash a `useEffect`-first hook
 * produces on every load, and the reason the table/cards choice renders ONE of the
 * two rather than both with one hidden by CSS (`041` §8, Q-3).
 *
 * `change` listener, not a resize loop: the browser tells us when the answer
 * flips, and nothing runs on the other pixels.
 * ========================================================================= */

function read(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return false;
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => read(query));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/** `true` at and above the named breakpoint. Mobile-first: ask for the wide case. */
export function useBreakpoint(name: BreakpointName): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS[name]}px)`);
}

/**
 * `true` when the element is at least `minPx` wide — the CONTAINER's answer, for a
 * component whose room depends on what the page around it left (`041` §8.A).
 *
 * A table needs ~760px to be a table. At a 1024px viewport the full sidebar and the
 * page's frame leave ~620, so the VIEWPORT says "tablet, table" while the content
 * area says "cards" — and the table was drawn with its subject cut to eight
 * characters. The element is measured in `useLayoutEffect`, which runs before the
 * browser paints, so the first frame is already the right one even though the first
 * RENDER used `fallback`.
 *
 * `fallback` is what to say until a measurement exists: before mount, and in jsdom,
 * where every box is 0px wide. Callers pass the viewport breakpoint.
 */
export function useAtLeastWidth<T extends HTMLElement>(
  ref: RefObject<T | null>,
  minPx: number,
  fallback: boolean,
): boolean {
  const [wide, setWide] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (width > 0) setWide(width >= minPx);
    };
    measure();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, minPx]);

  return wide ?? fallback;
}
