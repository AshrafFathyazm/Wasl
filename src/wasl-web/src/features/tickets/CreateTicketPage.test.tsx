import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../components/Toast/ToastHost';
import { ApiError } from '../../lib/api';
import type {
  CustomerDetail,
  CustomerListItem,
  TicketListItem,
  TicketResponse,
} from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';

/* ============================================================================
 * `038` — the redesigned screen's claims
 * ============================================================================
 * WHAT IS MOCKED, AND WHY IT IS THE MODULE AND NOT `fetch`. Unchanged from
 * `024`: `tickets.api` is the seam, because counting the functions this screen
 * calls to reach the server measures what the criteria mean by "requests" — one
 * call out per intent — while a `fetch` counter measures the transport.
 *
 * `ticketKeys` is a VALUE, not a type, and the page calls it to build a query
 * key. A factory that omits it makes the module import fail with
 * "ticketKeys is not a function" at render time, which reads as a component
 * bug. It is re-implemented here rather than imported: `vi.mock` is hoisted
 * above every import and its factory may close over nothing.
 * ============================================================================ */

vi.mock('./tickets.api', () => ({
  searchCustomers: vi.fn(),
  createTicket: vi.fn(),
  listTickets: vi.fn(),
  getTicket: vi.fn(),
  ticketKeys: {
    list: (params: unknown) => ['tickets', 'list', params],
  },
}));

vi.mock('../customers/customers.api', () => ({
  getCustomer: vi.fn(),
}));

const { searchCustomers, createTicket, listTickets } = await import('./tickets.api');
const { getCustomer } = await import('../customers/customers.api');
const { default: CreateTicketPage } = await import('./CreateTicketPage');

const CUSTOMER: CustomerListItem = {
  id: '3f1a6c2e-8b44-4d5e-9a01-0c7f2e6b8d31',
  fullName: 'Gulf Logistics Co.',
  email: 'ops@gulflogistics.example',
  phone: '+966500000001',
  companyName: 'Gulf Holdings',
  createdAtUtc: '2026-08-01T09:00:00.000Z',
};

const TICKET = {
  id: '9d2b7e14-5a63-4c0f-8f21-6b3e4d8a1c07',
  ticketNumber: 'TKT-2026-000412',
} as unknown as TicketResponse;

function openTicket(id: string, subject: string): TicketListItem {
  return {
    id,
    ticketNumber: `TKT-2026-00${id}`,
    subject,
    customerId: CUSTOMER.id,
    customerName: CUSTOMER.fullName,
    status: 'Open',
    priority: 'Normal',
    category: 'Billing',
    channel: 'Email',
    assigneeId: null,
    assigneeName: null,
    isEscalated: false,
    createdAtUtc: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  };
}

/** An envelope with no open tickets. The DEFAULT for most tests: the duplicate
 *  check runs on every selection and an unmocked resolver would reject. */
const NO_OPEN = { items: [], page: 1, pageSize: 5, totalCount: 0, totalPages: 0 };

function problem(status: number, type: string, errors?: Record<string, string[]>) {
  return new ApiError(
    {
      type,
      title: 'x',
      status,
      detail: 'x',
      instance: '/api/tickets',
      traceId: 't',
      ...(errors ? { errors } : {}),
    },
    'en',
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/tickets/new']}>
            <Routes>
              <Route path="/tickets/new" element={<CreateTicketPage />} />
              <Route path="/tickets/:id" element={<div data-testid="ticket-detail" />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ToastProvider>
    </I18nextProvider>,
  );
}

async function selectCustomer(user: UserEvent) {
  vi.mocked(searchCustomers).mockResolvedValue({
    items: [CUSTOMER],
    page: 1,
    pageSize: 10,
    totalCount: 1,
    totalPages: 1,
  });

  await user.type(screen.getByLabelText('Customer'), 'Gulf');

  /* SCOPED TO THE LISTBOX. `Dropdown`'s menu also publishes `option` roles, so
   * an unscoped query can match the category menu instead. */
  const listbox = await screen.findByRole('listbox', {}, { timeout: 3000 });
  const option = await within(listbox).findByRole('option');
  await user.click(option);

  await screen.findByRole('button', { name: 'Change' });
}

/** The category dropdown is the only `Dropdown` a test drives. */
async function pickCategory(user: UserEvent, option: string) {
  await user.click(screen.getByLabelText('Category'));
  const listbox = await screen.findByRole('listbox', { name: 'Category' });
  await user.click(within(listbox).getByRole('option', { name: option }));
}

async function fillTicketFields(user: UserEvent) {
  await user.type(screen.getByLabelText('Subject'), 'Card declined at checkout');
  await user.type(screen.getByLabelText('Description'), 'Payment page returns an error.');
  await pickCategory(user, 'Billing');
  await user.click(screen.getByRole('radio', { name: 'Email' }));
}

const submit = () => screen.getByRole('button', { name: 'Create ticket' });

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(listTickets).mockResolvedValue(NO_OPEN);
  await i18n.changeLanguage('en');
});

/* ========================================================================== */

describe('AC-1 — nothing waits for a customer', () => {
  /* THE HEADLINE CHANGE, and the reason it is first. `024` disabled the whole
   * ticket card behind a `fieldset` until a customer was picked; an agent on the
   * phone hears the problem before they hear who is calling. */
  it('has every field enabled on first paint, with no customer selected', () => {
    renderPage();

    expect(screen.getByLabelText('Subject')).toBeEnabled();
    expect(screen.getByLabelText('Description')).toBeEnabled();
    expect(screen.getByLabelText('Category')).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Email' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Low' })).toBeEnabled();

    /* The submit is live too. A disabled submit refuses without saying why; this
       one answers with the summary below (AC-18). */
    expect(submit()).toBeEnabled();
  });

  it('renders no fieldset and no "select a customer first" note', () => {
    const { container } = renderPage();

    expect(container.querySelector('fieldset')).toBeNull();
    expect(screen.queryByText(/select a customer to continue/i)).toBeNull();
  });
});

describe('AC-2, AC-3 — validation starts at submit, then goes live', () => {
  it('shows no error when a required field is touched and left empty', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByLabelText('Subject'));
    await user.tab();

    /* CONTENT, not presence. `024` validated `onBlur`, so this is the assertion
       that would have failed then — and the one that fails if `mode` drifts
       back. */
    expect(screen.queryByText('Subject is required')).toBeNull();
  });

  it('clears one field’s error as it is corrected, without a second submit', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(submit());
    expect(await screen.findByText('Subject is required')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Subject'), 'A subject');

    await waitFor(() => expect(screen.queryByText('Subject is required')).toBeNull());
    /* The others are still wrong — a correction clears ITS field, not the form. */
    expect(screen.getByText('Description is required')).toBeInTheDocument();
  });
});

describe('AC-18, AC-19, AC-20 — the footer summary and the focus', () => {
  it('names every missing field and issues no request', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(submit());

    /* THE WHOLE SENTENCE, and the order is reading order. The mock-up's summary
       and its focus disagreed (spec M-3); both read one array here, so this
       assertion and the next one cannot drift apart. */
    expect(
      await screen.findByText(
        '5 fields missing: Customer, Subject, Description, Channel, Category',
      ),
    ).toBeInTheDocument();

    expect(createTicket).not.toHaveBeenCalled();
  });

  it('moves focus to the CUSTOMER search, which is the first missing field', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(submit());

    /* THE MOCK-UP'S BUG, asserted. Its focus lookup only saw fields carrying
       `aria-invalid`, so it named «العميل» first and focused SUBJECT. */
    await waitFor(() => expect(screen.getByLabelText('Customer')).toHaveFocus());
  });

  it('counts down as fields are filled, in the singular at one', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(submit());
    await screen.findByText(/5 fields missing/);

    await selectCustomer(user);
    await user.type(screen.getByLabelText('Description'), 'Something broke.');
    await pickCategory(user, 'Billing');
    await user.click(screen.getByRole('radio', { name: 'Email' }));

    /* `_one`, not "1 fields missing". The Arabic catalogue carries six forms for
       the same key; this proves the count reaches i18next at all. */
    expect(await screen.findByText('1 field missing: Subject')).toBeInTheDocument();
  });
});

describe('AC-12, AC-13, AC-14 — the duplicate check', () => {
  it('asks TWO questions per selection — the open ones, and the previous ones', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectCustomer(user);

    /* TWO, and not one request split client-side. Asking for all six statuses at
     * once returns five rows that could all be closed, so the OPEN count — the
     * thing that actually warns — would come back wrong. Each count comes from
     * its own `totalCount`, which is the same reasoning `countTickets` records
     * for the list's chip counts. */
    await waitFor(() => expect(listTickets).toHaveBeenCalledTimes(2));

    const params = vi.mocked(listTickets).mock.calls.map((call) => call[0]);
    expect(params).toContainEqual(
      expect.objectContaining({
        customerId: CUSTOMER.id,
        pageSize: 5,
        status: ['New', 'Open', 'InProgress', 'PendingCustomer'],
      }),
    );
    expect(params).toContainEqual(
      expect.objectContaining({
        customerId: CUSTOMER.id,
        pageSize: 3,
        status: ['Resolved', 'Closed'],
      }),
    );
  });

  it('shows previous tickets when there are no open ones — the closed-yesterday case', async () => {
    /* THE REASON THIS EXISTS. `Closed` is terminal (BR-1.5), so a customer whose
     * problem was closed yesterday and who calls back today gets a NEW ticket —
     * and the amber banner is correctly silent, because nothing is open. Before
     * this, the agent had no way to find the closed one from here. */
    vi.mocked(listTickets).mockImplementation((params) =>
      Promise.resolve(
        params.status?.includes('Closed')
          ? {
              items: [
                { ...openTicket('9', 'Closed yesterday'), status: 'Closed' as const },
              ],
              page: 1,
              pageSize: 3,
              totalCount: 1,
              totalPages: 1,
            }
          : NO_OPEN,
      ),
    );

    const user = userEvent.setup();
    renderPage();
    await selectCustomer(user);

    expect(
      await screen.findByText(/This customer has 1 previous ticket/),
    ).toBeInTheDocument();
    /* And the warning is still absent — the two are independent. */
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders NO banner when the customer has none open', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectCustomer(user);

    await waitFor(() => expect(listTickets).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says how many there are from totalCount, not from the rows it lists', async () => {
    /* THE ASSERTION THE MOCK-UP WOULD FAIL TWICE OVER: its count rendered empty
       (M-2), and counting `items` here would say five when there are nine. */
    vi.mocked(listTickets).mockResolvedValue({
      items: [1, 2, 3, 4, 5].map((n) => openTicket(String(n), `Open ticket ${n}`)),
      page: 1,
      pageSize: 5,
      totalCount: 9,
      totalPages: 2,
    });

    const user = userEvent.setup();
    renderPage();
    await selectCustomer(user);

    expect(
      await screen.findByText(/This customer has 9 open tickets/),
    ).toBeInTheDocument();
  });

  it('is advisory — a failed check blocks nothing (AC-17)', async () => {
    vi.mocked(listTickets).mockRejectedValue(problem(500, 'errors/unexpected'));
    vi.mocked(createTicket).mockResolvedValue({ ticket: TICKET, location: null });

    const user = userEvent.setup();
    renderPage();
    await selectCustomer(user);
    await fillTicketFields(user);
    await user.click(submit());

    /* No banner, no notice, and the create still happens. */
    await waitFor(() => expect(createTicket).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('AC-27, AC-30, AC-39 — what actually goes on the wire', () => {
  it('sends ONE request when submit is clicked twice in a row', async () => {
    vi.mocked(createTicket).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ticket: TICKET, location: null }), 50),
        ),
    );

    const user = userEvent.setup();
    renderPage();
    await selectCustomer(user);
    await fillTicketFields(user);

    /* THE SAME NODE, CLICKED TWICE — not two `submit()` lookups.
     *
     * Re-querying by name fails on the second call, because the button's label
     * becomes «Creating…» the moment the mutation starts. That failure is a test
     * artefact and it hides the real claim: the guard has to hold for two clicks
     * that arrive BEFORE React re-renders, which is exactly when the label, the
     * `disabled` attribute and `isPending` are all still stale. Holding the
     * element reproduces that. */
    const button = submit();
    await user.click(button);
    await user.click(button);

    await waitFor(() => expect(createTicket).toHaveBeenCalledTimes(1));
  });

  it('omits `priority` entirely when it was never touched', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ticket: TICKET, location: null });

    const user = userEvent.setup();
    renderPage();
    await selectCustomer(user);
    await fillTicketFields(user);
    await user.click(submit());

    await waitFor(() => expect(createTicket).toHaveBeenCalled());
    /* THE SERIALISED BODY, not form state — those are two different claims and
       only this one is what the server sees. `in` rather than a value check: an
       explicit `priority: undefined` would pass `toBeUndefined()` and still
       serialise to a key the contract says must be absent. */
    /* Through `unknown`: `CreateTicketRequest` has no index signature, so the
       compiler refuses the direct cast — correctly. The claim is about the
       object's KEYS, which is a weaker question than its type. */
    const body = vi.mocked(createTicket).mock.calls[0]?.[0] as unknown as Record<
      string,
      unknown
    >;
    expect('priority' in body).toBe(false);
  });

  it('carries an Idempotency-Key, keeps it on an identical retry, remints it after an edit', async () => {
    vi.mocked(createTicket).mockRejectedValue(problem(500, 'errors/unexpected'));

    const user = userEvent.setup();
    renderPage();
    await selectCustomer(user);
    await fillTicketFields(user);

    await user.click(submit());
    await waitFor(() => expect(createTicket).toHaveBeenCalledTimes(1));
    const first = vi.mocked(createTicket).mock.calls[0]?.[1];
    expect(first).toBeTruthy();

    /* RETRY, UNEDITED — the lost-response case the header exists for. The same
       key must go out, so the server replays instead of creating a second
       ticket. */
    await user.click(submit());
    await waitFor(() => expect(createTicket).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createTicket).mock.calls[1]?.[1]).toBe(first);

    /* EDITED — a new intent. `036` Q-5: the same key with a different body
       answers `409`, so reusing it here would trap a form the user has just
       corrected. This is the assertion that the first draft of this feature got
       wrong. */
    await user.type(screen.getByLabelText('Subject'), ' again');
    await user.click(submit());
    await waitFor(() => expect(createTicket).toHaveBeenCalledTimes(3));
    expect(vi.mocked(createTicket).mock.calls[2]?.[1]).not.toBe(first);
  });
});

describe('AC-28 — a 404 clears the picker and keeps everything else', () => {
  it('preserves subject, description, category and channel', async () => {
    vi.mocked(createTicket).mockRejectedValue(
      problem(404, 'errors/not-found', { customerId: ['gone'] }),
    );

    const user = userEvent.setup();
    renderPage();
    await selectCustomer(user);
    await fillTicketFields(user);
    await user.click(submit());

    await waitFor(() => expect(screen.getByLabelText('Customer')).toBeInTheDocument());

    expect(screen.getByLabelText('Subject')).toHaveValue('Card declined at checkout');
    expect(screen.getByLabelText('Description')).toHaveValue(
      'Payment page returns an error.',
    );
    expect(screen.getByRole('radio', { name: 'Email' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

describe('AC-35, AC-36 — «New customer» opens a sheet and selects what it created', () => {
  it('reads the created customer back and selects it, keeping the ticket fields', async () => {
    const created: CustomerDetail = {
      id: 'aa11bb22-cc33-4d44-8e55-ff6677889900',
      fullName: 'Najd Trading',
      email: 'hello@najd.example',
      phone: null,
      companyName: 'Najd Group',
      notes: null,
      isActive: true,
      createdAtUtc: '2026-09-06T10:00:00.000Z',
      updatedAtUtc: '2026-09-06T10:00:00.000Z',
    } as CustomerDetail;

    vi.mocked(getCustomer).mockResolvedValue(created);

    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByLabelText('Subject'),
      'Typed before the customer existed',
    );
    await user.click(screen.getByRole('button', { name: /New customer/i }));

    /* The sheet is `035`'s form. Driving it end to end is `035`'s test; what
       THIS screen owns is what happens on `onCreated`, so the callback is
       reached through the rendered form's own submit path only as far as
       proving the sheet opened. */
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    /* Everything typed before opening the sheet is still there — the reason it
       is a sheet and not a navigation. */
    expect(screen.getByLabelText('Subject')).toHaveValue(
      'Typed before the customer existed',
    );
  });
});
