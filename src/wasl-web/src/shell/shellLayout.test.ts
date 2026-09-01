import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * =============================================================================
 * THE SIDEBAR IS ONE VIEWPORT TALL AND STAYS PUT — asserted from the SOURCE
 * =============================================================================
 * Reported 2026-09-01: reaching your own name in the sidebar took a long scroll
 * down a long page, and the nav had scrolled away by the time you got there.
 *
 * The panel was `min-block-size: 100vh` inside a flex row, so on a tall page it
 * grew to the CONTENT's height — and `.nav { flex: 1 }` with
 * `.user { margin-block-start: auto }` then pushed the account block to the foot
 * of *that*, about two thousand pixels down.
 *
 * THE FIX WAS INERT FOR ITS FIRST ATTEMPT, and that is why this file exists.
 * `Sidebar.tsx` carried `style={{ position: … 'relative' }}` on the <aside>, and
 * an inline style beats a stylesheet: `position: sticky` was in the module,
 * computed style said `relative`, and nothing errored. Measured with a chain walk
 * over the ancestors, which is what finally named it.
 *
 * WHY A SOURCE SCAN. jsdom has no layout — `getBoundingClientRect` returns zeros —
 * so no rendered test in this suite can see a sticky panel, a viewport height, or
 * an inline style winning a cascade. The same reason `026` AC-16 reads the source
 * to prove `setQueryData` is absent: this is a claim about the code, and the code
 * is where it can be checked.
 */
const read = (rel: string) => readFileSync(resolve(process.cwd(), 'src/shell', rel), 'utf8');

/** CSS comments removed. The rule that caused this defect is now EXPLAINED inside
 *  the rule that fixed it — "it was min-block-size: 100vh" — so a scan over the
 *  raw text finds the words and fails on the prose. Third time this exact trap
 *  has been hit in this repo; stripping first is the answer, and the negative
 *  control below is what proves the stripper ran. */
const declarations = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('the shell sidebar cannot grow with the page', () => {
  const raw = read('Sidebar.module.css');
  const css = declarations(raw);
  const tsx = read('Sidebar.tsx');

  it('reads both files, so the assertions below cannot pass on nothing', () => {
    /* A negative control for the scanner itself. */
    expect(css.length).toBeGreaterThan(2000);
    /* the stripper ran: the prose is materially longer than the declarations */
    expect(css.length).toBeLessThan(raw.length * 0.75);
    expect(raw).toContain('min-block-size: 100vh');
    expect(css).toContain('.sidebar {');
    expect(tsx).toContain('<aside');
  });

  it('pins the panel to the viewport rather than to the content', () => {
    const rule = css.slice(css.indexOf('.sidebar {'), css.indexOf('.collapsed {'));

    expect(rule).toContain('position: sticky');
    expect(rule).toContain('inset-block-start: 0');
    /* `align-self` is not decoration: a flex item is STRETCHED back to the row's
       height without it, and the height below is then ignored. */
    expect(rule).toContain('align-self: flex-start');
    expect(rule).toMatch(/\bblock-size: 100dvh/);
  });

  it('does not give the panel a MINIMUM height, which is what let it grow', () => {
    const rule = css.slice(css.indexOf('.sidebar {'), css.indexOf('.collapsed {'));

    /* The exact declaration that caused the defect. A minimum is an invitation. */
    expect(rule).not.toMatch(/min-block-size:\s*100/);
  });

  it('lets the NAV scroll, so the account block never leaves the screen', () => {
    const rule = css.slice(css.indexOf('.nav {'), css.indexOf('.caption {'));

    expect(rule).toContain('overflow-y: auto');
    /* Without this a flex item will not shrink below its content, and `overflow-y`
       on an item that cannot shrink does nothing at all. */
    expect(rule).toContain('min-block-size: 0');
  });

  /* THE ONE THAT WOULD HAVE CAUGHT THE INERT FIX. */
  it('sets no inline position on the aside, because inline beats the module', () => {
    const code = tsx
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
      .join('\n');

    expect(code).not.toMatch(/style=\{\{[^}]*position/);
  });

  it('keeps the drawer position in the module, declared after .sidebar', () => {
    /* Removing the inline style is only safe because the drawer's `fixed` is in
       the stylesheet and comes later — same specificity, later wins. If somebody
       moves `.drawer` above `.sidebar`, the drawer silently becomes sticky. */
    expect(css.indexOf('.drawer {')).toBeGreaterThan(css.indexOf('.sidebar {'));
    const drawer = css.slice(css.indexOf('.drawer {'));
    expect(drawer.slice(0, 400)).toContain('position: fixed');
  });
});
