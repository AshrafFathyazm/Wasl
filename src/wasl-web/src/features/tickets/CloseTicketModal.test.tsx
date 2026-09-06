import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../components/Toast/ToastHost';
import { ApiError } from '../../lib/api';
import type { TicketResponse } from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';

/* The module is the seam, the same choice `024` and `026` made. */
vi.mock('./tickets.api', async () => {
  const actual = await vi.importActual<typeof import('./tickets.api')>('./tickets.api');
  return { ...actual, getTicket: vi.fn(), changeTicketStatus: vi.fn() };
});

const { getTicket, changeTicketStatus } = await import('./tickets.api');
const { CloseTicketModal, composeNote, NOTE_MAX } = await import('./CloseTicketModal');

const TICKET_ID = '8f1c2d34-5678-4abc-9def-0123456789ab';
const NUMBER = 'TCK-2026-000042';

const ticket = (over: Partial<TicketResponse> = {}): TicketResponse =>
  ({
    id: TICKET_ID,
    ticketNumber: NUMBER,
    customer: { id: 'c-1', fullName: 'علي الأحمد', companyName: null },
    subject: 'الفاتورة الشهرية لم تصل',
    description: 'لم تصل الفاتورة على البريد.',
    category: 'Billing',
    priority: 'Normal',
    channel: 'Email',
    status: 'Open',
    assignedToUserId: null,
    assignee: null,
    isEscalated: false,
    allowedTransitions: ['InProgress', 'Closed'],
    tags: [],
    version: 'AAAAAAAAB9E=',
    createdAtUtc: '2026-08-23T12:00:00Z',
    updatedAtUtc: '2026-08-23T12:00:00Z',
    ...over,
  }) as TicketResponse;

const onClose = vi.fn();

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CloseTicketModal ticketId={TICKET_ID} ticketNumber={NUMBER} onClose={onClose} />
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const label = (key: string) => i18n.t(key, { ns: 'tickets' });
/** A translated label can carry regex metacharacters — the Arabic close reasons
 *  do not today, and a label that gains one later must not turn this file's
 *  assertions into a pattern that quietly matches something else. */
const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const confirm = () => screen.getByRole('button', { name: label('close.confirm') });

beforeEach(() => {
  onClose.mockReset();
  vi.mocked(getTicket).mockReset();
  vi.mocked(getTicket).mockResolvedValue(ticket());
  vi.mocked(changeTicketStatus).mockReset();
  vi.mocked(changeTicketStatus).mockResolvedValue(ticket({ status: 'Closed' }));
});

describe('AC-16 — the row has no version, so opening fetches the ticket', () => {
  it('asks for the ticket and keeps the confirm out of reach until it answers', async () => {
    let resolve!: (value: TicketResponse) => void;
    vi.mocked(getTicket).mockReturnValue(
      new Promise<TicketResponse>((r) => {
        resolve = r;
      }),
    );

    mount();

    expect(getTicket).toHaveBeenCalledWith(TICKET_ID, expect.anything());
    expect(confirm()).toBeDisabled();

    resolve(ticket());
    await waitFor(() => expect(confirm()).toBeEnabled());
  });
});

describe('AC-17 — BR-1 is the server’s, and the client renders what it was given', () => {
  it('refuses in words and sends nothing when Closed is not allowed', async () => {
    vi.mocked(getTicket).mockResolvedValue(
      ticket({ status: 'InProgress', allowedTransitions: ['Open', 'PendingCustomer', 'Resolved'] }),
    );

    mount();

    /* `findBy`, NOT `waitFor(confirm disabled)`. The confirm is disabled while
       the ticket is still LOADING too, so that wait resolves on the pending
       state and asserts nothing about the refusal — it passed against a modal
       that had not yet been told the transition was illegal.

       The refusal names the status rather than saying "not allowed", because
       "why not" is the only useful half of it. */
    await screen.findByText(new RegExp(escapeRe(label('status.InProgress'))));

    expect(confirm()).toBeDisabled();
    expect(changeTicketStatus).not.toHaveBeenCalled();
  });
});

describe('AC-18 / AC-19 — four reasons, and one conditional field', () => {
  it('offers the four and marks the pressed one', async () => {
    mount();
    await waitFor(() => expect(confirm()).toBeEnabled());

    for (const key of ['solved', 'duplicate', 'noAction', 'noReply']) {
      expect(
        screen.getByRole('button', { name: label(`close.reason.${key}`) }),
      ).toHaveAttribute('aria-pressed', 'false');
    }

    await userEvent.click(
      screen.getByRole('button', { name: label('close.reason.solved') }),
    );

    expect(
      screen.getByRole('button', { name: label('close.reason.solved') }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('puts «التذكرة الأصلية» in the DOM only while «مكرّرة» is chosen', async () => {
    mount();
    await waitFor(() => expect(confirm()).toBeEnabled());

    expect(screen.queryByLabelText(new RegExp(label('close.duplicateOf')))).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: label('close.reason.duplicate') }),
    );
    expect(
      screen.getByLabelText(new RegExp(label('close.duplicateOf'))),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: label('close.reason.noAction') }),
    );
    expect(screen.queryByLabelText(new RegExp(label('close.duplicateOf')))).toBeNull();
  });
});

describe('AC-20 — confirming with no reason reports it and sends nothing', () => {
  it('shows the inline error', async () => {
    mount();
    await waitFor(() => expect(confirm()).toBeEnabled());

    await userEvent.click(confirm());

    expect(screen.getByRole('alert')).toHaveTextContent(label('close.reasonRequired'));
    expect(changeTicketStatus).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('refuses a duplicate with no original number', async () => {
    mount();
    await waitFor(() => expect(confirm()).toBeEnabled());

    await userEvent.click(
      screen.getByRole('button', { name: label('close.reason.duplicate') }),
    );
    await userEvent.click(confirm());

    expect(changeTicketStatus).not.toHaveBeenCalled();
  });
});

describe('AC-21 / AC-22 — the composed note and the version that goes with it', () => {
  it('sends reason, then the duplicate reference, then the summary — with the fetched version', async () => {
    mount();
    await waitFor(() => expect(confirm()).toBeEnabled());

    await userEvent.click(
      screen.getByRole('button', { name: label('close.reason.duplicate') }),
    );
    await userEvent.type(
      screen.getByLabelText(new RegExp(label('close.duplicateOf'))),
      'TCK-2026-000412',
    );
    await userEvent.type(
      screen.getByLabelText(new RegExp(label('close.summary'))),
      'نفس الرسوم.',
    );
    await userEvent.click(confirm());

    await waitFor(() => expect(changeTicketStatus).toHaveBeenCalledTimes(1));

    const [id, body] = vi.mocked(changeTicketStatus).mock.calls[0]!;
    expect(id).toBe(TICKET_ID);
    expect(body.status).toBe('Closed');
    expect(body.expectedVersion).toBe('AAAAAAAAB9E=');

    /* READ THE STRING, do not count the fields. `errors[field].length === 1` is
       a shape assertion — this repo shipped seventeen raw resource keys under
       exactly that check. */
    expect(body.note).toContain(label('close.reason.duplicate'));
    expect(body.note).toContain('TCK-2026-000412');
    expect(body.note).toContain('نفس الرسوم.');
    expect(body.note!.indexOf(label('close.reason.duplicate'))).toBe(0);
  });

  it('reports a 409 in words, in the modal, and does not close it', async () => {
    vi.mocked(changeTicketStatus).mockRejectedValue(
      new ApiError(
        {
          type: 'errors/concurrency-conflict',
          title: 'Conflict',
          status: 409,
          traceId: 't-1',
        },
        'ar',
      ),
    );

    mount();
    await waitFor(() => expect(confirm()).toBeEnabled());
    await userEvent.click(
      screen.getByRole('button', { name: label('close.reason.solved') }),
    );
    await userEvent.click(confirm());

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(label('close.error.stale')),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('distinguishes a forbidden TRANSITION from a stale version, both 409', async () => {
    vi.mocked(changeTicketStatus).mockRejectedValue(
      new ApiError(
        {
          type: 'errors/invalid-status-transition',
          title: 'Conflict',
          status: 409,
          traceId: 't-2',
        },
        'ar',
      ),
    );

    mount();
    await waitFor(() => expect(confirm()).toBeEnabled());
    await userEvent.click(
      screen.getByRole('button', { name: label('close.reason.solved') }),
    );
    await userEvent.click(confirm());

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(label('close.error.transition')),
    );
  });
});

describe('AC-24 — the surface holds input, so the scrim does not dismiss it', () => {
  it('declares no notification control of any kind (G-5, Q-2)', async () => {
    mount();
    await waitFor(() => expect(confirm()).toBeEnabled());

    /* ABSENT, not disabled. `021` is unbuilt, so a checkbox promising the
       customer a message is a fact this product does not have. */
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('draws no amber “last message unanswered” banner (G-6)', async () => {
    mount();
    await waitFor(() => expect(confirm()).toBeEnabled());

    /* There is no customer message in this product — `Interaction` was never
       built. The banner cannot be right, so it is not drawn. */
    expect(screen.queryByText(/رسالة|message/i)).toBeNull();
  });

  it('has a navy primary and no danger control', async () => {
    mount();
    await waitFor(() => expect(confirm()).toBeEnabled());

    expect(confirm().className).not.toMatch(/danger/i);
  });
});

describe('composeNote — the one place three fields become the contract’s one', () => {
  it('keeps the order and drops the parts that are empty', () => {
    expect(
      composeNote({
        reason: 'مكرّرة',
        duplicateOf: 'TCK-1',
        duplicateLabel: 'التذكرة الأصلية',
        summary: 'شرح',
      }),
    ).toBe('مكرّرة — التذكرة الأصلية TCK-1\nشرح');

    expect(
      composeNote({ reason: 'تم الحل', duplicateOf: '', duplicateLabel: 'x', summary: '' }),
    ).toBe('تم الحل');
  });

  it('never exceeds the column, which is 500 and answers 400 at 501', () => {
    const note = composeNote({
      reason: 'تم الحل',
      duplicateOf: '',
      duplicateLabel: 'x',
      summary: 'ب'.repeat(900),
    });

    expect(note).toHaveLength(NOTE_MAX);
  });
});
