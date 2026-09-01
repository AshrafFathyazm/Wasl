import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PagedResult, TicketListItem } from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';

/* `015` frontend half, rendered. The unit tests for the URL round-trip are in
 * `ticketFilters.test.ts`; these assert the three things only a render can show:
 * that a control writes the URL, that the page then REQUESTS what the URL says,
 * and that an empty filtered result is a different state from an empty list. */

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
  totalPages: 1,
  ...over,
});

/** Reports the SEARCH, not just the pathname — the filters live there. */
function LocationProbe() {
  const { search } = useLocation();
  return <span data-testid="search">{search}</span>;
}

/** `queue` is what `routes.tsx` passes on `/tickets/mine` and
 *  `/tickets/unassigned`; `routes.test.tsx` proves those paths supply it. */
const mounted = (url = '/tickets', queue?: 'mine' | 'unassigned') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <TicketListPage queue={queue} />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
};

const urlSearch = () => screen.getByTestId('search').textContent ?? '';

/** The parameters of the most recent request. */
const lastParams = () => vi.mocked(listTickets).mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.mocked(listTickets).mockReset();
  vi.mocked(listTickets).mockResolvedValue(page());
  /* THE CHIP COUNTS ARE A SEPARATE FETCHER, and they must answer here: the
   * subtitle and every chip number wait on all five, so an unmocked count
   * leaves the header permanently absent and the reason is not obvious from a
   * failing query assertion. */
  vi.mocked(countTickets).mockReset();
  vi.mocked(countTickets).mockResolvedValue(0);
});

describe('the tabs write the URL, and the page requests what the URL says', () => {
  it('sends no status filter on the All tab', async () => {
    mounted();
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    expect(lastParams()).toMatchObject({ page: 1, pageSize: 20 });
    expect(lastParams()).not.toHaveProperty('status');
  });

  it('puts the status in the URL and in the request', async () => {
    mounted();
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('tab', { name: /new/i }));

    await waitFor(() => expect(urlSearch()).toContain('status=New'));
    await waitFor(() => expect(lastParams()?.status).toEqual(['New']));
  });

  /* A tab is a shortcut, so clicking the active one returns to All rather than
   * leaving the reader with no way back except the browser's back button. */
  it('clicking the active tab clears the filter', async () => {
    mounted('/tickets?status=New');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('tab', { name: /new/i }));

    await waitFor(() => expect(urlSearch()).not.toContain('status='));
  });

  /* AC-14. The URL is the container, so a filtered link renders filtered on
   * arrival — no click, no effect, nothing to hydrate. */
  it('renders a filtered list straight from the URL', async () => {
    mounted('/tickets?status=Resolved&priority=High&assignee=me');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    expect(lastParams()).toMatchObject({
      status: ['Resolved'],
      priority: ['High'],
      assignee: 'me',
    });
  });

  it('marks the active tab with aria-selected, not only a class', async () => {
    mounted('/tickets?status=New');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    expect(screen.getByRole('tab', { name: /new/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /^all/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  /* Page 5 of an unfiltered list is rarely page 5 of a filtered one. Keeping it
   * turns "filter to Open" into an empty table with a pager reading 5 of 1, and
   * the empty table reads as "no matching tickets" — so the filter looks broken
   * rather than the pager. */
  it('drops the page when a filter changes and keeps the page size', async () => {
    mounted('/tickets?page=5&pageSize=50');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('tab', { name: /new/i }));

    await waitFor(() => expect(lastParams()).toMatchObject({ page: 1, pageSize: 50 }));
    expect(urlSearch()).not.toContain('page=5');
  });
});

describe('the search box', () => {
  /* Typing straight into the URL would push a history entry per keystroke and
   * fire a request per keystroke. The box is local and the URL is written after
   * the last one. */
  it('does not request on every keystroke', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mounted();
    await waitFor(() => expect(listTickets).toHaveBeenCalled());
    const before = vi.mocked(listTickets).mock.calls.length;

    await user.type(screen.getByPlaceholderText(i18n.t('tickets:list.search')), 'gulf');

    expect(vi.mocked(listTickets).mock.calls.length).toBe(before);

    vi.advanceTimersByTime(350);
    await waitFor(() => expect(lastParams()?.search).toBe('gulf'));

    vi.useRealTimers();
  });

  /* Without the re-sync effect the box would keep showing a term the list is no
   * longer filtered by, and the reader would believe the search is broken. */
  it('shows the term the URL carries, not a stale draft', async () => {
    mounted('/tickets?search=gulf');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    expect(screen.getByPlaceholderText(i18n.t('tickets:list.search'))).toHaveValue('gulf');
  });
});

describe('no matches is not no tickets', () => {
  /* 015's own criterion, and the preventive half of the feature. "No tickets
   * yet" over a filtered list tells the reader their data is gone. */
  it('says nothing matched when a filter is on', async () => {
    vi.mocked(listTickets).mockResolvedValue(
      page({ items: [], totalCount: 0, totalPages: 0 }),
    );

    mounted('/tickets?status=Closed');

    await waitFor(() =>
      expect(screen.getByText(i18n.t('tickets:list.noMatchTitle'))).toBeInTheDocument(),
    );
    expect(screen.queryByText(i18n.t('tickets:list.emptyTitle'))).not.toBeInTheDocument();
  });

  it('says there are no tickets when nothing is filtered', async () => {
    vi.mocked(listTickets).mockResolvedValue(
      page({ items: [], totalCount: 0, totalPages: 0 }),
    );

    mounted('/tickets');

    await waitFor(() =>
      expect(screen.getByText(i18n.t('tickets:list.emptyTitle'))).toBeInTheDocument(),
    );
    expect(screen.queryByText(i18n.t('tickets:list.noMatchTitle'))).not.toBeInTheDocument();
  });

  /* Past the end wins over no-matches: a filtered list CAN be paged past its
   * end, and the pager is the thing to fix first. */
  it('past the end wins over no matches', async () => {
    vi.mocked(listTickets).mockResolvedValue(
      page({ items: [], totalCount: 137, totalPages: 7 }),
    );

    mounted('/tickets?status=Open&page=99');

    await waitFor(() =>
      expect(screen.getByText(i18n.t('tickets:list.pastEndTitle'))).toBeInTheDocument(),
    );
    expect(screen.queryByText(i18n.t('tickets:list.noMatchTitle'))).not.toBeInTheDocument();
  });
});

describe('the panel', () => {
  it('is a disclosure — closed, named, and reporting its state', async () => {
    mounted();
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    const toggle = screen.getByRole('button', { name: new RegExp(i18n.t('tickets:list.filter'), 'i') });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  /* The count is what tells a reader a filter is on while the panel is shut. */
  it('counts the active filters in a badge, and keeps the button name stable', async () => {
    mounted('/tickets?status=Open&status=New&escalated=false');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    /* THE NAME NO LONGER CARRIES THE COUNT — the design puts the number in a
     * filled badge on the control, so the button is called "Filter" whether
     * three filters are on or none. This test used to assert `/\(3\)/` in the
     * accessible name and was the record of the old shape; the badge itself is
     * the assertion now, and the stable name is asserted WITH it, because that
     * is the half a regression would silently take back. */
    const button = screen.getByRole('button', {
      name: new RegExp(i18n.t('tickets:list.filter')),
    });
    expect(within(button).getByText('3')).toBeInTheDocument();
  });

  /* The search is a question the reader typed, not a facet they ticked. */
  /* The standalone "Clear filters" link left with the frame layout — مسح الكل
   * lives inside the panel now, and it clears-and-applies in one press. The
   * CLAIM is unchanged and is the point of the test: the search is a question
   * the reader typed, not a facet they ticked, and clearing facets must not
   * throw it away. */
  it('مسح الكل clears the facets in one press and keeps the search term', async () => {
    mounted('/tickets?status=Open&search=gulf');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(i18n.t('tickets:list.filter')) }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('tickets:list.clearAll') }),
    );

    await waitFor(() => expect(urlSearch()).not.toContain('status='));
    expect(urlSearch()).toContain('search=gulf');
  });

  /* The panel edits a DRAFT and تطبيق is the write. Chips alone must send
   * nothing — the old panel fired a request per click, and "these three
   * together" was impossible to say. */
  it('applies the chip draft only on تطبيق', async () => {
    mounted();
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(i18n.t('tickets:list.filter')) }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('tickets:priority.High') }),
    );

    /* Nothing written yet — the URL still carries no priority. */
    expect(urlSearch()).not.toContain('priority=');

    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('tickets:list.apply') }),
    );

    await waitFor(() => expect(urlSearch()).toContain('priority=High'));
    await waitFor(() => expect(lastParams()?.priority).toEqual(['High']));
  });

  /* THIS TEST WENT RED EXACTLY AS ITS PREDECESSOR PROMISED. The old assertion
   * held the fields disabled "until the endpoint can filter by it", with a note
   * that the red would mean 015's backend grew the parameters — it did, on
   * 2026-08-31, with three integration tests pinning the inclusive UTC-day
   * bounds. So the assertion flipped from "inert" to "works end to end". */
  it('picks a day in the calendar and تطبيق puts it in the URL and the request', async () => {
    mounted();
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(i18n.t('tickets:list.filter')) }),
    );

    /* The trigger opens a DIALOG named after its field — two تطبيق buttons can
     * be on screen at once, and the name is what tells them apart. */
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(i18n.t('tickets:list.createdFrom')) }),
    );
    const dialog = screen.getByRole('dialog', {
      name: i18n.t('tickets:list.createdFrom'),
    });

    /* Day 15 of the current month — always on the grid, never in the outside
     * fringe of an adjacent month. */
    await userEvent.click(within(dialog).getByRole('button', { name: '15' }));
    await userEvent.click(
      within(dialog).getByRole('button', { name: i18n.t('tickets:list.apply') }),
    );

    /* The calendar wrote the DRAFT; nothing reaches the URL until the panel's
     * own تطبيق — the same draft-until-apply contract the chips keep. */
    expect(urlSearch()).not.toContain('createdFrom=');

    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('tickets:list.apply') }),
    );

    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
    await waitFor(() => expect(urlSearch()).toContain(`createdFrom=${iso}`));
    await waitFor(() => expect(lastParams()?.createdFrom).toBe(iso));
  });
});


/*
 * =============================================================================
 * THE TWO SCOPED QUEUES — one filter that the reader cannot remove
 * =============================================================================
 * `/tickets/mine` and `/tickets/unassigned` are this screen with `assignee`
 * decided by the path. Every assertion below is about the ONE way that differs
 * from a facet, because a facet is removable and this is not: the whole point is
 * that "My tickets" cannot quietly become everybody's.
 *
 * Each of these can fail while the screen still looks right, which is why they
 * are tests and not comments:
 *   - the request could carry no assignee at all — a full queue under a personal
 *     heading, and it renders perfectly
 *   - the counts could stay unscoped — 131 above four rows
 *   - the scope could reach the URL, where the next facet click keeps it and a
 *     nav click to another queue does not
 *   - مسح الكل could clear it, leaving the nav highlighting one queue while the
 *     table shows another
 *   - an empty personal queue could claim the product has no tickets
 */
describe('the path decides the assignee, and nothing on screen can undo it', () => {
  it.each([
    ['/tickets/mine', 'mine', 'me'],
    ['/tickets/unassigned', 'unassigned', 'unassigned'],
  ] as const)('%s asks the server for assignee=%s', async (url, queue, wire) => {
    mounted(url, queue);
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    expect(lastParams()?.assignee).toBe(wire);
  });

  it('sends no assignee at all on /tickets — the control for the two above', async () => {
    mounted();
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    expect(lastParams()).not.toHaveProperty('assignee');
  });

  it('lets the path outrank a stale ?assignee= in a pasted link', async () => {
    /* The comment on `filters` claims this ordering. Untested, the two could be
     * combined the other way round and every assertion above would still pass —
     * and the failure is the bad one: a link somebody shared silently showing a
     * DIFFERENT queue from the one the nav is highlighting. */
    mounted('/tickets/mine?assignee=unassigned', 'mine');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    expect(lastParams()?.assignee).toBe('me');
  });

  it('scopes all five chip counts, so the header describes this queue', async () => {
    mounted('/tickets/mine', 'mine');
    await waitFor(() => expect(countTickets).toHaveBeenCalledTimes(5));

    /* EVERY call, not the first: the counts are five separate queries and a
     * scope applied to some of them is a header that mixes two queues. */
    for (const [params] of vi.mocked(countTickets).mock.calls) {
      expect(params.assignee).toBe('me');
    }
  });

  it('keeps the scope out of the URL when a facet is applied', async () => {
    mounted('/tickets/mine', 'mine');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('tab', { name: /new/i }));

    await waitFor(() => expect(urlSearch()).toContain('status=New'));
    /* The path already says it. Written here too, it would survive a click to
     * another queue and contradict the nav. */
    expect(urlSearch()).not.toContain('assignee=');
    /* And the request still carries it — the scope is applied on the way OUT of
     * the URL, so stripping it from the query string must not drop it. */
    await waitFor(() => expect(lastParams()?.assignee).toBe('me'));
  });

  it('does not count the queue in the تصفية badge', async () => {
    /* The badge is "how many questions have I asked", and the queue is not one:
     * it has no control in the panel and no chip in the strip, so a 1 there
     * points at nothing the reader can find or undo. This is the one thing the
     * whole scoped-queue suite missed and a screenshot caught. */
    mounted('/tickets/unassigned', 'unassigned');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    const button = screen.getByRole('button', {
      name: new RegExp(i18n.t('tickets:list.filter')),
    });
    expect(within(button).queryByText('1')).not.toBeInTheDocument();
  });

  it('still counts a facet the reader DID apply on a scoped queue', async () => {
    /* The control: without it, the assertion above passes on a build where the
     * badge stopped counting anything at all. */
    mounted('/tickets/unassigned?priority=High', 'unassigned');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    const button = screen.getByRole('button', {
      name: new RegExp(i18n.t('tickets:list.filter')),
    });
    expect(within(button).getByText('1')).toBeInTheDocument();
  });

  it('draws no removable chip for the scope', async () => {
    mounted('/tickets/mine', 'mine');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    const label = `${i18n.t('tickets:list.column.assignee')}: ${i18n.t(
      'tickets:list.assignedToMe',
    )}`;
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it('DOES draw one when the reader chose the same assignee on /tickets', async () => {
    /* The control for the assertion above. Without it, that test would pass on a
     * build where the assignee chip had been deleted outright. */
    mounted('/tickets?assignee=me');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    const label = `${i18n.t('tickets:list.column.assignee')}: ${i18n.t(
      'tickets:list.assignedToMe',
    )}`;
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('مسح الكل clears the facets and keeps the queue', async () => {
    mounted('/tickets/mine?status=Open', 'mine');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(i18n.t('tickets:list.filter')) }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('tickets:list.clearAll') }),
    );

    await waitFor(() => expect(urlSearch()).not.toContain('status='));
    await waitFor(() => expect(lastParams()?.assignee).toBe('me'));
  });

  it('an empty personal queue says so, instead of claiming there are no tickets', async () => {
    vi.mocked(listTickets).mockResolvedValue(
      page({ items: [], totalCount: 0, totalPages: 0 }),
    );
    mounted('/tickets/mine', 'mine');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    expect(
      await screen.findByText(i18n.t('tickets:list.emptyMineTitle')),
    ).toBeInTheDocument();
    /* NOT the filtered-empty state: the reader ticked nothing, so offering to
     * clear their filters names a cause that does not exist. */
    expect(
      screen.queryByRole('button', { name: i18n.t('tickets:list.noMatchCta') }),
    ).not.toBeInTheDocument();
    /* And not the "nothing has arrived on any channel" copy either, which is
     * false while the team's queue holds work. */
    expect(
      screen.queryByText(i18n.t('tickets:list.emptyTitle')),
    ).not.toBeInTheDocument();
  });
});
