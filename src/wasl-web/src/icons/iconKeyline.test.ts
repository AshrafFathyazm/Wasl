import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CONTROLS,
  KEYLINE,
  KEYLINE_TOLERANCE,
  bboxOf,
  extractIcons,
  overhang,
  pathPoints,
} from './iconGeometry';

/* ============================================================================
 * 037 · AC-1 and AC-2 — the keyline is a test now
 * ============================================================================
 *
 * `design/icons.md` Rule 2 is a 16-unit keyline inside the 24 box, and it is
 * one of the two rules the whole set's signature rests on. Nothing checked it,
 * so it drifted: the first run of this file against the set as it stood
 * reported EIGHT violations across thirty-nine icons, with a green build.
 *
 * `icons.md` says the signature must be "felt, not seen". A rule that is felt
 * rather than seen is exactly the kind that cannot be caught by looking, which
 * is why it needs a number.
 * ========================================================================= */

const ICONS_DIR = __dirname;

/** Every icon module in the folder — two files before 037 merges them, one after. */
function iconModules(): Array<{ file: string; source: string }> {
  return readdirSync(ICONS_DIR)
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
    .map((file) => ({ file, source: readFileSync(join(ICONS_DIR, file), 'utf8') }));
}

function allIcons(): Array<{ file: string; name: string; icon: ReturnType<typeof extractIcons> extends Map<string, infer V> ? V : never }> {
  const out: Array<{ file: string; name: string; icon: never }> = [];
  for (const { file, source } of iconModules())
    for (const [name, icon] of extractIcons(source)) out.push({ file, name, icon: icon as never });
  return out;
}

/* -- AC-2 · the controls, before anything else --------------------------- *
 *
 * These run first and they are not decoration. The first version of the tool
 * this file imports mis-tokenised compact arc flags and produced a well-formed
 * report about nothing; control 2 is that exact shape. If a control fails, no
 * number below means anything.
 */
describe('AC-2 — the tool is verified before it is believed', () => {
  it.each(CONTROLS)('measures $what correctly', ({ d, expect: want }) => {
    const got = bboxOf({ circles: [], rects: [], paths: [d] });
    expect(got.x0).toBeCloseTo(want.x0, 2);
    expect(got.y0).toBeCloseTo(want.y0, 2);
    expect(got.x1).toBeCloseTo(want.x1, 2);
    expect(got.y1).toBeCloseTo(want.y1, 2);
  });

  /* `008`'s query counter: a measurement that reports nothing satisfies every
   * "must be under N" assertion ever written. So it throws instead. */
  it('throws rather than measuring nothing', () => {
    expect(() => pathPoints('')).toThrow(/no points/);
    expect(() => bboxOf({ circles: [], rects: [], paths: [] })).toThrow(/nothing to measure/);
    expect(() => extractIcons('// a file with no icons in it')).toThrow(/matched nothing/);
  });

  it('refuses an arc flag that is not 0 or 1 instead of guessing', () => {
    expect(() => pathPoints('M0 0a2 2 0 9 1 4 4')).toThrow(/arc flag/);
  });
});

/* -- AC-1 · the keyline --------------------------------------------------- */

describe('AC-1 — every icon is inside the 16-unit keyline', () => {
  it('found icons to measure at all', () => {
    expect(allIcons().length).toBeGreaterThan(20);
  });

  it.each(allIcons())('$name ($file)', ({ name, icon }) => {
    const box = bboxOf(icon);
    const over = overhang(box);
    expect(
      over,
      `${name} reaches ${over.toFixed(2)} units outside the keyline — ` +
        `x ${box.x0.toFixed(2)}…${box.x1.toFixed(2)}, y ${box.y0.toFixed(2)}…${box.y1.toFixed(2)}, ` +
        `and the keyline is ${KEYLINE.min}…${KEYLINE.max}`,
    ).toBeLessThanOrEqual(KEYLINE_TOLERANCE);
  });
});
