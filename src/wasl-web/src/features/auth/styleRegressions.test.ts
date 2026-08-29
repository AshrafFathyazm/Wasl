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
    /* EVERY `.lang` RULE, not the first one.
     *
     * This took `exec()[0]` — the first match in the file. The 025 refinement
     * added a `.lang` override inside a container query, placed it ABOVE the base
     * rule, and this test began failing with a diff showing two inset properties
     * and no colour. The fix was still present; the test was reading the wrong
     * rule.
     *
     * That mattered, because asking why led to a real defect. A rule inside
     * `@container` carries only the specificity of its own selector — the query adds
     * none — so an override placed above its base rule loses on source order and
     * silently does nothing. Both are fixed: the override moved below the base
     * rule, and this now finds the rule by its CONTENT rather than its position.
     *
     * A test that named the wrong rule is how the defect surfaced. That is an
     * argument for the header note above, not against it. */
    const langRules = [...loginCss.matchAll(/\.lang\s*\{[^}]*\}/gs)].map(
      (match) => match[0],
    );
    const painted = langRules.find((rule) =>
      rule.includes('-webkit-text-fill-color'),
    );

    expect(painted).toBeDefined();
    expect(painted).toContain('color: var(--text-primary) !important');
    expect(painted).toContain(
      '-webkit-text-fill-color: var(--text-primary) !important',
    );
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

describe('D-8 — the channel label must not mirror its position', () => {
  /* REPORTED, in Arabic: hovering a channel showed its name in English and
   * showed almost nothing in Arabic — "hidden, or far away".
   *
   * D-7 again, one element over. `.tip` is absolutely positioned and then moved
   * by a `translate()` built from canvas coordinates, exactly like the nodes. It
   * was given `direction: rtl` under an RTL interface, copying `.panelText` —
   * and `inset-inline-start` maps to a physical side using THE ELEMENT'S OWN
   * direction, so its `inset-inline-start: 0` flipped to the panel's right edge
   * while the transform kept pushing right.
   *
   * `.panelText` is safe with the same declaration because it is in normal flow
   * and has no insets to flip. That difference is the whole defect, and it is
   * not visible from reading either rule on its own. */

  it('does not give the label a direction of its own', () => {
    expect(loginCss).not.toMatch(/\[dir='rtl'\]\s*\.tip\s*\{/s);
  });

  it('keeps the label on the same pinned axis as the nodes', () => {
    const tipRule = /\.tip\s*\{[^}]*\}/s.exec(loginCss)?.[0] ?? '';
    expect(tipRule).toContain('inset-inline-start: 0');
  });

  it('isolates the label text instead, so a mixed-script name still reads', () => {
    /* The position is physical; the TEXT still has to resolve its own
     * direction. `<bdi>` does that from the content — the same element
     * `LoginForm` wraps the error sentence in. */
    const panelTsx = read('features/auth/BrandPanel.tsx');
    expect(panelTsx).toMatch(/<bdi>\{channelLabel\}<\/bdi>/);
  });
});

describe('the entrance motion cannot hide what it animates', () => {
  /* `023`'s loader shape of mistake, asserted rather than remembered.
   *
   * Every entrance keyframe here starts at `opacity: 0`. Declared unconditionally
   * and merely cancelled under `prefers-reduced-motion: reduce`, the 0% state
   * stays painted and the form is invisible for exactly the people who cannot
   * ask for the motion back. So the declarations live INSIDE a
   * `no-preference` block and the elements are visible with no animation at all.
   *
   * This asserts the gating, not the pixels. */

  /** The body of the brace-balanced block that starts at `open`. */
  const blockBody = (css: string, open: number) => {
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) return css.slice(open + 1, i);
      }
    }
    throw new Error('unbalanced braces in Login.module.css');
  };

  const noPreferenceAt = loginCss.indexOf(
    '@media (prefers-reduced-motion: no-preference)',
  );
  const gated =
    noPreferenceAt < 0
      ? ''
      : blockBody(loginCss, loginCss.indexOf('{', noPreferenceAt));

  it('declares the entrance behind no-preference', () => {
    expect(noPreferenceAt).toBeGreaterThan(-1);
    for (const name of ['frame-in', 'fade-up', 'aurora-drift', 'error-shake']) {
      expect(gated).toContain(name);
    }
  });

  it('declares no animation anywhere else', () => {
    /* The strong half. A single `animation:` outside the gate is the defect
     * coming back, and it would come back looking correct. */
    const declarations = loginCss.match(/^\s*animation:/gm) ?? [];
    const gatedDeclarations = gated.match(/^\s*animation:/gm) ?? [];
    expect(declarations.length).toBeGreaterThan(0);
    expect(gatedDeclarations.length).toBe(declarations.length);
  });
});

describe('the card is fluid in block size', () => {
  it('floors the height instead of fixing it', () => {
    /* The reference pins the frame to 540px. Our form column is taller than the
     * reference's — a caps-lock hint, an error block and a `<details>` the
     * reference has none of — so a fixed height clips the moment any of the
     * three appears, and again in Arabic. Product owner, 2026-08-28: cap the
     * page's padding, put no max-height on the card. */
    const screenRule = /\.screen\s*\{[^}]*\}/s.exec(loginCss)?.[0] ?? '';
    expect(screenRule).toContain('min-block-size: 540px');
    expect(screenRule).not.toMatch(/^\s*block-size:/m);
    expect(screenRule).not.toMatch(/max-block-size:/);
  });
});

describe('container-query overrides follow the rules they override', () => {
  it('declares every base rule before its override', () => {
    /* MEASURED THROUGH A FAILING TEST, which is the only reason it was found.
     *
     * A rule inside `@container` carries the specificity of its own selector and
     * nothing more — the query adds none. So an override placed ABOVE its base
     * rule loses on source order and is dead CSS that reads as correct. The
     * `.lang` override shipped that way for one commit; the D-6 assertion caught
     * it by accident, because its locator found the override instead of the rule
     * it was written to guard.
     *
     * Asserted for all of them, not just `.lang`, because the next one will be a
     * different selector. */
    const overridden = [
      'screen',
      'panel',
      'halo',
      'panelText',
      'panelHeadline',
      'panelBody',
      'formColumn',
      'lang',
    ];

    /* INDENTATION IS THE LOCATOR, and the two earlier attempts are why.
     *
     * A base rule sits at column 0. Every override sits inside a block and is
     * indented. That is the whole distinction, and it needs no parsing.
     *
     * The first version matched `@container[^}]*?\n\s+\.name`, which cannot
     * cross a `}` — so it reached only the FIRST selector inside each block. Six
     * of the eight names below returned -1 and skipped their assertion while the
     * test reported green. Before that, the escapes were single: inside a
     * template literal `\s` collapses to `s` and `\.` to `.`, so the pattern was
     * `s+.name` and NOTHING matched. Zero of eight, also green.
     *
     * A brace-counting scan was tried next and hung on the `@container` that
     * appears inside a comment in this stylesheet. Counting braces to find a
     * block is more machinery than the question needs. */
    for (const name of overridden) {
      const base = loginCss.indexOf(`\n.${name} {`);
      expect(base, `${name}: no base rule`).toBeGreaterThan(-1);

      /* Every indented occurrence, not the first: an override can appear in more
       * than one block, and the earliest is the one that would lose. */
      const indented = new RegExp(`\\n +\\.${name}[,\\s]`, `g`);
      const hits = [...loginCss.matchAll(indented)].map((hit) => hit.index ?? 0);

      for (const at of hits) {
        expect(at, `${name}: override at ${at} precedes its base rule at ${base}`)
          .toBeGreaterThan(base);
      }
    }
  });
});
