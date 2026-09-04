import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * =============================================================================
 * ROW HOVER — `035` §7, asserted from the SOURCE
 * =============================================================================
 * Specified by the product owner on 2026-09-03 as CSS plus five constraints,
 * each of which prevents a specific defect. jsdom draws no boxes — every rect is
 * zero — so none of it can be measured in this suite. These are claims about the
 * code that produces the paint, and the code is where they can be checked.
 *
 * WHAT WAS MEASURED IN A REAL BROWSER, and is recorded rather than asserted
 * (1500×1000, signed in, `/customers`, third row hovered, fifth row given
 * `aria-selected` by hand):
 *
 *   ar   dir rtl   border-collapse collapse   row height 62
 *        hover     rgb(239,245,246)  rail rgb(159,180,188) -3px inset
 *        selected  rgb(243,243,251)  rail rgb(29,23,77)    -3px inset
 *   en   dir ltr   border-collapse collapse   row height 62
 *        hover     rgb(239,245,246)  rail rgb(159,180,188)  3px inset
 *        selected  rgb(243,243,251)  rail rgb(29,23,77)     3px inset
 *   both cells rgba(0,0,0,0) — transparent, so the ROW's fill is what shows
 *
 * Screenshots in both directions confirmed the rail lands on the LEADING edge:
 * right in Arabic, left in English, on the hovered row and the selected one.
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8');

/** Comments stripped FIRST. This stylesheet's prose QUOTES what it replaced —
 *  "it was `.row:hover .td`" — so a scan over the raw text finds the words in the
 *  explanation and passes on it. Third time this trap has been hit in this repo;
 *  the control below is what proves the stripper ran. */
const declarations = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const RAW = read('components/Table/Table.module.css');
const CSS = declarations(RAW);
const TOKENS = declarations(read('styles/tokens.css'));
const TSX = read('components/Table/Table.tsx');

/**
 * The body of one rule, by its EXACT selector.
 *
 * The first version searched for the selector as a substring and took the next
 * `{` — so `rule(css, '.row')` returned the body of `.row:last-child .td`,
 * which is the rule that happens to mention `.row` first. Two assertions failed
 * on a stylesheet that was correct. The selector must end where the brace
 * begins.
 */
const rule = (css: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, (ch) => `\\${ch}`);
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? null;
};

describe('the table row lights once, on the row', () => {
  it('read both files, so nothing below can pass on an empty string', () => {
    expect(CSS.length).toBeGreaterThan(500);
    expect(TOKENS.length).toBeGreaterThan(500);
    expect(TSX.length).toBeGreaterThan(500);
  });

  it('stripped the comments — the control for every scan in this file', () => {
    expect(CSS).not.toContain('/*');
    /* The prose says the words the scans below forbid. If the stripper stopped,
       these would be found in it. */
    expect(RAW).toContain('.row:hover .td');
    expect(CSS).not.toContain('.row:hover .td');
  });

  /* ---- the constraints, one test each ------------------------------------ */

  it('hovers the <tr>, not the <td>', () => {
    /* It was `.row:hover .td`, which lights eight cells that happen to abut.
       The requirement is explicit that the row lights ONCE. */
    expect(CSS).not.toMatch(/\.row:hover\s+\.td/);
    expect(rule(CSS, '.row:hover')).toMatch(
      /background-color:\s*var\(--surface-table-row-hover\)/,
    );
  });

  it('keeps border-collapse: collapse, without which the inset rail does not paint', () => {
    /* Asserted rather than assumed: nothing about `separate` would error, and
       the rail would simply be invisible. */
    expect(rule(CSS, '.table')).toMatch(/border-collapse:\s*collapse/);
  });

  it('puts the rail on the leading edge in BOTH directions', () => {
    /* `box-shadow` offsets are PHYSICAL — there is no logical form, and a shadow
       does not flip with `direction`. The requirement assumed it would
       ("يمين في RTL تلقائياً"), so the sign is set once per direction. */
    expect(rule(CSS, '.row')).toMatch(/--row-rail-x:\s*3px/);
    expect(rule(CSS, "[dir='rtl'] .row")).toMatch(/--row-rail-x:\s*-3px/);
    expect(rule(CSS, '.row:hover')).toMatch(
      /box-shadow:\s*inset var\(--row-rail-x\) 0 0 var\(--border-table-row-rail\)/,
    );
  });

  it('changes NO size under any :hover in this file', () => {
    /* Any padding, height or border change makes the row jump under the cursor.
       Scanned over EVERY `:hover` rule in the primitive, not just the row's —
       the next one added would otherwise be unguarded. */
    const hoverRules = [...CSS.matchAll(/[^{}]*:hover[^{]*\{([^}]*)\}/g)].map(
      (m) => m[1],
    );
    expect(hoverRules.length).toBeGreaterThan(0);
    for (const body of hoverRules) {
      expect(body).not.toMatch(/(^|[\s;])padding/);
      expect(body).not.toMatch(/(^|[\s;])(block-size|height|inline-size|width)\s*:/);
      expect(body).not.toMatch(/(^|[\s;])border(?!-radius)/);
    }
  });

  it('transitions background-color, not the background shorthand', () => {
    /* `transition: background` animates a shorthand that includes
       `background-position`, which is not what 120ms was specified for. */
    expect(rule(CSS, '.row')).toMatch(/transition:\s*background-color 120ms linear/);
    expect(rule(CSS, '.row')).not.toMatch(/transition:\s*background\s+/);
  });

  it('gives the pointer only to a clickable row', () => {
    /* A pointer over an inert row promises a click that does nothing. The
       primitive already knows which rows are clickable. */
    expect(rule(CSS, '.rowClickable')).toMatch(/cursor:\s*pointer/);
    expect(rule(CSS, '.row')).not.toMatch(/cursor:/);
    expect(TSX).toMatch(/onRowClick && styles\.rowClickable/);
  });

  it('lets the selected row win, hover included', () => {
    /* Dead CSS today — nothing in the product marks a row selected. Specified
       now because the ticket detail's row flyout and `035`'s sheet both create
       that state, and a rule written after the fact is a rule written twice. */
    expect(CSS).toMatch(
      /\.row\[aria-selected='true'\],\s*\.row\[aria-selected='true'\]:hover/,
    );
    const selected = rule(
      CSS,
      ".row[aria-selected='true'],\n.row[aria-selected='true']:hover",
    );
    expect(selected).toMatch(/background-color:\s*var\(--surface-table-row-selected\)/);
    expect(selected).toMatch(/var\(--border-table-row-rail-selected\)/);
  });

  it('sets no inline row background anywhere, so CSS is the only owner', () => {
    /* The requirement's last constraint: if a row carried an inline background
       from JavaScript, CSS could not win and the hover would have to be done
       with mouseenter/mouseleave, skipping the selected row. No such style
       exists — asserted, so the day one appears this test names the reason. */
    expect(TSX).not.toMatch(/<tr[^>]*style=/);
    expect(TSX).not.toMatch(/backgroundColor/);
  });

  /* ---- the colours live in exactly one file ------------------------------ */

  it('keeps the four colours in tokens.css and nowhere else', () => {
    /* `#e9f1f3`, not the `#D6E4E8` the requirement specified: asked for two steps
       lighter on 2026-09-03 and then a third, each ~28% toward white:
       #d6e4e8 -> #e0eaed -> #e9f1f3 -> #eff5f6. The rail kept its value —
       see the note on the token. */
    for (const hex of ['#eff5f6', '#9fb4bc']) {
      expect(TOKENS.toLowerCase()).toContain(hex);
      expect(CSS.toLowerCase()).not.toContain(hex);
    }
    /* The other two were already there. */
    expect(TOKENS.toLowerCase()).toContain('#1d174d');
    expect(TOKENS.toLowerCase()).toContain('#f3f3fb');
  });

  it('does NOT repurpose --surface-row-hover, which has ten other consumers', () => {
    /* `035` §7 said to rewrite it to #D6E4E8. Counting the call sites found
       eleven — one table row and ten faint hovers on the ticket detail's menu
       items and panel rows plus the segmented tab track — so rewriting it would
       have restyled nine surfaces nobody asked about. The spec is corrected. */
    expect(TOKENS).toMatch(/--surface-row-hover:\s*#fafcfc/);
    expect(CSS).not.toContain('--surface-row-hover');
  });
});
