import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Table, type TableColumn, type TableSort } from './Table';

/*
 * The primitive's contract: specs/026-ticket-list/table-primitive.md.
 *
 * TWO KINDS OF ASSERTION HERE, deliberately.
 *
 * Behaviour that jsdom can observe is asserted by rendering. Behaviour it cannot
 * — anything that needs layout or CSS Modules — is asserted by READING THE
 * SOURCE, because vitest applies no CSS and `getComputedStyle` reports nothing
 * useful. A render assertion for those passes on the broken build, which is not
 * a weaker test, it is a test that lies.
 */

interface Person {
  id: string;
  name: string;
  city: string;
}

const PEOPLE: Person[] = [
  { id: 'a', name: 'علي الأحمد', city: 'الرياض' },
  { id: 'b', name: 'Sara Khan', city: 'جدة' },
  { id: 'c', name: 'فاطمة عبد الرحمن', city: 'الدمام' },
];

/* Hoisted out of the JSX because the no-JSX-literal rule (BR-8.8) covers
 * src/components, tests included. It is the right call even here: the rule is
 * what stops a hard-coded string reaching a screen, and carving out an
 * exception for tests is how the first one gets in. */
const EMPTY_TEXT = 'لا نتائج';
const VIEW_LABEL = 'عرض';

const COLUMNS: TableColumn<Person>[] = [
  { id: 'name', header: 'الاسم', cell: (p) => p.name },
  { id: 'city', header: 'المدينة', width: 120, cell: (p) => p.city, skeleton: 'pill' },
];

const renderTable = (props: Partial<React.ComponentProps<typeof Table<Person>>> = {}) =>
  render(
    <Table
      columns={COLUMNS}
      rows={PEOPLE}
      rowKey={(p) => p.id}
      label="جدول تجريبي"
      {...props}
    />,
  );

describe('AC-T-01 / AC-T-09 — every state renders, and every heading is readable', () => {
  it("renders headings as the th's own text, not inside an sr-only span", () => {
    renderTable();
    const table = screen.getByRole('table', { name: 'جدول تجريبي' });
    for (const heading of ['الاسم', 'المدينة']) {
      const th = within(table).getByRole('columnheader', { name: heading });
      /* No element child: sr-only text needs a span to carry the class, so this
       * is what `toBeVisible` cannot tell you — jsdom computes neither the
       * clip-path nor the 1px box, and a heading reverted to sr-only PASSES
       * `expect(th).toBeVisible()`. Measured, not assumed. */
      expect(th.children).toHaveLength(0);
      expect(th.textContent).toBe(heading);
    }
  });

  it('renders the empty node instead of a body, keeping the headings', () => {
    renderTable({ state: 'empty', empty: <p>{EMPTY_TEXT}</p> });
    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'الاسم' })).toBeInTheDocument();
    expect(screen.queryByText('Sara Khan')).not.toBeInTheDocument();
  });

  it('renders a skeleton row per requested row, hidden from assistive tech', () => {
    const { container } = renderTable({ state: 'loading', skeletonRows: 6 });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(6);
    /* Announced once by the caller's live region, never once per row. */
    expect(container.querySelectorAll('tbody tr[aria-hidden="true"]')).toHaveLength(6);
  });
});

describe('Q-T-3 — Table owns the sort control, 015 owns the query', () => {
  it('adds no control and no aria-sort when a column is not sortable', () => {
    renderTable({ onSortChange: vi.fn() });
    const th = screen.getByRole('columnheader', { name: 'الاسم' });
    expect(th).not.toHaveAttribute('aria-sort');
    expect(within(th).queryByRole('button')).toBeNull();
  });

  it('reports aria-sort on the th, which is what a screen reader reads', () => {
    const cols = COLUMNS.map((c) => (c.id === 'name' ? { ...c, sortable: true } : c));
    renderTable({
      columns: cols,
      onSortChange: vi.fn(),
      sort: { columnId: 'name', direction: 'desc' },
      sortLabel: 'ترتيب',
    });
    expect(screen.getByRole('columnheader', { name: /الاسم/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    /* The unsorted sortable column says "none", not nothing — absent means
     * "not sortable", and the two must not look alike to assistive tech. */
    expect(screen.getByRole('columnheader', { name: 'المدينة' })).not.toHaveAttribute(
      'aria-sort',
    );
  });

  /* REWRITTEN 2026-09-06. The control was a click-through toggle — asc → desc →
   * unsorted on one button — and is a three-row menu now, on the product
   * owner's instruction. So the assertion is no longer "the third press
   * releases it": each outcome is named on its own row and reachable in one
   * press from any state, which is the whole reason the toggle was replaced. */
  it('names all three outcomes, each reachable in one press from any state', async () => {
    const onSortChange = vi.fn();
    const cols = COLUMNS.map((c) => (c.id === 'name' ? { ...c, sortable: true } : c));
    const u = userEvent.setup();

    const draw = (sort: TableSort | null) => (
      <Table
        columns={cols}
        rows={PEOPLE}
        rowKey={(p) => p.id}
        label="t"
        onSortChange={onSortChange}
        sort={sort}
        sortLabel="ترتيب"
      />
    );

    const { rerender } = render(draw(null));

    /* From UNSORTED, the third row still reads "clear" and still resolves to
     * null — a menu row that cannot be reached is worse than a cycle. */
    await u.click(screen.getByRole('button', { name: /الاسم/ }));
    let items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    await u.click(items[2] as HTMLElement);
    expect(onSortChange).toHaveBeenLastCalledWith(null);

    await u.click(screen.getByRole('button', { name: /الاسم/ }));
    await u.click(screen.getAllByRole('menuitem')[0] as HTMLElement);
    expect(onSortChange).toHaveBeenLastCalledWith({ columnId: 'name', direction: 'asc' });

    /* FROM asc, DESC IS ONE PRESS — under the old toggle it was one press too,
     * but "clear" was two. That asymmetry is what this replaces. */
    rerender(draw({ columnId: 'name', direction: 'asc' }));
    await u.click(screen.getByRole('button', { name: /الاسم/ }));
    items = screen.getAllByRole('menuitem');
    await u.click(items[1] as HTMLElement);
    expect(onSortChange).toHaveBeenLastCalledWith({
      columnId: 'name',
      direction: 'desc',
    });

    rerender(draw({ columnId: 'name', direction: 'desc' }));
    await u.click(screen.getByRole('button', { name: /الاسم/ }));
    await u.click(screen.getAllByRole('menuitem')[2] as HTMLElement);
    expect(onSortChange).toHaveBeenLastCalledWith(null);
  });

  /* THE REST STATE HAS NO GLYPH, and that is the instruction's point: a neutral
   * arrow on every sortable heading makes the sorted column stop standing out.
   * jsdom resolves the module stylesheet, so `visibility` is readable here. */
  it('shows no sort glyph on an unsorted heading, and a brand one when sorted', () => {
    const cols = COLUMNS.map((c) => (c.id === 'name' ? { ...c, sortable: true } : c));
    const { rerender, container } = render(
      <Table
        columns={cols}
        rows={PEOPLE}
        rowKey={(p) => p.id}
        label="t"
        onSortChange={vi.fn()}
        sort={null}
        sortLabel="ترتيب"
      />,
    );
    const idle = container.querySelector('thead svg');
    expect(idle, 'the neutral glyph is rendered but hidden, not absent').not.toBeNull();
    expect(idle?.getAttribute('class')).toMatch(/sortIconIdle/);

    rerender(
      <Table
        columns={cols}
        rows={PEOPLE}
        rowKey={(p) => p.id}
        label="t"
        onSortChange={vi.fn()}
        sort={{ columnId: 'name', direction: 'asc' }}
        sortLabel="ترتيب"
      />,
    );
    const active = container.querySelector('thead svg');
    expect(active?.getAttribute('class')).not.toMatch(/sortIconIdle/);
    expect(container.querySelector('thead button')?.getAttribute('class')).toMatch(
      /sortBtnOn/,
    );
  });

  /* The old cycle test lived here and is DELETED, not skipped — 2026-09-06.
   * It drove a control that no longer exists, so it could only be kept green by
   * asserting the toggle behaviour the menu deliberately replaced. The two tests
   * above cover what it covered. */
});

/* AC-T-04, the half of it jsdom CAN see.
 *
 * Widths are ratios normalised to percentages so nothing overflows. That only
 * holds if EVERY rendered column is in the normalisation — and the first version
 * dropped the actions column whenever the caller named no width for it, because
 * `undefined` meant both "no flyout" and "flyout, unsized". The <th> then took
 * its content width on top of a full 100% and the table overflowed by exactly
 * that column.
 *
 * Found by rendering the customer preview, not by reading. Guarded here because
 * the arithmetic is the whole reason there is no scrollbar. */
describe('AC-T-04 — every rendered column is in the width normalisation', () => {
  const percentOf = (th: HTMLElement) => Number.parseFloat(th.style.inlineSize);

  it('gives every column a percentage, flyout column included', () => {
    renderTable({
      rowFlyout: {
        header: 'الإجراءات',
        triggerLabel: 'إجراءات الصف',
        render: () => null,
      },
    });
    const heads = screen.getAllByRole('columnheader');
    expect(heads).toHaveLength(COLUMNS.length + 1);
    for (const th of heads) {
      expect(th.style.inlineSize, th.textContent ?? '').toMatch(/%$/);
    }
  });

  it('sums to 100, which is what makes the table fit any frame', () => {
    renderTable({
      rowFlyout: {
        header: 'الإجراءات',
        triggerLabel: 'إجراءات الصف',
        render: () => null,
      },
    });
    const total = screen
      .getAllByRole('columnheader')
      .reduce((sum, th) => sum + percentOf(th), 0);
    /* Rounded to four places per column, so a hair of drift is arithmetic, not
     * a missing column — a missing one costs whole percent, as the defect did. */
    expect(total).toBeGreaterThan(99.9);
    expect(total).toBeLessThan(100.1);
  });
});

describe('AC-T-06 — the flyout closes when anything scrolls', () => {
  const flyout = {
    header: 'الإجراءات',
    triggerLabel: 'إجراءات الصف',
    render: () => <button type="button">{VIEW_LABEL}</button>,
  };

  it('opens from its row and closes on scroll', async () => {
    const u = userEvent.setup();
    renderTable({ rowFlyout: flyout });

    await u.click(screen.getAllByRole('button', { name: 'إجراءات الصف' })[0]!);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    /* capture: true, because scroll does not bubble to document — a listener
     * without it never fires for the table's own scroller. */
    await act(async () => {
      document.dispatchEvent(new Event('scroll', { bubbles: false }));
    });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape', async () => {
    const u = userEvent.setup();
    renderTable({ rowFlyout: flyout });
    await u.click(screen.getAllByRole('button', { name: 'إجراءات الصف' })[0]!);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

/*
 * SOURCE-READ GUARDS. Everything below needs layout or CSS Modules, neither of
 * which vitest provides — so these read the files. Each has been broken on
 * purpose and watched go red; the results are in tests.md §1c.
 */
describe('the guards jsdom cannot express', () => {
  const dir = resolve(process.cwd(), 'src/components/Table');
  const css = readFileSync(resolve(dir, 'Table.module.css'), 'utf8');
  const tsx = readFileSync(resolve(dir, 'Table.tsx'), 'utf8');
  const NL = String.fromCharCode(10);

  const ruleBody = (cls: string) => {
    const start = css.indexOf(NL + '.' + cls + ' {');
    if (start === -1) return null;
    return css.slice(start, css.indexOf(NL + '}', start));
  };

  /* AC-T-08 — every control carries the base.css rule-17 override.
   *
   * WRITTEN LOOSE ONCE, AND THE NEGATIVE CONTROL CAUGHT IT. The first version
   * asserted that the rule matched background-color OR color with !important,
   * so dropping !important from .sortBtn colour left it GREEN - the background
   * declaration alone satisfied it. A guard for exactly that defect passed on
   * exactly that defect, which is the second time this has happened here.
   *
   * The rule now is per-declaration: EVERY colour declaration in these rules
   * carries !important, because losing it on either property is enough for the
   * navy to win on that property. */
  const colourDecls = (body: string) =>
    body
      .split(NL)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('color:') || l.startsWith('background-color:'));

  it.each(['sortBtn', 'sortBtnOn', 'flyoutTrigger', 'flyoutTriggerOn'])(
    '.%s marks every colour declaration !important',
    (cls) => {
      const body = ruleBody(cls);
      expect(body, `.${cls} is not declared`).not.toBeNull();
      const decls = colourDecls(body!);
      expect(decls.length, `.${cls} sets no colour at all`).toBeGreaterThan(0);
      for (const d of decls) expect(d, `.${cls}`).toContain('!important');
    },
  );

  it('declares the low-specificity reset BEFORE any control class', () => {
    const reset = css.indexOf('.card :where(button)');
    expect(reset).toBeGreaterThan(-1);
    /* :where() adds no specificity, so the reset ties every class below and
     * loses to them on order. Below the first one it wins instead, and repaints
     * every control transparent. */
    expect(reset).toBeLessThan(css.indexOf(NL + '.sortBtn {'));
  });

  /* AC-T-07 — one Latin value in a column of Arabic ones must start on the same
   * inline edge. jsdom lays out nothing, so the edge cannot be measured here;
   * what CAN be asserted is that the mechanism is the right one. */
  it('isolates cell text without rewriting the cell direction', () => {
    expect(ruleBody('td')).toContain('unicode-bidi: isolate');
    /* dir="auto" also isolates — and also rewrites direction from the first
     * strong character, which is the defect. It must not appear. */
    expect(tsx).not.toContain('dir="auto"');
  });

  /* AC-T-04 — no HORIZONTAL scrollbar, because nothing overflows sideways.
   *
   * NARROWED 2026-09-06, and narrowed rather than deleted. This used to forbid
   * `scrollbar-width: none` and `::-webkit-scrollbar` anywhere in the file, and
   * that over-reached: what AC-T-04 protects is the WIDTH mechanism — columns
   * are ratios normalised to percentages, so the table fits any frame and the
   * bar is unnecessary rather than concealed. Hiding it instead would paper over
   * columns that genuinely do not fit.
   *
   * Vertical overflow in `fill` mode is a different thing entirely: it is
   * INTENDED. The body is meant to scroll — that is the whole point of the mode
   * — and the product owner ruled the bar itself out on 2026-09-06 («ولازم
   * ميكونش فيه scroll في جنب الجدول»). Nothing is being faked there.
   *
   * So the two hiding declarations are allowed in EXACTLY ONE rule, and this
   * asserts that scope. Loosening it to "anywhere" would let a future change
   * hide the horizontal bar again, which is the defect AC-T-04 exists for. */
  it('hides a scrollbar only in fill mode, and never the horizontal one', () => {
    const fillRule = ruleBody('scrollerFill');
    expect(fillRule, '.scrollerFill is not declared').not.toBeNull();
    expect(fillRule).toContain('scrollbar-width: none');

    /* Every occurrence belongs to the fill scroller — the rule itself and its
     * webkit companion. COUNTED rather than trusted, because "the one I just
     * read is the only one" is exactly the assumption that lets a second appear.
     *
     * COMMENTS COME OUT FIRST. The stylesheet's own note explains why both
     * declarations are needed and therefore contains both names; counting the
     * raw file finds them and fails on prose. `029` and `027` each shipped a
     * guard that went red on its own comment, and this is the third. */
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code, 'the comment stripper removed everything').toContain('.scrollerFill');
    expect(code.match(/scrollbar-width: none/g)).toHaveLength(1);
    expect(code.match(/::-webkit-scrollbar/g)).toHaveLength(1);
    expect(code).toContain('.scrollerFill::-webkit-scrollbar');

    /* The horizontal axis is never hidden, and never suppressed. */
    expect(css).not.toContain('overflow-x: hidden');

    /* Widths are ratios normalised to percentages, so the table fits any frame.
     * This is the half of AC-T-04 that has not changed. */
    expect(tsx).toContain('function widthPercents');
    expect(tsx).toContain('toFixed(4)}%');
  });

  /* AC-T-02 — the skeleton row and the real row take their height from the same
   * custom property, so they cannot drift. */
  it('gives skeleton and data rows the same height source', () => {
    expect(ruleBody('td')).toContain('block-size: var(--row-h)');
    /* One <td> class for both, so there is no second height to keep in step. */
    expect(css.indexOf(NL + '.skeletonTd {')).toBe(-1);
  });

  /* AC-T-05 — the flyout must leave the clip chain, and the floor must be the
   * table. Both are layout facts jsdom cannot produce. */
  it('places the flyout outside the clip chain, floored by the table', () => {
    expect(ruleBody('flyout')).toContain('position: fixed');
    expect(tsx).toContain('data-table-scroller');
    expect(tsx).toContain('Math.min(');
  });

  /* AC-T-10 — no domain type reaches this file.
   *
   * THIS GUARD FAILED ON ITS OWN DOCUMENTATION the first time it ran. The file
   * explains the boundary by naming the very identifier the guard forbids, and
   * a whole-file substring search cannot tell an explanation from an import.
   * The alternative was to stop writing down why the rule exists, which is the
   * wrong trade.
   *
   * So it reads CODE LINES, not the file: comment lines are dropped, and the
   * import check looks at import statements only. More precise as well as
   * greener - AC-T-10 is about what this file depends on, not what it says. */
  it('imports nothing from features or the domain', () => {
    const code = tsx
      .split(NL)
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('*') && !l.startsWith('/*') && !l.startsWith('//'));

    const imports = code.filter((l) => l.startsWith('import') || l.includes(" from '"));
    expect(imports.some((l) => l.includes('features/'))).toBe(false);
    expect(imports.some((l) => l.includes('api-types'))).toBe(false);

    const body = code.join(NL);
    expect(body).not.toContain('PendingCustomer');
    expect(body).not.toContain('TicketStatus');
  });
});

/*
 * A REFETCH DIMS AND KEEPS ITS ROWS. It never returns to the skeleton.
 *
 * Re-skeletoning throws away the content the reader is looking at, to say
 * something they did not ask about — and on a fast connection it is a flash
 * rather than a state. The rows staying put is the assertion; the dim is how it
 * is said quietly, and aria-busy is how it reaches someone who cannot see dim.
 */
describe('AC-026-06 — refreshing dims, never re-skeletons', () => {
  it('keeps every row while refreshing', () => {
    const { container } = renderTable({ refreshing: true });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(PEOPLE.length);
    /* Skeleton rows are aria-hidden; real rows are not. If a refetch had
     * re-skeletoned, this would be PEOPLE.length instead of zero. */
    expect(container.querySelectorAll('tbody tr[aria-hidden="true"]')).toHaveLength(0);
    expect(screen.getByText('Sara Khan')).toBeInTheDocument();
  });

  it('announces itself to a screen reader, which cannot see a dim', () => {
    const { container } = renderTable({ refreshing: true });
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });

  it('sets no aria-busy when it is not refreshing', () => {
    /* aria-busy="false" is not the same as absent to every assistive tech, and
     * a permanently-present attribute is one nobody notices changing. */
    const { container } = renderTable();
    expect(container.firstElementChild).not.toHaveAttribute('aria-busy');
  });

  it('dims through a class, so the rows are not re-rendered to say it', () => {
    const plain = renderTable().container.firstElementChild!.className;
    const dim = renderTable({ refreshing: true }).container.firstElementChild!.className;
    expect(dim).not.toBe(plain);
    expect(dim).toContain('refreshing');
  });
});
