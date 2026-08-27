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

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
