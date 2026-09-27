import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyTheme,
  awayFrom,
  paintsTheSame,
  readCachedTheme,
  THEME_CACHE_KEY,
  writeCachedTheme,
  type Theme,
} from './theme';

/* ============================================================================
 * theme.ts — `022`, FE-022-02
 * ========================================================================= */

const THEME: Theme = {
  brandColor: '#1570EF',
  onBrand: '#FFFFFF',
  sidebarMode: 'Brand',
  updatedAtUtc: '2026-09-27T00:00:00Z',
  version: 'AAAAAAAAB9E=',
};

beforeEach(() => {
  localStorage.clear();
});

describe('applyTheme writes only brand tokens (AC-16)', () => {
  it('sets the three custom properties and the sidebar attribute', () => {
    const root = document.createElement('div');

    applyTheme(THEME, root);

    expect(root.style.getPropertyValue('--brand')).toBe('#1570EF');
    expect(root.style.getPropertyValue('--on-brand')).toBe('#FFFFFF');
    expect(root.style.getPropertyValue('--brand-away')).toBe('black');
    expect(root.dataset['sidebarMode']).toBe('brand');
  });

  /* THE ASSERTION AC-16 IS ACTUALLY ABOUT. A tenant who could set "success" to
   * red would have a product that can lie about state (ADR-012 part 3), and the
   * failure mode is a screen that renders perfectly and means the wrong thing.
   *
   * Asserted as "nothing but these four", not as "these four are present" —
   * presence would stay green if a fifth token were added tomorrow. */
  it('writes nothing else at all', () => {
    const root = document.createElement('div');

    applyTheme(THEME, root);

    const written = Array.from({ length: root.style.length }, (_, index) =>
      root.style.item(index),
    ).sort();

    expect(written).toEqual(['--brand', '--brand-away', '--on-brand']);
    expect(Object.keys(root.dataset)).toEqual(['sidebarMode']);
  });

  it('flips the ramp direction for a light brand', () => {
    const root = document.createElement('div');

    applyTheme({ ...THEME, brandColor: '#4A9E96', onBrand: '#0D2626' }, root);

    expect(root.style.getPropertyValue('--brand-away')).toBe('white');
  });
});

describe('awayFrom maps the decision, and does not remake it', () => {
  it.each([
    ['#FFFFFF', 'black'],
    ['#ffffff', 'black'],
    ['#0D2626', 'white'],
  ])('%s mixes toward %s', (onBrand, expected) => {
    expect(awayFrom(onBrand)).toBe(expected);
  });
});

describe('the cache never throws (A-4)', () => {
  it('round-trips a theme', () => {
    writeCachedTheme(THEME);

    expect(readCachedTheme()).toEqual(THEME);
  });

  it('returns null for corrupt JSON rather than throwing', () => {
    localStorage.setItem(THEME_CACHE_KEY, '{ not json');

    expect(readCachedTheme()).toBeNull();
  });

  /* A RELEASE CAN CHANGE THE SHAPE, and a cached object from the previous one
   * must not reach `applyTheme` and write `undefined` into `--brand`. */
  it('returns null for a well-formed object of the wrong shape', () => {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ brandColor: '#1570EF' }));

    expect(readCachedTheme()).toBeNull();
  });

  it('returns null for an unknown sidebar mode', () => {
    localStorage.setItem(
      THEME_CACHE_KEY,
      JSON.stringify({ ...THEME, sidebarMode: 'Rainbow' }),
    );

    expect(readCachedTheme()).toBeNull();
  });

  /* A PRIVATE WINDOW THROWS ON `localStorage` ACCESS. A theme cache that breaks
   * the application is worse than a flash, so both paths swallow. */
  it('survives a storage that throws on read', () => {
    const throwing = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError');
      }),
      setItem: vi.fn(),
    } as unknown as Storage;

    expect(() => readCachedTheme(throwing)).not.toThrow();
    expect(readCachedTheme(throwing)).toBeNull();
  });

  it('survives a storage that throws on write', () => {
    const throwing = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('QuotaExceededError');
      }),
    } as unknown as Storage;

    expect(() => writeCachedTheme(THEME, throwing)).not.toThrow();
  });
});

describe('paintsTheSame — AC-18, one write and not two', () => {
  it('ignores fields that do not affect paint', () => {
    expect(
      paintsTheSame(THEME, { ...THEME, version: 'different', updatedAtUtc: 'later' }),
    ).toBe(true);
  });

  it.each([
    ['brandColor', { brandColor: '#000000' }],
    ['onBrand', { onBrand: '#0D2626' }],
    ['sidebarMode', { sidebarMode: 'Dark' as const }],
  ])('reports a difference in %s', (_field, patch) => {
    expect(paintsTheSame(THEME, { ...THEME, ...patch })).toBe(false);
  });

  /* A MISSING CACHE IS NOT "THE SAME". Treating null as equal would suppress the
   * corrective write on the very load that needs it — the first one. */
  it('is false when either side is absent', () => {
    expect(paintsTheSame(null, THEME)).toBe(false);
    expect(paintsTheSame(THEME, null)).toBe(false);
  });
});
