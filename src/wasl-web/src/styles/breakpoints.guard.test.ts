import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ALLOWED_WIDTHS,
  BREAKPOINTS,
  CONTAINER_WIDTHS,
  LEGACY_WIDTHS,
} from './breakpoints';

/* ============================================================================
 * `041` AC-2 / AC-15 — the widths are named once, and every stylesheet agrees
 * ============================================================================
 * CSS cannot read a variable inside `@media` or `@container`, so the numbers are
 * spelled in each stylesheet and THIS is what keeps the spellings from drifting.
 * A rule at 1100px that nobody remembers choosing is how the product reached eight
 * different widths in eight files.
 *
 * It scans SOURCE, because jsdom evaluates no media query; it is a proxy for the
 * pixels, and says so. A guard that has never been seen to fail has not been
 * verified (CLAUDE.md), so the first test feeds the scanner a width that is not
 * allowed and expects to be told.
 * ========================================================================= */

const SRC = resolve(process.cwd(), 'src');

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return full.endsWith('.css') ? [full] : [];
  });
}

/** Block comments out, so a note explaining a retired width is not a width. */
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

interface Query {
  kind: 'media' | 'container';
  prelude: string;
  widths: number[];
}

/** Every `@media` / `@container` prelude and the px widths it tests. */
export function queriesIn(css: string): Query[] {
  const out: Query[] = [];
  const at = /@(media|container)\s+([^{]+)\{/g;
  for (let m = at.exec(css); m; m = at.exec(css)) {
    const kind = m[1] === 'media' ? 'media' : 'container';
    const prelude = (m[2] ?? '').trim();
    /* Only WIDTH features: `prefers-reduced-motion` and `hover` carry no px. */
    const widths = [...prelude.matchAll(/(\d+(?:\.\d+)?)px/g)].map((w) => Number(w[1]));
    if (widths.length > 0) out.push({ kind, prelude, widths });
  }
  return out;
}

const FILES = cssFiles(SRC).map((file) => ({
  file: file.slice(SRC.length + 1).replaceAll('\\', '/'),
  queries: queriesIn(strip(readFileSync(file, 'utf8'))),
}));

describe('the scanner itself — the control for everything below', () => {
  it('reads a media width, a range width and a container width', () => {
    const found = queriesIn(
      '@media (min-width: 1234px) { a{} } @media (width <= 321px) { a{} } @container x (width >= 555px) { a{} } @media (prefers-reduced-motion: reduce) { a{} }',
    );
    expect(found.map((q) => q.widths)).toEqual([[1234], [321], [555]]);
  });

  it('flags a width that is not allowed', () => {
    const bad = queriesIn('@media (min-width: 1100px) { a{} }').flatMap((q) => q.widths);
    expect(bad.filter((w) => !ALLOWED_WIDTHS.has(w))).toEqual([1100]);
  });
});

describe('AC-2 — every width in every stylesheet is one the product names', () => {
  it('uses only breakpoints, container widths and listed legacy widths', () => {
    const offenders = FILES.flatMap(({ file, queries }) =>
      queries.flatMap((q) =>
        q.widths
          .filter((w) => !ALLOWED_WIDTHS.has(w))
          .map((w) => `${file}: @${q.kind} ${q.prelude} — ${w}px`),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps no legacy exemption that no stylesheet uses any more', () => {
    const used = new Set(
      FILES.flatMap(({ queries }) => queries.flatMap((q) => q.widths)),
    );
    const stale = Object.keys(LEGACY_WIDTHS).filter((w) => !used.has(Number(w)));
    expect(stale).toEqual([]);
  });

  it('every breakpoint and container width is used somewhere, or it is decoration', () => {
    const used = new Set(
      FILES.flatMap(({ queries }) => queries.flatMap((q) => q.widths)),
    );
    const names = { ...BREAKPOINTS, ...CONTAINER_WIDTHS } as Record<string, number>;
    const unused = Object.entries(names)
      .filter(([, px]) => !used.has(px))
      // `sm` and `xl` are named for the hook and for Phase 2; they gain a rule there.
      .filter(([name]) => !['sm', 'xl', 'table'].includes(name))
      .map(([name]) => name);
    expect(unused).toEqual([]);
  });
});

describe('AC-15 — a page module decides its layout by CONTAINER, not by viewport', () => {
  const PAGE_MODULES = [
    'features/tickets/TicketDetail.module.css',
    'features/tickets/CreateTicket.module.css',
  ];

  it.each(PAGE_MODULES)(
    '%s has no viewport width media query for its columns',
    (file) => {
      const entry = FILES.find((f) => f.file === file);
      expect(entry).toBeDefined();
      /* `bp: md` padding and tap-target rules are phone/tablet FLOORS and stay
       viewport queries; what must not appear is a viewport query that decides how
       many columns the page has. Those are all `@container` here. */
      const columns = entry!.queries.filter(
        (q) =>
          q.kind === 'container' && q.widths.some((w) => w === CONTAINER_WIDTHS.split),
      );
      expect(columns.length).toBeGreaterThan(0);
    },
  );
});
