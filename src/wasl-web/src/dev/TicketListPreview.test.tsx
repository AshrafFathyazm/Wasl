import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import TicketListPreview from './TicketListPreview';

/*
 * A PREVIEW IS NOT NORMALLY TESTED — ADR-009 makes it a measuring instrument
 * that never ships, and routes.tsx strips it from the production bundle. This
 * file exists anyway, and only because it has already earned its place: the
 * first time it was run it failed twice, on defects that reading the JSX had
 * not surfaced.
 *
 *   1. The date field was a <button> inside a <label>. A button is not a
 *      labelable control, so the <label> contributed nothing and the field
 *      announced as an unnamed button. Same bug on the footer's rows-per-page.
 *   2. Two buttons named "تطبيق" could be on screen at once — the filter
 *      panel's and the calendar's — with no named container to tell them apart.
 *
 * Both are fixed. The assertions below are the shape of those fixes, plus the
 * two Intl measurements the calendar depends on, because those are the things
 * that break silently when someone "simplifies" a locale string.
 *
 * FE-026-01 inherits all of this into the `Table` primitive. These move there.
 */

const openFromField = async () => {
  const u = userEvent.setup();
  render(<TicketListPreview />);
  await u.click(screen.getAllByRole('button', { name: /تصفية/ })[0]!);
  await u.click(screen.getAllByRole('button', { name: /تاريخ الإنشاء من/ })[0]!);
  return { u, dialog: screen.getByRole('dialog', { name: /تاريخ الإنشاء من/ }) };
};

describe('the preview mounts every state it claims to show', () => {
  it('renders without throwing and keeps the column headings in the empty states', () => {
    render(<TicketListPreview />);
    /* Six frames: two widths of data, then loading, none, nomatch, error. Every
     * one keeps its <thead>, which is the point — an empty state that also
     * drops the headings reads as a broken page rather than an empty list. */
    expect(screen.getAllByRole('table')).toHaveLength(6);
    expect(screen.getByText('لا توجد تذاكر بعد')).toBeInTheDocument();
    expect(screen.getByText('لا نتائج مطابقة')).toBeInTheDocument();
    expect(screen.getByText('تعذّر تحميل القائمة')).toBeInTheDocument();
  });
});

/* THE COLUMN THIS FILE GOT WRONG TWICE.
 *
 * Channel shipped as a 36px icon with the label in an sr-only span, and the
 * actions heading shipped sr-only too. Both read as correct from the JSX and
 * both were wrong against the design; the sr-only span is exactly what makes
 * them indistinguishable, because `getByText` finds a visually hidden node.
 *
 * THE OBVIOUS ASSERTION DOES NOT WORK, AND THIS WAS MEASURED. `toBeVisible`
 * looks green on an sr-only node: the utility hides with `clip-path` and a 1px
 * box, jsdom computes neither, so a heading reverted to sr-only PASSED
 * `expect(head).toBeVisible()`. The negative control is the only reason that is
 * known — the test was written, believed, and then seen not to fail.
 *
 * So both assertions below are STRUCTURAL. The heading must have no element
 * child, because sr-only text needs a span to carry the class. The channel
 * label must resolve to the node that also holds the glyph, because with the
 * label in an sr-only span `getByText` returns that span instead and the svg
 * lookup comes back null. Neither can be satisfied by a hidden node. */
/* THE RULE-17 OVERRIDE, GUARDED AT THE SOURCE.
 *
 * base.css paints every <button> with the primary navy using !important, and
 * documents the only way out: repeat the properties on a CLASS, with
 * !important. This module did not, and twenty-five controls - every tab, chip,
 * pager cell and kebab - rendered as solid navy pills. It read as a broken
 * palette rather than a missing rule, which is exactly what rule 17 warns of.
 *
 * This cannot be asserted from the DOM: vitest does not apply CSS Modules, so
 * getComputedStyle returns nothing useful and a render test would pass on the
 * broken build. So the stylesheet is READ. That is the same shape as the
 * message-key guards - scan the source for a property the runtime cannot
 * report on. */
describe('every button class repeats the base.css rule-17 override', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/dev/TicketListPreview.module.css'),
    'utf8',
  );
  const NL = String.fromCharCode(10);

  /* Every class this file puts on a <button>. */
  const BUTTON_CLASSES = [
    'toggle',
    'toggleOn',
    'filterBtn',
    'tab',
    'tabOn',
    'kebab',
    'kebabOn',
    'emptyCta',
    'searchClear',
    'chipClear',
    'dateBtn',
    'calNav',
    'calTitle',
    'calCell',
    'calCellOn',
    'calCellToday',
    'calCellOutside',
    'pageBtn',
    'pageActive',
    'pageDisabled',
    'filterChip',
    'filterChipOn',
    'menuItem',
    'menuItemDanger',
    'linkBtn',
    'solidBtn',
  ];

  const ruleBody = (cls: string) => {
    const start = css.indexOf(NL + '.' + cls + ' {');
    if (start === -1) return null;
    const end = css.indexOf(NL + '}', start);
    return css.slice(start, end);
  };

  /* PER DECLARATION, not "one of the two".
   *
   * This asserted only that background-color carried !important. The Table
   * primitive inherited the same shape, and its negative control found the
   * hole: dropping !important from a rule COLOUR left the test green, because
   * the background declaration alone satisfied it. Losing it on either property
   * is enough for the navy to win on that property.
   *
   * Fixed here at the same time, because a guard with a known hole left in one
   * of two places is a guard nobody trusts in either. */
  const colourDecls = (body: string) =>
    body
      .split(NL)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('color:') || l.startsWith('background-color:'));

  it.each(BUTTON_CLASSES)('.%s marks every colour declaration !important', (cls) => {
    const body = ruleBody(cls);
    expect(body, `.${cls} is not declared`).not.toBeNull();
    const decls = colourDecls(body!);
    expect(decls.length, `.${cls} sets no colour at all`).toBeGreaterThan(0);
    for (const d of decls) expect(d, `.${cls}`).toContain('!important');
  });

  it('declares the low-specificity reset BEFORE any button class', () => {
    const reset = css.indexOf('.page :where(button)');
    expect(reset).toBeGreaterThan(-1);
    /* :where() contributes no specificity, so the reset ties every class below
     * and loses to them on order. Below the first one, it would win instead and
     * repaint every button transparent. */
    const first = Math.min(
      ...BUTTON_CLASSES.map((c) => css.indexOf(NL + '.' + c + ' {')).filter(
        (i) => i > -1,
      ),
    );
    expect(reset).toBeLessThan(first);
  });

  it('pins -webkit-text-fill-color, which beats a descendant color', () => {
    expect(css).toContain('-webkit-text-fill-color: currentcolor !important');
  });
});

describe('channel and actions are visible columns, not sr-only ones', () => {
  it('renders the channel label as visible text beside its glyph', () => {
    render(<TicketListPreview />);
    const [table] = screen.getAllByRole('table');
    const cells = within(table!).getAllByText('واتساب');
    expect(cells.length).toBeGreaterThan(0);
    /* getByText resolves to the PILL, which also holds the glyph. An sr-only
     * label resolves to the hidden span instead, and this comes back null. */
    expect(cells[0]!.querySelector('svg')).not.toBeNull();
    expect(cells[0]!.className).toContain('channel');
  });

  it('shows every channel in the set, each with its own tint class', () => {
    render(<TicketListPreview />);
    const [table] = screen.getAllByRole('table');
    const labels = ['واتساب', 'رسائل نصية', 'نموذج ويب', 'بريد', 'محادثة مباشرة'];
    const classes = new Set<string>();
    for (const label of labels) {
      const found = within(table!).queryAllByText(label);
      expect(found.length, label).toBeGreaterThan(0);
      classes.add(found[0]!.className);
    }
    /* Five labels, five DISTINCT class strings. One tint reused across two
     * channels would defeat the scanning the pill exists for. */
    expect(classes.size).toBe(labels.length);
  });

  it('gives the actions column a heading a sighted user can read', () => {
    render(<TicketListPreview />);
    const [table] = screen.getAllByRole('table');
    const head = within(table!).getByRole('columnheader', { name: 'الإجراءات' });
    /* No element child: the text is the <th>'s own, not an sr-only span's. */
    expect(head.children).toHaveLength(0);
    expect(head.textContent).toBe('الإجراءات');
  });
});

describe('the popovers are named, not just visible', () => {
  it('gives the date field an accessible name carrying label AND value', async () => {
    render(<TicketListPreview />);
    const u = userEvent.setup();
    await u.click(screen.getAllByRole('button', { name: /تصفية/ })[0]!);
    /* Both halves. "created from" alone does not say whether a date is set. */
    expect(
      screen.getAllByRole('button', { name: 'تاريخ الإنشاء من dd/mm/yyyy' }).length,
    ).toBeGreaterThan(0);
  });

  it('names the calendar so its Apply is distinguishable from the panel Apply', async () => {
    const { dialog } = await openFromField();
    expect(within(dialog).getByRole('button', { name: 'تطبيق' })).toBeInTheDocument();
    /* Two of them on screen. Without the dialog name this query is ambiguous,
     * which is exactly what a screen reader would face. */
    expect(screen.getAllByRole('button', { name: 'تطبيق' })).toHaveLength(2);
  });
});

describe('BR-8.13 — the picker never introduces a second numeral system', () => {
  it('writes Latin digits in the Gregorian calendar', async () => {
    const { dialog } = await openFromField();
    expect(within(dialog).getAllByRole('button', { name: '15' })).not.toHaveLength(0);
  });

  it('writes Latin digits in the Hijri calendar too', async () => {
    const { u, dialog } = await openFromField();
    await u.click(within(dialog).getByRole('switch'));
    /* If `-nu-latn` is ever dropped from HIJRI_LOCALE this becomes ١٥ and the
     * picker disagrees with the column it filters. */
    expect(within(dialog).getAllByRole('button', { name: '15' })).not.toHaveLength(0);
    expect(dialog.textContent).toContain('هـ');
  });
});

describe('the weekday row is the clipped WORD the design specifies', () => {
  it('renders إثنين ثلاثاء أربعاء … Monday-first, not the narrow letters', async () => {
    const { dialog } = await openFromField();
    const labels = Array.from(dialog.querySelectorAll('span'))
      .slice(0, 7)
      .map((s) => s.textContent);
    expect(labels).toEqual(['إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد']);
    /* Monday-first, from the canvas. */
    expect(labels[0]).toBe('إثنين');
  });

  /* THE REASON THESE ARE TRANSCRIBED AND NOT DERIVED, asserted rather than
   * claimed in a comment. Neither ICU width is the design's form: `short` is
   * the full name (identical to `long`), and `narrow` is one letter. A test
   * that only checked the rendered row would go green again the day someone
   * "simplifies" this back to Intl with a different width. */
  it('is a form no ICU width produces — short is long, narrow is one letter', () => {
    const ar = (w: 'narrow' | 'short' | 'long') =>
      Array.from({ length: 7 }, (_, i) =>
        new Intl.DateTimeFormat('ar', { weekday: w }).format(new Date(2026, 0, 5 + i)),
      );
    expect(ar('short')).toEqual(ar('long'));
    expect(ar('narrow').every((d) => d.length === 1)).toBe(true);
    expect(ar('short')).not.toContain('إثنين');
  });
});
