import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '../../lib/i18n';
import DashboardPage, { readRange } from './DashboardPage';

/*
 * `020` FE-020-03. The route's two jobs: the range lives in the URL, and the
 * request is made once per range.
 *
 * The transport is stubbed at `fetch`, not at the fetcher, so the PATH is part of
 * what is asserted — `?range=30d` reaching the server is the property, and a
 * mocked `getDashboard` would have proved only that a function was called.
 */

const BODY = {
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
    oldestUntouched: null,
    myOldest: null,
    needsAttentionTotal: 0,
  },
  dailySeries: [{ localDate: '2026-09-07', created: 6, resolved: 7 }],
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
  needsAttention: [],
  teamLoad: [],
};

let requested: string[] = [];

function stubFetch(status = 200, body: unknown = BODY) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      /* PATH AND QUERY ONLY. `lib/api.ts` resolves against an absolute base, so
       * the raw value is `http://localhost:3000/api/dashboard?range=14d` — and
       * asserting the whole string would tie these tests to whatever base the
       * wrapper is configured with. The query is the part under test. */
      const url = new URL(String(input), 'http://localhost');

      requested.push(url.pathname + url.search);

      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
}

/** Renders the current location, so an assertion can read the URL the page wrote. */
function Location() {
  const location = useLocation();

  return <span data-testid="url">{location.pathname + location.search}</span>;
}

function mount(initial = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <Location />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  requested = [];
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readRange', () => {
  it('takes the three accepted values and degrades everything else', () => {
    /* A stale or hand-edited link becomes a working screen rather than an error
     * the reader cannot act on — `015`'s rule for its filters. The SERVER still
     * refuses an unaccepted value, because a client is not where that rule
     * lives. */
    expect(readRange('7d')).toBe('7d');
    expect(readRange('30d')).toBe('30d');
    expect(readRange('90d')).toBe('14d');
    expect(readRange('')).toBe('14d');
    expect(readRange(null)).toBe('14d');
  });
});

describe('the range lives in the URL', () => {
  it('sends the default range on the wire even though the URL omits it', () => {
    /* The response echoes what was applied, so a request that omitted the
     * parameter would make the echo the only place the value exists. */
    mount();

    return waitFor(() => {
      expect(requested).toEqual(['/api/dashboard?range=14d']);
    });
  });

  it('reads a range out of the URL and asks for that one', async () => {
    mount('/?range=30d');

    await waitFor(() => {
      expect(requested).toEqual(['/api/dashboard?range=30d']);
    });

    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('writes the chosen range to the URL, and omits the default', async () => {
    mount();

    await waitFor(() => expect(screen.getByText('Created vs resolved')).toBeInTheDocument());

    screen.getByRole('button', { name: '7d' }).click();

    await waitFor(() => {
      expect(screen.getByTestId('url').textContent).toBe('/?range=7d');
    });

    /* Back to the default: the parameter is REMOVED rather than set to `14d`.
     * `/` and `/?range=14d` are the same screen, and a parameter restating the
     * default is one that has to be kept in step with it. */
    screen.getByRole('button', { name: '14d' }).click();

    await waitFor(() => {
      expect(screen.getByTestId('url').textContent).toBe('/');
    });
  });

  /**
   * ONE REQUEST PER SWITCH, AND GOING BACK REFETCHES — which is not what this
   * test first claimed.
   *
   * It was written as "switching back issues no request", on the reasoning that
   * `['dashboard', range]` already holds 14d. The run said three requests, not
   * two, and the run is right: React Query's default `staleTime` is 0, so a
   * cached entry is stale the moment it lands and returning to it serves the
   * cache INSTANTLY and revalidates behind it.
   *
   * That is the correct behaviour for this screen rather than something to
   * suppress — the endpoint is `Cache-Control: no-store` by decision, and a
   * dashboard that showed a minute-old number without checking would be the
   * caching this feature refused. What the cache buys is the absence of a
   * skeleton, not the absence of a request.
   */
  it('asks once per switch, and revalidates a cached range instead of re-skeletoning', async () => {
    mount();

    await waitFor(() => expect(requested).toHaveLength(1));

    screen.getByRole('button', { name: '7d' }).click();
    await waitFor(() => expect(requested).toHaveLength(2));

    screen.getByRole('button', { name: '14d' }).click();

    await waitFor(() => {
      expect(screen.getByTestId('url').textContent).toBe('/');
    });

    /* Three requests, in order, one per switch — asserted as an equality rather
     * than "no more than three", because a threshold drifts with every unrelated
     * change while the SEQUENCE is the property. */
    await waitFor(() => {
      expect(requested).toEqual([
        '/api/dashboard?range=14d',
        '/api/dashboard?range=7d',
        '/api/dashboard?range=14d',
      ]);
    });

    /* And the numbers were never replaced by a skeleton on the way back: the
     * card is on screen throughout, which is what `keepPreviousData` plus a warm
     * cache is for. */
    expect(screen.getByText('Created vs resolved')).toBeInTheDocument();
  });
});

describe('a failure', () => {
  it('renders the error state with the problem trace id', async () => {
    stubFetch(500, {
      type: 'https://wasl.local/errors/unexpected',
      title: 'Something went wrong.',
      status: 500,
      traceId: '00-abc-def-01',
    });

    mount();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText('00-abc-def-01')).toBeInTheDocument();
    expect(screen.queryByText('Created vs resolved')).not.toBeInTheDocument();
  });

  it('keeps the range tabs usable while the request is failing', async () => {
    /* The header is furniture and the failure is in the body: a reader whose
     * 30-day request failed should be able to ask for 7 days without reloading
     * the page. */
    stubFetch(500, { type: 'x', title: 'x', status: 500 });

    mount();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: '7d' })).toBeEnabled();
  });
});
