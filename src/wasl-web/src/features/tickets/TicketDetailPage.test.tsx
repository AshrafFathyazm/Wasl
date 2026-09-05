import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../components/Toast/ToastHost';
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

    /* The rail's "their other tickets" is the LIST endpoint with `?customerId=` —
     * no new endpoint and no new contract, and `010` has accepted the parameter
     * the whole time. Mocked here for the reason `countTickets` is mocked in the
     * list's tests: left real it would put an unstubbed request behind every
     * render in this file. */
    listTickets: vi.fn(),
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
  listTickets,
} = await import('./tickets.api');
const { default: TicketDetailPage, tint } = await import('./TicketDetailPage');

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
  {
    id: 'r-1',
    title: 'طلب كشف حساب',
    body: 'نحتاج صورة من كشف الحساب.',
    category: 'Billing',
  },
  { id: 'r-2', title: 'تأكيد استلام الشكوى', body: 'وصلتنا شكواك.', category: null },
];

/* THE TOAST PROVIDER IS PART OF THE HARNESS, not a convenience.
 *
 * `AppShell` mounts it around every authenticated route, so a page that fires a
 * toast always has one in production. `useToast` THROWS rather than returning a
 * no-op when it is missing — twelve tests here went red on that the moment the
 * `403` moved from a banner to a toast, which is the behaviour the throw is for:
 * a silent no-op is a failure the user never sees, because the write succeeded,
 * the toast was requested, and nothing appeared. */
const mounted = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/tickets/${ID}`]}>
            <Routes>
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
};

/* `ApiError(problem, contentLanguage)` — the status is read OFF the problem
 * rather than passed beside it, so a test cannot construct one that disagrees
 * with itself. Read from the class; the first version of this file guessed
 * `(status, problem)` and `tsc` said so four times. */
/** One transition, named as the MENU names it — the status alone. It read
 *  "Move to X" while the transitions lived in a take-action menu; the v3 canvas
 *  heads the menu «نقل الحالة إلى» once and lists the statuses under it, so the
 *  sentence is on the header rather than repeated on every row. */
const moveTo = (status: string) => i18n.t(`tickets:status.${status}`);

/**
 * Opens the take-action MENU and picks a transition.
 *
 * The transitions were inline buttons until the screen was rebuilt on the
 * approved preview. `027` Q-3 ruled a MENU — "controls that appear and disappear
 * per state read as a broken toolbar" — and the first version of this page
 * contradicted that ruling, which a screenshot showed and no test could.
 */
/* FOUND BY `aria-haspopup`, not by its label — because its label IS the current
 * status, so a name-based query would have to know the fixture's status and
 * would break on every test that overrides it. One trigger now: the sticky bar
 * went with the take-action menu it existed to repeat. */
const statusTrigger = () =>
  /* QUERY, not get: the Closed case asserts there are NONE, and `getAllByRole`
     throws on an empty result rather than returning one. */
  screen.queryAllByRole('button', {
    name: (_name, element) => element.getAttribute('aria-haspopup') === 'menu',
  });

const openActions = async () => userEvent.click(statusTrigger()[0]!);

const chooseTransition = async (status: string) => {
  await openActions();
  await userEvent.click(screen.getByRole('menuitem', { name: moveTo(status) }));
};

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
  vi.mocked(addTicketComment)
    .mockReset()
    .mockResolvedValue({} as never);
  vi.mocked(changeTicketStatus)
    .mockReset()
    .mockResolvedValue({} as never);
  vi.mocked(changeTicketAssignee)
    .mockReset()
    .mockResolvedValue({} as never);
  vi.mocked(getTags).mockReset().mockResolvedValue(TAGS);
  vi.mocked(getCannedReplies).mockReset().mockResolvedValue(REPLIES);
  vi.mocked(attachTicketTag)
    .mockReset()
    .mockResolvedValue({} as never);
  vi.mocked(detachTicketTag)
    .mockReset()
    .mockResolvedValue({} as never);

  /* An EMPTY page by default, so the rail's sibling block is absent unless a test
   * puts something in it — a fixture that always returned rows would make "leaves
   * this ticket out" pass on a screen that renders no siblings at all. */
  vi.mocked(listTickets)
    .mockReset()
    .mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 4,
      totalCount: 0,
      totalPages: 0,
    } as never);
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

    await chooseTransition('InProgress');

    await waitFor(() => expect(changeTicketStatus).toHaveBeenCalled());
    await waitFor(() => expect(getTicket).toHaveBeenCalledTimes(2));
  });
});

describe('AC-2 — only allowedTransitions render, and an empty array renders none', () => {
  it('offers exactly what the server sent', async () => {
    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    await openActions();

    expect(
      screen.getByRole('menuitem', { name: moveTo('InProgress') }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: moveTo('Closed') })).toBeInTheDocument();

    /* The decoy. `Open` is a real status and is NOT in allowedTransitions, so a
     * control for it would be a control whose only outcome is a 409. Without
     * this line the test passes on a page that renders all six. */
    expect(
      screen.queryByRole('menuitem', { name: moveTo('Open') }),
    ).not.toBeInTheDocument();
  });

  /* THE CURRENT STATUS IS SHOWN AND IS NOT ACTIONABLE — the v3 canvas draws it
   * ticked at the head of the list. It is absent from `allowedTransitions`
   * because a same-status transition is a `409`, not a no-op, so it is rendered
   * from `status` and must NOT be a menuitem: a reader who picks it gets a
   * conflict for having chosen where they already are. */
  it('shows the current status in the menu, ticked, and not as an item', async () => {
    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());
    await openActions();

    const menu = screen.getByRole('menu');
    expect(within(menu).getByText(i18n.t('tickets:status.Open'))).toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', { name: i18n.t('tickets:status.Open') }),
    ).not.toBeInTheDocument();
  });

  /* Asserted with `[]`, not only with a populated array — `027` AC-2 says so, and
   * it is the `Closed` case: terminal, BR-1.5. */
  it('renders no status control at all for a Closed ticket', async () => {
    vi.mocked(getTicket).mockResolvedValue(
      ticket({ status: 'Closed', allowedTransitions: [] }),
    );

    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    /* No trigger AT ALL for a Closed ticket — `allowedTransitions` is `[]`, so
       neither the top bar nor the sticky bar offers one. Asserting the absence of
       the TRIGGER is stronger than asserting the absence of the items: a menu
       nobody can open would still pass the second. */
    /* The pill renders as TEXT, not as a disabled button: a disabled control
       invites a reader to hunt for what would enable it, and nothing will. */
    expect(statusTrigger()).toHaveLength(0);
    expect(screen.getByText(i18n.t('tickets:status.Closed'))).toBeInTheDocument();
  });

  /* Closed is terminal for comments too, so the composer is ABSENT rather than
   * disabled: a disabled box invites a reader to hunt for what would enable it. */
  it('renders no composer for a Closed ticket', async () => {
    vi.mocked(getTicket).mockResolvedValue(
      ticket({ status: 'Closed', allowedTransitions: [] }),
    );

    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    expect(
      screen.queryByLabelText(i18n.t('tickets:detail.comment')),
    ).not.toBeInTheDocument();
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

    await chooseTransition('Closed');

    expect(changeTicketStatus).not.toHaveBeenCalled();

    const note = screen.getByLabelText(i18n.t('tickets:detail.note'));
    await userEvent.type(note, 'مكرر');
    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('tickets:detail.confirm') }),
    );

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

    await chooseTransition('Closed');

    await waitFor(() => expect(changeTicketStatus).toHaveBeenCalled());
    expect(
      screen.queryByLabelText(i18n.t('tickets:detail.note')),
    ).not.toBeInTheDocument();
  });
});

describe('AC-6 — expectedVersion comes from the read, and AC-4/AC-5 keep the answers apart', () => {
  it('sends the version the ticket carried', async () => {
    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    await chooseTransition('InProgress');

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

    await chooseTransition('InProgress');

    await waitFor(() =>
      expect(
        screen.getByText(i18n.t('tickets:detail.conflictTitle')),
      ).toBeInTheDocument(),
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

    await chooseTransition('InProgress');

    await waitFor(() =>
      expect(
        screen.getByText(i18n.t('tickets:detail.versionRejectedTitle')),
      ).toBeInTheDocument(),
    );

    /* The two must not share a message. Collapsing them throws away the only one
     * the reader can act on. */
    expect(
      screen.queryByText(i18n.t('tickets:detail.conflictTitle')),
    ).not.toBeInTheDocument();
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

  /* «تحميل الأقدم» AT THE FOOT, because the v3 canvas labels the feed «الأحدث
   * أولاً» — which reverses `027` Q-2's "newest at the bottom, load earlier
   * above". The CLAIM is untouched and is the one `013` measured: the cursor the
   * server sent, never one derived from an entry. */
  it('loads older entries with the cursor it was given, never a derived one', async () => {
    vi.mocked(getTicketTimeline).mockResolvedValueOnce(
      timeline({
        items: [entry({ id: 'e-2', cursor: 'c-2' })],
        hasMore: true,
        nextCursor: 'CURSOR-B',
      }),
    );

    mounted();
    await waitFor(() =>
      expect(screen.getByText(i18n.t('tickets:detail.loadOlder'))).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText(i18n.t('tickets:detail.loadOlder')));

    await waitFor(() =>
      expect(vi.mocked(getTicketTimeline).mock.calls.at(-1)?.[1]).toMatchObject({
        before: 'CURSOR-B',
      }),
    );
  });

  it('offers no load-older control when the server says there is no more', async () => {
    mounted();
    await waitFor(() => expect(getTicketTimeline).toHaveBeenCalled());

    expect(
      screen.queryByText(i18n.t('tickets:detail.loadOlder')),
    ).not.toBeInTheDocument();
  });
});

describe('the comment composer', () => {
  it('sends the body and the internal flag, then clears', async () => {
    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

    const box = screen.getByLabelText(i18n.t('tickets:detail.comment'));
    await userEvent.type(box, 'رد على العميل');
    /* A SWITCH, not a checkbox: it is not a field being submitted, it is the mode
       the next comment is written in — and the hint under it changes with the
       mode, which is the only place a reader learns what internal means. */
    await userEvent.click(
      screen.getByRole('switch', { name: i18n.t('tickets:detail.markInternal') }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('tickets:detail.send') }),
    );

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

    expect(
      screen.getByRole('button', { name: i18n.t('tickets:detail.send') }),
    ).toBeDisabled();
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

    /* A PANEL, not a Dropdown — the v3 canvas gives it a title, a search box and
       a footer note, and the rows carry an avatar and the role. The rows are
       buttons; there is no listbox and no option role. */
    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('tickets:detail.assign') }),
    );

    expect(screen.getByRole('button', { name: /منى العتيبي/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Omar Khalid/ })).toBeInTheDocument();
  });

  it('sends the version with the assignment too', async () => {
    mounted();
    /* WAIT FOR THE RENDER, not for the mock call. A resolved query is not a
     * painted screen, and four tests here failed looking for a control while the
     * page was still its skeleton — the mock had been called and React had not
     * committed. */
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());
    expect(getSupportUsers).toHaveBeenCalled();

    /* A PANEL, not a Dropdown — the v3 canvas gives it a title, a search box and
       a footer note, and the rows carry an avatar and the role. The rows are
       buttons; there is no listbox and no option role. */
    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('tickets:detail.assign') }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Omar Khalid/ }));

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
      expect(
        screen.getByText(i18n.t('tickets:detail.notFoundTitle')),
      ).toBeInTheDocument(),
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

  /* THE «لا وسوم» SENTENCE IS GONE, and this is the test that used to assert it.
   *
   * The v3 canvas draws the tag row as chips followed by «+ وسم» and nothing
   * else — so a ticket with no tags shows the add control alone, which says the
   * same thing in the place the reader would act. The claim that survives is the
   * one that mattered: no empty row, and never a chip with no name. */
  it('renders the add control and no chips when a ticket has none', async () => {
    mounted();
    await rendered();

    expect(
      screen.getByRole('button', { name: i18n.t('tickets:detail.addTag') }),
    ).toBeInTheDocument();
    expect(screen.queryByText('استرداد')).not.toBeInTheDocument();
    expect(screen.queryByText('خصم مزدوج')).not.toBeInTheDocument();
  });

  it('renders the tags the READ returned', async () => {
    vi.mocked(getTicket).mockResolvedValue(ticket({ tags: TAGS }));

    mounted();
    await rendered();

    expect(screen.getByText('استرداد')).toBeInTheDocument();
    expect(screen.getByText('خصم مزدوج')).toBeInTheDocument();
  });

  /* Offering a tag the ticket already carries is offering a write whose outcome the
   * server has already applied. The decoy is the attached one. */
  it('offers only the tags not already attached', async () => {
    vi.mocked(getTicket).mockResolvedValue(ticket({ tags: [TAGS[0]!] }));

    mounted();
    await rendered();

    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('tickets:detail.addTag') }),
    );

    expect(screen.getByRole('menuitem', { name: 'خصم مزدوج' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'استرداد' })).not.toBeInTheDocument();
  });

  it('attaches, then refetches rather than seeding the cache', async () => {
    mounted();
    await rendered();
    expect(getTicket).toHaveBeenCalledTimes(1);

    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('tickets:detail.addTag') }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'استرداد' }));

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

    await chooseTransition('InProgress');
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
      await screen.findByRole('button', { name: i18n.t('tickets:detail.useTemplate') }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /طلب كشف حساب/ }));

    await waitFor(() =>
      expect(screen.getByLabelText(i18n.t('tickets:detail.comment'))).toHaveValue(
        'نحتاج صورة من كشف الحساب.',
      ),
    );

    expect(addTicketComment).not.toHaveBeenCalled();
  });

  /* A template with no category applies to every ticket, and the server returns
   * those alongside the matching ones.
   *
   * THE PER-ROW «كل التصنيفات» LABEL IS GONE: the v3 canvas heads the menu
   * «ردود جاهزة · الفاتورة» once and gives each row its title and a clipped line
   * of its body, which is what tells two acknowledgements apart. So the claim
   * moves to where the canvas put it — the header names the SCOPE, and the
   * general template is listed inside it rather than marked as an exception. */
  it('heads the menu with the ticket’s category and lists the general template too', async () => {
    mounted();
    await rendered();

    /* findByRole, not getByRole. The picker renders only once the templates have
     * arrived, so waiting for the TICKET is not waiting for this control — the
     * same slip that failed four tests earlier in this file. */
    await userEvent.click(
      await screen.findByRole('button', { name: i18n.t('tickets:detail.useTemplate') }),
    );

    const menu = screen.getByRole('menu');
    expect(
      within(menu).getByText(new RegExp(i18n.t('tickets:category.Technical'))),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: /تأكيد استلام الشكوى/ }),
    ).toBeInTheDocument();
  });

  it('renders no picker at all when the server offers nothing', async () => {
    vi.mocked(getCannedReplies).mockResolvedValue([]);

    mounted();
    await rendered();

    await waitFor(() => expect(getCannedReplies).toHaveBeenCalled());

    expect(
      screen.queryByRole('button', { name: i18n.t('tickets:detail.useTemplate') }),
    ).not.toBeInTheDocument();
  });
});

/*
 * =============================================================================
 * THE V3 CANVAS, AND THE FIVE REGIONS THAT HAVE NO BACKEND
 * =============================================================================
 * The product owner's rule, 2026-09-01: build the columns the backend has, and
 * treat anything without a counterpart as absent from the design.
 *
 * Everything below is either a region v3 ADDED that is genuinely backed — the
 * two tabs, the customer's other tickets, the company name, the 403 — or the
 * guard that keeps the unbacked five out. The guard is the unusual one and it is
 * the one this instruction actually needs: nothing else in the suite can fail
 * when somebody draws an SLA countdown from a field that does not exist.
 */
describe('the two tabs, and the counts that label them', () => {
  const rendered = async () =>
    waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

  it('asks for the comments first, by type and not by filtering in the client', async () => {
    mounted();
    await waitFor(() => expect(getTicketTimeline).toHaveBeenCalled());

    expect(vi.mocked(getTicketTimeline).mock.calls[0]?.[1]).toMatchObject({
      type: 'Comments',
    });
  });

  it('asks the SERVER for the history when that tab is picked', async () => {
    mounted();
    await rendered();

    await userEvent.click(
      screen.getByRole('tab', { name: new RegExp(i18n.t('tickets:detail.tabHistory')) }),
    );

    /* A SECOND REQUEST, not a client-side split of the first. The endpoint takes
       `?type=`, the counts differ per tab, and each tab pages on its own cursor —
       splitting one merged page in the browser would give both tabs the same
       cursor and the wrong totals. */
    await waitFor(() =>
      expect(vi.mocked(getTicketTimeline).mock.calls.at(-1)?.[1]).toMatchObject({
        type: 'History',
      }),
    );
  });

  it('labels BOTH tabs from one response', async () => {
    vi.mocked(getTicketTimeline).mockResolvedValue(
      timeline({ commentCount: 12, historyCount: 88 }),
    );

    mounted();
    await rendered();

    /* `034` returns both totals on either request, so the inactive tab is
       labelled without a second fetch — and 88 beside a tab nobody has opened is
       the proof it came from this response. */
    const comments = screen.getByRole('tab', {
      name: new RegExp(i18n.t('tickets:detail.tabComments')),
    });
    const history = screen.getByRole('tab', {
      name: new RegExp(i18n.t('tickets:detail.tabHistory')),
    });
    expect(within(comments).getByText('12')).toBeInTheDocument();
    expect(within(history).getByText('88')).toBeInTheDocument();
  });

  /* BR-8.13. Latin digits in both languages: a count is a number a reader quotes
   * to somebody else, and the interface language here is Arabic. */
  it('renders the counts in Latin digits', async () => {
    vi.mocked(getTicketTimeline).mockResolvedValue(
      timeline({ commentCount: 12, historyCount: 88 }),
    );

    mounted();
    await rendered();

    expect(screen.getByRole('tab', { name: /12/ })).toBeInTheDocument();
    expect(screen.queryByText('١٢')).not.toBeInTheDocument();
  });

  /* NEWEST FIRST, and this test was the wrong way round until a screenshot said
   * so — it asserted "the server's order, untouched", which was my assumption
   * about the server rather than a measurement of it.
   *
   *   GET …/timeline?limit=4&type=History  →  08:51 · 08:52 · 08:52 · 08:53
   *
   * ASCENDING: the SQL orders DESC and the handler hands the page back
   * oldest-first, which is `013` Q-2's chat order. The v3 canvas labels the strip
   * «الأحدث أولاً», so the client flips it — and the fixture below is written in
   * the server's order for that reason. */
  it('renders newest first, flipping the ascending page the server sends', async () => {
    vi.mocked(getTicketTimeline).mockResolvedValue(
      timeline({
        items: [
          entry({ id: 'oldest', type: 'Comment', body: 'الأقدم', cursor: 'c-2' }),
          entry({ id: 'newest', type: 'Comment', body: 'الأحدث', cursor: 'c-1' }),
        ],
      }),
    );

    mounted();
    await rendered();

    const bodies = screen.getAllByText(/الأحدث|الأقدم/).map((node) => node.textContent);
    expect(bodies).toEqual(['الأحدث', 'الأقدم']);
  });

  /* THE HALF THE SINGLE-PAGE TEST CANNOT SEE. Reversing the flattened list
   * instead of each page puts the SECOND page's rows ahead of the first page's —
   * every row still present, every count right, and the feed silently out of
   * order the moment somebody presses «تحميل الأقدم». */
  it('keeps a second page strictly older than the first', async () => {
    vi.mocked(getTicketTimeline)
      .mockResolvedValueOnce(
        timeline({
          items: [
            entry({ id: 'b', type: 'Comment', body: 'ب', cursor: 'c-b' }),
            entry({ id: 'a', type: 'Comment', body: 'أ', cursor: 'c-a' }),
          ],
          hasMore: true,
          nextCursor: 'CURSOR-OLDER',
        }),
      )
      .mockResolvedValueOnce(
        timeline({
          items: [
            entry({ id: 'z', type: 'Comment', body: 'ز', cursor: 'c-z' }),
            entry({ id: 'y', type: 'Comment', body: 'ي', cursor: 'c-y' }),
          ],
        }),
      );

    mounted();
    await rendered();
    await userEvent.click(screen.getByText(i18n.t('tickets:detail.loadOlder')));

    await waitFor(() => {
      const bodies = screen.getAllByText(/^[أبزي]$/).map((node) => node.textContent);
      /* Page 1 newest→oldest, then page 2 newest→oldest. Never interleaved and
         never page 2 first. */
      expect(bodies).toEqual(['أ', 'ب', 'ي', 'ز']);
    });
  });
});

describe('the rail: the customer, their company, and their other tickets', () => {
  const rendered = async () =>
    waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

  it('shows the company name the server sends', async () => {
    vi.mocked(getTicket).mockResolvedValue(
      ticket({
        customer: {
          id: 'c-1',
          fullName: 'منيرة الدوسري',
          email: 'a@b.example',
          companyName: 'مؤسسة الرياض للتجارة',
        },
      }),
    );

    mounted();
    await rendered();

    /* MEASURED ON THE WIRE 2026-09-01 and absent from the provisional type until
       then — a field the server sends that no type declares is a field no screen
       can show. */
    expect(screen.getByText('مؤسسة الرياض للتجارة')).toBeInTheDocument();
  });

  it('asks for the customer’s other tickets by customerId', async () => {
    mounted();
    await rendered();

    await waitFor(() =>
      expect(vi.mocked(listTickets).mock.calls.at(-1)?.[0]).toMatchObject({
        customerId: 'c-1',
        pageSize: 4,
      }),
    );
  });

  it('leaves THIS ticket out of their other tickets', async () => {
    vi.mocked(listTickets).mockResolvedValue({
      items: [
        {
          id: ID,
          ticketNumber: 'TCK-2026-000042',
          subject: 'نفس التذكرة',
          status: 'Open',
        },
        {
          id: 'other',
          ticketNumber: 'TCK-2026-000038',
          subject: 'تأخر تسليم الطلب',
          status: 'New',
        },
      ],
      page: 1,
      pageSize: 4,
      totalCount: 2,
      totalPages: 1,
    } as never);

    mounted();
    await rendered();

    /* FOUR ARE FETCHED AND THREE ARE SHOWN, because one of the four is the ticket
       already on screen. Filtering after the fetch is what makes the count honest
       without a second request. */
    expect(await screen.findByText('تأخر تسليم الطلب')).toBeInTheDocument();
    expect(screen.queryByText('نفس التذكرة')).not.toBeInTheDocument();
  });
});

describe('a 403 is its own answer, not a failure', () => {
  it('says «read only» when the server refuses the write', async () => {
    vi.mocked(changeTicketStatus).mockRejectedValue(problem(403, 'errors/forbidden'));

    mounted();
    await waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());
    await chooseTransition('InProgress');

    /* BR-6: a data-dependent denial is a HANDLER denial, so it arrives as a 403
       with a body — and it is not the concurrency conflict and not the client
       defect. Three answers, three sentences; collapsing them into "it failed"
       throws away the only ones a reader can act on. */
    await waitFor(() =>
      expect(
        screen.getByText(i18n.t('tickets:detail.forbiddenTitle')),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(i18n.t('tickets:detail.conflictTitle')),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(i18n.t('tickets:detail.versionRejectedTitle')),
    ).not.toBeInTheDocument();
  });
});

/*
 * THE GUARD FOR THE INSTRUCTION, IN THE TWO HALVES IT ACTUALLY HAS.
 *
 * The rule was *"anything with no backend counterpart is absent from the
 * design"*, and the owner then refined it: draw the unbuilt actions, leave them
 * READ ONLY. Those are not in tension — the refinement is about a menu row,
 * which promises nothing until it is pressed. A DATA region is different: an SLA
 * countdown drawn from nothing is a fact the product does not have, and it looks
 * exactly like a working one.
 *
 * So the guard splits:
 *
 *   the SCREEN may draw an unbuilt ACTION, and it must be inert and say why
 *   the SCREEN must not draw an unbuilt FACT — no SLA, no due date, no mentions
 *   the CLIENT must have no fetcher for an endpoint that does not exist, which
 *     is what makes "inert" structural rather than a forgotten `disabled`
 */
describe('the unbuilt actions are drawn, inert, and unreachable', () => {
  const rendered = async () =>
    waitFor(() => expect(screen.getByText('TCK-2026-000042')).toBeInTheDocument());

  const openMenu = async () => {
    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('tickets:detail.takeAction') }),
    );
  };

  it.each(['escalate', 'merge', 'extendDue'])(
    '%s is present and disabled',
    async (key) => {
      mounted();
      await rendered();
      await openMenu();

      const item = screen.getByRole('menuitem', {
        name: i18n.t(`tickets:detail.action.${key}`),
      });
      expect(item).toBeDisabled();
      /* AND IT SAYS WHY. A control that refuses without a reason is the defect this
       screen was rebuilt to avoid, and `disabled` alone is exactly that. */
      expect(item).toHaveAttribute('title', i18n.t('tickets:detail.actionUnavailable'));
    },
  );

  it('offers Close as a live item when BR-1 allows it', async () => {
    mounted();
    await rendered();
    await openMenu();

    /* The fixture's `allowedTransitions` carries `Closed`. */
    const close = screen.getByRole('menuitem', {
      name: i18n.t('tickets:detail.action.close'),
    });
    expect(close).not.toBeDisabled();

    await userEvent.click(close);
    /* New → Closed and Open → Closed need BR-1.2's note first, and the fixture is
       Open — so the note field appears and NOTHING is sent yet. */
    expect(changeTicketStatus).not.toHaveBeenCalled();
    expect(screen.getByLabelText(i18n.t('tickets:detail.note'))).toBeInTheDocument();
  });

  it('disables Close when it is not a permitted transition', async () => {
    vi.mocked(getTicket).mockResolvedValue(
      ticket({ status: 'PendingCustomer', allowedTransitions: ['InProgress'] }),
    );

    mounted();
    await rendered();
    await openMenu();

    /* BR-1: PendingCustomer → Closed is not permitted. The row stays, so the menu
       does not change shape per status, and it refuses with its own reason. */
    const close = screen.getByRole('menuitem', {
      name: i18n.t('tickets:detail.action.close'),
    });
    expect(close).toBeDisabled();
    expect(close).toHaveAttribute('title', i18n.t('tickets:detail.closeNotAllowed'));
  });
});

describe('the unbuilt facts and endpoints are absent from the code', () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

  /** Comments stripped, strings kept. Hand-rolled: a regex cannot tell a comment
   *  from the same characters inside a string, and these files contain both. */
  const strip = (source: string) => {
    let out = '';
    let mode = 'code';
    for (let i = 0; i < source.length; i += 1) {
      const two = source.slice(i, i + 2);
      if (mode === 'code' && two === '/*') {
        mode = 'block';
        i += 1;
        continue;
      }
      if (mode === 'code' && two === '//') {
        mode = 'line';
        i += 1;
        continue;
      }
      if (mode === 'block' && two === '*/') {
        mode = 'code';
        i += 1;
        continue;
      }
      if (mode === 'line' && source[i] === '\n') {
        mode = 'code';
        out += '\n';
        continue;
      }
      if (mode === 'code') out += source[i];
    }
    return out;
  };

  const pageSrc = read('src/features/tickets/TicketDetailPage.tsx');
  const page = strip(pageSrc);
  const api = strip(read('src/features/tickets/tickets.api.ts'));

  it('strips comments, so the guard cannot pass on prose', () => {
    /* A NEGATIVE CONTROL FOR THE SCANNER. Both files explain the missing regions
       at length, so the stripped code must be materially shorter and must not
       contain a phrase that only ever appears in a comment. Without this, a
       scanner that silently returned '' would pass everything below. */
    expect(page.length).toBeGreaterThan(2000);
    expect(page.length).toBeLessThan(pageSrc.length * 0.85);
    expect(pageSrc.toLowerCase()).toContain('no due date');
    expect(page.toLowerCase()).not.toContain('no due date');
  });

  /* A SUBSTRING SEARCH FOR 'sla' FAILED ON `useTranslation` — t-r-a-n-s-l-a-t-i-o-n
   * contains it, and the guard went red on the import line of a page with no SLA
   * anywhere. The fix is a word-START boundary: `slaDueAtUtc` matches,
   * `translation` does not. The boundary is only on the left, deliberately —
   * `\bsla\b` would miss the identifier this exists to refuse. */
  it.each([
    [
      /\bsla/i,
      'no service level agreement exists in the domain: no field, no table, no setting',
    ],
    [
      /\bdueAt|\bdueIn|\bdueDate/i,
      'nothing carries a due date, so nothing can render one',
    ],
    [/firstResponse/i, 'first-response time does not exist'],
    [/\bmention/i, 'a comment has no mentions and there is no notification'],
    [/\bbreach/i, 'nothing can be breached without an SLA to breach'],
  ])('the page renders nothing matching %s — %s', (pattern) => {
    expect(page).not.toMatch(pattern);
  });

  /* THE HALF THAT MAKES "INERT" STRUCTURAL. A `disabled` attribute is one edit
   * away from being deleted; a fetcher that does not exist cannot be called by
   * one. So the three unbuilt actions have no client function at all — the menu
   * rows have no `onClick` to give them. */
  it.each([/escalateTicket/, /mergeTicket/, /extendDue/, /\/escalate/, /\/merge/])(
    'the api module exports nothing matching %s',
    (pattern) => {
      expect(api).not.toMatch(pattern);
    },
  );

  it('reads isEscalated and calls no escalate endpoint', () => {
    /* ESCALATION IS THE ONE THAT NEEDS CARE: `isEscalated` IS on the response and
       IS rendered, read-only. What must not exist is a way to change it. */
    expect(page).toContain('isEscalated');
    expect(page.toLowerCase()).not.toContain('escalateticket');
  });

  it('has no catalogue key for an unbuilt FACT', () => {
    const en = JSON.parse(read('src/locales/en/tickets.json')) as Record<string, string>;

    /* `detail.action.merge` and `detail.action.extendDue` are deliberately
       exempt — they label the inert rows the owner asked for. A key for the
       DATA those actions would produce is not exempt, and that is the
       distinction this test encodes rather than a blanket ban. */
    const offenders = Object.keys(en).filter(
      (key) =>
        !key.startsWith('detail.action.') && /sla|dueAt|dueIn|mention|breach/i.test(key),
    );
    expect(offenders).toEqual([]);
  });
});

/*
 * THE TINT HASH, AND THE COLLISION THAT WAS MEASURED BEFORE IT WAS FIXED.
 *
 * Colour on this screen is DERIVED — `TagSummary` is `(id, name)` and
 * `SupportUserOption` is `(id, fullName, role)`, so neither a tag nor a person
 * carries one. The owner ruled that they must differ anyway, which makes the hash
 * a load-bearing part of the design rather than a detail.
 *
 * It summed code units first, and that clusters on this alphabet: Arabic names
 * are built from a small set of letters. Two of the three seeded support users
 * landed in one bucket at four colours AND at five — measured against the running
 * server, not reasoned about. FNV-1a separates them.
 */
describe('the tint is derived from the name, and one name always gives one colour', () => {
  it('separates the two seeded agents that used to collide', () => {
    /* THE EXACT PAIR from the measurement. If somebody swaps the hash back for
       something simpler, this is the test that says what it costs. */
    expect(tint('نورة السالم', 5)).not.toBe(tint('منى العتيبي', 5));
  });

  it('is stable: the same name gives the same bucket every call', () => {
    /* The property the whole scheme rests on — a person is ONE colour in the rail,
       on every comment they wrote, and in the picker. Distinctness is the tags'
       rule; identity is this one, and they pull in opposite directions. */
    const once = tint('منى العتيبي', 5);
    expect(tint('منى العتيبي', 5)).toBe(once);
    expect(tint('منى العتيبي', 5)).toBe(once);
  });

  it('stays inside the palette, for any name and any size', () => {
    for (const name of ['', 'a', 'Omar Khalid', 'منيرة الدوسري', 'x'.repeat(400)]) {
      for (const buckets of [3, 5, 6]) {
        const value = tint(name, buckets);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(buckets);
      }
    }
  });

  it('uses every one of the five buckets over ten real names', () => {
    /* Ten over five MUST collide — pigeonhole — so the claim is about the
       DISTRIBUTION, which is the part a hash controls. The sum version used three
       of five buckets and put four names in one of them; this asserts the shape
       that replaced it, and it is the whole reason the hash changed. */
    const names = [
      'Omar Khalid',
      'نورة السالم',
      'منى العتيبي',
      'ليلى الحربي',
      'سارة المطيري',
      'خالد الشمري',
      'طلال القحطاني',
      'هند السالم',
      'ريم الدوسري',
      'منيرة الدوسري',
    ];
    const used = new Set(names.map((name) => tint(name, 5)));
    expect(used.size).toBe(5);
  });
});
