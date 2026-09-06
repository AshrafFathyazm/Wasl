import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/* ============================================================================
 * `038` — the claims no rendered test can make
 * ============================================================================
 * jsdom computes no layout and applies no stylesheet, so nothing rendered can
 * see a grid column, a lost cascade, or an import that should not exist. These
 * are claims about the SOURCE, and `027` established the shape: strip comments
 * first, and carry a control proving the stripper ran — because the prose
 * explaining a rule contains the words the rule forbids, and the guard then goes
 * red on its own documentation. That has now happened three times in this
 * repository.
 * ============================================================================ */

const DIR = resolve(process.cwd(), 'src/features/tickets');

const read = (name: string) => readFileSync(join(DIR, name), 'utf8');

/** Both comment syntaxes, and CSS comments are the `/* *\/` form too. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the stripper runs — the control for every scan below', () => {
  it('removes a block comment and keeps the code beside it', () => {
    const stripped = stripComments('const a = 1; /* grid-template-columns: 1fr */ const b = 2;');
    expect(stripped).toContain('const a = 1;');
    expect(stripped).toContain('const b = 2;');
    expect(stripped).not.toContain('grid-template-columns');
  });

  it('is actually applied to the page, whose comments name what the scans forbid', () => {
    /* THE FILE'S OWN PROSE mentions `getSupportUsers` and
       `grid-template-columns` while explaining why neither may appear. Without
       the strip, every assertion below fails on its own documentation. */
    const raw = read('CreateTicketPage.tsx');
    expect(raw).toContain('getSupportUsers');
    expect(stripComments(raw)).not.toContain('getSupportUsers');
  });
});

describe('AC-4 — the two-column grid is declared in CSS, and nothing overrides it', () => {
  const css = stripComments(read('CreateTicket.module.css'));
  const page = stripComments(read('CreateTicketPage.tsx'));

  it('declares the 316px rail inside a 1100px media query, in the stylesheet', () => {
    expect(css).toMatch(/@media\s*\(width\s*>=\s*1100px\)/);
    expect(css).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+316px/);
  });

  it('sets NO grid property in an inline style anywhere on the page', () => {
    /* SPEC M-1, AND IT IS THE WHOLE REASON THIS FILE EXISTS.
     *
     * The supplied mock-up carried `grid-template-columns:minmax(0,1fr)` in the
     * element's `style` attribute. Its own `@media (min-width:1100px)` rule
     * never applied — an inline style outranks every stylesheet rule that is not
     * `!important` — so the two-column design shipped as one column with a green
     * everything. Measured in Chrome: the media query matched `true` and
     * computed columns were a single `1060px` track.
     *
     * `027` found the identical failure in `Sidebar.tsx`, where
     * `style={{ position: 'relative' }}` silently beat a stylesheet `sticky`. */
    expect(page).not.toMatch(/style=\{\{[^}]*grid/i);
    expect(page).not.toMatch(/gridTemplateColumns/);
  });

  it('has no inline style attribute on the page at all', () => {
    /* The stronger claim, and it is cheap here because this screen needs none.
       A narrow "no grid inline" rule invites the next inline style, and the one
       after that is a `position`. */
    expect(page).not.toMatch(/\bstyle=\{/);
  });
});

describe('AC-31 — the assignment control has no fetcher', () => {
  const page = stripComments(read('CreateTicketPage.tsx'));

  it('never imports or calls getSupportUsers', () => {
    /* R-1 draws the control and does not build it. `getSupportUsers` EXISTS —
       `011` shipped it and the ticket detail's picker uses it — so the absence
       here is a decision, not a limitation.
       A `disabled` prop is one edit away from deletion; a function that is not
       imported is not. This is `027`'s rule for the escalate/merge rows, applied
       to the one control on this screen the backend cannot serve. */
    expect(page).not.toContain('getSupportUsers');
    expect(page).not.toContain('supportUsers');
  });
});

describe('AC-23 — logical properties only', () => {
  const css = stripComments(read('CreateTicket.module.css'));

  it('uses no physical inset or margin side', () => {
    /* stylelint enforces this repo-wide; asserted here too because this feature
       moves a footer's actions to one edge, which is the single most common
       place `margin-left: auto` gets written. */
    expect(css).not.toMatch(/(margin|padding|inset|border)-(left|right):/);
    expect(css).not.toMatch(/\b(left|right):\s/);
  });
});

describe('AC-37 — the icon set is untouched by this feature', () => {
  it('renders WhatsApp from the shared module and defines no svg of its own', () => {
    /* R-7, reversed 2026-09-06: use the icon the system ships, not the mock-up's
       glyph. So this feature's files contain no `<svg>` at all — the whole set
       is reached by import. `037`'s trademark question stays open where `037`
       left it, and no screen outside this one changes appearance. */
    for (const file of [
      'ChannelPicker.tsx',
      'CreateTicketPage.tsx',
      'CustomerPicker.tsx',
      'DuplicateWarning.tsx',
      'PriorityPicker.tsx',
      'RadioGroup.tsx',
    ]) {
      expect(stripComments(read(file)), `${file} draws its own svg`).not.toContain('<svg');
    }

    expect(read('ChannelPicker.tsx')).toContain("from '../../icons/icons'");
    expect(read('ChannelPicker.tsx')).toContain('IconWhatsapp');
  });
});
