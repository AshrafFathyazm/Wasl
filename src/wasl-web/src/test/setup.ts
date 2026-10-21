import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/* Unmount between tests. Without it a test that asserts "one listbox" passes
 * against the PREVIOUS test's listbox, and the suite goes green while the
 * component is broken — the failure mode these tests exist to catch. */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* jsdom implements neither, and a component that calls either one throws before
 * its assertion runs. Stubbed rather than shimmed: no test asserts on scrolling
 * or on a media query, so a stub that records nothing is honest about that. */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

/* `041`. A WIDTH-AWARE matchMedia, because the table/cards choice and the sidebar
 * drawer now read it on first render. jsdom ships none, and a stub that answers
 * `false` to everything would mean "below every breakpoint" — every list a card
 * list, every sidebar a drawer — in every test that was written for a desktop.
 *
 * It understands exactly the forms this codebase writes — `(min-width: Npx)`,
 * `(max-width: Npx)` and the range spelling `(width >= Npx)` / `(width < Npx)` —
 * against `window.innerWidth`, which setup pins to a desktop below. A test that
 * wants a phone sets `window.innerWidth = 390` BEFORE rendering. Any other query
 * (`prefers-reduced-motion`, `hover`) answers `false`, as it did before. */
Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });

/** Pulls the pixel value out of one media feature, or null. */
function px(query: string, feature: RegExp): number | null {
  const match = feature.exec(query);
  return match ? Number(match[1]) : null;
}

function evaluate(query: string): boolean {
  const width = window.innerWidth;
  const min = px(query, /\(\s*min-width:\s*(\d+(?:\.\d+)?)px\s*\)/);
  if (min !== null) return width >= min;
  const max = px(query, /\(\s*max-width:\s*(\d+(?:\.\d+)?)px\s*\)/);
  if (max !== null) return width <= max;
  const ge = px(query, /\(\s*width\s*>=\s*(\d+(?:\.\d+)?)px\s*\)/);
  if (ge !== null) return width >= ge;
  const lt = px(query, /\(\s*width\s*<\s*(\d+(?:\.\d+)?)px\s*\)/);
  if (lt !== null) return width < lt;
  return false;
}

window.matchMedia = ((query: string) => ({
  get matches() {
    return evaluate(query);
  },
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
