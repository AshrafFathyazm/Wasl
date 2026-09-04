import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../lib/api';
import type { PagedResult, TicketListItem } from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';

/* The module is the seam, not `fetch` — the same choice `024` made and for the
 * same reason: it measures "one call out per intent", which is what the claims
 * are actually about. */
vi.mock('./tickets.api', async () => {
  const actual = await vi.importActual<typeof import('./tickets.api')>('./tickets.api');
  /* `countTickets` is mocked too, and separately: it is what the chip counts
     call, and leaving it real would put five unmocked requests behind every
     render in this file. */
  return { ...actual, listTickets: vi.fn(), countTickets: vi.fn() };
});

const { listTickets, countTickets } = await import('./tickets.api');
const { default: TicketListPage } = await import('./TicketListPage');

const ROW: TicketListItem = {
  id: '8f1c2d34-5678-4abc-9def-0123456789ab',
  ticketNumber: 'TCK-2026-000042',
  subject: 'لا يمكنني تسجيل الدخول إلى الحساب',
  customerId: '1b2c3d4e-5678-4abc-9def-0123456789ab',
  customerName: 'علي الأحمد',
  status: 'InProgress',
  priority: 'High',
  category: 'Technical',
  channel: 'Email',
  assigneeId: null,
  assigneeName: null,
  isEscalated: false,
  createdAtUtc: '2026-08-23T12:00:00Z',
};

const page = (
  over: Partial<PagedResult<TicketListItem>> = {},
): PagedResult<TicketListItem> => ({
  items: [ROW],
  page: 1,
  pageSize: 20,
  totalCount: 1,
  totalPages: 3,
  ...over,
});

/* The page is mounted on its own, so navigating away unmounts nothing and
 * "the list is gone" is not an assertion. This reports the router location
 * instead, which is the thing actually under test. */
function LocationProbe() {
  const { pathname } = useLocation();
  return <span data-testid="pathname">{pathname}</span>;
}

const mounted = (url = '/tickets') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <TicketListPage />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
};

beforeEach(() => {
  vi.mocked(listTickets).mockReset();
  vi.mocked(listTickets).mockResolvedValue(page());

  /* THE CHIP COUNTS ARE A SEPARATE FETCHER — five of them, one per status chip
   * plus `Closed` for the subtitle. Answered here so the header renders; left
   * unmocked, every count stays pending, `allCount` stays undefined and the
   * subtitle never appears, which reads as a copy bug rather than a missing
   * stub. Distinct from `listTickets` on purpose: the assertions below count
   * LIST requests, and before `countTickets` existed the counts were seven
   * extra list calls that broke them. */
  vi.mocked(countTickets).mockReset();
  vi.mocked(countTickets).mockResolvedValue(0);
});

describe('AC-026-01 — the page is the only thing that fetches', () => {
  it('renders a row from the query, with the ticket number in Latin digits', async () => {
    mounted();
    expect(await screen.findByText('TCK-2026-000042')).toBeInTheDocument();
    expect(screen.getByText('علي الأحمد')).toBeInTheDocument();
  });

  it('sends the URL page and pageSize, not a default', async () => {
    mounted('/tickets?page=3&pageSize=50');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());
    expect(vi.mocked(listTickets).mock.calls[0]![0]).toEqual({ page: 3, pageSize: 50 });
  });

  /* A hand-typed ?page=abc must not reach the query key as NaN — that is a cache
   * entry nothing can ever match, so the screen loads forever and never errors.
   * The failure is invisible: no request, no error, a permanent skeleton. */
  it.each(['abc', '0', '-4', ''])('falls back to page 1 for ?page=%j', async (bad) => {
    mounted(`/tickets?page=${bad}`);
    await waitFor(() => expect(listTickets).toHaveBeenCalled());
    expect(vi.mocked(listTickets).mock.calls[0]![0]!.page).toBe(1);
  });
});

describe('AC-026-04 — the control shows what the SERVER returned', () => {
  it('renders the clamped pageSize, not the one that was requested', async () => {
    /* BR-7.2 clamps rather than rejecting: asking for 500 is a 200 carrying 100.
     * A control rendering what was SENT shows 500 above a hundred rows and
     * disagrees with the data beside it, with nothing failing. */
    vi.mocked(listTickets).mockResolvedValue(page({ pageSize: 100, page: 1 }));
    mounted('/tickets?pageSize=500');
    await screen.findByText('TCK-2026-000042');
    /* `031`: the cast to `HTMLSelectElement` went with the native element. The
     * claim is unchanged and is now read off what the reader actually sees —
     * the trigger's own text — rather than off a DOM property. */
    expect(screen.getByRole('combobox')).toHaveTextContent('100');
  });
});

describe('the five states', () => {
  it('shows a skeleton while pending, and no rows', () => {
    vi.mocked(listTickets).mockImplementation(() => new Promise(() => {}));
    const { container } = mounted();
    expect(
      container.querySelectorAll('tbody tr[aria-hidden="true"]').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('TCK-2026-000042')).toBeNull();
  });

  it('shows the empty state, and keeps the column headings', async () => {
    vi.mocked(listTickets).mockResolvedValue(
      page({ items: [], totalCount: 0, totalPages: 0 }),
    );
    mounted();
    expect(
      await screen.findByText(i18n.t('tickets:list.emptyTitle')),
    ).toBeInTheDocument();
    /* An empty state that also drops the headings reads as a broken page rather
     * than an empty list. */
    expect(
      screen.getByRole('columnheader', { name: i18n.t('tickets:list.column.subject') }),
    ).toBeInTheDocument();
  });

  it('keeps the table and its headings, and shows ONE standard notice', async () => {
    /* THE COPY IS THE PRIMITIVE'S NOW, and the server's `detail` is deliberately
       not shown. This test asserted the opposite until 2026-09-03 — it required
       «الخادم غير متاح» from the response — and that behaviour was the defect:
       on a validation envelope `detail` is developer-facing, so the screen read
       «تعذّر تحميل القائمة · راجع خاصية errors للاطّلاع على رسائل الحقول».

       Ruled the same day: "ثبت شكل دا لكل جداول السيستم نفس الايكونز نفس الرسالة
       نفس كل شيء للجداول". One event, one set of words, read from `common`. */
    const u = userEvent.setup();
    vi.mocked(listTickets).mockRejectedValue(
      new ApiError(
        {
          type: 'errors/unexpected',
          title: 'Unexpected',
          status: 500,
          detail: 'الخادم غير متاح',
          traceId: '00-abc-def-00',
        },
        'ar',
      ),
    );
    mounted();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(i18n.t('common:table.errorTitle'))).toBeInTheDocument();
    expect(within(alert).getByText(i18n.t('common:table.errorBody'))).toBeInTheDocument();

    /* The server's own `detail` is NOT on screen. Asserted, because dropping it
       was the point. */
    expect(screen.queryByText('الخادم غير متاح')).not.toBeInTheDocument();

    /* The trace id IS — the one string a reader can hand to somebody who can act
       on it. */
    expect(within(alert).getByText('00-abc-def-00')).toBeInTheDocument();

    /* AND THE TABLE SURVIVES. Reported 2026-09-03: "ارسم الجدول عادي الهدير يكون
       موجود والبودي بتاع الجداول تكون فيها الايرور دا بس متخفيش رسم الجدول
       بالهيدر بتاعه". A page that replaces its whole table reads as broken
       rather than as a failed request. */
    expect(
      screen.getByRole('columnheader', { name: i18n.t('tickets:list.column.subject') }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('row')).toHaveLength(1);

    vi.mocked(listTickets).mockResolvedValue(page());
    await u.click(within(alert).getByRole('button', { name: i18n.t('common:table.retry') }));
    expect(await screen.findByText('TCK-2026-000042')).toBeInTheDocument();
  });
});

describe('changing the page size returns to page 1', () => {
  it('does not keep the reader on a page that may not exist', async () => {
    /* Page 7 of 20-row pages is not page 7 of 100-row pages. Keeping the number
     * lands the reader somewhere they did not choose, and on a short list lands
     * them past the end — an empty screen that looks like a data problem. */
    const u = userEvent.setup();
    mounted('/tickets?page=7&pageSize=20');
    await screen.findByText('TCK-2026-000042');
    vi.mocked(listTickets).mockClear();

    /* `031`: `user.selectOptions` reaches for an `HTMLOptionElement` and throws
     * on anything else, so the rows-per-page control is now driven by opening it
     * and clicking a row. The assertion below is untouched. */
    await u.click(screen.getByRole('combobox'));
    await u.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: '100' }),
    );
    await waitFor(() => expect(listTickets).toHaveBeenCalled());
    expect(vi.mocked(listTickets).mock.calls[0]![0]).toEqual({ page: 1, pageSize: 100 });
  });
});

/*
 * AC-026-16 — THE CACHE RULE, ASSERTED AT THE SOURCE.
 *
 * Spec §5: a body returned by a write is what the server HAD, not what it
 * STORED. The two already differ by four digits of a timestamp, and a list is
 * exactly where a helpfully reused write response would go. `setQueryData` into
 * a list key seeds a value the server will never return again — nothing throws,
 * the row simply differs from the same row after a refresh.
 *
 * This cannot be asserted by rendering: the defect is a call that is ABSENT.
 * Only reading the source can prove an absence.
 */
describe('AC-026-16 — nothing under features/tickets seeds the cache from a write', () => {
  const dir = resolve(process.cwd(), 'src/features/tickets');
  const NL = String.fromCharCode(10);

  const sources = readdirSync(dir)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.'))
    .map((f) => ({ file: f, text: readFileSync(resolve(dir, f), 'utf8') }));

  it('reads more than one file, so an empty sweep cannot pass', () => {
    /* A guard that silently scanned nothing would be green forever. */
    expect(sources.length).toBeGreaterThan(3);
  });

  it.each(sources.map((s) => s.file))('%s calls no setQueryData', (file) => {
    const src = sources.find((s) => s.file === file)!.text;
    const code = src
      .split(NL)
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('*') && !l.startsWith('/*') && !l.startsWith('//'))
      .join(NL);
    expect(code).not.toContain('setQueryData');
    expect(code).not.toContain('setQueriesData');
  });

  it('renders the timestamp from the query payload, not from a literal', async () => {
    /* The other half: the date on screen comes from what the GET returned. */
    vi.mocked(listTickets).mockResolvedValue(
      page({ items: [{ ...ROW, createdAtUtc: '2026-01-09T00:00:00Z' }] }),
    );
    mounted();
    expect(await screen.findByText('09/01/2026')).toBeInTheDocument();
  });
});

/*
 * FE-026-09 / Q-7. The first version of this screen shipped a row MENU holding a
 * single "View ticket" item, and no row click — the opposite of what the spec
 * ruled. Nothing caught it, because no test asked what the row does.
 *
 * These are the assertions that would have.
 */
describe('FE-026-09 — the row navigates, AND it has a menu again', () => {
  /* Q-7 IS SUPERSEDED, and this test used to assert its opposite.
   *
   * Q-7 turned down a row menu, and it was right about what it was shown: a menu
   * holding a single View item that duplicated the row click. The product owner
   * supplied the design frames on 2026-08-31 — four actions, an icon each, a rule
   * above a destructive one — and ruled the menu in. Three of the four are things
   * the row click cannot do, which is the difference from what Q-7 refused.
   *
   * Kept as a rewritten test rather than deleted: the assertions below are the
   * ones that would have caught the original defect too — they ask what the row
   * and the trigger each do, which is what nothing asked before. */
  it('renders the actions column and a four-item menu', async () => {
    const u = userEvent.setup();
    mounted();
    await screen.findByText('TCK-2026-000042');

    expect(
      screen.getByRole('columnheader', { name: i18n.t('tickets:list.column.actions') }),
    ).toBeInTheDocument();

    /* Closed until asked: a menu rendered inline in every row is six menus on a
     * six-row page, and a screen reader walks all of them. */
    expect(screen.queryByRole('menu')).toBeNull();

    await u.click(
      screen.getByRole('button', { name: i18n.t('tickets:list.rowActions') }),
    );

    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      i18n.t('tickets:list.view'),
      i18n.t('tickets:list.action.reassign'),
      i18n.t('tickets:list.action.escalate'),
      i18n.t('tickets:list.action.close'),
    ]);
  });

  it('leaves escalate disabled, because 016 has no endpoint', async () => {
    const u = userEvent.setup();
    mounted();
    await screen.findByText('TCK-2026-000042');
    await u.click(
      screen.getByRole('button', { name: i18n.t('tickets:list.rowActions') }),
    );

    /* The design draws the item, so it is drawn — and it does not pretend to
     * work. There is no escalate endpoint in the API at all; `016` is unbuilt.
     * Asserted by STATE rather than by absence, so building `016` turns this
     * red at the line that says why. */
    expect(
      screen.getByRole('menuitem', { name: i18n.t('tickets:list.action.escalate') }),
    ).toBeDisabled();
  });

  it('opens the menu without navigating — the trigger is not the row', async () => {
    const u = userEvent.setup();
    mounted();
    await screen.findByText('TCK-2026-000042');

    await u.click(
      screen.getByRole('button', { name: i18n.t('tickets:list.rowActions') }),
    );

    /* The row's own handler ignores a click that started on a button, and the
     * trigger stops propagation. Both halves are needed and neither is visible
     * from the markup: without them, pressing the kebab opens the ticket. */
    expect(screen.getByTestId('pathname')).not.toHaveTextContent(`/tickets/${ROW.id}`);
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
  });

  it('gives the subject a real link — the keyboard and screen-reader path', async () => {
    mounted();
    const link = await screen.findByRole('link', { name: ROW.subject });
    /* onRowClick adds no tabindex and no role, deliberately. Without this anchor
     * the row is reachable by mouse only, and the failure is invisible to
     * anyone testing with a mouse. */
    expect(link).toHaveAttribute('href', `/tickets/${ROW.id}`);
  });

  it('navigates when the row itself is clicked', async () => {
    const u = userEvent.setup();
    mounted();
    const cell = await screen.findByText('علي الأحمد');
    await u.click(cell);
    await waitFor(() =>
      expect(screen.getByTestId('pathname')).toHaveTextContent(`/tickets/${ROW.id}`),
    );
  });
});

/*
 * FE-026-08 — the two states that are NOT distinguishable from the array alone.
 *
 * Both arrive as `items: []`. The contract clamps `page` UP to 1 and never DOWN,
 * so `?page=99` on a three-page list returns page 99 with zero items and a
 * totalCount of 137. Only totalCount separates them — and telling a reader
 * "No tickets yet" over a list holding 137 of them says their data is gone.
 */
describe('FE-026-08 — past-the-end is not the same as empty', () => {
  const emptyPage = { items: [], totalCount: 0, totalPages: 0, page: 1 };
  const pastEnd = { items: [], totalCount: 137, totalPages: 7, page: 99 };

  it('says "no tickets yet" only when there are genuinely none', async () => {
    vi.mocked(listTickets).mockResolvedValue(page(emptyPage));
    mounted();
    expect(
      await screen.findByText(i18n.t('tickets:list.emptyTitle')),
    ).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('tickets:list.pastEndTitle'))).toBeNull();
  });

  it('says past-the-end when the list has rows on other pages', async () => {
    vi.mocked(listTickets).mockResolvedValue(page(pastEnd));
    mounted('/tickets?page=99');
    expect(
      await screen.findByText(i18n.t('tickets:list.pastEndTitle')),
    ).toBeInTheDocument();
    /* The wrong copy is the whole defect — assert its absence, not just the
     * right copy's presence. */
    expect(screen.queryByText(i18n.t('tickets:list.emptyTitle'))).toBeNull();
  });

  it('offers a way back, and it goes to the LAST page', async () => {
    const u = userEvent.setup();
    vi.mocked(listTickets).mockResolvedValue(page(pastEnd));
    mounted('/tickets?page=99');
    await screen.findByText(i18n.t('tickets:list.pastEndTitle'));
    vi.mocked(listTickets).mockClear();

    await u.click(
      screen.getByRole('button', { name: i18n.t('tickets:list.pastEndCta') }),
    );
    await waitFor(() => expect(listTickets).toHaveBeenCalled());
    expect(vi.mocked(listTickets).mock.calls[0]![0]!.page).toBe(7);
  });

  it('keeps the column headings in both states', async () => {
    vi.mocked(listTickets).mockResolvedValue(page(pastEnd));
    mounted('/tickets?page=99');
    await screen.findByText(i18n.t('tickets:list.pastEndTitle'));
    expect(
      screen.getByRole('columnheader', { name: i18n.t('tickets:list.column.subject') }),
    ).toBeInTheDocument();
  });
});

/*
 * THE GAP A NEGATIVE CONTROL FOUND.
 *
 * `Table` has its own tests for `refreshing`, and they pass. But nothing here
 * asserted that the PAGE hands it the right flag — so swapping `isPending` for
 * `isFetching` (which re-skeletons on every refetch) left all 27 tests green.
 * The primitive was covered and its caller was not.
 */
describe('AC-026-06 — a refetch keeps the rows on screen', () => {
  it('does not return to the skeleton when moving page', async () => {
    mounted('/tickets?page=1');
    await screen.findByText('TCK-2026-000042');
    const u = userEvent.setup();

    /* Second request never settles, so the refetching state is the one under
     * assertion rather than a frame that has already passed. */
    let release: (v: PagedResult<TicketListItem>) => void = () => {};
    vi.mocked(listTickets).mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );

    await u.click(screen.getByRole('button', { name: i18n.t('common:pager.next') }));
    await waitFor(() => expect(listTickets).toHaveBeenCalledTimes(2));

    /* The row the reader was looking at is still there... */
    expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument();
    /* ...and no skeleton replaced it. Skeleton rows are aria-hidden. */
    expect(document.querySelectorAll('tbody tr[aria-hidden="true"]')).toHaveLength(0);
    /* ...and the table says it is busy, for a reader who cannot see the dim. */
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    release(page());
  });
});

/*
 * THE TWO STATES THE SEEDED DATABASE CANNOT SHOW.
 *
 * No seeded ticket has `isEscalated: true`, and every one is unassigned — so the
 * Arabic walk on the real screen exercised neither. Fixtures can, and that is
 * the honest way round: manufacturing seed rows to make a screenshot look
 * complete would be dressing the demo, not testing the component.
 *
 * These assert the CONDITION, both ways. A test that only renders the true case
 * passes on a component that renders the marker unconditionally.
 */
describe('escalation and assignment render only when the row says so', () => {
  it('shows the escalated marker when isEscalated, and not when it is false', async () => {
    vi.mocked(listTickets).mockResolvedValue(
      page({ items: [{ ...ROW, isEscalated: true }] }),
    );
    const { unmount } = mounted();
    expect(await screen.findByText(i18n.t('tickets:list.escalated'))).toBeInTheDocument();
    unmount();

    vi.mocked(listTickets).mockResolvedValue(
      page({ items: [{ ...ROW, isEscalated: false }] }),
    );
    mounted();
    await screen.findByText('TCK-2026-000042');
    expect(screen.queryByText(i18n.t('tickets:list.escalated'))).toBeNull();
  });

  it('shows an initials circle for an assignee, hidden from assistive tech', async () => {
    vi.mocked(listTickets).mockResolvedValue(
      page({
        items: [{ ...ROW, assigneeId: 'a1', assigneeName: 'عمر سعيد' }],
      }),
    );
    const { container } = mounted();
    await screen.findByText('عمر سعيد');

    const avatar = container.querySelector('[class*="avatar"]');
    expect(avatar).not.toBeNull();
    /* The first CHARACTER, not the first byte — an Arabic letter is multi-byte
     * and name[0] would render a replacement glyph. */
    expect(avatar!.textContent).toBe('ع');
    /* aria-hidden: the name is right beside it, so announcing the initial first
     * is noise. */
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText(i18n.t('tickets:list.unassigned'))).toBeNull();
  });

  it('shows the unassigned label and NO circle when both fields are null', async () => {
    /* The contract makes assigneeId and assigneeName null together — the row is
     * still returned, because the join is a left join. */
    vi.mocked(listTickets).mockResolvedValue(
      page({ items: [{ ...ROW, assigneeId: null, assigneeName: null }] }),
    );
    const { container } = mounted();
    expect(
      await screen.findByText(i18n.t('tickets:list.unassigned')),
    ).toBeInTheDocument();
    expect(container.querySelector('[class*="avatar"]')).toBeNull();
  });
});

describe('an inverted created range never reaches the request', () => {
  /* THE PRODUCTION PATH, end to end: a hand-typed or stale link carrying a
     range that ends before it starts. The endpoint refuses that range —
     `400`, `errors.createdTo` — and the refusal must not reach a reader,
     because it arrives as an error pane over a list that was working.

     Measured 2026-09-03, Arabic, before the reader dropped it:
       /tickets?createdFrom=2026-09-01&createdTo=2026-08-01
         rendered «تعذّر تحميل القائمة · راجع خاصية errors للاطّلاع على رسائل
         الحقول» — the server's DEVELOPER-facing detail, on screen.
       /customers with the same pair answered 200 totalCount 0 and said
         «لا عميل يطابق هذا» — a false claim about the data. */

  it('sends neither bound, and still lists', async () => {
    mounted('/tickets?createdFrom=2026-09-01&createdTo=2026-08-01');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());
    const params = vi.mocked(listTickets).mock.calls.at(-1)?.[0];
    expect(params?.createdFrom).toBeUndefined();
    expect(params?.createdTo).toBeUndefined();
  });

  it('shows no chip for the range it dropped', async () => {
    /* THE URL KEEPS THE STALE PAIR, and that is the same behaviour every other
       dropped value has — `?sort=email` stays in the address bar too. What
       matters is that nothing in the product acts on it: no request carries it
       and no chip offers to remove a filter that is not applied. Asserting the
       URL was cleaned was the first version of this test, and it was WRONG —
       the page rewrites the URL on a filter CHANGE, not on a read. */
    mounted('/tickets?createdFrom=2026-09-01&createdTo=2026-08-01');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());
    expect(screen.queryByText(/01\/09\/2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/01\/08\/2026/)).not.toBeInTheDocument();
  });

  it('keeps a range that runs forwards — the control', async () => {
    /* Without this, a reader that dropped BOTH bounds unconditionally would
       pass the two tests above while deleting the feature. */
    mounted('/tickets?createdFrom=2026-08-01&createdTo=2026-09-01');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());
    expect(vi.mocked(listTickets).mock.calls.at(-1)?.[0]?.createdFrom).toBe('2026-08-01');
    expect(vi.mocked(listTickets).mock.calls.at(-1)?.[0]?.createdTo).toBe('2026-09-01');
  });
});
