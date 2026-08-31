import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../lib/api';
import type {
  CannedReplySummary,
  SupportUser,
  TagSummary,
  TicketResponse,
  TimelineEntry,
  TimelinePage,
} from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';

/* `027` — the detail screen. The module is the seam, for the reason
 * `CreateTicketPage.test.tsx` gives: counting these functions measures what the
 * criteria mean by "requests", one call out per intent. */
vi.mock('./tickets.api', async () => {
  const actual = await vi.importActual<typeof import('./tickets.api')>('./tickets.api');
  return {
    ...actual,
    getTicket: vi.fn(),
    getTicketTimeline: vi.fn(),
    getSupportUsers: vi.fn(),
    addTicketComment: vi.fn(),
    changeTicketStatus: vi.fn(),
    changeTicketAssignee: vi.fn(),
    getTags: vi.fn(),
    getCannedReplies: vi.fn(),
    attachTicketTag: vi.fn(),
    detachTicketTag: vi.fn(),
  };
});

const {
  getTicket,
  getTicketTimeline,
  getSupportUsers,
  addTicketComment,
  changeTicketStatus,
  changeTicketAssignee,
  getTags,
  getCannedReplies,
  attachTicketTag,
  detachTicketTag,
} = await import('./tickets.api');
const { default: TicketDetailPage } = await import('./TicketDetailPage');

const ID = '8f1c2d34-5678-4abc-9def-0123456789ab';

const ticket = (over: Partial<TicketResponse> = {}): TicketResponse =>
  ({
    id: ID,
    ticketNumber: 'TCK-2026-000042',
    customer: { id: 'c-1', fullName: 'علي الأحمد', email: 'ali@example.com' },
    subject: 'لا يمكنني تسجيل الدخول إلى الحساب',
    description: 'وصف المشكلة',
    category: 'Technical',
    priority: 'High',
    channel: 'Email',
    status: 'Open',
    assignedToUserId: null,
    assignee: null,
    isEscalated: false,
    escalatedAtUtc: null,
    escalationReason: null,
    createdByUserId: 'u-1',
    createdAtUtc: '2026-08-23T12:00:00Z',
    updatedAtUtc: '2026-08-23T12:00:00Z',
    version: 'AAAAAAAAB+4=',
    allowedTransitions: ['InProgress', 'Closed'],
    tags: [],
    ...over,
  }) as TicketResponse;

const entry = (over: Partial<TimelineEntry> = {}): TimelineEntry => ({
  type: 'Created',
  id: 'e-1',
  occurredAtUtc: '2026-08-23T12:00:00Z',
  actor: { id: 'u-1', fullName: 'منى العتيبي', role: 'Manager' },
  cursor: 'c-1',
  body: null,
  isInternal: null,
  channel: null,
  oldValue: null,
  newValue: 'New',
  note: null,
  authorKind: null,
  recordedBy: null,
  ...over,
});

const timeline = (over: Partial<TimelinePage> = {}): TimelinePage => ({
  items: [entry()],
  hasMore: false,
  nextCursor: null,
  commentCount: 0,
  historyCount: 1,
  ...over,
});

const USERS: SupportUser[] = [
  { id: 'u-1', fullName: 'منى العتيبي', role: 'Manager' },
  { id: 'u-2', fullName: 'Omar Khalid', role: 'Agent' },
];

const TAGS: TagSummary[] = [
  { id: 't-1', name: 'استرداد' },
  { id: 't-2', name: 'خصم مزدوج' },
];

/* One with a category and one without, because `?category=` WIDENS: the server
 * returns the matching templates PLUS the general ones, measured. A fixture with
 * only categorised templates cannot show that. */
const REPLIES: CannedReplySummary[] = [
  { id: 'r-1', title: 'طلب كشف حساب', body: 'نحتاج صورة من كشف الحساب.', category: 'Billing' },
  { id: 'r-2', title: 'تأكيد استلام الشكوى', body: 'وصلتنا شكواك.', category: null },
];

const mounted = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/tickets/${ID}`]}>
          <Routes>
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
};

/* `ApiError(problem, contentLanguage)` — the status is read OFF the problem
 * rather than passed beside it, so a test cannot construct one that disagrees
 * with itself. Read from the class; the first version of this file guessed
 * `(status, problem)` and `tsc` said so four times. */
/** The button for one transition, named as the catalogue names it. */
const moveTo = (status: string) =>
  i18n.t('tickets:detail.moveTo', { status: i18n.t(`tickets:status.${status}`) });

const problem = (status: number, type: string, over: Record<string, unknown> = {}) =>
  new ApiError(
    { type: `https://wasl.local/${type}`, title: 'x', status, ...over } as never,
    null,
  );

const conflict = () => problem(409, 'errors/concurrency-conflict');

beforeEach(() => {
  vi.mocked(getTicket).mockReset().mockResolvedValue(ticket());
  vi.mocked(getTicketTimeline).mockReset().mockResolvedValue(timeline());
  vi.mocked(getSupportUsers).mockReset().mockResolvedValue(USERS);
  vi.mocked(addTicketComment).mockReset().mockResolvedValue({} as never);
  vi.mocked(changeTicketStatus).mockReset().mockResolvedValue({} as never);
  vi.mocked(changeTicketAssignee).mockReset().mockResolvedValue({} as never);
  vi.mocked(getTags).mockReset().mockResolvedValue(TAGS);
  vi.mocked(getCannedReplies).mockReset().mockResolvedValue(REPLIES);
  vi.mocked(attachTicketTag).mockReset().mockResolvedValue({} as never);
  vi.mocked(detachTicketTag).mockReset().mockResolvedValue({} as never);
});

describe('AC-1 — the page reads the ticket and nothing renders one from a write', () => {
  it('renders the ticket the READ returned', async () => {
    mounted();

    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());
    expect(screen.getByText('لا يمكنني تسجيل الدخول إلى الحساب')).toBeInTheDocument();
  });

  /* The rule that made `assigneeName` a backend fix rather than a client
   * workaround (`026` §5): a write response is what the server HAD, not what it
   * stored, and the two already differ by four digits of a timestamp. */
  it('refetches after a write instead of seeding the cache from the response', async () => {
    mounted();
    /* WAIT FOR THE RENDER, not for the mock call. A resolved query is not a
     * painted screen, and four tests here failed looking for a control while the
     * page was still its skeleton — the mock had been called and React had not
     * committed. */
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());
    expect(getTicket).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: moveTo('InProgress') }));

    await waitFor(() => expect(changeTicketStatus).toHaveBeenCalled());
    await waitFor(() => expect(getTicket).toHaveBeenCalledTimes(2));
  });
});

describe('AC-2 — only allowedTransitions render, and an empty array renders none', () => {
  it('offers exactly what the server sent', async () => {
    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: moveTo('InProgress') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: moveTo('Closed') })).toBeInTheDocument();

    /* The decoy. `Open` is a real status and is NOT in allowedTransitions, so a
     * control for it would be a control whose only outcome is a 409. Without
     * this line the test passes on a page that renders all six. */
    expect(screen.queryByRole('button', { name: moveTo('Open') })).not.toBeInTheDocument();
  });

  /* Asserted with `[]`, not only with a populated array — `027` AC-2 says so, and
   * it is the `Closed` case: terminal, BR-1.5. */
  it('renders no status control at all for a Closed ticket', async () => {
    vi.mocked(getTicket).mockResolvedValue(ticket({ status: 'Closed', allowedTransitions: [] }));

    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    for (const status of ['InProgress', 'Closed', 'Open', 'Resolved']) {
      expect(screen.queryByRole('button', { name: moveTo(status) })).not.toBeInTheDocument();
    }
  });

  /* Closed is terminal for comments too, so the composer is ABSENT rather than
   * disabled: a disabled box invites a reader to hunt for what would enable it. */
  it('renders no composer for a Closed ticket', async () => {
    vi.mocked(getTicket).mockResolvedValue(ticket({ status: 'Closed', allowedTransitions: [] }));

    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    expect(screen.queryByLabelText(i18n.t('tickets:detail.comment'))).not.toBeInTheDocument();
  });
});

describe('BR-1.2 — closing work that was never started asks for a reason first', () => {
  /* `allowedTransitions` does NOT say so: New → Closed and Open → Closed are both
   * permitted and both answer 400 with errors.note when the note is absent.
   * Sending it bare would surface a validation error naming a field the reader was
   * never shown. */
  it('does not send the transition until a note is typed', async () => {
    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: moveTo('Closed') }));

    expect(changeTicketStatus).not.toHaveBeenCalled();

    const note = screen.getByLabelText(i18n.t('tickets:detail.note'));
    await userEvent.type(note, 'مكرر');
    await userEvent.click(screen.getByRole('button', { name: i18n.t('tickets:detail.confirm') }));

    await waitFor(() =>
      expect(changeTicketStatus).toHaveBeenCalledWith(
        ID,
        expect.objectContaining({ status: 'Closed', note: 'مكرر' }),
      ),
    );
  });

  /* Resolved → Closed deliberately does NOT need one: `012` Q-1 ruled that asking
   * for a reason for the expected outcome trains people to type nothing useful. */
  it('sends Resolved → Closed immediately, with no note demanded', async () => {
    vi.mocked(getTicket).mockResolvedValue(
      ticket({ status: 'Resolved', allowedTransitions: ['InProgress', 'Closed'] }),
    );

    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: moveTo('Closed') }));

    await waitFor(() => expect(changeTicketStatus).toHaveBeenCalled());
    expect(screen.queryByLabelText(i18n.t('tickets:detail.note'))).not.toBeInTheDocument();
  });
});

describe('AC-6 — expectedVersion comes from the read, and AC-4/AC-5 keep the answers apart', () => {
  it('sends the version the ticket carried', async () => {
    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: moveTo('InProgress') }));

    await waitFor(() =>
      expect(changeTicketStatus).toHaveBeenCalledWith(
        ID,
        expect.objectContaining({ expectedVersion: 'AAAAAAAAB+4=' }),
      ),
    );
  });

  /* AC-4. Refetch and say what happened — and NEVER retry: the second write would
   * apply to a state the reader never saw. */
  it('a 409 says what happened, refetches, and does not retry', async () => {
    vi.mocked(changeTicketStatus).mockRejectedValue(conflict());

    mounted();
    /* WAIT FOR THE RENDER, not for the mock call. A resolved query is not a
     * painted screen, and four tests here failed looking for a control while the
     * page was still its skeleton — the mock had been called and React had not
     * committed. */
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());
    expect(getTicket).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: moveTo('InProgress') }));

    await waitFor(() =>
      expect(screen.getByText(i18n.t('tickets:detail.conflictTitle'))).toBeInTheDocument(),
    );

    expect(changeTicketStatus).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getTicket).toHaveBeenCalledTimes(2));
  });

  /* AC-5. A 400 on expectedVersion is a bug in this client — a user cannot cause
   * it and cannot fix it, so "try again" would be a lie. */
  it('a 400 is shown as a client defect, not as a recoverable error', async () => {
    vi.mocked(changeTicketStatus).mockRejectedValue(
      /* The server's detail is "expectedVersion is required" — accurate, and
         meaningless to a reader who never typed a version. The page shows the
         catalogue's body instead, which says it is a fault in the application. */
      problem(400, 'errors/validation', { detail: 'expectedVersion is required.' }),
    );

    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: moveTo('InProgress') }));

    await waitFor(() =>
      expect(
        screen.getByText(i18n.t('tickets:detail.versionRejectedTitle')),
      ).toBeInTheDocument(),
    );

    /* The two must not share a message. Collapsing them throws away the only one
     * the reader can act on. */
    expect(screen.queryByText(i18n.t('tickets:detail.conflictTitle'))).not.toBeInTheDocument();
  });
});

describe('AC-3 — the timeline is a cursor', () => {
  it('asks with a limit and no page number', async () => {
    mounted();

    await waitFor(() => expect(getTicketTimeline).toHaveBeenCalled());

    const params = vi.mocked(getTicketTimeline).mock.calls[0]?.[1];
    expect(params).toMatchObject({ limit: 50 });
    expect(params).not.toHaveProperty('page');
    expect(params).not.toHaveProperty('pageSize');
    expect(params).not.toHaveProperty('before');
  });

  it('loads earlier entries with the cursor it was given, never a derived one', async () => {
    vi.mocked(getTicketTimeline).mockResolvedValueOnce(
      timeline({ items: [entry({ id: 'e-2', cursor: 'c-2' })], hasMore: true, nextCursor: 'CURSOR-B' }),
    );

    mounted();
    await waitFor(() =>
      expect(screen.getByText(i18n.t('tickets:detail.loadEarlier'))).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText(i18n.t('tickets:detail.loadEarlier')));

    await waitFor(() =>
      expect(vi.mocked(getTicketTimeline).mock.calls.at(-1)?.[1]).toMatchObject({
        before: 'CURSOR-B',
      }),
    );
  });

  it('offers no load-earlier control when the server says there is no more', async () => {
    mounted();
    await waitFor(() => expect(getTicketTimeline).toHaveBeenCalled());

    expect(screen.queryByText(i18n.t('tickets:detail.loadEarlier'))).not.toBeInTheDocument();
  });
});

describe('the comment composer', () => {
  it('sends the body and the internal flag, then clears', async () => {
    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    const box = screen.getByLabelText(i18n.t('tickets:detail.comment'));
    await userEvent.type(box, 'رد على العميل');
    await userEvent.click(screen.getByLabelText(i18n.t('tickets:detail.markInternal')));
    await userEvent.click(screen.getByRole('button', { name: i18n.t('tickets:detail.send') }));

    await waitFor(() =>
      expect(addTicketComment).toHaveBeenCalledWith(ID, {
        body: 'رد على العميل',
        isInternal: true,
      }),
    );

    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('will not send an empty body', async () => {
    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: i18n.t('tickets:detail.send') })).toBeDisabled();
  });
});

describe('AC-7 — the assignee picker lists the server’s users and the server decides', () => {
  it('offers every support user, including for an Agent', async () => {
    mounted();
    /* WAIT FOR THE RENDER, not for the mock call. A resolved query is not a
     * painted screen, and four tests here failed looking for a control while the
     * page was still its skeleton — the mock had been called and React had not
     * committed. */
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());
    expect(getSupportUsers).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('combobox', { name: i18n.t('tickets:detail.assign') }));

    expect(screen.getByRole('option', { name: /منى العتيبي/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Omar Khalid/ })).toBeInTheDocument();
  });

  it('sends the version with the assignment too', async () => {
    mounted();
    /* WAIT FOR THE RENDER, not for the mock call. A resolved query is not a
     * painted screen, and four tests here failed looking for a control while the
     * page was still its skeleton — the mock had been called and React had not
     * committed. */
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());
    expect(getSupportUsers).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('combobox', { name: i18n.t('tickets:detail.assign') }));
    await userEvent.click(screen.getByRole('option', { name: /Omar Khalid/ }));

    await waitFor(() =>
      expect(changeTicketAssignee).toHaveBeenCalledWith(ID, {
        assigneeId: 'u-2',
        expectedVersion: 'AAAAAAAAB+4=',
      }),
    );
  });
});

describe('the states a reader can actually reach', () => {
  it('a 404 offers the way back rather than a retry', async () => {
    vi.mocked(getTicket).mockRejectedValue(problem(404, 'errors/not-found'));

    mounted();

    await waitFor(() =>
      expect(screen.getByText(i18n.t('tickets:detail.notFoundTitle'))).toBeInTheDocument(),
    );
    expect(screen.getByText(i18n.t('tickets:detail.backToList'))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('tickets:detail.retry'))).not.toBeInTheDocument();
  });

  it('any other failure offers a retry rather than the way back', async () => {
    vi.mocked(getTicket).mockRejectedValue(problem(500, 'errors/internal'));

    mounted();

    await waitFor(() =>
      expect(screen.getByText(i18n.t('tickets:detail.errorTitle'))).toBeInTheDocument(),
    );
    expect(screen.getByText(i18n.t('tickets:detail.retry'))).toBeInTheDocument();
  });
});

describe("`034`'s tags — the read half it shipped without", () => {
  const rendered = async () =>
    waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

  it('says so when a ticket has none, rather than showing an empty row', async () => {
    mounted();
    await rendered();

    expect(screen.getByText(i18n.t('tickets:detail.noTags'))).toBeInTheDocument();
  });

  it('renders the tags the READ returned', async () => {
    vi.mocked(getTicket).mockResolvedValue(ticket({ tags: TAGS }));

    mounted();
    await rendered();

    expect(screen.getByText('استرداد')).toBeInTheDocument();
    expect(screen.getByText('خصم مزدوج')).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('tickets:detail.noTags'))).not.toBeInTheDocument();
  });

  /* Offering a tag the ticket already carries is offering a write whose outcome the
   * server has already applied. The decoy is the attached one. */
  it('offers only the tags not already attached', async () => {
    vi.mocked(getTicket).mockResolvedValue(ticket({ tags: [TAGS[0]!] }));

    mounted();
    await rendered();

    await userEvent.click(screen.getByRole('combobox', { name: i18n.t('tickets:detail.addTag') }));

    expect(screen.getByRole('option', { name: 'خصم مزدوج' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'استرداد' })).not.toBeInTheDocument();
  });

  it('attaches, then refetches rather than seeding the cache', async () => {
    mounted();
    await rendered();
    expect(getTicket).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('combobox', { name: i18n.t('tickets:detail.addTag') }));
    await userEvent.click(screen.getByRole('option', { name: 'استرداد' }));

    await waitFor(() => expect(attachTicketTag).toHaveBeenCalledWith(ID, 't-1'));
    await waitFor(() => expect(getTicket).toHaveBeenCalledTimes(2));
  });

  /* Both directions. An attach that worked proves nothing about a detach, and the
   * remove control is a different element with a different name. */
  it('detaches through a control named after the tag it removes', async () => {
    vi.mocked(getTicket).mockResolvedValue(ticket({ tags: [TAGS[0]!] }));

    mounted();
    await rendered();

    await userEvent.click(
      screen.getByRole('button', {
        name: i18n.t('tickets:detail.removeTag', { name: 'استرداد' }),
      }),
    );

    await waitFor(() => expect(detachTicketTag).toHaveBeenCalledWith(ID, 't-1'));
  });

  /* The vocabulary is not a ticket. Invalidating a ticket must not refetch a
   * seeded, bounded set that did not change. */
  it('does not refetch the vocabulary when the ticket is invalidated', async () => {
    mounted();
    await rendered();
    expect(getTags).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: moveTo('InProgress') }));
    await waitFor(() => expect(getTicket).toHaveBeenCalledTimes(2));

    expect(getTags).toHaveBeenCalledTimes(1);
  });
});

describe("`034`'s reply templates", () => {
  const rendered = async () =>
    waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

  it('asks for the templates that apply to this ticket', async () => {
    mounted();
    await rendered();

    await waitFor(() => expect(getCannedReplies).toHaveBeenCalled());
    expect(vi.mocked(getCannedReplies).mock.calls[0]?.[0]).toBe('Technical');
  });

  /* INSERTS, does not send. A template is a starting point, and a picker that sent
   * it would post an unedited form letter with one click. */
  it('inserts the body into the draft and sends nothing', async () => {
    mounted();
    await rendered();

    /* findByRole, not getByRole. The picker renders only once the templates have
     * arrived, so waiting for the TICKET is not waiting for this control — the
     * same slip that failed four tests earlier in this file. */
    await userEvent.click(
      await screen.findByRole('combobox', { name: i18n.t('tickets:detail.useTemplate') }),
    );
    await userEvent.click(screen.getByRole('option', { name: /طلب كشف حساب/ }));

    await waitFor(() =>
      expect(screen.getByLabelText(i18n.t('tickets:detail.comment'))).toHaveValue(
        'نحتاج صورة من كشف الحساب.',
      ),
    );

    expect(addTicketComment).not.toHaveBeenCalled();
  });

  /* A template with no category applies to every ticket, and the server returns
   * those alongside the matching ones. The picker must label the difference — an
   * unlabelled general template reads as one that was miscategorised. */
  it('labels a template with no category as applying to every category', async () => {
    mounted();
    await rendered();

    /* findByRole, not getByRole. The picker renders only once the templates have
     * arrived, so waiting for the TICKET is not waiting for this control — the
     * same slip that failed four tests earlier in this file. */
    await userEvent.click(
      await screen.findByRole('combobox', { name: i18n.t('tickets:detail.useTemplate') }),
    );

    expect(
      screen.getByRole('option', { name: new RegExp(i18n.t('tickets:detail.templateGeneral')) }),
    ).toBeInTheDocument();
  });

  it('renders no picker at all when the server offers nothing', async () => {
    vi.mocked(getCannedReplies).mockResolvedValue([]);

    mounted();
    await rendered();

    await waitFor(() => expect(getCannedReplies).toHaveBeenCalled());

    expect(
      screen.queryByRole('combobox', { name: i18n.t('tickets:detail.useTemplate') }),
    ).not.toBeInTheDocument();
  });
});
