import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COMMUNICATION_CHANNELS,
  TICKET_PRIORITIES,
} from '../../lib/api-types.provisional';
import type { TicketListItem } from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';
import { ChannelPicker } from './ChannelPicker';
import { DuplicateWarning, PriorTickets } from './DuplicateWarning';
import { PriorityPicker } from './PriorityPicker';

/* ============================================================================
 * `038` — the three new controls, unit level
 * ============================================================================
 * Separate from the page's file on purpose: these are claims about the CONTROLS
 * — enum coverage, the radio-group keyboard model, the banner's count — and
 * proving them through the whole route means five awaits of debounce and query
 * before each assertion.
 * ============================================================================ */

function wrap(node: React.ReactNode) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nextProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  document.documentElement.dir = 'ltr';
});

describe('AC-6, AC-7, AC-8 — the channel row', () => {
  it('renders one option per contract enum member, in contract order', () => {
    wrap(<ChannelPicker value="" onChange={() => undefined} />);

    const group = screen.getByRole('radiogroup', { name: 'Channel' });
    const radios = within(group).getAllByRole('radio');

    /* DERIVED FROM THE CONSTANT, so a sixth channel added to the contract fails
       here instead of quietly leaving the row at five and looking complete. */
    expect(radios).toHaveLength(COMMUNICATION_CHANNELS.length);
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Email',
      'WhatsApp',
      'Live chat',
      'SMS',
      'Web form',
    ]);
  });

  it('checks exactly one, and holds exactly one tab stop', () => {
    wrap(<ChannelPicker value="Sms" onChange={() => undefined} />);

    const radios = screen.getAllByRole('radio');
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(
      1,
    );

    /* ROVING TABINDEX. Five focusable buttons would make one control five tab
       stops — the defect this asserts against is the DEFAULT behaviour, which is
       why it is asserted rather than assumed. */
    expect(radios.filter((r) => r.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'SMS' })).toHaveAttribute('tabindex', '0');
  });

  it('keeps a tab stop when NOTHING is selected', () => {
    /* The state priority ships in (R-3). With no selection and no fallback the
       group would be unreachable by keyboard entirely. */
    wrap(<PriorityPicker value="" onChange={() => undefined} />);

    const radios = screen.getAllByRole('radio');
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(
      0,
    );
    expect(radios.filter((r) => r.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('names the selected channel in words underneath', () => {
    wrap(<ChannelPicker value="WhatsApp" onChange={() => undefined} />);

    /* The row is five pictures, and two of them are message bubbles. This line
       is what makes the choice readable rather than recognisable. */
    expect(
      screen.getByText('The channel the request arrived on: WhatsApp'),
    ).toBeInTheDocument();
  });

  it('moves the SELECTION with the arrow keys, not just focus', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(<ChannelPicker value="Email" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: 'Email' }));
    onChange.mockClear();
    await user.keyboard('{ArrowRight}');

    /* A radio group's arrow key changes the value — that is what separates it
       from a listbox, where the arrow moves focus and Enter commits. */
    expect(onChange).toHaveBeenCalledWith('WhatsApp');
  });

  it('reverses the horizontal arrows under RTL', async () => {
    document.documentElement.dir = 'rtl';
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(<ChannelPicker value="WhatsApp" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: 'WhatsApp' }));
    onChange.mockClear();
    await user.keyboard('{ArrowRight}');

    /* In Arabic the visually-NEXT cell is the one to the inline-end, which
       ArrowLeft reaches. ArrowRight therefore goes back to Email. A group that
       ignores direction sends the caret the wrong way for every Arabic user and
       nothing errors. */
    expect(onChange).toHaveBeenCalledWith('Email');
  });
});

describe('AC-29 — priority ships with nothing selected', () => {
  it('renders all four, none checked, with Normal marked as the default', () => {
    wrap(<PriorityPicker value="" onChange={() => undefined} />);

    expect(screen.getAllByRole('radio')).toHaveLength(TICKET_PRIORITIES.length);
    expect(screen.getByRole('radio', { name: 'Normal (default)' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    /* The mock-up pre-selects «عادية». Reproducing that would either show a
       choice the request does not carry, or start pinning today's server
       default — `024` already paid for that lesson once. */
  });
});

describe('AC-13, AC-14, AC-15, AC-16 — the duplicate banner', () => {
  const rows: TicketListItem[] = [1, 2].map((n) => ({
    id: `id-${n}`,
    ticketNumber: `TKT-2026-00000${n}`,
    subject: `Open subject ${n}`,
    customerId: 'c1',
    customerName: 'A customer',
    status: 'Open',
    priority: 'Normal',
    category: 'Billing',
    channel: 'Email',
    assigneeId: null,
    assigneeName: null,
    isEscalated: false,
    createdAtUtc: new Date(Date.now() - n * 86_400_000).toISOString(),
  }));

  it('renders nothing at all when the count is zero', () => {
    const { container } = wrap(
      <DuplicateWarning count={0} tickets={[]} customerId="c1" lang="en" />,
    );
    /* NOT an empty panel. An amber box warning about nothing is worse than no
       box, and the component refuses rather than trusting its caller. */
    expect(container).toBeEmptyDOMElement();
  });

  it('lists nothing until asked, and says so on the toggle', async () => {
    const user = userEvent.setup();
    wrap(<DuplicateWarning count={2} tickets={rows} customerId="c1" lang="en" />);

    const toggle = screen.getByRole('button', { name: 'Show them' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Open subject 1')).toBeNull();

    await user.click(toggle);

    expect(screen.getByText('Open subject 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('links each listed ticket to its own route', async () => {
    const user = userEvent.setup();
    wrap(<DuplicateWarning count={2} tickets={rows} customerId="c1" lang="en" />);
    await user.click(screen.getByRole('button', { name: 'Show them' }));

    expect(screen.getByRole('link', { name: /Open subject 1/ })).toHaveAttribute(
      'href',
      '/tickets/id-1',
    );
  });

  /* TWO RENDERS, NOT A RERENDER. The first draft rerendered the same instance
   * with a new count and clicked «Show them» again — but the disclosure is state
   * and survives a rerender, so the toggle already read «Hide» and the query
   * failed. The failure was about the test's own bookkeeping, not the claim. */
  it('offers no «view all» when the list is complete', async () => {
    const user = userEvent.setup();
    wrap(<DuplicateWarning count={2} tickets={rows} customerId="c1" lang="en" />);
    await user.click(screen.getByRole('button', { name: 'Show them' }));

    /* A "view all" under a complete list links to the same information. */
    expect(screen.queryByRole('link', { name: 'View all' })).toBeNull();
  });

  it('offers «view all» when the count exceeds what it listed', async () => {
    const user = userEvent.setup();
    wrap(<DuplicateWarning count={9} tickets={rows} customerId="c1" lang="en" />);
    await user.click(screen.getByRole('button', { name: 'Show them' }));

    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/tickets?customerId=c1',
    );
  });

  it('renders an age per row, and today as a word', async () => {
    const user = userEvent.setup();
    const today: TicketListItem = {
      ...rows[0]!,
      id: 'today',
      createdAtUtc: new Date().toISOString(),
    };
    wrap(<DuplicateWarning count={1} tickets={[today]} customerId="c1" lang="en" />);
    await user.click(screen.getByRole('button', { name: 'Show them' }));

    /* "0 days ago" is what a counted key produces at zero in English, and it is
       not something a person says. */
    expect(screen.getByText('today')).toBeInTheDocument();
  });
});

describe('PriorTickets — the quiet half, ruled 2026-09-06', () => {
  const closed: TicketListItem[] = [
    {
      id: 'p1',
      ticketNumber: 'TKT-2026-000900',
      subject: 'Closed last week',
      customerId: 'c1',
      customerName: 'A customer',
      status: 'Closed',
      priority: 'Normal',
      category: 'Billing',
      channel: 'Email',
      assigneeId: null,
      assigneeName: null,
      isEscalated: false,
      createdAtUtc: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    },
  ];

  it('renders nothing at zero, like the warning above it', () => {
    const { container } = wrap(
      <PriorTickets count={0} tickets={[]} customerId="c1" lang="en" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('is NOT a status region — the warning owns that role', () => {
    wrap(<PriorTickets count={1} tickets={closed} customerId="c1" lang="en" />);

    /* `role="status"` is the amber banner's, and it is announced. Previous
       tickets are context: announcing them with the same urgency as a duplicate
       risk is how an assistive-technology user stops trusting either. */
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(/This customer has 1 previous ticket/)).toBeInTheDocument();
  });

  it('shows the status on each row, because Resolved and Closed differ', async () => {
    const user = userEvent.setup();
    wrap(<PriorTickets count={1} tickets={closed} customerId="c1" lang="en" />);
    await user.click(screen.getByRole('button', { name: 'Show them' }));

    /* `Resolved` invites a reopen — `Resolved → InProgress` is permitted by
       BR-1.6. `Closed` is terminal by BR-1.5. The agent needs to know which
       before they follow the link. */
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Closed last week/ })).toHaveAttribute(
      'href',
      '/tickets/p1',
    );
  });

  it('makes no claim about WHEN a ticket was closed', () => {
    /* THE FIRST DRAFT SAID "closed in the last 14 days" AND THE API CANNOT
       ANSWER IT: `GET /api/tickets` filters on `createdFrom`/`createdTo` and
       there is no `closedFrom`; `closedAtUtc` is on the ticket DETAIL, not on a
       list row. A creation window is wrong in both directions — a ticket opened
       six months ago and closed yesterday is missed, one opened ten days ago and
       closed nine days ago is included.
       So the copy makes the weaker claim it can support. This asserts the
       stronger one is absent, because it is the sentence somebody will helpfully
       add back. */
    wrap(<PriorTickets count={1} tickets={closed} customerId="c1" lang="en" />);

    expect(screen.queryByText(/closed .*(day|days|week)/i)).toBeNull();
  });
});
