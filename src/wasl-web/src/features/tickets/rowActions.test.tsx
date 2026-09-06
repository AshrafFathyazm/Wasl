import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../components/Toast/ToastHost';
import type {
  PagedResult,
  SupportUser,
  TicketListItem,
  TicketResponse,
} from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';

/* ============================================================================
 * `039` — the two row actions, through the real list screen
 * ============================================================================
 * The panel's own properties are `AssigneePanel.test.tsx` and the modal's are
 * `CloseTicketModal.test.tsx`. What is only observable HERE is the join: that
 * the menu item acts instead of navigating, that the surface is fed the row it
 * was opened on, and that the toast arrives after the surface has gone.
 * ========================================================================= */

vi.mock('./tickets.api', async () => {
  const actual = await vi.importActual<typeof import('./tickets.api')>('./tickets.api');
  return {
    ...actual,
    listTickets: vi.fn(),
    countTickets: vi.fn(),
    getTicket: vi.fn(),
    getSupportUsers: vi.fn(),
    changeTicketAssignee: vi.fn(),
    changeTicketStatus: vi.fn(),
  };
});

const {
  listTickets,
  countTickets,
  getTicket,
  getSupportUsers,
  changeTicketAssignee,
  changeTicketStatus,
} = await import('./tickets.api');
const { default: TicketListPage } = await import('./TicketListPage');

const ROW: TicketListItem = {
  id: '8f1c2d34-5678-4abc-9def-0123456789ab',
  ticketNumber: 'TCK-2026-000042',
  subject: 'الفاتورة الشهرية لم تصل على البريد',
  customerId: '1b2c3d4e-5678-4abc-9def-0123456789ab',
  customerName: 'علي الأحمد',
  status: 'Open',
  priority: 'High',
  category: 'Billing',
  channel: 'Email',
  assigneeId: null,
  assigneeName: null,
  isEscalated: false,
  createdAtUtc: '2026-08-23T12:00:00Z',
};

const USERS: SupportUser[] = [
  { id: 'u-1', fullName: 'سعد الدوسري', role: 'Agent' },
  { id: 'u-2', fullName: 'منى العتيبي', role: 'Manager' },
];

const TICKET = {
  id: ROW.id,
  ticketNumber: ROW.ticketNumber,
  customer: { id: ROW.customerId, fullName: ROW.customerName, companyName: null },
  subject: ROW.subject,
  description: 'لم تصل الفاتورة.',
  category: 'Billing',
  priority: 'High',
  channel: 'Email',
  status: 'Open',
  assignedToUserId: null,
  assignee: null,
  isEscalated: false,
  allowedTransitions: ['InProgress', 'Closed'],
  tags: [],
  version: 'AAAAAAAAB9E=',
  createdAtUtc: ROW.createdAtUtc,
  updatedAtUtc: ROW.createdAtUtc,
} as unknown as TicketResponse;

const page = (): PagedResult<TicketListItem> => ({
  items: [ROW],
  page: 1,
  pageSize: 20,
  totalCount: 1,
  totalPages: 1,
});

function LocationProbe() {
  const { pathname } = useLocation();
  return <span data-testid="pathname">{pathname}</span>;
}

const mounted = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/tickets']}>
            <TicketListPage />
            <LocationProbe />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
};

const label = (key: string) => i18n.t(key, { ns: 'tickets' });

/** TWO elements carry `role="menu"` once the flyout is open: `Table`'s own
 *  surface and the caller's item list inside it. `getByRole('menu')` therefore
 *  throws "found multiple", which reads as a broken component and is not one —
 *  the innermost is the one holding the items. */
async function openRowMenu() {
  /* FIVE SECONDS, not Testing Library's default one. The failure this replaces
     was `Unable to find role="button" and name "Ticket actions"` — the row had
     not arrived yet, not the trigger being absent. It reproduced ONLY in a full
     parallel run, where this file shares a machine with eight other workers and
     is itself the slowest in the suite; alone it passes in 1.4s. Raising the
     wait is right where lowering the parallelism would be: the assertion is
     about the menu, and nothing here is measuring how fast a mock resolves. */
  const trigger = await screen.findByRole(
    'button',
    { name: label('list.rowActions') },
    { timeout: 5_000 },
  );
  await userEvent.click(trigger);
  /* `findAll`, not `getAll`. This file drives the whole list screen and takes
     ~15s on its own; under the default parallel pool it shares a machine with
     eight other workers, and a synchronous `getAll` here failed once in a full
     run and passed every time the file ran alone. A flake that only appears
     under load is the worst kind to leave in. */
  const menus = await screen.findAllByRole('menu');
  return menus[menus.length - 1]!;
}

beforeEach(() => {
  for (const fn of [
    listTickets,
    countTickets,
    getTicket,
    getSupportUsers,
    changeTicketAssignee,
    changeTicketStatus,
  ]) {
    vi.mocked(fn).mockReset();
  }
  vi.mocked(listTickets).mockResolvedValue(page());
  vi.mocked(countTickets).mockResolvedValue(0);
  vi.mocked(getTicket).mockResolvedValue(TICKET);
  vi.mocked(getSupportUsers).mockResolvedValue(USERS);
  vi.mocked(changeTicketAssignee).mockResolvedValue(TICKET);
  vi.mocked(changeTicketStatus).mockResolvedValue(TICKET);
});

describe('AC-1 / AC-3 — four items and a rule, and none of them is red', () => {
  it('renders view, reassign, a disabled escalate, a rule and close', async () => {
    mounted();
    const menu = await openRowMenu();

    const items = within(menu).getAllByRole('menuitem');
    expect(items).toHaveLength(4);
    expect(items[2]).toBeDisabled();

    const close = within(menu).getByRole('menuitem', {
      name: label('list.action.close'),
    });
    expect(close.className).not.toMatch(/danger/i);
  });
});

describe('AC-2 — «إعادة الإسناد» acts in place and does not navigate', () => {
  it('opens the picker and leaves the route alone', async () => {
    mounted();
    const menu = await openRowMenu();

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: label('list.action.reassign') }),
    );

    const picker = await screen.findByRole('dialog', { name: label('assign.menuLabel') });
    expect(within(picker).getByText('سعد الدوسري')).toBeInTheDocument();
    expect(screen.getByTestId('pathname')).toHaveTextContent('/tickets');
  });

  it('fetches the ticket the row could not carry — the version and the assignee', async () => {
    mounted();
    const menu = await openRowMenu();

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: label('list.action.reassign') }),
    );

    await waitFor(() =>
      expect(getTicket).toHaveBeenCalledWith(ROW.id, expect.anything()),
    );
  });
});

describe('AC-25 / AC-26 / AC-33 — assigning: one write, then the surface goes, then the toast', () => {
  it('sends the fetched version and announces the new assignee', async () => {
    mounted();
    const menu = await openRowMenu();
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: label('list.action.reassign') }),
    );

    const picker = await screen.findByRole('dialog', { name: label('assign.menuLabel') });
    await waitFor(() =>
      expect(within(picker).getByRole('button', { name: /سعد الدوسري/ })).toBeEnabled(),
    );

    await userEvent.click(within(picker).getByRole('button', { name: /سعد الدوسري/ }));

    await waitFor(() => expect(changeTicketAssignee).toHaveBeenCalledTimes(1));
    const [id, body] = vi.mocked(changeTicketAssignee).mock.calls[0]!;
    expect(id).toBe(ROW.id);
    expect(body).toEqual({ assigneeId: 'u-1', expectedVersion: 'AAAAAAAAB9E=' });

    /* THE ORDER IS THE ASSERTION, not "both happened". §1.1 of the feedback
       layer: close the surface, THEN toast. A toast rendered over a panel that
       is still open is a message the reader dismisses twice. */
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: label('assign.menuLabel') }),
      ).toBeNull(),
    );

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('سعد الدوسري');
    expect(status).toHaveTextContent(ROW.ticketNumber);
  });

  it('unassigning is INFO, not success — it is a step back, not an achievement', async () => {
    vi.mocked(getTicket).mockResolvedValue({
      ...TICKET,
      assignee: { id: 'u-1', fullName: 'سعد الدوسري', role: 'Agent' },
    } as unknown as TicketResponse);

    mounted();
    const menu = await openRowMenu();
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: label('list.action.reassign') }),
    );

    const picker = await screen.findByRole('dialog', { name: label('assign.menuLabel') });
    const clear = within(picker).getByRole('button', {
      name: new RegExp(label('detail.unassign')),
    });
    await waitFor(() => expect(clear).toBeEnabled());
    await userEvent.click(clear);

    await waitFor(() => expect(changeTicketAssignee).toHaveBeenCalledTimes(1));
    expect(vi.mocked(changeTicketAssignee).mock.calls[0]![1].assigneeId).toBeNull();

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(label('assign.toast.unassigned'));
  });
});

describe('AC-25 / AC-26 — closing: the modal leaves before the toast arrives', () => {
  it('closes the ticket and names the reason in the message', async () => {
    mounted();
    const menu = await openRowMenu();

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: label('list.action.close') }),
    );

    const dialog = await screen.findByRole('dialog', { name: label('close.title') });
    const confirm = within(dialog).getByRole('button', { name: label('close.confirm') });
    await waitFor(() => expect(confirm).toBeEnabled());

    await userEvent.click(
      within(dialog).getByRole('button', { name: label('close.reason.solved') }),
    );
    await userEvent.click(confirm);

    await waitFor(() => expect(changeTicketStatus).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: label('close.title') })).toBeNull(),
    );

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(label('close.reason.solved'));
    expect(status).toHaveTextContent(ROW.ticketNumber);
    expect(screen.getByTestId('pathname')).toHaveTextContent('/tickets');
  });
});

describe('AC-27 — a failure is reported where it happened, never as a toast', () => {
  it('leaves the picker open, announces the refusal in it, and fires nothing', async () => {
    const { ApiError } = await import('../../lib/api');
    vi.mocked(changeTicketAssignee).mockRejectedValue(
      new ApiError(
        { type: 'errors/forbidden', title: 'Forbidden', status: 403, traceId: 't' },
        'ar',
      ),
    );

    mounted();
    const menu = await openRowMenu();
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: label('list.action.reassign') }),
    );

    const picker = await screen.findByRole('dialog', { name: label('assign.menuLabel') });
    await waitFor(() =>
      expect(within(picker).getByRole('button', { name: /سعد الدوسري/ })).toBeEnabled(),
    );
    await userEvent.click(within(picker).getByRole('button', { name: /سعد الدوسري/ }));

    const alert = await within(picker).findByRole('alert');
    expect(alert).toHaveTextContent(label('assign.error.forbidden'));

    /* Still open, and NO toast — `role="status"` is what a success or an info
       toast renders as, and there is not one on this path. */
    expect(
      screen.getByRole('dialog', { name: label('assign.menuLabel') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('AC-15 — the picker is dismissible without acting', () => {
  it('closes on Escape', async () => {
    mounted();
    const menu = await openRowMenu();
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: label('list.action.reassign') }),
    );
    await screen.findByRole('dialog', { name: label('assign.menuLabel') });

    await userEvent.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: label('assign.menuLabel') }),
      ).toBeNull(),
    );
    expect(changeTicketAssignee).not.toHaveBeenCalled();
  });
});
