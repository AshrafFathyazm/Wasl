import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/* ============================================================================
 * `039` — the source guards
 * ============================================================================
 * Six of these assert an ABSENCE, and an absence is the one thing a rendered
 * test cannot hold: `queryByRole(...)` is null for a control that is missing,
 * for one that is hidden, and for one that failed to render. Only a scan of the
 * source can say the thing was never written.
 *
 * EVERY SCAN STRIPS COMMENTS FIRST, and there is a control below proving the
 * stripper ran. `027` shipped two guards that failed on their own prose — an
 * absence guard for `sla` went red on `useTranslation`, and a sidebar guard went
 * red on the comment explaining the declaration it forbids.
 * ========================================================================= */

const HERE = __dirname;

/** The modules this feature owns. Named one by one rather than globbed: a glob
 *  quietly stops covering a file the day it is renamed, and these guards are the
 *  only thing standing between the product and a checkbox that promises a
 *  customer a message nobody sends. */
const FEATURE_TS = [
  'AssigneePanel.tsx',
  'Avatar.tsx',
  'CloseTicketModal.tsx',
  'RowAssignMenu.tsx',
  'openTicketCounts.ts',
];

const FEATURE_CSS = [
  'AssigneePanel.module.css',
  'Avatar.module.css',
  'CloseTicketModal.module.css',
  'RowAssignMenu.module.css',
];

const read = (file: string) => readFileSync(resolve(HERE, file), 'utf8');

/** Block comments, line comments and JSX comments. Deliberately crude: it may
 *  take a `//` inside a string literal with it, and every scan below is about
 *  identifiers and property names, none of which live in a URL. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

describe('the stripper itself — the control that makes every scan below mean something', () => {
  it('removes a block comment, a line comment and keeps the code between them', () => {
    const stripped = stripComments(
      ['/* danger */', 'const a = 1;', '// danger', 'const b = 2;'].join('\n'),
    );

    expect(stripped).not.toContain('danger');
    expect(stripped).toContain('const a = 1;');
    expect(stripped).toContain('const b = 2;');
  });

  it('is actually applied — the sources DO carry the words the scans forbid', () => {
    /* Each forbidden word appears in this feature's own PROSE, so a scan run on
       the raw source would go red for the wrong reason — `027` shipped two
       guards that did exactly that. */
    expect(read('CloseTicketModal.tsx')).toContain('checkbox');
    expect(stripComments(read('CloseTicketModal.tsx'))).not.toContain('checkbox');
  });

  it('keeps the CODE — a stripper returning nothing would pass every scan below', () => {
    /* THE PAIR ABOVE IS NOT ENOUGH ON ITS OWN, and it was the only control here
       until it was tested: replacing `stripComments` with `() => ''` left the
       whole file GREEN. "The word is in the raw source and not in the stripped
       one" is satisfied by an empty string, which is also what a broken stripper
       returns. Measured, not reasoned — control C9 in `tests.md`. */
    const stripped = stripComments(read('CloseTicketModal.tsx'));

    expect(stripped).toContain('changeTicketStatus');
    expect(stripped).toContain('allowedTransitions');
    expect(stripped.length).toBeGreaterThan(read('CloseTicketModal.tsx').length / 3);
  });
});

describe('AC-3 — the close item is not a danger control, in either file', () => {
  it('has no `rowMenuItemDanger` left anywhere', () => {
    const page = stripComments(readFileSync(resolve(HERE, 'TicketListPage.tsx'), 'utf8'));
    const css = readFileSync(resolve(HERE, 'TicketList.module.css'), 'utf8');

    expect(page).not.toContain('rowMenuItemDanger');
    /* The stylesheet keeps a paragraph explaining the deletion, so this asserts
       the SELECTOR is gone rather than the word. */
    expect(css).not.toMatch(/^\.rowMenuItemDanger/m);
  });
});

describe('AC-17 — BR-1 lives on the server, and no copy of it is in this feature', () => {
  it('declares no transition map', () => {
    for (const file of FEATURE_TS) {
      const source = stripComments(read(file));

      /* A map from a status to the statuses it may move to would look like one
         of these. The client reads `allowedTransitions` off the ticket instead —
         "the API returns allowedTransitions and the UI renders only what it was
         given". */
      expect(source, file).not.toMatch(/PendingCustomer\s*:/);
      expect(source, file).not.toMatch(/InProgress\s*:\s*\[/);
      expect(source, file).not.toMatch(/TRANSITIONS/);
    }
  });

  it('reads the legal transitions from the ticket the server sent', () => {
    expect(stripComments(read('CloseTicketModal.tsx'))).toContain(
      'allowedTransitions.includes',
    );
  });
});

describe('AC-28 — this feature fires toasts and configures nothing about them', () => {
  it('imports only `useToast` from the toast module', () => {
    for (const file of FEATURE_TS) {
      const source = stripComments(read(file));
      const imports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*Toast[^']*'/g)];

      for (const match of imports) {
        const named = match[1]!.split(',').map((name) => name.trim()).filter(Boolean);
        expect(named, file).toEqual(['useToast']);
      }

      /* The three things a caller must never restate: the timing table, the
         stack limit and the ARIA role. All three belong to `Toast`/`ToastHost`,
         and a copy here is how the product ends up with two answers. */
      expect(source, file).not.toContain('TOAST_MS');
      expect(source, file).not.toContain('MAX_VISIBLE');
      expect(source, file).not.toMatch(/role=["'](status|alert)["']\s*\}?\s*$/m);
      expect(source, file).not.toMatch(/duration|dismissAfter|timeoutMs/);
    }
  });
});

describe('AC-30 — every glyph comes from the icon set', () => {
  it('authors no `<svg>` of its own', () => {
    for (const file of FEATURE_TS) {
      /* `037` replaced the whole set and put four guards around it. An inline
         path here would be outside all four: no keyline check, no duplicate
         check, no RTL flip, no stroke rule. */
      expect(stripComments(read(file)), file).not.toContain('<svg');
      expect(stripComments(read(file)), file).not.toContain('viewBox');
    }
  });
});

describe('AC-31 / AC-32 — semantic tokens, and logical properties only', () => {
  it('uses no hex colour literal', () => {
    for (const file of FEATURE_CSS) {
      const css = read(file).replace(/\/\*[\s\S]*?\*\//g, ' ');

      /* The mock's own three count colours are `#C4362F`, `#8A5A00`, `#76818C`.
         Two are tokens exactly; the red is NOT — the house `--state-danger-text`
         is `#e54545`, and the house value wins the way `037`'s keyline won over
         a supplied icon set's. Recorded in `summary.md`, not smuggled in as a
         literal. */
      expect(css, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it('uses no physical `left` / `right` property', () => {
    for (const file of FEATURE_CSS) {
      const css = read(file).replace(/\/\*[\s\S]*?\*\//g, ' ');

      expect(css, file).not.toMatch(/^\s*(left|right)\s*:/m);
      expect(css, file).not.toMatch(/^\s*(margin|padding|border)-(left|right)\s*:/m);
      expect(css, file).not.toMatch(/\btext-align:\s*(left|right)\b/);
    }
  });
});

describe('AC-34 — two unbuilt things, absent rather than disabled', () => {
  it('has no notification control and no `notify` on any type it declares (G-5, Q-2)', () => {
    const source = stripComments(read('CloseTicketModal.tsx'));

    /* `021` is unbuilt. A checkbox promising the customer a message is a fact
       the product does not have, and it looks exactly like a working one. A
       DISABLED checkbox was the other option and was ruled out: `027`'s "draw it
       inert" covers ACTIONS, and a disabled input reads as "not yet". */
    expect(source).not.toContain('checkbox');
    expect(source).not.toContain('Checkbox');
    expect(source).not.toMatch(/\bnotify/i);
  });

  it('imports nothing that could supply "the customer\'s last message" (G-6)', () => {
    for (const file of FEATURE_TS) {
      const source = stripComments(read(file));

      /* There is no customer message in this product — `Interaction` was never
         built. A banner drawn from nothing is worse than no banner, and a
         `disabled` prop is one edit from deletion while a function that does not
         exist is not. */
      expect(source, file).not.toContain('getTicketTimeline');
      expect(source, file).not.toContain('Timeline');
      expect(source, file).not.toMatch(/lastMessage|awaitingReply|unanswered/i);
    }
  });
});

describe('AC-35 — one AssigneePanel, and both screens import it', () => {
  const featureFiles = readdirSync(HERE).filter((name) => name.endsWith('.tsx'));

  it('is declared exactly once in the feature', () => {
    const declarations = featureFiles.filter((name) => {
      const source = stripComments(readFileSync(resolve(HERE, name), 'utf8'));
      return /(?:function|const)\s+AssigneePanel\b/.test(source);
    });

    /* THE CROSS-FILE SCAN IS THE LOAD-BEARING HALF, and `037` C3 is why: a
       second `const` of the same name in ONE file is a compile error, so the
       compiler gets there first and an in-file assertion can never fail. The
       defect that actually happened was two declarations in two files. */
    expect(declarations).toEqual(['AssigneePanel.tsx']);
  });

  it('is imported by the detail rail and by the list menu', () => {
    for (const consumer of ['TicketDetailPage.tsx', 'RowAssignMenu.tsx']) {
      const source = stripComments(readFileSync(resolve(HERE, consumer), 'utf8'));
      expect(source, consumer).toMatch(/import\s*\{[^}]*AssigneePanel[^}]*\}\s*from\s*'\.\/AssigneePanel'/);
    }
  });

  it('leaves no second Avatar in the two screens that used to declare one', () => {
    const detail = stripComments(readFileSync(resolve(HERE, 'TicketDetailPage.tsx'), 'utf8'));

    expect(detail).not.toMatch(/function\s+Avatar\b/);
    expect(detail).toMatch(/import\s*\{[^}]*Avatar[^}]*\}\s*from\s*'\.\/Avatar'/);
  });
});
