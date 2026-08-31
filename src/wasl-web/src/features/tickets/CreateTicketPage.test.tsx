import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../lib/api';
import type { CustomerListItem, TicketResponse } from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';

/* ============================================================================
 * The three screen-level claims.
 * ============================================================================
 *
 * WHAT IS MOCKED, AND WHY IT IS THE MODULE AND NOT `fetch`.
 *
 * `tickets.api` used to answer customer search from a STUB, behind
 * `STUBBED_CUSTOMER_SEARCH`, so no `fetch` happened for a search at all and a
 * test counting `fetch` calls would have counted zero and passed no matter what
 * the debounce did.
 *
 * So the seam is the module: `searchCustomers` and `createTicket` are the two
 * functions this screen uses to reach the server, and counting THEM measures
 * the same thing the task means by "requests" — one call out per intent.
 *
 * **The stub was deleted on 2026-08-31 and not one assertion below changed,
 * which is what this paragraph predicted.** The flag is gone from the mock too:
 * a factory that keeps declaring a property the real module no longer exports is
 * how a test goes on passing against a shape that no longer exists.
 *
 * `vi.mock` is hoisted above the imports, so the factory may not close over
 * anything declared below it. The mocks are therefore declared inside it and
 * reached through the imported bindings.
 * ============================================================================ */

vi.mock('./tickets.api', () => ({
  searchCustomers: vi.fn(),
  createTicket: vi.fn(),
  getTicket: vi.fn(),
}));

const { searchCustomers, createTicket } = await import('./tickets.api');
const { default: CreateTicketPage } = await import('./CreateTicketPage');

const CUSTOMER: CustomerListItem = {
  id: '3f1a6c2e-8b44-4d5e-9a01-0c7f2e6b8d31',
  fullName: 'Gulf Logistics Co.',
  email: 'ops@gulflogistics.example',
  phone: '+966500000001',
  companyName: 'Gulf Logistics Co.',
  createdAtUtc: '2026-08-01T09:00:00.000Z',
};

const TICKET = {
  id: '9d2b7e14-5a63-4c0f-8f21-6b3e4d8a1c07',
  ticketNumber: 'TKT-2026-000412',
} as unknown as TicketResponse;

/**
 * A `ProblemDetails` as the frozen contract defines it.
 *
 * `errors` is not decoration on the `404`. `errors/not-found` is shared with
 * every unresolvable reference in the system, so the KEY inside `errors` is what
 * says which one — and the screen keys on `errors.customerId` rather than on the
 * status, deliberately. A fixture that omitted it fell through to the generic
 * branch and the test read as a broken component.
 */
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
  /* `retry: false` — TanStack Query retries a failed query three times by
   * default, and a test asserting "one request" against a retrying client is
   * asserting on the retry policy instead. `gcTime: 0` so one test's cached
   * result cannot answer the next test's query. */
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/tickets/new']}>
          <Routes>
            <Route path="/tickets/new" element={<CreateTicketPage />} />
            {/* No text: the BR-8.8 lint rule forbids a literal in JSX and is right to,
                even here. Nothing asserts on this element — it exists so a 201
                navigates somewhere that resolves. */}
            <Route path="/tickets/:id" element={<div data-testid="ticket-detail" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

/** Type into the picker, pick the first row, and return once the form is live. */
async function selectCustomer(user: UserEvent) {
  vi.mocked(searchCustomers).mockResolvedValue({
    items: [CUSTOMER],
    page: 1,
    pageSize: 10,
    totalCount: 1,
    totalPages: 1,
  });

  await user.type(screen.getByLabelText('Customer'), 'Gulf');

  /* SCOPED TO THE LISTBOX, and it has to be.
   *
   * A native `<option>` carries the implicit role `option`, so this form's three
   * `<select>` elements put sixteen of them in the tree before the picker
   * returns anything. An unscoped `findByRole('option')` matches those instead —
   * and a `querySelectorAll('[role="option"]')` probe does NOT, because it reads
   * the attribute rather than the role and sees only the picker's one row. The
   * two disagree, and the attribute query is the one that is wrong. */
  const listbox = await screen.findByRole('listbox', {}, { timeout: 3000 });
  const option = await within(listbox).findByRole('option');
  await user.click(option);

  await waitFor(() => expect(screen.getByLabelText('Subject')).toBeEnabled());
}

/* `031` replaced the three native `<select>` elements with `Dropdown`, and
 * `user.selectOptions` addresses a native `<select>` BY DEFINITION — it reaches
 * for `HTMLOptionElement` and throws on anything else. So the way the fields are
 * DRIVEN changed and every assertion below did not: same three values, same
 * request body, same preservation claim. That distinction is the whole of
 * `031` AC-12, and it is the reason this helper exists rather than each test
 * learning the new control. */
async function pickOption(user: UserEvent, field: string, option: string) {
  await user.click(screen.getByLabelText(field));
  const listbox = await screen.findByRole('listbox', { name: field });
  await user.click(within(listbox).getByRole('option', { name: option }));
}

/** Fill everything except the customer. Used to prove what a `404` preserves. */
async function fillTicketFields(user: UserEvent) {
  await user.type(screen.getByLabelText('Subject'), 'Card declined at checkout');
  await user.type(screen.getByLabelText('Description'), 'Payment page returns an error.');
  await pickOption(user, 'Category', 'Billing');
  await pickOption(user, 'Priority', 'High');
  await pickOption(user, 'Channel', 'Email');
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('TEST-024-07 — the picker does not search on every keystroke (AC-3)', () => {
  it('issues NO request below two characters', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Customer'), 'G');
    /* Waited out rather than asserted immediately: an assertion that runs
     * before the debounce would pass against a component with no debounce at
     * all, which is the defect this test is for. */
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(searchCustomers).not.toHaveBeenCalled();
  });

  it('issues ONE request for a burst of keystrokes, carrying the final term', async () => {
    vi.mocked(searchCustomers).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 10,
      totalCount: 0,
      totalPages: 0,
    });

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Customer'), 'Gulf');
    await waitFor(() => expect(searchCustomers).toHaveBeenCalled(), { timeout: 3000 });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(searchCustomers).toHaveBeenCalledTimes(1);
    expect(vi.mocked(searchCustomers).mock.calls[0]?.[0]).toBe('Gulf');
  });
});

describe('TEST-024-06 — two clicks, one request (AC-12)', () => {
  it('sends the ticket ONCE when submit is clicked twice in a row', async () => {
    let settle: (value: {
      ticket: TicketResponse;
      location: string | null;
    }) => void = () => {};
    vi.mocked(createTicket).mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    /* `delay: null` — this test is about a synchronous double click, not
     * about typing speed, and the default per-keystroke delay spends seconds
     * getting to the click. TEST-024-07 keeps the real delay because timing is
     * exactly what it measures. */
    const user = userEvent.setup({ delay: null });
    renderPage();
    await selectCustomer(user);
    await fillTicketFields(user);

    const submit = screen.getByRole('button', { name: /create ticket/i });
    /* Two clicks with NO await between them. Awaiting the first lets React
     * flush, `isPending` becomes true, and the button disables — which is the
     * path that already worked. The defect was the synchronous double-click,
     * so the test has to be synchronous too. */
    submit.click();
    submit.click();

    await waitFor(() => expect(createTicket).toHaveBeenCalled());
    expect(createTicket).toHaveBeenCalledTimes(1);

    settle({ ticket: TICKET, location: `/api/tickets/${TICKET.id}` });
  });
});

describe('TEST-024-05 — a 404 clears the picker and keeps everything else (AC-11)', () => {
  it('preserves subject, description, and all three selects', async () => {
    vi.mocked(createTicket).mockRejectedValue(
      problem(404, 'errors/not-found', { customerId: ['Customer not found.'] }),
    );

    const user = userEvent.setup({ delay: null });
    renderPage();
    await selectCustomer(user);
    await fillTicketFields(user);

    await user.click(screen.getByRole('button', { name: /create ticket/i }));

    /* The picker is back, and it is back EMPTY — the selected row is gone. */
    const picker = await screen.findByLabelText('Customer', {}, { timeout: 3000 });
    expect(picker).toHaveValue('');

    /* The five other fields are untouched. This is the whole claim: a `404` on
     * the customer must not cost the agent the paragraph they just typed. */
    expect(screen.getByLabelText('Subject')).toHaveValue('Card declined at checkout');
    expect(screen.getByLabelText('Description')).toHaveValue(
      'Payment page returns an error.',
    );
    /* `toHaveValue` reads `HTMLSelectElement.value`; a `div role="combobox"` has
     * no value property, so the CLAIM is unchanged and the reading of it is:
     * the chosen label is still on the trigger. */
    expect(screen.getByLabelText('Category')).toHaveTextContent('Billing');
    expect(screen.getByLabelText('Priority')).toHaveTextContent('High');
    expect(screen.getByLabelText('Channel')).toHaveTextContent('Email');

    /* And the reason is on screen, in words, not only as a cleared field.
     *
     * `alert`, not `status`: the field the agent chose was silently emptied, and
     * a polite announcement that waits for a pause is the one case where it will
     * be read after they have already started retyping. */
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/no longer available/i)).toBeInTheDocument();
  });
});
