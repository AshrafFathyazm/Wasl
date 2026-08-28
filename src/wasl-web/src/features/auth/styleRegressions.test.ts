import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* ============================================================================
 * D-3, D-6, D-7 — the three defects jsdom cannot see
 * ============================================================================
 *
 * READ THIS BEFORE TRUSTING THESE TESTS.
 *
 * jsdom does no layout and no cascade resolution worth the name:
 * `getBoundingClientRect()` returns zeroes and `getComputedStyle` will not tell
 * you that `-webkit-text-fill-color` beat `color`. So the three defects below —
 * all of which were found by MEASURING A REAL BROWSER — cannot be reproduced
 * here at all.
 *
 * What these are instead: assertions that the *fix* is still in the stylesheet.
 * They are PROXIES. They catch the fix being deleted, renamed, or refactored
 * away — which is the realistic regression, since each fix is one or two lines
 * whose purpose is not obvious from reading it. They do NOT catch the defect
 * coming back by another route: a new rule elsewhere re-introducing the padding,
 * a different selector winning, a token changing underneath.
 *
 * A measurement that names the wrong thing is worse than no measurement, so it
 * is named here: **these prove the source, not the pixels.** The pixels were
 * measured once, by hand, and the numbers are in `tests.md` §3.
 *
 * The honest fix is a browser-driven visual check in CI. That does not exist in
 * this project yet and is not in `025`'s scope.
 * ============================================================================ */

const read = (file: string) =>
  readFileSync(join(__dirname, '..', '..', file), 'utf8');

const loginCss = read('features/auth/Login.module.css');
const checkboxCss = read('components/Checkbox/Checkbox.module.css');

describe('D-3 — the checkbox must be square', () => {
  it('resets the inherited input padding', () => {
    /* MEASURED: 26.4 x 23. `base.css` gives every `input` a
     * `padding-inline: var(--space-3)`, and under `box-sizing: border-box` a
     * 23px box cannot shrink below its own padding plus border —
     * 12 + 12 + 1.2 + 1.2 = 26.4. It reads as a broken glyph, not a padding
     * rule. Deleting this reset brings it straight back. */
    expect(checkboxCss).toMatch(/\.control\s*\{[^}]*padding:\s*0\s*;/s);
  });

  it('sizes both axes from the same token', () => {
    expect(checkboxCss).toContain('inline-size: var(--checkbox-size)');
    expect(checkboxCss).toContain('block-size: var(--checkbox-size)');
  });

  it('keeps the tick physical, so it does not mirror into a backwards check', () => {
    /* A tick is a glyph, not a layout. ADR-007 §6 names the exception. */
    expect(checkboxCss).toMatch(/transform:\s*rotate\(45deg\)/);
  });
});

describe('D-6 — the language button rendered blank', () => {
  it('sets -webkit-text-fill-color alongside color', () => {
    /* MEASURED: the text was in the DOM, with the right font and the right
     * `color`, and the box painted nothing. `-webkit-text-fill-color` INHERITS
     * and beats `color`; `base.css` sets it on buttons so the primary button's
     * label stays white, and this button is white-on-white.
     *
     * `023` recorded this exact defect on the avatar initials. It is the second
     * time it has cost a screen, which is why it is asserted rather than
     * remembered. */
    const langRule = /\.lang\s*\{[^}]*\}/s.exec(loginCss)?.[0] ?? '';

    expect(langRule).toContain('color: var(--text-primary) !important');
    expect(langRule).toContain('-webkit-text-fill-color: var(--text-primary) !important');
  });
});

describe('D-7 — the mesh must not mirror under RTL', () => {
  it('pins the panel to ltr', () => {
    /* MEASURED: every channel icon left the panel in Arabic. The nodes are
     * positioned with `inset-inline-start: 0` and moved by a `translate()` whose
     * numbers come from canvas coordinates — and a canvas has no writing mode.
     * Under RTL the logical inset flips to the right edge while the transform
     * keeps pushing right.
     *
     * Same class as `023`'s loader, where a logical property inside an assembly
     * that is mirrored as a whole made it mirror twice. */
    const panelRule = /\.panel\s*\{[^}]*\}/s.exec(loginCss)?.[0] ?? '';
    expect(panelRule).toContain('direction: ltr');
  });

  it('puts the COPY back on the interface direction', () => {
    /* Pinning the panel is only half of it. The chip, headline, and subtitle are
     * text and must still mirror — without this they would sit left-aligned in
     * an Arabic interface. */
    expect(loginCss).toMatch(/\[dir='rtl'\]\s*\.panelText\s*\{[^}]*direction:\s*rtl/s);
  });

  it('flips the seam shadow, which has no logical form', () => {
    /* `box-shadow` cannot be expressed logically, so RTL needs an explicit rule.
     * Unflipped, the contact shadow lands on the outer edge of the form and
     * reads as a stray vertical line rather than as a bug. */
    expect(loginCss).toMatch(/\[dir='rtl'\]\s*\.formColumn\s*\{[^}]*inset\s+-16px/s);
  });
});

describe('the reveal toggle is an affix, not an action', () => {
  it('overrides the global button fill', () => {
    /* MEASURED: it rendered as a solid navy square inside the password field,
     * because `base.css` gives every `button` the primary background. */
    const inputCss = read('components/Input/Input.module.css');
    const revealRule = /\.reveal\s*\{[^}]*\}/s.exec(inputCss)?.[0] ?? '';

    expect(revealRule).toContain('background: transparent !important');
    expect(revealRule).toContain('color: var(--text-muted) !important');
  });
});
