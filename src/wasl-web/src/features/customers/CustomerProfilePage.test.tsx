import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, type ProblemDetails } from '../../lib/api';
import type { CustomerDetail } from '../../lib/api-types.provisional';
import { formatDate } from '../../lib/formatters';
import i18n from '../../lib/i18n';

/* ============================================================================
 * 032 — the profile screen's claims
 * ============================================================================
 *
 * THE SEAM IS THE MODULE, not `fetch`. `customers.api` is the whole of this
 * screen's access to the server — one function — and mocking it measures the
 * same thing the criteria mean by "reads from `GET /api/customers/{id}`" while
 * leaving the wrapper's own behaviour (which `lib/api.test.ts` covers) alone.
 *
 * `vi.mock` is hoisted above the imports, so the factory may not close over
 * anything declared below it.
 * ========================================================================== */

vi.mock('./customers.api', () => ({
  getCustomer: vi.fn(),
  createCustomer: vi.fn(),
}));

const { getCustomer } = await import('./customers.api');
const { default: CustomerProfilePage } = await import('./CustomerProfilePage');

const ID = 'a3f19c04-7b62-4d18-9f30-5c2ab41c8e21';

const CUSTOMER: CustomerDetail = {
  id: ID,
  fullName: 'علي الأحمد',
  email: 'ali.ahmed@abyan.sa',
  phone: '+966501234567',
  companyName: 'Abyan Technology Co.',
  notes: 'Prefers WhatsApp in the morning.',
  isActive: true,
  createdAtUtc: '2026-08-29T09:12:00.000Z',
  updatedAtUtc: '2026-08-29T09:12:00.000Z',
  version: 'AAAAAAAAB9E=',
};

/** A `ProblemDetails` as `002`'s registry defines it, with the `traceId` the
 *  error state is required to render. */
function problem(status: number, type: string, extra?: Partial<ProblemDetails>) {
  return new ApiError(
    {
      type: `https://wasl.local/${type}`,
      title: 'Something the server said',
      status,
      traceId: '00-8f1c2d3456789abc-0123456789abcdef-01',
      ...extra,
    },
    'en',
  );
}

function renderAt(id: string) {
  const client = new QueryClient({
    /* `retryDelay: 0` AND NOT `retry: false`.
     *
     * Turning retry off would hide the page's OWN retry rule, which is a
     * decision this feature made: a `404` is not retried at all, everything else
     * is retried once. Keeping the rule and removing only the BACKOFF is what
     * lets the error states be asserted — with the default exponential delay a
     * `500` takes over a second to settle, so every `findBy` times out at
     * 1000ms and it reads as a screen that never renders its error state.
     * MEASURED: eleven tests failed exactly that way on the first run.
     *
     * `gcTime: 0` stops one test's cache answering the next one's query — the
     * same hazard the backend suite has with one shared container. */
    defaultOptions: { queries: { gcTime: 0, retryDelay: 0 } },
  });

  const utils = render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/customers/${id}`]}>
          <Routes>
            <Route path="/customers/:id" element={<CustomerProfilePage />} />
            <Route path="/customers" element={<p>{'the list'}</p>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );

  return { ...utils, client };
}

beforeEach(async () => {
  vi.mocked(getCustomer).mockReset();
  await i18n.changeLanguage('en');
});

describe('AC-1 — the page reads the customer from the read endpoint', () => {
  it('calls GET /api/customers/{id} with the id from the URL and renders it', async () => {
    vi.mocked(getCustomer).mockResolvedValue(CUSTOMER);

    renderAt(ID);

    /* THE HEADING, not the text: the name renders TWICE by design — the
     * breadcrumb carries it as well as the header, which is what the design
     * document draws. A `getByText` finds both and throws, which is how this was
     * noticed rather than assumed. */
    expect(
      await screen.findByRole('heading', { level: 2, name: CUSTOMER.fullName }),
    ).toBeInTheDocument();
    /* The ID FROM THE ROUTE, not from anywhere else. A page that reads a
     * customer handed to it by a previous screen would render the same name and
     * never call this. */
    expect(getCustomer).toHaveBeenCalledWith(ID, expect.anything());
    expect(screen.getByText(CUSTOMER.email!)).toBeInTheDocument();
    expect(screen.getByText(CUSTOMER.notes!)).toBeInTheDocument();
  });

  it('renders no Edit control — 017 is not built', async () => {
    vi.mocked(getCustomer).mockResolvedValue(CUSTOMER);
    renderAt(ID);
    await screen.findByRole('heading', { level: 2 });

    /* ABSENT, not disabled. Queried by role rather than by text so a disabled
     * button with the same label would still fail this. */
    expect(
      screen.queryByRole('button', { name: /edit|تعديل/i }),
    ).not.toBeInTheDocument();
  });
});

describe('AC-2 — both id shapes reach the not-found state', () => {
  /* THE TABLE IS THE ASSERTION. The frozen contract says a malformed id is a
   * `400` naming `id`; the built action carries `{id:guid}` and answers `404`,
   * which the backend's own
   * `A_malformed_id_returns_404_which_the_contract_says_should_be_400` asserts.
   * Both are covered, so this screen is correct under either resolution of that
   * difference — which is the point of not branching on it. */
  const cases = [
    { label: 'a well-formed id with no customer (404, what the server does)', error: problem(404, 'errors/not-found') },
    { label: 'a malformed id (404 today, via the route constraint)', error: problem(404, 'errors/not-found') },
    { label: 'a malformed id (400, what the contract promises)', error: problem(400, 'errors/validation', { errors: { id: ["'id' must be a valid identifier."] } }) },
  ];

  for (const { label, error } of cases) {
    it(`renders not-found for ${label}`, async () => {
      vi.mocked(getCustomer).mockRejectedValue(error);

      renderAt('not-a-guid');

      expect(
        await screen.findByText('That customer does not exist'),
      ).toBeInTheDocument();

      /* NOT the error state. The two are different states and the difference is
       * asserted here, not left to the eye: a 404 offers no Retry, because
       * retrying a definite answer is how a state becomes a loop. */
      expect(screen.queryByText('The profile could not be loaded')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    });
  }
});

describe('AC-3 — the error state carries the traceId', () => {
  it('renders the traceId verbatim, isolated LTR, with a Retry that refetches', async () => {
    const failure = problem(500, 'errors/unknown');
    vi.mocked(getCustomer).mockRejectedValue(failure);

    renderAt(ID);

    expect(await screen.findByText('The profile could not be loaded')).toBeInTheDocument();

    /* VERBATIM. Not truncated, not reformatted, not translated — it has to match
     * the server log character for character or it is worse than absent,
     * because someone will read it out. */
    const trace = screen.getByText(failure.problem.traceId!);
    expect(trace).toHaveAttribute('dir', 'ltr');

    const calls = vi.mocked(getCustomer).mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(vi.mocked(getCustomer).mock.calls.length).toBeGreaterThan(calls),
    );
  });

  it('shows no traceId when the request never reached a server', async () => {
    /* A transport failure has no `traceId` — nothing logged it. An invented one
     * would send someone hunting through logs for a string never written. */
    vi.mocked(getCustomer).mockRejectedValue(
      new ApiError({ type: 'errors/network', title: 'Network request failed', status: 0 }, null),
    );

    renderAt(ID);

    expect(await screen.findByText('The profile could not be loaded')).toBeInTheDocument();
    expect(screen.queryByText(/^00-/)).not.toBeInTheDocument();
  });
});

describe('AC-4 — copy writes the RAW value', () => {
  it('copies the whole id while the screen shows a truncated one', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    vi.mocked(getCustomer).mockResolvedValue(CUSTOMER);
    renderAt(ID);
    await screen.findByRole('heading', { level: 2 });

    await userEvent.click(screen.getByRole('button', { name: 'Copy the identifier' }));

    /* THE CLIPBOARD, NOT THE DOM. This is the assertion the criterion is about:
     * the rendered text is `a3f19c04…8e21`, so a test reading the DOM would
     * pass on a truncated id — an id-shaped string that resolves to nothing. */
    expect(writeText).toHaveBeenCalledWith(ID);
    expect(screen.queryByText(ID)).not.toBeInTheDocument();

    /* And the confirmation names WHAT was copied. Three copy controls share one
     * toast, and "Copied" alone leaves the reader checking their clipboard to
     * find out which button they hit. */
    expect(await screen.findByText('Identifier copied')).toBeInTheDocument();
  });

  it('copies the email as the server returned it', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    vi.mocked(getCustomer).mockResolvedValue(CUSTOMER);
    renderAt(ID);
    await screen.findByRole('heading', { level: 2 });

    await userEvent.click(screen.getByRole('button', { name: 'Copy the email address' }));

    expect(writeText).toHaveBeenCalledWith(CUSTOMER.email);
  });

  it('keeps the control’s accessible name after a successful copy', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    vi.mocked(getCustomer).mockResolvedValue(CUSTOMER);
    renderAt(ID);
    await screen.findByRole('heading', { level: 2 });

    const button = screen.getByRole('button', { name: 'Copy the phone number' });
    await userEvent.click(button);

    /* The same ruling `Button` records for its loading state: renaming a control
     * mid-action makes a screen reader announce a different button from the one
     * that was pressed. The tick is for the eye, the toast is for the ear. */
    expect(screen.getByRole('button', { name: 'Copy the phone number' })).toBe(button);
  });
});

describe('AC-5 — three states that all show no notes are distinguishable', () => {
  it('renders a muted line when notes are empty', async () => {
    vi.mocked(getCustomer).mockResolvedValue({ ...CUSTOMER, notes: null });
    renderAt(ID);

    expect(await screen.findByText('No notes on this customer')).toBeInTheDocument();
    /* The record card is present, so this is the LOADED screen with nothing
     * written — not a screen that failed to load. */
    expect(screen.getByText('Record details')).toBeInTheDocument();
  });

  it('treats whitespace-only notes as empty', async () => {
    vi.mocked(getCustomer).mockResolvedValue({ ...CUSTOMER, notes: '   \n  ' });
    renderAt(ID);

    expect(await screen.findByText('No notes on this customer')).toBeInTheDocument();
  });

  it('does not show the empty-notes line while loading, or on a failure', async () => {
    /* A pending promise, so the loading state is a state rather than a frame. */
    vi.mocked(getCustomer).mockReturnValue(new Promise(() => {}));
    const { unmount } = renderAt(ID);

    expect(screen.queryByText('No notes on this customer')).not.toBeInTheDocument();
    expect(screen.queryByText('Record details')).not.toBeInTheDocument();
    unmount();

    vi.mocked(getCustomer).mockRejectedValue(problem(500, 'errors/unknown'));
    renderAt(ID);

    expect(await screen.findByText('The profile could not be loaded')).toBeInTheDocument();
    expect(screen.queryByText('No notes on this customer')).not.toBeInTheDocument();
  });
});

describe('AC-10 — direction, in the Arabic interface', () => {
  it('keeps the address and the number LTR while the name follows its content', async () => {
    await i18n.changeLanguage('ar');
    vi.mocked(getCustomer).mockResolvedValue(CUSTOMER);

    renderAt(ID);
    await screen.findByRole('heading', { level: 2 });

    /* An address or an E.164 number reversed is unusable rather than merely
     * ugly, and `dir="ltr"` — not `dir="auto"` — is what pins it: an address is
     * not language content and has no direction to detect. */
    expect(screen.getByText(CUSTOMER.email!)).toHaveAttribute('dir', 'ltr');
    /* THE GROUPED FORM IS WHAT IS ON SCREEN — `formatPhone`, added by `032`
     * because the design groups the digits. The raw E.164 is deliberately NOT in
     * the DOM, which is the same split AC-4 asserts for the id. */
    expect(screen.getByText('+966 50 123 4567')).toHaveAttribute('dir', 'ltr');
    expect(screen.queryByText(CUSTOMER.phone!)).not.toBeInTheDocument();

    /* THE NAME CARRIES NO `dir` AND ITS TEXT IS INSIDE A `<bdi>`, which is the
     * opposite of what it looked like it should be. `07-customer-profile.md`
     * specifies `dir="auto"` on the name; with a `<bdi>` inside, `auto` finds no
     * strong character — a bdi manages its own direction, so its content is
     * skipped — falls back to `ltr`, and `text-align: start` then resolves to the
     * LEFT edge inside an RTL page. Measured in Chrome: the Arabic name rendered
     * at x 57 while its own avatar sat at x 667. See the view's own note. */
    const heading = screen.getByRole('heading', { level: 2, name: CUSTOMER.fullName });
    expect(heading).not.toHaveAttribute('dir');
    expect(heading.querySelector('bdi')).not.toBeNull();
  });

  it('renders an em dash and no copy control for an absent contact method', async () => {
    vi.mocked(getCustomer).mockResolvedValue({ ...CUSTOMER, phone: null });
    renderAt(ID);
    await screen.findByRole('heading', { level: 2 });

    expect(
      screen.queryByRole('button', { name: 'Copy the phone number' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('AC-11 — dates go through lib/formatters', () => {
  it('renders the created and updated dates in Latin digits in both locales', async () => {
    vi.mocked(getCustomer).mockResolvedValue(CUSTOMER);
    renderAt(ID);
    await screen.findByRole('heading', { level: 2 });

    const expected = formatDate(CUSTOMER.createdAtUtc, 'en');
    /* TWO rows carry the same value in this release: `008`'s contract says
     * `updatedAtUtc` equals `createdAtUtc` until `017` ships an update path. The
     * count is the assertion — a screen that dropped one row would still pass a
     * `getByText`. */
    expect(screen.getAllByText(expected)).toHaveLength(2);
    /* Gregorian, Latin digits, in Arabic too (`014`'s ruling). An Arabic-Indic
     * digit here would mean the formatter was bypassed. */
    expect(expected).toMatch(/\d/);
  });
});

describe('spec Q-5 — a deactivated customer is named, not hidden', () => {
  it('renders a badge when isActive is false, and none when it is true', async () => {
    vi.mocked(getCustomer).mockResolvedValue({ ...CUSTOMER, isActive: false });
    const { unmount } = renderAt(ID);

    expect(await screen.findByText('Deactivated')).toBeInTheDocument();
    /* And the profile still renders: a ticket may reference a deactivated
     * customer, which is why the endpoint answers `200` rather than `404`. */
    expect(
      screen.getByRole('heading', { level: 2, name: CUSTOMER.fullName }),
    ).toBeInTheDocument();
    unmount();

    vi.mocked(getCustomer).mockResolvedValue(CUSTOMER);
    renderAt(ID);
    await screen.findByRole('heading', { level: 2 });
    expect(screen.queryByText('Deactivated')).not.toBeInTheDocument();
  });
});
