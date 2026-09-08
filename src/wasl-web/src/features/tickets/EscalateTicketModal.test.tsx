import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../components/Toast/ToastHost';
import { ApiError } from '../../lib/api';
import type { TicketPriority } from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';

/* The module is the seam, the same choice `024`, `026` and `039` made. */
vi.mock('./tickets.api', async () => {
  const actual = await vi.importActual<typeof import('./tickets.api')>('./tickets.api');
  return { ...actual, escalateTicket: vi.fn() };
});

const { escalateTicket } = await import('./tickets.api');
const { EscalateTicketModal, refusalToEscalate, REASON_MAX } = await import(
  './EscalateTicketModal'
);

const TICKET_ID = '8f1c2d34-5678-4abc-9def-0123456789ab';
const NUMBER = 'TCK-2026-000042';
const VERSION = 'AAAAAAAAB9E=';

const onClose = vi.fn();

function mount(priority: TicketPriority = 'Normal') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <EscalateTicketModal
            ticketId={TICKET_ID}
            ticketNumber={NUMBER}
            expectedVersion={VERSION}
            priority={priority}
            onClose={onClose}
          />
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const label = (key: string) => i18n.t(key, { ns: 'tickets' });

/** `ApiError(problem, contentLanguage)` — the STATUS comes off the problem, it
 *  is not a separate argument. Written the other way round on the first attempt
 *  and every error-path test failed identically, because `instanceof ApiError`
 *  held while `.status` was `undefined` and every branch fell through to
 *  `unknown`. A helper so the shape is stated once. */
const refusal = (status: number, type = 'internal') =>
  new ApiError(
    {
      /* `type` IS REQUIRED ON `ProblemDetails`, not optional — every non-2xx in
         this product is RFC 7807 with a `type` (`002`), so a fixture that could
         omit it would be modelling a response the server cannot send. The
         default is a segment `refusalToEscalate` does not branch on, which is
         what the `403`/`503`/`400` cases need. */
      type: `https://wasl.local/errors/${type}`,
      title: 'Refused',
      status,
      traceId: 't-1',
    },
    'en',
  );

const reasonField = () => screen.getByLabelText(new RegExp(label('escalate.reason')));
const confirm = () => screen.getByRole('button', { name: label('escalate.confirm') });

/* ============================================================================
 * EscalateTicketModal — `016` FE-016-02, FE-016-04, FE-016-05, FE-016-06
 * ============================================================================
 * Every test here is about a rule the SERVER owns and the client must not
 * duplicate. The dialog's whole job is to collect one string and send it with a
 * version — so what is worth asserting is the boundaries of that string, what
 * happens to each of the server's refusals, and the several things the dialog
 * deliberately does not do.
 * ========================================================================= */

describe('EscalateTicketModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(escalateTicket).mockResolvedValue({} as never);
  });

  // ── FE-016-04, the reason's boundaries ────────────────────────────────────

  it('disables Confirm with an empty reason and enables it at one character', async () => {
    mount();

    expect(confirm()).toBeDisabled();

    await userEvent.type(reasonField(), 'x');

    expect(confirm()).toBeEnabled();
  });

  /* WHITESPACE IS NOT A REASON, and the server agrees: BR-3.5 measures the
     length AFTER trimming, so " " is a `400` on the wire. Matching that here
     means the reader is not told their reason was accepted and then refused. */
  it('treats a whitespace-only reason as empty', async () => {
    mount();

    await userEvent.type(reasonField(), '    ');

    expect(confirm()).toBeDisabled();
  });

  /* 500 EXACTLY IS VALID. A client written as `< 500` refuses a legitimate
     reason, and the reader has no way to tell that from a bug. */
  it('accepts a reason of exactly the maximum length', async () => {
    mount();

    await userEvent.click(reasonField());
    await userEvent.paste('x'.repeat(REASON_MAX));

    expect(confirm()).toBeEnabled();
  });

  /* THE NATIVE CEILING IS THE FIRST DEFENCE. `maxLength` stops the reader typing
     past 500 rather than letting them write 600 and hear about it from the
     server — so this asserts the attribute, not a rejection. */
  it('caps the field at the maximum rather than letting the server refuse it', () => {
    mount();

    expect(reasonField()).toHaveAttribute('maxlength', String(REASON_MAX));
  });

  it('sends the trimmed reason and the version it was given', async () => {
    mount();

    await userEvent.type(reasonField(), '  the customer is threatening to leave  ');
    await userEvent.click(confirm());

    await waitFor(() => expect(escalateTicket).toHaveBeenCalledTimes(1));

    expect(escalateTicket).toHaveBeenCalledWith(TICKET_ID, {
      reason: 'the customer is threatening to leave',
      expectedVersion: VERSION,
    });
  });

  /* THE BODY HAS TWO FIELDS AND ONLY TWO. `priority` would let a client set a
     value BELOW BR-3.6's floor, and `isEscalated` would make de-escalation
     expressible against BR-3.9 — both are absent from the request type, and
     this is what notices if either is ever added and then populated. */
  it('sends no priority and no escalation flag', async () => {
    mount('Critical');

    await userEvent.type(reasonField(), 'data loss');
    await userEvent.click(confirm());

    await waitFor(() => expect(escalateTicket).toHaveBeenCalledTimes(1));

    const body = vi.mocked(escalateTicket).mock.calls[0]![1];

    /* `Object.keys` OVER THE ACTUAL ARGUMENT, not over the declared type — the
       declared type already excludes both fields, so asserting against it would
       be asserting that TypeScript works. This catches the case that matters: a
       field added to the type later and populated here. */
    expect(Object.keys(body).sort()).toEqual(['expectedVersion', 'reason']);
  });

  // ── FE-016-02, what the priority sentence says ────────────────────────────

  /* THE SENTENCE MIRRORS BR-3.6 AND MUST NOT GET IT BACKWARDS.
   *
   * A dialog that tells a manager their `Critical` ticket "will be raised to
   * High" is announcing the exact defect BR-3.6 exists to prevent — and it
   * would say so even on a server that behaves correctly, which makes it the
   * kind of wrong nobody reports as a bug in the right place. */
  it.each([
    ['Low', 'escalate.priorityRaised'],
    ['Normal', 'escalate.priorityRaised'],
    ['High', 'escalate.priorityKept'],
    ['Critical', 'escalate.priorityKept'],
  ] as const)('says the priority %s → %s', (priority, key) => {
    mount(priority);

    /* The interpolated sentence, matched on its stable stem: both strings carry
       a placeholder, so an exact-string assertion would be asserting the
       interpolation rather than which sentence was chosen. */
    const stem = label(key).split('{{')[0]!.trim();

    expect(screen.getByText(new RegExp(stem.slice(0, 24)))).toBeInTheDocument();
  });

  it('states that escalation cannot be undone', () => {
    mount();

    expect(screen.getByText(label('escalate.oneWay'))).toBeInTheDocument();
  });

  // ── FE-016-05, the server's refusals — INLINE, never a toast ──────────────

  /* AC-16. Each of these is about the thing the reader is looking at, with the
     reason they typed still in the field. A toast takes the answer away from the
     question and can be missed entirely.
     ────────────────────────────────────────────────────────────────────────
     THE `role="alert"` ASSERTION IS THE ONE THAT MATTERS. Finding the text is
     satisfied by a toast too — the toast host renders into the same document —
     so "inline" is proven by the message being inside the dialog and by the
     dialog staying open, not by the text existing. */
  it.each([
    ['ticket-not-escalatable', 'escalate.error.notEscalatable'],
    ['already-escalated', 'escalate.error.already'],
    ['concurrency-conflict', 'escalate.error.stale'],
  ])('renders the %s conflict inline', async (type, key) => {
    vi.mocked(escalateTicket).mockRejectedValue(
      refusal(409, type),
    );

    mount();

    await userEvent.type(reasonField(), 'because');
    await userEvent.click(confirm());

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent(label(key));

    /* THE DIALOG IS STILL OPEN and the reason is still there — a `409` is
       something to correct, not something that discards the work. */
    expect(onClose).not.toHaveBeenCalled();
    expect(reasonField()).toHaveValue('because');
  });

  it.each([
    [403, 'escalate.error.forbidden'],
    [503, 'escalate.error.transient'],
    [400, 'escalate.error.invalid'],
    [500, 'escalate.error.unknown'],
  ])('renders a %d inline', async (status, key) => {
    vi.mocked(escalateTicket).mockRejectedValue(
      refusal(status),
    );

    mount();

    await userEvent.type(reasonField(), 'because');
    await userEvent.click(confirm());

    expect(await screen.findByRole('alert')).toHaveTextContent(label(key));
  });

  /* A `409` NEVER AUTO-RETRIES (ADR-006). A retry would send the reason against
     a state the reader has not seen — the same argument that puts the server's
     version check ahead of its state rules. */
  it('does not retry a conflict on its own', async () => {
    vi.mocked(escalateTicket).mockRejectedValue(
      refusal(409, 'concurrency-conflict'),
    );

    mount();

    await userEvent.type(reasonField(), 'because');
    await userEvent.click(confirm());

    await screen.findByRole('alert');

    expect(escalateTicket).toHaveBeenCalledTimes(1);
  });

  it('closes and reports success once the server accepts it', async () => {
    mount();

    await userEvent.type(reasonField(), 'the customer escalated to their account manager');
    await userEvent.click(confirm());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  // ── refusalToEscalate, on its own ─────────────────────────────────────────

  /* BRANCHING ON THE LAST PATH SEGMENT, NEVER THE FULL URI — `002` AC-25, and
     it is what makes `ProblemTypes.TypeBase` safe to change. This asserts that
     directly: a different base with the same segment must produce the same
     message. */
  it('branches on the type segment and not the base URI', () => {
    const t = (key: string) => key;

    for (const base of ['https://wasl.local/errors/', 'https://example.test/x/y/']) {
      expect(
        refusalToEscalate(
          new ApiError(
            { type: `${base}already-escalated`, title: 't', status: 409 },
            'en',
          ),
          t,
        ),
      ).toBe('escalate.error.already');
    }
  });

  /* AN UNRECOGNISED `409` FALLS BACK TO "STALE", NOT TO "UNKNOWN". A conflict
     with a type this client has never heard of is still a conflict, and "reload
     and try again" is true for every one of them — while "something went wrong"
     tells the reader nothing they can act on. */
  it('treats an unfamiliar conflict as a stale copy', () => {
    expect(
      refusalToEscalate(
        refusal(409, 'some-future-conflict'),
        (key: string) => key,
      ),
    ).toBe('escalate.error.stale');
  });

  it('treats a non-ApiError as unknown', () => {
    expect(refusalToEscalate(new Error('network down'), (key: string) => key)).toBe(
      'escalate.error.unknown',
    );
  });
});
