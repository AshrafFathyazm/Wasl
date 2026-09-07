import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import i18n from '../../lib/i18n';
import type { DashboardSnapshot, DashboardTeamMember } from '../../lib/api-types.provisional';
import { DashboardView } from './DashboardView';

/*
 * `020`. The screen as a function of props — which is what the view/page split
 * exists for: loading, a failed request, an empty system and an Agent's four
 * tiles are all reachable here without breaking anything or signing in as
 * somebody else.
 *
 * WHAT THESE CANNOT SEE, stated so nobody reads them as covering it: jsdom
 * computes no cascade and no flex, so none of the three defects the browser found
 * on this screen — the range buttons losing their pressed state to a
 * `!important`, the axis labels drawn inside the bars, and the tracks collapsing
 * to a hairline in a flex column — would have failed a single assertion below.
 * `dashboardGuards.test.ts` catches the first by scanning the source; the other
 * two are recorded in `tests.md` as browser measurements.
 */

const TEAM: DashboardTeamMember[] = [
  {
    userId: 'u1',
    fullName: 'Ashraf Fathy',
    isActive: true,
    assignedOpenCount: 14,
    escalatedOpenCount: 3,
  },
  {
    userId: 'u2',
    fullName: 'سارة المطيري',
    isActive: true,
    assignedOpenCount: 11,
    escalatedOpenCount: 1,
  },
  {
    userId: 'u3',
    fullName: 'Omar Khalid',
    isActive: false,
    assignedOpenCount: 6,
    escalatedOpenCount: 0,
  },
];

function snapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    range: '14d',
    scope: 'Team',
    timeZoneId: 'Asia/Riyadh',
    fromLocalDate: '2026-08-25',
    toLocalDate: '2026-09-07',
    generatedAtUtc: '2026-09-07T09:14:02Z',
    attention: {
      unassignedCount: 12,
      escalatedOpenCount: 3,
      escalatedOverdueCount: 2,
      waitingOnCustomerCount: 21,
      assignedToMeCount: 4,
      oldestUntouched: {
        ticketId: 't-oldest',
        ticketNumber: 'TCK-2026-000318',
        subject: 'Duplicate charge on invoice 5512',
        createdAtUtc: '2026-09-03T06:11:00Z',
        ageHours: 99,
      },
      myOldest: null,
      needsAttentionTotal: 15,
    },
    dailySeries: [
      { localDate: '2026-09-06', created: 7, resolved: 8 },
      { localDate: '2026-09-07', created: 6, resolved: 7 },
    ],
    openByStatus: [
      { status: 'New', count: 12 },
      { status: 'Open', count: 18 },
      { status: 'InProgress', count: 12 },
      { status: 'PendingCustomer', count: 21 },
      { status: 'Resolved', count: 9 },
    ],
    medians: {
      firstReplyMinutes: 130,
      firstReplySampleSize: 46,
      resolutionMinutes: 1680,
      resolutionSampleSize: 31,
      firstReplyTargetMinutes: 120,
      resolutionTargetMinutes: 1440,
    },
    channelMix: [
      { channel: 'Email', count: 26 },
      { channel: 'WhatsApp', count: 36 },
      { channel: 'LiveChat', count: 16 },
      { channel: 'Sms', count: 6 },
      { channel: 'WebForm', count: 10 },
    ],
    needsAttention: [
      {
        ticketId: 't-1',
        ticketNumber: 'TCK-2026-000318',
        subject: 'Duplicate charge on invoice 5512',
        customerName: 'Faisal Al-Otaibi',
        status: 'Open',
        priority: 'High',
        isEscalated: true,
        isUnassigned: false,
        createdAtUtc: '2026-09-03T06:11:00Z',
        ageHours: 99,
      },
      {
        ticketId: 't-2',
        ticketNumber: 'TCK-2026-000341',
        subject: 'تعذر تسجيل الدخول للحساب',
        customerName: 'علي الأحمد',
        status: 'New',
        priority: 'Normal',
        isEscalated: false,
        isUnassigned: true,
        createdAtUtc: '2026-09-05T08:20:00Z',
        ageHours: 51,
      },
    ],
    teamLoad: TEAM,
    ...overrides,
  };
}

function mount(props: Partial<Parameters<typeof DashboardView>[0]> = {}) {
  return render(
    <MemoryRouter>
      <DashboardView
        state="loaded"
        snapshot={snapshot()}
        range="14d"
        onRangeChange={() => {}}
        lang="en"
        updatedMinutes={1}
        onRetry={() => {}}
        {...props}
      />
    </MemoryRouter>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('the four tiles', () => {
  it('renders the Manager four, each linking to what it is about', () => {
    const { container } = mount();

    /* SCOPED TO THE TILE ROW, and the first version was not — `getByText`
     * matched two nodes and threw. "Unassigned" is a tile label AND a badge on
     * the attention list, which is correct on the screen and ambiguous to a
     * query: the same word means "the pool" above and "this ticket has no
     * owner" below. */
    const tiles = container.querySelector('[class*="tiles"]') as HTMLElement;

    expect(within(tiles).getByText('Unassigned').closest('a')).toHaveAttribute(
      'href',
      '/tickets/unassigned',
    );
    expect(within(tiles).getByText('Escalated & open').closest('a')).toHaveAttribute(
      'href',
      '/tickets?escalated=true',
    );
    expect(within(tiles).getByText('Oldest untouched').closest('a')).toHaveAttribute(
      'href',
      '/tickets/t-oldest',
    );
    expect(within(tiles).getByText('Waiting on customer').closest('a')).toHaveAttribute(
      'href',
      '/tickets?status=PendingCustomer',
    );
  });

  it('names how many escalations are over a day — the 2026-09-07 contract change', () => {
    /* `escalatedOverdueCount` renders here and nowhere else. Counting
     * `needsAttention` for it would be wrong from the eleventh escalation,
     * silently, because that list is capped at ten rows of two mixed kinds. */
    mount();

    expect(screen.getByText('2 older than 24h')).toBeInTheDocument();
  });

  it('renders the Agent FOUR instead, with no team load anywhere', () => {
    /* THE PROPERTY IS DELETED, NOT SET TO `undefined` — and the compiler is what
     * insisted. `exactOptionalPropertyTypes` refuses `teamLoad: undefined`
     * against `teamLoad?: DashboardTeamMember[]`, which is exactly the
     * distinction the contract makes on the wire: an Agent's document has NO
     * `teamLoad` key. A fixture that set it to `undefined` would model a shape
     * the server never sends. */
    const agent = snapshot({
      scope: 'Mine',
      attention: {
        ...snapshot().attention,
        assignedToMeCount: 7,
        oldestUntouched: null,
        myOldest: {
          ticketId: 't-mine',
          ticketNumber: 'TCK-2026-000355',
          subject: 'Refund not received',
          createdAtUtc: '2026-09-06T10:02:00Z',
          ageHours: 25,
        },
      },
    });

    delete agent.teamLoad;

    mount({ snapshot: agent });

    expect(screen.getByText('Assigned to me')).toBeInTheDocument();
    expect(screen.getByText('Unassigned pool')).toBeInTheDocument();
    expect(screen.getByText('My oldest')).toBeInTheDocument();
    expect(screen.queryByText('Escalated & open')).not.toBeInTheDocument();

    /* `teamLoad !== undefined` is the test, and this is the assertion that keeps
     * it that way: an Agent's response has no such property, and an empty array
     * would be a different claim. */
    expect(screen.queryByText('Team load')).not.toBeInTheDocument();
  });

  it('mutes a zero rather than painting it red', () => {
    /* Zero unassigned is the good outcome. A red 0 trains the reader to ignore
     * the colour, after which a red 12 says nothing either. */
    const { container } = mount({
      snapshot: snapshot({
        attention: { ...snapshot().attention, unassignedCount: 0 },
      }),
    });

    const zero = [...container.querySelectorAll('[class*="tileValue"]')].find(
      (node) => node.textContent === '0',
    );

    expect(zero?.className).toMatch(/tileValueZero/);

    const red = [...container.querySelectorAll('[class*="tileFootAct"]')].map(
      (node) => node.textContent,
    );

    expect(red.join(' ')).not.toContain('Nobody owns these');
  });

  it('renders an em dash for a ticket tile with no ticket, never 0h', () => {
    mount({
      snapshot: snapshot({
        attention: { ...snapshot().attention, oldestUntouched: null },
      }),
    });

    expect(screen.getByText('Nothing waiting')).toBeInTheDocument();
    expect(screen.queryByText('0h')).not.toBeInTheDocument();
  });
});

describe('the queue card', () => {
  it('draws four statuses and totals only those four', () => {
    /* `Resolved` arrives in the response and is not drawn: the card counts what
     * is OPEN. Summing the response instead would put a number above the card
     * that the bars do not add up to. */
    const { container } = mount();

    expect(screen.getByText('63 open right now · click to filter')).toBeInTheDocument();

    /* SCOPED TO THE BAR LABELS, and the first version searched the whole
     * document — where it found the chart's sr-only table, whose third COLUMN
     * HEADER is "Resolved". Both are correct: the status card must not draw a
     * Resolved bar, and the chart must label its resolved column. */
    const labels = [...container.querySelectorAll('[class*="barLabel"]')]
      .slice(0, 4)
      .map((node) => node.textContent);

    expect(labels).toEqual(['New', 'Open', 'In progress', 'Pending cust.']);
    expect(labels).not.toContain('Resolved');
  });

  it('scales the bars to the LARGEST status, not to the total', () => {
    /* Changed 2026-09-07 with the revised canvas. Dividing by the total drew
     * 12/18/12/21 as 19/29/19/33% and used a third of the card. */
    const { container } = mount();

    const widths = [...container.querySelectorAll('[class*="barRow"] [class*="fill"]')]
      .slice(0, 4)
      .map((node) => (node as HTMLElement).style.inlineSize);

    expect(widths).toEqual(['57%', '86%', '57%', '100%']);
  });

  it('names each median against its target, and the overshoot in words', () => {
    mount();

    expect(screen.getByText('target 2h')).toBeInTheDocument();
    expect(screen.getByText('2h 10m')).toBeInTheDocument();
    expect(screen.getByText('+10m over')).toBeInTheDocument();
    expect(screen.getByText('target 1d')).toBeInTheDocument();
    expect(screen.getByText('1d 4h')).toBeInTheDocument();
    expect(screen.getByText('+4h over')).toBeInTheDocument();
  });

  it('renders an em dash at sample size zero, and no overshoot', () => {
    /* `null` is not `0`. Zero minutes to first reply is a claim, and an empty
     * period does not make it — the sample size is what decides. */
    mount({
      snapshot: snapshot({
        medians: {
          firstReplyMinutes: null,
          firstReplySampleSize: 0,
          resolutionMinutes: null,
          resolutionSampleSize: 0,
          firstReplyTargetMinutes: 120,
          resolutionTargetMinutes: 1440,
        },
      }),
    });

    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText(/over$/)).not.toBeInTheDocument();

    /* The TARGET survives an empty population: it is configuration, not a
     * measurement, so the label stays beside the dash. */
    expect(screen.getByText('target 2h')).toBeInTheDocument();
  });
});

describe('needs attention', () => {
  it('links the whole set when there are more rows than the list holds', () => {
    /* The count is `needsAttentionTotal`, not the list's length — a link reading
     * "View all 2" beside two rows tells the reader nothing. */
    mount();

    expect(screen.getByText('View all 15').closest('a')).toHaveAttribute(
      'href',
      '/tickets?assignee=unassigned',
    );
  });

  it('omits the link when the list already holds everything', () => {
    mount({
      snapshot: snapshot({
        attention: { ...snapshot().attention, needsAttentionTotal: 2 },
      }),
    });

    expect(screen.queryByText(/View all/)).not.toBeInTheDocument();
  });

  it('shows Escalated where both memberships are true, and links each row', () => {
    const { container } = mount();

    /* SCOPED TO THE LIST. `TCK-2026-000318` is also the oldest-untouched tile's
     * footnote — the same ticket, named twice on the screen because it is both
     * the oldest and in the attention list, which is exactly the case the
     * design's two regions are for. */
    const rows = container.querySelector('[class*="rows"]') as HTMLElement;
    const escalated = within(rows).getByText('TCK-2026-000318').closest('a');

    expect(escalated).toHaveAttribute('href', '/tickets/t-1');
    expect(within(escalated as HTMLElement).getByText('Escalated')).toBeInTheDocument();

    const unassigned = screen.getByText('TCK-2026-000341').closest('a');

    expect(within(unassigned as HTMLElement).getByText('Unassigned')).toBeInTheDocument();
  });

  it('renders an Arabic subject with dir=auto on the English screen', () => {
    /* Two languages share one list, and without `dir="auto"` an Arabic subject
     * renders its punctuation at the wrong end. */
    mount();

    expect(screen.getByText('تعذر تسجيل الدخول للحساب')).toHaveAttribute('dir', 'auto');
  });

  it('says so when nothing needs attention, rather than "no results"', () => {
    mount({ snapshot: snapshot({ needsAttention: [] }) });

    expect(screen.getByText('Nothing is unassigned or escalated.')).toBeInTheDocument();
  });
});

describe('where demand comes from', () => {
  it('ranks the channels by count and prints each share', () => {
    /* Sorted in the client: the contract orders by the enum so the bars cannot
     * reorder between refreshes, and the design ranks them. The design wins on
     * the screen, and the tie-break on the name is what keeps it stable. */
    const { container } = mount();

    const labels = [...container.querySelectorAll('[class*="barLabel"]')]
      .slice(4)
      .map((node) => node.textContent);

    expect(labels).toEqual(['WhatsApp', 'Email', 'Live chat', 'Web form', 'SMS']);

    expect(screen.getByText('38%')).toBeInTheDocument();
    expect(screen.getByText('6%')).toBeInTheDocument();
  });

  it('links each channel into the filtered list', () => {
    mount();

    expect(screen.getByText('WhatsApp').closest('a')).toHaveAttribute(
      'href',
      '/tickets?channel=WhatsApp',
    );
  });
});

describe('team load', () => {
  it('reports what the team holds and what nobody holds', () => {
    mount();

    expect(screen.getByText('31 assigned · 12 unassigned')).toBeInTheDocument();
    expect(screen.getByText('Open tickets per agent · red above 8')).toBeInTheDocument();
  });

  it('colours only the agents over the ceiling', () => {
    const { container } = mount();

    const counts = [...container.querySelectorAll('[class*="agentCount"]')].map((node) => ({
      value: node.textContent,
      over: /agentCountOver/.test(node.className),
    }));

    expect(counts).toEqual([
      { value: '14', over: true },
      { value: '11', over: true },
      { value: '6', over: false },
    ]);
  });

  it('names the escalations it has and never a breach', () => {
    /* The canvas's "2 breaching" footnote is deliberately absent: a breach needs
     * a per-ticket SLA and this product has none. This assertion is what stops
     * one being approximated later. */
    const { container } = mount();

    expect(screen.getByText('3 escalated')).toBeInTheDocument();
    expect(screen.getByText('1 escalated')).toBeInTheDocument();
    expect(screen.getByText('Can take more')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/breach/i);
  });

  it('marks a deactivated agent who still holds work', () => {
    /* Hiding them hides work that exists, which is the opposite of what the card
     * is for. */
    mount();

    expect(screen.getByText('Deactivated')).toBeInTheDocument();
  });

  it('renders full names, unabbreviated, with initials on the disc', () => {
    mount();

    expect(screen.getByText('Ashraf Fathy')).toBeInTheDocument();
    expect(screen.getByText('سارة المطيري')).toBeInTheDocument();
    expect(screen.getByText('AF')).toBeInTheDocument();
    expect(screen.getByText('سا')).toBeInTheDocument();
  });
});

describe('the chart', () => {
  it('carries a real table of the same figures for a screen reader', () => {
    /* The bars are aria-hidden and the numbers are a table: a div with an
     * aria-label describing a fortnight is a sentence nobody can navigate. */
    mount();

    const table = screen.getByRole('table');

    expect(within(table).getByText('7 Sep')).toBeInTheDocument();
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Day',
      'Created',
      'Resolved',
    ]);
  });

  it('says an empty period is empty rather than drawing nothing', () => {
    mount({
      snapshot: snapshot({
        dailySeries: [
          { localDate: '2026-09-06', created: 0, resolved: 0 },
          { localDate: '2026-09-07', created: 0, resolved: 0 },
        ],
      }),
    });

    expect(
      screen.getByText('Nothing was created or resolved in this period.'),
    ).toBeInTheDocument();
  });

  it('states the verdict in words, never as a signed number', () => {
    mount();

    /* 13 created against 15 resolved — ahead by 2. "trailing by -2" is not a
     * sentence anybody reads. */
    expect(screen.getByText(/resolved is ahead of creation by 2/)).toBeInTheDocument();
  });
});

describe('the range control and the states', () => {
  it('marks the active range with aria-pressed and reports a change', () => {
    const onRangeChange = vi.fn();

    mount({ onRangeChange });

    expect(screen.getByRole('button', { name: '14d' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    screen.getByRole('button', { name: '30d' }).click();

    expect(onRangeChange).toHaveBeenCalledWith('30d');
  });

  it('renders a skeleton at the real card heights while loading', () => {
    const { container } = mount({ state: 'loading', snapshot: undefined });

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText('Created vs resolved')).not.toBeInTheDocument();
  });

  it('shows the trace id on a failure', () => {
    mount({ state: 'error', snapshot: undefined, traceId: '0HN7QK3M9V2P1:0000000B' });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('0HN7QK3M9V2P1:0000000B')).toBeInTheDocument();
  });

  /* A SECOND TEST RATHER THAN A SECOND `mount()` IN THE FIRST, and the first
   * version was the latter — which failed for a reason worth keeping: `render`
   * does not replace the previous tree, so the earlier frame's "Reference" was
   * still in the document and `queryByText` found it. Two mounts in one
   * assertion block is a test asserting against two screens at once. */
  it('omits the reference line when the failure carries no trace id', () => {
    /* A transport failure has none — the request never reached a server, so no
     * server logged it, and an invented id sends somebody hunting through logs
     * for a string that was never written. */
    mount({ state: 'error', snapshot: undefined });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Reference')).not.toBeInTheDocument();
  });

  it('keeps the numbers on screen while a new range loads', () => {
    /* `keepPreviousData` means there IS data. Replacing true numbers with grey
     * blocks on every tab press is a flash rather than a state. */
    const { container } = mount({ isBusy: true });

    expect(screen.getByText('Created vs resolved')).toBeInTheDocument();
    expect(container.querySelector('[class*="bodyBusy"]')).toBeInTheDocument();
  });
});
