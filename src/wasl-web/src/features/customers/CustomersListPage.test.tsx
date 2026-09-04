import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CustomerListItem, PagedResult } from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';

/* The module is the seam, not `fetch` — the same choice `026` and `032` made,
 * because it measures "one call out per intent", which is what the claims here
 * are actually about. */
vi.mock('./customers.api', async () => {
  const actual =
    await vi.importActual<typeof import('./customers.api')>('./customers.api');
  return {
    ...actual,
    listCustomers: vi.fn(),

    /* The company vocabulary is a SEPARATE fetcher and is mocked separately: the
       assertions below count LIST requests, and leaving this real would put an
       unstubbed request behind every panel open. */
    getCustomerCompanies: vi.fn(),
  };
});

const { listCustomers, getCustomerCompanies } = await import('./customers.api');
const { default: CustomersListPage } = await import('./CustomersListPage');

const ROW: CustomerListItem = {
  id: '1b2c3d4e-5678-4abc-9def-0123456789ab',
  fullName: 'علي الأحمد',
  email: 'ali@example.com',
  phone: '+966501234567',
  companyName: 'مؤسسة الرياض للتجارة',
  createdAtUtc: '2026-08-23T12:00:00Z',
};

const page = (
  over: Partial<PagedResult<CustomerListItem>> = {},
): PagedResult<CustomerListItem> => ({
  items: [ROW],
  page: 1,
  pageSize: 20,
  totalCount: 1,
  totalPages: 1,
  ...over,
});

/** Reports the SEARCH, because that is where every filter lives. */
function LocationProbe() {
  const { search } = useLocation();
  return <span data-testid="search">{search}</span>;
}

const mounted = (url = '/customers') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <CustomersListPage />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
};

const urlSearch = () => screen.getByTestId('search').textContent ?? '';
const lastParams = () => vi.mocked(listCustomers).mock.calls.at(-1)?.[0];
const rendered = () => waitFor(() => expect(listCustomers).toHaveBeenCalled());

beforeEach(() => {
  vi.mocked(listCustomers).mockReset().mockResolvedValue(page());
  vi.mocked(getCustomerCompanies)
    .mockReset()
    .mockResolvedValue({
      items: ['مؤسسة الرياض للتجارة', 'Gulf Services Ltd.'],
      hasUncompanied: true,
    });
});

describe('the directory reads the URL and asks the server for exactly that', () => {
  it('renders a row from the query', async () => {
    mounted();
    await rendered();

    expect(await screen.findByText('علي الأحمد')).toBeInTheDocument();
    expect(screen.getByText('مؤسسة الرياض للتجارة')).toBeInTheDocument();
  });

  it('sends no filter at all on a bare URL — the control for everything below', async () => {
    mounted();
    await rendered();

    expect(lastParams()).toEqual({ page: 1, pageSize: 20 });
  });

  it('renders a filtered list straight from the URL, with nothing to hydrate', async () => {
    mounted(
      '/customers?search=gulf&sort=createdAtUtc&dir=desc&company=Acme&noCompany=true' +
        '&createdFrom=2026-01-01&createdTo=2026-02-01',
    );
    await rendered();

    /* AC-14's shape, `015`'s rule: the URL is the state, read on every render. */
    expect(lastParams()).toMatchObject({
      search: 'gulf',
      sort: 'createdAtUtc',
      dir: 'desc',
      company: ['Acme'],
      noCompany: true,
      createdFrom: '2026-01-01',
      createdTo: '2026-02-01',
    });
  });

  it('drops a sort the server would refuse rather than sending it', async () => {
    mounted('/customers?sort=email&dir=sideways');
    await rendered();

    /* `?sort=email` is a `400` (`033` §5.5). A screen that forwarded it would show
       an error for a URL the reader can see and cannot fix; dropping it degrades
       to the server's default order. */
    expect(lastParams()).not.toHaveProperty('sort');
    expect(lastParams()).not.toHaveProperty('dir');
  });

  it('drops a date that is not a real day', async () => {
    mounted('/customers?createdFrom=2026-02-31');
    await rendered();

    /* Validated by ROUND TRIP, not by a regex: `2026-02-31` matches every shape a
       pattern can express and is not a day. */
    expect(lastParams()).not.toHaveProperty('createdFrom');
  });

  it('clamps the company list to twenty, as the server does', async () => {
    const many = Array.from({ length: 25 }, (_, i) => `company=C${i}`).join('&');
    mounted(`/customers?${many}`);
    await rendered();

    expect(lastParams()?.company).toHaveLength(20);
  });
});

describe('sorting is a request, and the control belongs to Table', () => {
  it('writes the column and the direction to the URL, then asks for them', async () => {
    mounted();
    await rendered();

    await userEvent.click(
      screen.getByRole('button', {
        name: new RegExp(i18n.t('customers:list.column.name')),
      }),
    );

    await waitFor(() => expect(urlSearch()).toContain('sort=fullName'));
    expect(urlSearch()).toContain('dir=asc');
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ sort: 'fullName', dir: 'asc' }),
    );
  });

  it('cycles to unsorted on the third press, and then sends no sort', async () => {
    mounted();
    await rendered();

    const header = screen.getByRole('button', {
      name: new RegExp(i18n.t('customers:list.column.name')),
    });

    await userEvent.click(header);
    await userEvent.click(header);
    await waitFor(() => expect(urlSearch()).toContain('dir=desc'));

    await userEvent.click(header);

    /* `Table` owns asc → desc → unsorted (`026` Q-T-3), and the third step is the
       one that matters: without it there is no way back to the server's order. */
    await waitFor(() => expect(urlSearch()).not.toContain('sort='));
    await waitFor(() => expect(lastParams()).not.toHaveProperty('sort'));
  });
});

describe('the filter panel edits a draft, and تطبيق is the write', () => {
  const openPanel = async () => {
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(i18n.t('customers:list.filter')) }),
    );
  };

  it('sends nothing when a company is ticked and nothing applied', async () => {
    mounted();
    await rendered();
    await openPanel();

    await userEvent.click(await screen.findByLabelText('Gulf Services Ltd.'));

    /* The old panel fired a request per click, which made "these two together"
       impossible to express. */
    expect(urlSearch()).not.toContain('company=');
  });

  it('applies the ticked company on تطبيق', async () => {
    mounted();
    await rendered();
    await openPanel();

    await userEvent.click(await screen.findByLabelText('Gulf Services Ltd.'));
    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('customers:list.apply') }),
    );

    await waitFor(() => expect(urlSearch()).toContain('company=Gulf+Services+Ltd.'));
    await waitFor(() => expect(lastParams()?.company).toEqual(['Gulf Services Ltd.']));
  });

  it('offers the no-company row only when the server says it would match', async () => {
    vi.mocked(getCustomerCompanies).mockResolvedValue({
      items: ['Gulf Services Ltd.'],
      hasUncompanied: false,
    });

    mounted();
    await rendered();
    await openPanel();

    await screen.findByLabelText('Gulf Services Ltd.');

    /* `hasUncompanied` is the server's own EXISTS, and a capped list cannot answer
       it — offering the row anyway is a checkbox that always returns nothing. */
    expect(
      screen.queryByLabelText(i18n.t('customers:list.noCompany')),
    ).not.toBeInTheDocument();
  });

  it('does not fetch the companies until the panel is opened', async () => {
    mounted();
    await rendered();

    expect(getCustomerCompanies).not.toHaveBeenCalled();

    await openPanel();
    await waitFor(() => expect(getCustomerCompanies).toHaveBeenCalled());
  });
});

describe('the applied chips describe the list, and each removes only itself', () => {
  it('removes one company and leaves the other', async () => {
    mounted('/customers?company=Acme&company=Globex');
    await rendered();

    const label = `${i18n.t('customers:list.column.company')}: Acme`;
    await userEvent.click(
      screen.getByRole('button', {
        name: i18n.t('customers:list.removeFilter', { label }),
      }),
    );

    await waitFor(() => expect(urlSearch()).not.toContain('Acme'));
    expect(urlSearch()).toContain('Globex');
  });

  it('keeps the SORT when the filters are cleared', async () => {
    mounted('/customers?company=Acme&sort=createdAtUtc&dir=desc');
    await rendered();

    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('customers:list.clearFilters') }),
    );

    /* Clearing filters is about which rows exist; the order they arrive in is a
       different question, and resetting it would undo a click made elsewhere. */
    await waitFor(() => expect(urlSearch()).not.toContain('company='));
    expect(urlSearch()).toContain('sort=createdAtUtc');
  });

  it('counts facets in the badge but not the search box', async () => {
    mounted('/customers?search=gulf&company=Acme&createdFrom=2026-01-01');
    await rendered();

    const button = screen.getByRole('button', {
      name: new RegExp(i18n.t('customers:list.filter')),
    });

    /* Two: the company and the date. The search term is a question the reader
       typed into a control of its own, with its own clear button. */
    expect(within(button).getByText('2')).toBeInTheDocument();
  });
});

describe('the three empty states are ordered, and each excludes the other two', () => {
  it('says "no customers yet" when nothing is filtered', async () => {
    vi.mocked(listCustomers).mockResolvedValue(
      page({ items: [], totalCount: 0, totalPages: 0 }),
    );

    mounted();
    await rendered();

    expect(
      await screen.findByText(i18n.t('customers:list.emptyTitle')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n.t('customers:list.noMatchTitle')),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(i18n.t('customers:list.pastEndTitle')),
    ).not.toBeInTheDocument();
  });

  it('says "nothing matches" under a search, and carries the term into the CTA', async () => {
    vi.mocked(listCustomers).mockResolvedValue(
      page({ items: [], totalCount: 0, totalPages: 0 }),
    );

    mounted('/customers?search=zzz');
    await rendered();

    expect(
      await screen.findByText(i18n.t('customers:list.noMatchTitle')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n.t('customers:list.emptyTitle')),
    ).not.toBeInTheDocument();

    /* BR-4's PREVENTIVE HALF, and the reason this state is its own component:
       most duplicates are created by someone who could not find the record, so
       the term they could not find is carried into the form. */
    const cta = screen.getByRole('link', {
      name: i18n.t('customers:list.noMatchCta', { term: 'zzz' }),
    });
    expect(cta).toHaveAttribute('href', '/customers/new?name=zzz');
  });

  it('says "past the end" when rows exist but not on this page, and that wins', async () => {
    vi.mocked(listCustomers).mockResolvedValue(
      page({ items: [], page: 9, totalCount: 96, totalPages: 5 }),
    );

    /* A FILTERED list can also be paged past its end, which is why the order
       matters: "nothing matches" here would tell the reader their filter is
       wrong when their PAGE is. */
    mounted('/customers?page=9&search=gulf');
    await rendered();

    expect(
      await screen.findByText(i18n.t('customers:list.pastEndTitle')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n.t('customers:list.noMatchTitle')),
    ).not.toBeInTheDocument();
  });
});

describe('paging renders what the server returned, never what was asked for', () => {
  it('renders the clamped page size rather than the requested one', async () => {
    vi.mocked(listCustomers).mockResolvedValue(page({ pageSize: 100, page: 1 }));

    mounted('/customers?pageSize=500');
    await rendered();

    /* BR-7.2 clamps rather than rejecting, so a pager showing 500 would describe
       a page nobody has. */
    expect(await screen.findByText('100')).toBeInTheDocument();
  });

  it('returns to page 1 when the page size changes', async () => {
    mounted('/customers?page=4');
    await rendered();

    await userEvent.click(
      screen.getByRole('combobox', { name: i18n.t('common:pager.rowsPerPage') }),
    );
    await userEvent.click(screen.getByRole('option', { name: '50' }));

    /* Page 4 of twenty-per-page can be past the end at fifty, and the empty table
       would then blame the filter. */
    await waitFor(() => expect(urlSearch()).toContain('pageSize=50'));
    expect(urlSearch()).not.toContain('page=4');
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
    mounted('/customers?createdFrom=2026-09-01&createdTo=2026-08-01');
    await rendered();
    const params = lastParams();
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
    mounted('/customers?createdFrom=2026-09-01&createdTo=2026-08-01');
    await rendered();
    expect(screen.queryByText(/01\/09\/2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/01\/08\/2026/)).not.toBeInTheDocument();
  });

  it('keeps a range that runs forwards — the control', async () => {
    /* Without this, a reader that dropped BOTH bounds unconditionally would
       pass the two tests above while deleting the feature. */
    mounted('/customers?createdFrom=2026-08-01&createdTo=2026-09-01');
    await rendered();
    expect(lastParams()?.createdFrom).toBe('2026-08-01');
    expect(lastParams()?.createdTo).toBe('2026-09-01');
  });
});
