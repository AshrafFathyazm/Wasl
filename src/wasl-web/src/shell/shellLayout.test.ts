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
const read = (rel: string) =>
  readFileSync(resolve(process.cwd(), 'src/shell', rel), 'utf8');

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

  /* REWRITTEN 2026-09-06, and it asserts the OUTCOME now rather than one
   * mechanism for it.
   *
   * It used to require `position: sticky` + `inset-block-start: 0` +
   * `align-self: flex-start` + `block-size: 100dvh` on the panel. Every one of
   * those existed to survive A PAGE THAT SCROLLED. The page does not scroll any
   * more — `.shell` is `100dvh` with `overflow: hidden` — so the panel is a
   * plain flex item at `block-size: 100%` and gets exactly the viewport height
   * with nothing pinning it.
   *
   * The DEFECT this guards is unchanged and is still the thing asserted: the
   * panel must take its height from the frame, never from the content, because
   * that is what pushed the account block two thousand pixels down. What changed
   * is which declarations produce it, so both halves are checked — the panel's,
   * and the shell's, which is now load-bearing for it. */
  it('takes the panel height from the frame, never from the content', () => {
    const rule = css.slice(css.indexOf('.sidebar {'), css.indexOf('.collapsed {'));

    /* The panel fills its row rather than measuring itself. */
    expect(rule).toMatch(/\bblock-size: 100%/);
    expect(rule).toContain('min-block-size: 0');

    /* And the row is exactly one viewport, and never scrolls — without this the
       100% above resolves against something that grows, which is the original
       defect wearing a different declaration. */
    const shell = declarations(read('AppShell.module.css'));
    const shellRule = shell.slice(shell.indexOf('.shell {'), shell.indexOf('.main {'));
    expect(shellRule).toMatch(/\bblock-size: 100dvh/);
    expect(shellRule).toContain('overflow: hidden');
  });

  /* NOT PART OF THE ORIGINAL GUARD, and added because removing `position:
   * sticky` broke it for one build: sticky was also the CONTAINING BLOCK for the
   * collapse toggle, which is absolutely positioned at `inset-inline-end: -13px`.
   * Without a positioned ancestor the button resolved against the viewport and
   * landed at x 1475 on a 1500px window — far from the panel, and overhanging
   * the document enough to give it a horizontal scrollbar. */
  it('keeps a containing block for the absolutely positioned toggle', () => {
    const rule = css.slice(css.indexOf('.sidebar {'), css.indexOf('.collapsed {'));
    const toggle = css.slice(css.indexOf('.toggle {'), css.indexOf('.toggle {') + 400);

    expect(toggle).toContain('position: absolute');
    expect(toggle).toMatch(/inset-inline-end:\s*-/);
    expect(rule).toMatch(/position:\s*(relative|sticky|absolute|fixed)/);
  });

  /* The panel must NOT clip, or it cuts the toggle's overhang in half — measured
   * at 12px of a 26px circle, in both the expanded and collapsed states. */
  it('does not clip the panel, so the toggle can straddle its edge', () => {
    const rule = css.slice(css.indexOf('.sidebar {'), css.indexOf('.collapsed {'));
    expect(rule).not.toMatch(/overflow:\s*hidden/);
    expect(rule).toContain('overflow: visible');
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
