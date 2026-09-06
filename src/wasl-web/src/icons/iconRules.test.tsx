import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { ComponentType, SVGProps } from 'react';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as allIcons from './icons';
import { extractIcons } from './iconGeometry';

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/* ============================================================================
 * 037 · AC-3, AC-4, AC-5, AC-6 — the rules `icons.md` states and nothing checked
 * ============================================================================
 *
 * These are source assertions, not rendered ones, and that is deliberate for
 * three of the four: the rule is about what is AUTHORED. A rendered `<svg>` in
 * jsdom would tell you what one component produced; it would not tell you that
 * a seventy-third icon was added to the file with a fill on it.
 *
 * AC-4 is the exception and is rendered, because "stroke 1.5 at every size" is
 * a claim about the component's behaviour under a prop, not about its text.
 * ========================================================================= */

const SRC = join(__dirname, '..');
const MODULE_PATH = join(__dirname, 'icons.tsx');
const moduleSource = readFileSync(MODULE_PATH, 'utf8');
const icons = extractIcons(moduleSource);

/** Every `.ts`/`.tsx` under `src/`, so a stray icon anywhere is visible. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** Comments carry the words the scans below forbid, so they come out first. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the comment stripper works — the control for the two scans that use it', () => {
  it('removes a block comment and a line comment, and keeps the code', () => {
    const stripped = stripComments(
      'const a = 1; /* fill="currentColor" */\n// fill="red"\nconst b = 2;',
    );
    expect(stripped).not.toContain('currentColor');
    expect(stripped).not.toContain('fill="red"');
    expect(stripped).toContain('const a = 1;');
    expect(stripped).toContain('const b = 2;');
  });

  /* `029` and `027` both shipped a guard that went red on its own prose. This
   * proves the stripper ran, so a green scan is not a scan of nothing. */
  it('leaves the module with icons still in it', () => {
    expect(stripComments(moduleSource)).toMatch(/export const Icon/);
  });
});

/* -- AC-3 ----------------------------------------------------------------- */

describe('AC-3 — nothing in the set is filled', () => {
  const code = stripComments(moduleSource);

  it('declares fill only as none, and only once, in base()', () => {
    const fills = [...code.matchAll(/fill:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(fills).toEqual(['none']);
  });

  it('has no fill attribute on any shape', () => {
    expect([...code.matchAll(/\bfill="[^"]*"/g)].map((m) => m[0])).toEqual([]);
  });

  it.each([...icons])('%s carries no fill of its own', (_name, icon) => {
    expect(icon.fills).toEqual([]);
  });
});

/* -- AC-6 ----------------------------------------------------------------- */

describe('AC-6 — one module, one declaration per name', () => {
  it('declares no name twice', () => {
    const declared = [...moduleSource.matchAll(/^export const (Icon\w+)/gm)].map(
      (m) => m[1] as string,
    );
    const seen = new Set<string>();
    const duplicates = declared.filter((n) =>
      seen.has(n) ? true : (seen.add(n), false),
    );
    expect(duplicates, `declared more than once: ${duplicates.join(', ')}`).toEqual([]);
  });

  /* THIS IS THE GUARD THAT WAS MISSING. Before 037 there were two icon files
   * and `IconEye` was declared in both with different geometry, so `Input.tsx`
   * and `TicketListPage.tsx` rendered different drawings of one import name.
   * Nothing failed, because nothing looked. */
  it('declares no Icon component anywhere else under src/', () => {
    const strays = sourceFiles(SRC)
      .filter((f) => f !== MODULE_PATH)
      .filter((f) =>
        /^export const Icon[A-Z]/m.test(stripComments(readFileSync(f, 'utf8'))),
      )
      .map((f) => relative(SRC, f));
    expect(strays, `icons declared outside the module: ${strays.join(', ')}`).toEqual([]);
  });

  it('found the whole set, not a fragment of it', () => {
    expect(icons.size).toBeGreaterThanOrEqual(70);
  });
});

/* -- AC-5 ----------------------------------------------------------------- */

describe('AC-5 — the 24 box and the 18 default', () => {
  it('sets the viewBox once, in base(), and nowhere else', () => {
    const code = stripComments(moduleSource);
    expect([...code.matchAll(/viewBox:\s*'([^']+)'/g)].map((m) => m[1])).toEqual([
      '0 0 24 24',
    ]);
    expect([...code.matchAll(/\bviewBox="[^"]*"/g)].map((m) => m[0])).toEqual([]);
  });

  it.each([...icons])('%s defaults to size 18', (_name, icon) => {
    expect(icon.defaultSize).toBe(18);
  });
});

/* -- AC-4 ----------------------------------------------------------------- */

/* Rendered, not scanned, because this is a claim about behaviour under a prop:
 * `icons.md` says the stroke stays 1.5 at EVERY size, and the document this set
 * came from asks for 1.75 at 16. A source scan would see `strokeWidth: 1.5` in
 * `base()` and stop there, which is exactly the reading that would miss one
 * icon overriding it. */
describe('AC-4 — stroke 1.5 at every size, on every icon', () => {
  const sizes = [16, 18, 20, 24];

  it.each([...icons.keys()])('%s', (name) => {
    const Icon = (allIcons as unknown as Record<string, IconComponent | undefined>)[name];
    expect(Icon, `${name} is declared but not exported`).toBeTypeOf('function');
    if (!Icon) return;
    for (const size of sizes) {
      const { container, unmount } = render(<Icon size={size} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('stroke-width')).toBe('1.5');
      expect(svg?.getAttribute('width')).toBe(String(size));
      expect(svg?.getAttribute('height')).toBe(String(size));
      expect(svg?.getAttribute('stroke')).toBe('currentColor');
      expect(svg?.getAttribute('fill')).toBe('none');
      unmount();
    }
  });
});
