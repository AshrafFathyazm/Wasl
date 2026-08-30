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
  return { ...actual, listTickets: vi.fn() };
});

const { listTickets } = await import('./tickets.api');
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
    const select = screen.getByRole('combobox');
    expect((select as HTMLSelectElement).value).toBe('100');
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

  it('shows the error state with the server detail, and retries', async () => {
    const u = userEvent.setup();
    vi.mocked(listTickets).mockRejectedValue(
      /* ApiError takes (problem, contentLanguage) — `status` comes off the
       * problem, not a separate argument. Got this wrong first time and the
       * test failed by rendering our fallback copy, which is exactly what it
       * would have done on a real transport failure. Right symptom, wrong
       * cause: the assertion was fine, the fixture was malformed. */
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
    /* The SERVER's message when it authored one — our copy would be less useful
     * and would hide that the server said something. */
    expect(within(alert).getByText('الخادم غير متاح')).toBeInTheDocument();

    vi.mocked(listTickets).mockResolvedValue(page());
    await u.click(within(alert).getByRole('button'));
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

    await u.selectOptions(screen.getByRole('combobox'), '100');
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
describe('FE-026-09 — the row navigates, and there is no row menu', () => {
  it('renders NO row menu, per Q-7', async () => {
    mounted();
    await screen.findByText('TCK-2026-000042');
    /* An actions column, a kebab trigger, or a menu role — none of the three.
     * Q-7: "Open is the row click", and a menu with one entry duplicating it is
     * the empty menu that ruling was about. */
    expect(screen.queryByRole('menu')).toBeNull();
    expect(
      screen.queryByRole('columnheader', { name: i18n.t('tickets:list.column.actions') }),
    ).toBeNull();
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

    await u.click(screen.getByRole('button', { name: i18n.t('tickets:list.next') }));
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
