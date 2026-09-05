import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, type ProblemDetails } from '../../lib/api';
import type { CreateCustomerResponse } from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';

/* ============================================================================
 * 032 — the create screen's claims
 * ============================================================================
 * The seam is the module, as on the profile: `customers.api` is this screen's
 * only route to the server.
 * ========================================================================== */

vi.mock('./customers.api', () => ({
  getCustomer: vi.fn(),
  createCustomer: vi.fn(),
}));

const { createCustomer } = await import('./customers.api');
const { default: CreateCustomerPage } = await import('./CreateCustomerPage');

const ID = '8f1c2d34-5678-4abc-9def-0123456789ab';

const CREATED: CreateCustomerResponse = {
  id: ID,
  fullName: 'Noura Al-Salem',
  email: 'noura@example.com',
  phone: null,
  companyName: null,
  notes: null,
  isActive: true,
  createdAtUtc: '2026-08-31T10:00:00.000Z',
  updatedAtUtc: '2026-08-31T10:00:00.000Z',
  version: 'AAAAAAAAB9E=',
};

function problem(status: number, type: string, errors?: Record<string, string[]>) {
  return new ApiError(
    {
      type: `https://wasl.local/${type}`,
      title: 'A customer with this email already exists.',
      status,
      traceId: '00-8f1c2d3456789abc-0123456789abcdef-01',
      ...(errors ? { errors } : {}),
    } satisfies ProblemDetails,
    'en',
  );
}

/** Renders wherever navigation lands, so a test can assert the destination
 *  rather than mocking `useNavigate` and asserting an argument to a spy. */
function Landing() {
  const location = useLocation();
  return <p>{`landed:${location.pathname}${location.search}`}</p>;
}

function renderPage(initialEntry = '/customers/new') {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 }, mutations: { retry: false } },
  });

  const utils = render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/customers/new" element={<CreateCustomerPage />} />
            <Route path="/customers/:id" element={<Landing />} />
            <Route path="/customers" element={<Landing />} />
            <Route path="/tickets/new" element={<Landing />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );

  return { ...utils, client };
}

/** The minimum a valid submit needs: a name and one contact method (BR-4.1). */
async function fillMinimum(user: UserEvent) {
  await user.type(
    screen.getByLabelText(new RegExp(i18n.t('customers:field.name'))),
    'Noura Al-Salem',
  );
  await user.type(screen.getByLabelText(/^Email/), 'noura@example.com');
}

beforeEach(async () => {
  vi.mocked(createCustomer).mockReset();
  await i18n.changeLanguage('en');
});

describe('AC-6 — one request per submit, and the control keeps its name', () => {
  it('sends exactly one POST for two synchronous clicks', async () => {
    const user = userEvent.setup();
    /* Resolves on our schedule, so both clicks land while the first request is
     * still in flight — which is the only way to exercise the guard. */
    let release: (value: {
      customer: CreateCustomerResponse;
      location: string | null;
    }) => void = () => {};
    vi.mocked(createCustomer).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    renderPage();
    await fillMinimum(user);

    const submit = screen.getByRole('button', { name: 'Create' });
    /* NOT `await user.click()` twice: awaiting lets React re-render between
     * them, and the `disabled` attribute would then be doing the work. The
     * defect `024` measured was two clicks in ONE tick, which is what a real
     * double-click is. */
    submit.click();
    submit.click();

    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));

    release({ customer: CREATED, location: `/api/customers/${ID}` });
    await screen.findByText(`landed:/customers/${ID}`);

    /* Still one after the mutation settled — the guard released, and nothing
     * replayed the queued click. */
    expect(createCustomer).toHaveBeenCalledTimes(1);
  });

  it('keeps the submit control’s accessible name while the request is in flight', async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockReturnValue(new Promise(() => {}));

    renderPage();
    await fillMinimum(user);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    /* NO "Saving…". `Button` carries `aria-busy` and keeps its name — swapping
     * the label renames the control mid-action, so a screen reader announces a
     * different button from the one that was pressed. Asserted by NAME, so a
     * label swap fails here rather than being noticed in review. */
    const submit = await screen.findByRole('button', { name: 'Create' });
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit).toBeDisabled();
  });
});

describe('AC-7 — a 400 renders the server’s own message, read as a string', () => {
  it('attaches each message to the field the server named', async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockRejectedValue(
      problem(400, 'errors/validation', {
        fullName: ['A full name is required by the server.'],
        email: ['Provide either an email address or a phone number.'],
      }),
    );

    renderPage();
    await fillMinimum(user);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    /* READ THE STRING. `errors[field]` with one entry is a SHAPE assertion — all
     * seventeen unresolved resource keys in `004b` shipped under assertions that
     * counted entries and never read one. This compares the sentence. */
    expect(
      await screen.findByText('A full name is required by the server.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Provide either an email address or a phone number.'),
    ).toBeInTheDocument();
  });

  it('fails when a server message is a raw resource key', async () => {
    const user = userEvent.setup();
    /* THE NEGATIVE CONTROL for the assertion above, kept as a test rather than
     * described: `t()` returns its input unchanged for an unknown key, so a key
     * leaked by the server renders verbatim. This asserts the client does not
     * quietly turn it into something that looks like copy. */
    vi.mocked(createCustomer).mockRejectedValue(
      problem(400, 'errors/validation', {
        fullName: ['Validation.Customer.FullNameRequired'],
      }),
    );

    renderPage();
    await fillMinimum(user);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const leaked = await screen.findByText('Validation.Customer.FullNameRequired');
    expect(leaked).toBeInTheDocument();
    /* And it IS key-shaped, which is what a guard like `ResourceKeyLeakTests`
     * looks for on the server side. The client cannot fix this; it can only fail
     * to hide it. */
    expect(leaked.textContent).toMatch(/^[A-Z][A-Za-z]+(\.[A-Za-z]+)+$/);
  });

  it('falls back to the problem title when a 400 names no field this form has', async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockRejectedValue(
      problem(400, 'errors/validation', { somethingElse: ['Not a field here.'] }),
    );

    renderPage();
    await fillMinimum(user);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    /* Otherwise the submit would fail silently: a `400` naming a field the form
     * does not render would set no error anywhere and the screen would look
     * like the button did nothing. */
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A customer with this email already exists.',
    );
  });
});

describe('AC-8 — the 409, and the only route to the existing record', () => {
  it('names the field and offers a search for the value that collided', async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockRejectedValue(
      problem(409, 'errors/duplicate-customer', {
        email: ['A customer with this email already exists.'],
      }),
    );

    renderPage();
    await fillMinimum(user);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      await screen.findByText('A customer with this email already exists.'),
    ).toBeInTheDocument();

    /* BR-4.7 keeps the existing customer's id OUT of the response, so a link
     * straight to the record is impossible and a search is the intended route.
     * The value searched for is what the user typed. */
    const find = screen.getByRole('link', { name: 'Find the existing customer' });
    expect(find).toHaveAttribute('href', '/customers?search=noura%40example.com');
  });

  it('issues no request before the submit — there is no duplicate pre-check', async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({
      customer: CREATED,
      location: `/api/customers/${ID}`,
    });

    renderPage();
    await fillMinimum(user);

    /* A check-then-create is a race two concurrent requests both pass (`007`
     * AC-13), and it leaks whether an address is on file to anyone who can open
     * this form. Typing a full email and blurring the field must reach the
     * network zero times. */
    await user.tab();
    expect(createCustomer).not.toHaveBeenCalled();
  });
});

describe('AC-1 — nothing renders a customer from the write response', () => {
  it('navigates by the Location header and seeds no customer cache entry', async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({
      customer: CREATED,
      /* THE ABSOLUTE FORM, which is what `024` measured the running server
       * sending where the contract shows a relative path. Only the pathname is
       * used — following the host would navigate out of the SPA. */
      location: `http://localhost:5272/api/customers/${ID}`,
    });

    const { client } = renderPage();
    await fillMinimum(user);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText(`landed:/customers/${ID}`)).toBeInTheDocument();

    /* THE ASSERTION THAT CARRIES THE RULE. The two response shapes are now the
     * same TYPE (`api-types.provisional.ts` records why), so the compiler no
     * longer objects to feeding a `201` body to the profile. Nothing may seed
     * `['customer', id]` from a write — the profile fetches its own. */
    expect(client.getQueryData(['customer', ID])).toBeUndefined();
  });

  it('falls back to the id when the server sends no Location', async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({ customer: CREATED, location: null });

    renderPage();
    await fillMinimum(user);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText(`landed:/customers/${ID}`)).toBeInTheDocument();
  });
});

describe('the returnUrl, and the open redirect it must not become', () => {
  it('returns to an internal path after a create', async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({
      customer: CREATED,
      location: `/api/customers/${ID}`,
    });

    renderPage('/customers/new?returnUrl=%2Ftickets%2Fnew');
    await fillMinimum(user);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('landed:/tickets/new')).toBeInTheDocument();
  });

  for (const hostile of [
    'https://evil.example/steal',
    '//evil.example',
    'javascript:alert(1)',
  ]) {
    it(`refuses ${hostile} and goes to the profile instead`, async () => {
      const user = userEvent.setup();
      vi.mocked(createCustomer).mockResolvedValue({
        customer: CREATED,
        location: `/api/customers/${ID}`,
      });

      renderPage(`/customers/new?returnUrl=${encodeURIComponent(hostile)}`);
      await fillMinimum(user);
      await user.click(screen.getByRole('button', { name: 'Create' }));

      /* `//evil.example` is the one that matters: it has no scheme, so a check
       * for `http` passes it and the browser still leaves the origin. */
      expect(await screen.findByText(`landed:/customers/${ID}`)).toBeInTheDocument();
    });
  }
});

describe('AC-10 — the phone field is pinned LTR, the others are not', () => {
  it('carries dir="ltr" on phone only, in the Arabic interface', async () => {
    await i18n.changeLanguage('ar');
    renderPage();

    /* MEASURED IN CHROME FIRST: with `dir="auto"` the phone placeholder rendered
     * `5X XXX XXXX 966+` in the Arabic layout — the country code at the far end,
     * and still shaped like a phone number, which is why it survives a glance.
     * `+`, the spaces and the digit groups are all weak or neutral, so an RTL
     * paragraph reorders the runs. This pins the fix. */
    expect(screen.getByLabelText(/الجوال/)).toHaveAttribute('dir', 'ltr');

    /* The other two stay `auto`: a name is language content in either script, and
     * an address has strong LTR characters of its own the moment it is typed. */
    expect(
      screen.getByLabelText(new RegExp(i18n.t('customers:field.name'))),
    ).toHaveAttribute('dir', 'auto');
    expect(screen.getByLabelText(/البريد الإلكتروني/)).toHaveAttribute('dir', 'auto');

    await i18n.changeLanguage('en');
  });
});

/* ============================================================================
 * AC-9 was REVERSED on 2026-09-05, and the criterion is recorded as superseded
 * rather than deleted.
 * ============================================================================
 * AC-9 read: BR-4.1 is stated BEFORE the fields it governs, as a standing hint,
 * because a cross-field rule explained under the second field is explained too
 * late. Nothing about that reasoning was wrong.
 *
 * What was wrong was that it did not survive contact with the validator.
 * `createCustomer.schema.ts` emits `customers:new.contactRequired` on BOTH
 * `email` and `phone`, so a form that actually broke the rule showed one
 * sentence three times — and THE OLD TEST BELOW ASSERTED EXACTLY THAT, with
 * `toHaveLength(3)` and a comment explaining the three as correct. It is the
 * clearest evidence in this file that a duplicate can be written down, reviewed,
 * and guarded, without anyone reading it as a duplicate.
 *
 * `design/feedback-layer.md` §1.6 — never two surfaces for one event — is what
 * it breaks, and that document did not exist when AC-9 was written.
 *
 * THE COST IS REAL AND IS NOT ARGUED AWAY: a reader on an untouched form is no
 * longer warned in advance. Product owner's call, and the reason the catalogue
 * entry must stay a whole sentence.
 * ========================================================================= */
describe('AC-9 (superseded) — BR-4.1 is carried by the validator alone', () => {
  it('shows no standing contact hint on an empty form', async () => {
    renderPage();

    expect(
      screen.queryByText(
        'At least one contact method is required — an email address or a phone number.',
      ),
    ).toBeNull();

    /* AND THE FORM HAS STILL FAILED NOTHING. Removing the hint must not have
       been done by promoting it to an error that fires on an untouched form,
       which is the obvious wrong way to make the duplicate go away. */
    expect(screen.getByLabelText(/^Email/)).not.toHaveAttribute('aria-invalid');
  });

  it('blocks a submit with a name and no contact method, naming both fields', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByLabelText(new RegExp(i18n.t('customers:field.name'))),
      'Noura Al-Salem',
    );
    await user.click(screen.getByRole('button', { name: 'Create' }));

    /* NOTHING REACHES THE SERVER: the client mirror is what makes this cheap,
     * and the server enforces it regardless. */
    await waitFor(() => expect(createCustomer).not.toHaveBeenCalled());

    /* BOTH fields, because `007`'s `400` names both — telling the user to fix
     * the one they did not choose is worse than naming the pair. */
    const messages = await screen.findAllByText(
      'At least one contact method is required — an email address or a phone number.',
    );

    /* TWO, AND TWO IS THE CEILING. This read `toHaveLength(3)` — the standing
       hint plus one message under each field — and the comment beside it
       described the three as the design. It was the duplicate, written down and
       guarded.
     *
     * The count still matters and is still exact rather than `>= 1`: two is
     * `007`'s `400` naming both fields, and the reader has to see the rule
     * wherever they were typing. A third occurrence means the hint came back. */
    expect(messages).toHaveLength(2);
  });
});
