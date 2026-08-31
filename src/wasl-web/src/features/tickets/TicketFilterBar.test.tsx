import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
  totalPages: 1,
  ...over,
});

/** Reports the SEARCH, not just the pathname — the filters live there. */
function LocationProbe() {
  const { search } = useLocation();
  return <span data-testid="search">{search}</span>;
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

const urlSearch = () => screen.getByTestId('search').textContent ?? '';

/** The parameters of the most recent request. */
const lastParams = () => vi.mocked(listTickets).mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.mocked(listTickets).mockReset();
  vi.mocked(listTickets).mockResolvedValue(page());
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

    await userEvent.click(screen.getByRole('tab', { name: /open/i }));

    await waitFor(() => expect(urlSearch()).toContain('status=Open'));
    await waitFor(() => expect(lastParams()?.status).toEqual(['Open']));
  });

  /* A tab is a shortcut, so clicking the active one returns to All rather than
   * leaving the reader with no way back except the browser's back button. */
  it('clicking the active tab clears the filter', async () => {
    mounted('/tickets?status=Open');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('tab', { name: /open/i }));

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
    mounted('/tickets?status=Open');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    expect(screen.getByRole('tab', { name: /open/i })).toHaveAttribute(
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

    await userEvent.click(screen.getByRole('tab', { name: /open/i }));

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
  it('counts the active filters on the button', async () => {
    mounted('/tickets?status=Open&status=New&escalated=false');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    expect(
      screen.getByRole('button', { name: /\(3\)/ }),
    ).toBeInTheDocument();
  });

  /* The search is a question the reader typed, not a facet they ticked. */
  it('Clear filters keeps the search term', async () => {
    mounted('/tickets?status=Open&search=gulf');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());

    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('tickets:list.clearFilters') }),
    );

    await waitFor(() => expect(urlSearch()).not.toContain('status='));
    expect(urlSearch()).toContain('search=gulf');
  });
});
