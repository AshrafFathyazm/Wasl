import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CustomerListItem, PagedResult } from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';

/* ============================================================================
 * The row's quick view and the add sheet — `035` §4.3, frames of 2026-09-03.
 * ============================================================================
 * `033` shipped "no panel: the row click navigates". Both halves reversed:
 * «عميل جديد» opens a sheet, and a row click opens a QUICK VIEW whose
 * «فتح الملف الكامل» is what navigates.
 */

vi.mock('./customers.api', async () => {
  const actual = await vi.importActual<typeof import('./customers.api')>('./customers.api');
  return {
    ...actual,
    listCustomers: vi.fn(),
    getCustomerCompanies: vi.fn(),
    createCustomer: vi.fn(),
  };
});

const { listCustomers, getCustomerCompanies, createCustomer } = await import(
  './customers.api'
);
const { default: CustomersListPage } = await import('./CustomersListPage');

const ROW: CustomerListItem = {
  id: '1b2c3d4e-5678-4abc-9def-0123456789ab',
  fullName: 'علي الأحمد',
  email: 'ali.ahmed@abyan.sa',
  phone: '+966501234567',
  companyName: 'شركة أبيان للتقنية',
  createdAtUtc: '2026-08-29T12:00:00Z',
};

const SECOND: CustomerListItem = {
  id: '2c3d4e5f-6789-4abc-9def-0123456789ab',
  fullName: 'Sara Khan',
  email: null,
  phone: null,
  companyName: null,
  createdAtUtc: '2026-08-27T12:00:00Z',
};

const page = (
  over: Partial<PagedResult<CustomerListItem>> = {},
): PagedResult<CustomerListItem> => ({
  items: [ROW, SECOND],
  page: 1,
  pageSize: 20,
  totalCount: 2,
  totalPages: 1,
  ...over,
});

function LocationProbe() {
  const { pathname } = useLocation();
  return <span data-testid="pathname">{pathname}</span>;
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

const rendered = () => waitFor(() => expect(listCustomers).toHaveBeenCalled());

beforeEach(() => {
  vi.mocked(listCustomers).mockReset().mockResolvedValue(page());
  vi.mocked(getCustomerCompanies)
    .mockReset()
    .mockResolvedValue({ items: [], hasUncompanied: false });
  vi.mocked(createCustomer).mockReset();
});

describe('a row click opens the quick view', () => {
  it('opens a dialog named after the customer, and marks the row', async () => {
    const u = userEvent.setup();
    mounted();
    await u.click(await screen.findByText('علي الأحمد'));

    const sheet = await screen.findByRole('dialog', { name: 'علي الأحمد' });
    expect(within(sheet).getByText('ali.ahmed@abyan.sa')).toBeInTheDocument();

    /* THE ROW CARRIES `aria-selected`, which `035` §7 specified with no producer
       in the product. This is the producer. */
    const selected = screen.getAllByRole('row').filter((r) => r.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(within(selected[0]!).getByText('علي الأحمد')).toBeInTheDocument();
  });

  it('marks ONLY the open row', async () => {
    /* `aria-selected="false"` on every other row would tell a screen reader the
       whole list is a selection widget. Only the open row carries the
       attribute at all. */
    const u = userEvent.setup();
    mounted();
    await u.click(await screen.findByText('علي الأحمد'));
    await screen.findByRole('dialog');

    const withAttr = screen
      .getAllByRole('row')
      .filter((r) => r.hasAttribute('aria-selected'));
    expect(withAttr).toHaveLength(1);
  });

  it('sends NO request to open — the row already holds every field it shows', async () => {
    const u = userEvent.setup();
    mounted();
    await screen.findByText('علي الأحمد');
    const before = vi.mocked(listCustomers).mock.calls.length;

    await u.click(screen.getByText('علي الأحمد'));
    await screen.findByRole('dialog');

    expect(vi.mocked(listCustomers).mock.calls.length).toBe(before);
  });

  it('renders an em dash for an absent contact, not a missing row', async () => {
    /* A field that disappears makes two customers render as two different
       shapes, and the reader cannot tell an absent phone from a screen that
       failed to draw one. */
    const u = userEvent.setup();
    mounted();
    await u.click(await screen.findByText('Sara Khan'));
    const sheet = await screen.findByRole('dialog', { name: 'Sara Khan' });

    expect(within(sheet).getAllByText(i18n.t('customers:list.absent')).length).toBeGreaterThanOrEqual(2);
  });

  it('navigates from «فتح الملف الكامل», and only from there', async () => {
    const u = userEvent.setup();
    mounted();
    await u.click(await screen.findByText('علي الأحمد'));
    const sheet = await screen.findByRole('dialog');

    /* The click itself did NOT navigate — that is the reversal. */
    expect(screen.getByTestId('pathname')).toHaveTextContent('/customers');

    await u.click(
      within(sheet).getByRole('button', { name: i18n.t('customers:quick.openProfile') }),
    );
    expect(screen.getByTestId('pathname')).toHaveTextContent(`/customers/${ROW.id}`);
  });

  it('closes on Escape and drops the row mark with it', async () => {
    const u = userEvent.setup();
    mounted();
    await u.click(await screen.findByText('علي الأحمد'));
    await screen.findByRole('dialog');

    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      screen.getAllByRole('row').filter((r) => r.hasAttribute('aria-selected')),
    ).toHaveLength(0);
  });

  it('keeps the name cell a real link, so the keyboard still reaches the profile', async () => {
    /* `onRowClick` is a MOUSE convenience and adds no tabindex and no role —
       the primitive says so. If the row click were the only path, a keyboard
       and a screen reader would have no way to the profile at all. */
    mounted();
    await screen.findByText('علي الأحمد');

    expect(
      screen.getByRole('link', { name: 'علي الأحمد' }),
    ).toHaveAttribute('href', `/customers/${ROW.id}`);
  });
});

describe('«عميل جديد» opens the create sheet', () => {
  it('opens the form in a dialog rather than navigating', async () => {
    const u = userEvent.setup();
    mounted();
    await rendered();

    await u.click(screen.getByRole('button', { name: i18n.t('customers:new.link') }));

    const sheet = await screen.findByRole('dialog', { name: i18n.t('customers:new.title') });
    expect(
      within(sheet).getByLabelText(new RegExp(i18n.t('customers:field.name'))),
    ).toBeInTheDocument();

    /* The route did not change — `035` Q-3 keeps `/customers/new` for the
       no-match CTA, and the sheet is a different entry point. */
    expect(screen.getByTestId('pathname')).toHaveTextContent('/customers');
  });

  it('closes and REFETCHES on success, and seeds no cache', async () => {
    /* `026` §5 and `032` AC-1: a list that trusts a create's body shows a row
       the server has not been asked about, and it sorts and pages by rules only
       the server knows. */
    const u = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({
      customer: {
        id: '3d4e5f60-789a-4abc-9def-0123456789ab',
        fullName: 'عميل جديد',
        email: 'new@example.com',
        phone: null,
        companyName: null,
        notes: null,
        isActive: true,
        createdAtUtc: '2026-09-03T10:00:00Z',
        updatedAtUtc: '2026-09-03T10:00:00Z',
        version: 'AAAAAAAAB9E=',
      },
      location: '/api/customers/3d4e5f60-789a-4abc-9def-0123456789ab',
    });

    mounted();
    await rendered();
    const before = vi.mocked(listCustomers).mock.calls.length;

    await u.click(screen.getByRole('button', { name: i18n.t('customers:new.link') }));
    const sheet = await screen.findByRole('dialog');

    await u.type(
      within(sheet).getByLabelText(new RegExp(i18n.t('customers:field.name'))),
      'عميل جديد',
    );
    await u.type(
      within(sheet).getByLabelText(new RegExp(i18n.t('customers:field.email'))),
      'new@example.com',
    );
    await u.click(
      within(sheet).getByRole('button', { name: i18n.t('customers:new.submit') }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(vi.mocked(listCustomers).mock.calls.length).toBeGreaterThan(before),
    );
  });

  it('orders the fields the way the frame does', async () => {
    /* Supplied 2026-09-03: "دا الشكل الصحيح لاضافة عميل عكس الي انت عامله".
       `032` had the company AFTER the two contact fields; the frame puts it
       second, which also puts the BR-4.1 hint immediately above the pair it
       governs rather than three fields away from one of them.

       ASSERTED BY DOM ORDER, not by presence. Every one of these fields was
       already on screen before the reorder, so a presence assertion passed on
       the wrong layout — which is what shipped. */
    const u = userEvent.setup();
    mounted();
    await rendered();
    await u.click(screen.getByRole('button', { name: i18n.t('customers:new.link') }));
    const sheet = await screen.findByRole('dialog');

    const labels = [...sheet.querySelectorAll('label')]
      .map((l) => (l.textContent ?? '').replace('*', '').trim())
      .filter((text) => text !== '');

    expect(labels).toEqual([
      i18n.t('customers:field.name'),
      i18n.t('customers:field.company'),
      i18n.t('customers:field.email'),
      i18n.t('customers:field.phone'),
      i18n.t('customers:field.notes'),
    ]);
  });

  it('drops the helper lines in the sheet and keeps them on the page', async () => {
    /* The two frames differ deliberately: the routed screen has room to explain
       where a name shows up; the sheet is a fast path, and five helper lines are
       five lines of reading between the reader and «حفظ». */
    const u = userEvent.setup();
    mounted();
    await rendered();
    await u.click(screen.getByRole('button', { name: i18n.t('customers:new.link') }));
    const sheet = await screen.findByRole('dialog');

    expect(within(sheet).queryByText(i18n.t('customers:new.nameHelp'))).toBeNull();
    expect(within(sheet).queryByText(i18n.t('customers:new.phoneHelp'))).toBeNull();

    /* BUT THE BR-4.1 HINT STAYS. It is not decoration: it is the only thing on
       screen telling a reader that one of the two contact fields is required,
       and the server refuses the form without one. */
    expect(
      within(sheet).getByText(i18n.t('customers:new.contactRequired')),
    ).toBeInTheDocument();
  });

  it('cancels with a BUTTON, not a link — there is nowhere to navigate to', async () => {
    const u = userEvent.setup();
    mounted();
    await rendered();

    await u.click(screen.getByRole('button', { name: i18n.t('customers:new.link') }));
    const sheet = await screen.findByRole('dialog');

    const cancel = within(sheet).getByRole('button', { name: i18n.t('common:cancel') });
    expect(cancel.tagName).toBe('BUTTON');

    await u.click(cancel);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('pathname')).toHaveTextContent('/customers');
  });

  it('sends nothing when it is cancelled', async () => {
    const u = userEvent.setup();
    mounted();
    await rendered();

    await u.click(screen.getByRole('button', { name: i18n.t('customers:new.link') }));
    const sheet = await screen.findByRole('dialog');
    await u.type(
      within(sheet).getByLabelText(new RegExp(i18n.t('customers:field.name'))),
      'اسم لن يُحفظ',
    );
    await u.click(within(sheet).getByRole('button', { name: i18n.t('common:cancel') }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(createCustomer).not.toHaveBeenCalled();
  });
});
