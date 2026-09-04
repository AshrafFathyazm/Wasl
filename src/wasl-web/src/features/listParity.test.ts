import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * =============================================================================
 * EVERY LIST SCREEN IS THE SAME SHAPE — asserted from the SOURCE
 * =============================================================================
 * Reported 2026-09-02, with the two screens side by side: *"مينفعش صفحة التذاكر
 * تكون الفلاتر والبحث وشكل الجدول مختلف المفروض كل الجداول في السيستم واماكن
 * الحبث والفلاتر في نفس المكان"* — and, separately, *"الهيدر مش تحته الرو الخاص
 * بيه"* and *"في مساحة فوق في الصفحه فاضيه كبيره جدا"*.
 *
 * Measured before and after, in Arabic and English at one viewport, on both
 * screens. AFTER, every one of these is identical to the pixel:
 *
 *   <h1> top            120
 *   search box          y=196, x=180..500
 *   تصفية button        y=200, x=88..168
 *   table card          y=256, x=89..1123
 *   row height          62
 *   header-vs-cell text drift, per column, over 20 rows   0px
 *
 * BEFORE: search at 513..833 on /customers against 462..782 on /tickets; the
 * <h1> 84px below the topbar on one and 102px on the other; row heights 62 and
 * 70; and the customer directory's email column 102px off its own heading.
 *
 * WHY A SOURCE SCAN. jsdom has no layout — every rect is zero — so nothing in
 * this suite can measure a position. These are claims about the code that
 * produces those positions, and the code is where they can be checked. The
 * numbers above were taken in a real browser and are recorded, not asserted.
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8');

/** CSS comments removed FIRST. Each rule below now carries the measurement that
 *  produced it, so a scan over raw text finds the words in the prose and passes
 *  on the explanation instead of the declaration. The control below is what
 *  proves the stripper ran. */
const declarations = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const TICKET_BAR_CSS = declarations(read('features/tickets/TicketFilterBar.module.css'));
const CUSTOMER_CSS = declarations(read('features/customers/CustomersList.module.css'));
const TICKET_LIST_CSS = declarations(read('features/tickets/TicketList.module.css'));
const SHELL_CSS = declarations(read('shell/AppShell.module.css'));

const TICKET_BAR = read('features/tickets/TicketFilterBar.tsx');
const CUSTOMER_BAR = read('features/customers/CustomerFilterBar.tsx');
const TICKET_PAGE = read('features/tickets/TicketListPage.tsx');
const CUSTOMER_PAGE = read('features/customers/CustomersListPage.tsx');

describe('the two list screens are one shape', () => {
  it('read every file, so nothing below can pass on an empty string', () => {
    for (const [name, text] of [
      ['ticket bar css', TICKET_BAR_CSS],
      ['customer css', CUSTOMER_CSS],
      ['ticket list css', TICKET_LIST_CSS],
      ['shell css', SHELL_CSS],
      ['ticket bar', TICKET_BAR],
      ['customer bar', CUSTOMER_BAR],
      ['ticket page', TICKET_PAGE],
      ['customer page', CUSTOMER_PAGE],
    ] as const) {
      expect(text.length, name).toBeGreaterThan(200);
    }
  });

  it('stripped the comments — the control for every scan in this file', () => {
    /* The prose in these stylesheets QUOTES the declarations it replaced. If the
       stripper stopped running, the scans would pass on the explanations. */
    expect(TICKET_BAR_CSS).not.toContain('/*');
    expect(CUSTOMER_CSS).not.toContain('/*');
    expect(TICKET_BAR_CSS).not.toContain('space-between hands that');
  });

  /* ---- the toolbar's position ------------------------------------------- */

  it('pins the toolbar to the inline-end on both screens', () => {
    /* `margin-inline-start: auto` on a row with nothing after it is what makes
       the position independent of the primary action's label — «عميل جديد» and
       «تذكرة جديدة» differ by 51px, and `space-between` handed that straight to
       the item before them. */
    for (const css of [TICKET_BAR_CSS, CUSTOMER_CSS]) {
      expect(css).toMatch(/\.toolbar\s*\{[^}]*margin-inline-start:\s*auto/);
    }
  });

  it('puts the toolbar on the SECOND row, after the chips, on both screens', () => {
    /* On the title row the toolbar sits wherever the action button leaves it.
       Asserted by ORDER: `tabsRow` opens before `toolbar` in both files. */
    for (const [name, tsx] of [
      ['tickets', TICKET_BAR],
      ['customers', CUSTOMER_BAR],
    ] as const) {
      const row2 = tsx.indexOf('styles.tabsRow');
      const toolbar = tsx.indexOf('styles.toolbar');
      expect(row2, `${name}: no tabsRow`).toBeGreaterThan(-1);
      expect(toolbar, `${name}: no toolbar`).toBeGreaterThan(-1);
      expect(toolbar, `${name}: the toolbar is above the strip row`).toBeGreaterThan(
        row2,
      );
    }
  });

  it('gives both second rows the same block spacing', () => {
    for (const css of [TICKET_BAR_CSS, CUSTOMER_CSS]) {
      expect(css).toMatch(/\.tabsRow\s*\{[^}]*margin-block:\s*18px 12px/);
    }
  });

  it('leaves the spacing to those rows — no gap or bottom margin on either bar', () => {
    /* Both were on the ticket bar and neither was on the customer one, which is
       what held the two screens 12px and 28px apart. */
    for (const css of [TICKET_BAR_CSS, CUSTOMER_CSS]) {
      const bar = /\.bar\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
      expect(bar).not.toMatch(/\bgap:/);
      expect(bar).not.toMatch(/margin-block-end:/);
    }
  });

  /* ---- the table itself -------------------------------------------------- */

  it('renders both tables at the same density', () => {
    for (const [name, tsx] of [
      ['tickets', TICKET_PAGE],
      ['customers', CUSTOMER_PAGE],
    ] as const) {
      expect(tsx, `${name}: density`).toContain('density="dense"');
    }
  });

  it('uses the Button primitive for تصفية on both, not a hand-rolled one', () => {
    /* The customer bar styled a bare <button> and came out 6px wider than the
       real one — and with the toolbar pinned, that moved the search box. */
    expect(CUSTOMER_CSS).not.toMatch(/\.filterBtn\b/);
    expect(CUSTOMER_BAR).not.toMatch(/className=\{cx\(styles\.filterBtn/);
    for (const tsx of [TICKET_BAR, CUSTOMER_BAR]) {
      expect(tsx).toMatch(/buttonType="secondary-outline"[\s\S]{0,400}IconFilter/);
    }
  });

  /* ---- the gap above the title ------------------------------------------- */

  it('gives the shell one owner for the space above the first heading', () => {
    /* `--content-padding` is 56px on all four sides and every page adds its own
       block padding under it. The sides keep 56 — the cards' inline edges are
       measured against that frame — and the top drops, because the topbar draws
       a border. */
    expect(SHELL_CSS).toMatch(
      /\.content\s*\{[^}]*padding-block-start:\s*var\(--space-6\)/,
    );
  });

  it('leaves no leftover top margin on the customer bar', () => {
    /* 18px, from when the bar sat UNDER a heading it now contains. */
    const bar = /\.bar\s*\{([^}]*)\}/.exec(CUSTOMER_CSS)?.[1] ?? '';
    expect(bar).not.toMatch(/margin-block-start:/);
  });

  /* ---- a header over its own column -------------------------------------- */

  it('wraps every truncating cell, so the box and the cut can disagree', () => {
    /* ONE ELEMENT CANNOT CARRY BOTH. A `dir` on the element that truncates puts
       its box on the edge its CONTENT chose, not the one its heading is on
       (measured: 102px on the email column, 61px on a Latin name in an Arabic
       table); no `dir` at all cuts a mixed-direction value at its BEGINNING.
       `unicode-bidi: plaintext` fixes the cut and not the box, and
       `text-align: match-parent` — the declaration CSS provides for exactly this
       — is unsupported in Chrome 152 and is dropped from the cascade silently.
       So: a flex wrapper in the page's direction, and the `dir` on the value. */
    expect(CUSTOMER_CSS).toMatch(/\.cellBox\s*\{[^}]*display:\s*flex/);
    expect(TICKET_LIST_CSS).toMatch(/\.subjectAnchor\s*\{[^}]*display:\s*flex/);

    /* every `dir` on a customer cell is inside a wrapper */
    for (const cls of ['styles.name', 'styles.email', 'styles.phone']) {
      const at = CUSTOMER_PAGE.indexOf(cls);
      expect(at, cls).toBeGreaterThan(-1);
      /* 1400, not 400. The window has to clear the COMMENT above each cell,
         and those grew when the name became a link — the guard went red on a
         file that was correct, which is the same failure mode its own helper
         had. A window is the wrong shape for this and a parser is the right
         one; the window is kept because a parser for JSX in a guard is more
         machinery than the claim is worth. */
      const before = CUSTOMER_PAGE.slice(Math.max(0, at - 1400), at);
      expect(before, `${cls} is not inside a cellBox`).toContain('styles.cellBox');
    }
  });

  it('keeps the `dir` on the value and off the wrapper', () => {
    /* The wrapper must stay in the PAGE's direction — that is the half that
       places the box. */
    expect(CUSTOMER_PAGE).not.toMatch(/styles\.cellBox\}\s*dir=/);
    expect(TICKET_LIST_CSS).not.toMatch(/\.subjectAnchor\s*\{[^}]*direction:/);
    expect(TICKET_PAGE).toMatch(/styles\.subjectLine\}\s*\n\s*dir="auto"/);
  });

  /* ---- one answer for an inverted range ---------------------------------- */

  it('refuses «تطبيق» on an inverted draft, on both panels', () => {
    /* MIRRORED FOR THE READER, never the authority: the endpoint answers `400`
       either way, and `readFilters`/`readCustomerFilters` drop such a pair out
       of the URL. This is the third layer — the picker cannot BUILD one.

       A SOURCE SCAN, because the draft is only reachable by driving two
       calendars. That was attempted over CDP and abandoned: the day cells are
       not <button>s with plain digits, and four probes in a row reported
       "no day 15" — a measurement that names the wrong thing is worse than
       none. The predicate itself is unit-tested in `ticketFilters.test.ts` and
       `customerFilters.test.ts` (6 cases each, including the `from == to`
       control against a `<=` rule). */
    for (const [name, tsx] of [
      ['tickets', TICKET_BAR],
      ['customers', CUSTOMER_BAR],
    ] as const) {
      expect(tsx, `${name}: no predicate`).toContain('createdRangeIsInverted(');
      expect(tsx, `${name}: Apply not gated`).toMatch(
        /text=\{t\('list\.apply'\)\}[\s\S]{0,120}disabled=\{draftRangeInverted\}|disabled=\{draftRangeInverted\}[\s\S]{0,120}t\('list\.apply'\)/,
      );
      expect(tsx, `${name}: no note`).toContain("t('list.rangeInverted')");
    }
  });

  it('does not reintroduce plaintext or match-parent on those cells', () => {
    /* Both were tried and measured; each fixed one half. Left in place they read
       as the mechanism, and the flex wrapper then looks removable. */
    for (const css of [CUSTOMER_CSS, TICKET_LIST_CSS]) {
      expect(css).not.toContain('unicode-bidi: plaintext');
      expect(css).not.toContain('match-parent');
    }
  });
});
