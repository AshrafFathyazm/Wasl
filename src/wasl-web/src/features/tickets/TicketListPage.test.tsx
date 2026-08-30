import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../lib/api';
import type { PagedResult, TicketListItem } from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';

/* The module is the seam, not `fetch` — the same choice `024` made and for the
 * same reason: it measures "one call out per intent", which is what the claims
 * are actually about. */
vi.mock('./tickets.api', async () => {
  const actual = await vi.importActual<typeof import('./tickets.api')>('./tickets.api');
  return { ...actual, listTickets: vi.fn() };
});

const { listTickets } = await import('./tickets.api');
const { default: TicketListPage } = await import('./TicketListPage');

const ROW: TicketListItem = {
  id: '8f1c2d34-5678-4abc-9def-0123456789ab',
  ticketNumber: 'TCK-2026-000042',
  subject: 'لا يمكنني تسجيل الدخول إلى الحساب',
  customerId: '1b2c3d4e-5678-4abc-9def-0123456789ab',
  customerName: 'علي الأحمد',
  status: 'InProgress',
  priority: 'High',
  category: 'Technical',
  channel: 'Email',
  assigneeId: null,
  assigneeName: null,
  isEscalated: false,
  createdAtUtc: '2026-08-23T12:00:00Z',
};

const page = (
  over: Partial<PagedResult<TicketListItem>> = {},
): PagedResult<TicketListItem> => ({
  items: [ROW],
  page: 1,
  pageSize: 20,
  totalCount: 1,
  totalPages: 1,
  ...over,
});

const mounted = (url = '/tickets') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <TicketListPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
};

beforeEach(() => {
  vi.mocked(listTickets).mockReset();
  vi.mocked(listTickets).mockResolvedValue(page());
});

describe('AC-026-01 — the page is the only thing that fetches', () => {
  it('renders a row from the query, with the ticket number in Latin digits', async () => {
    mounted();
    expect(await screen.findByText('TCK-2026-000042')).toBeInTheDocument();
    expect(screen.getByText('علي الأحمد')).toBeInTheDocument();
  });

  it('sends the URL page and pageSize, not a default', async () => {
    mounted('/tickets?page=3&pageSize=50');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());
    expect(vi.mocked(listTickets).mock.calls[0]![0]).toEqual({ page: 3, pageSize: 50 });
  });

  /* A hand-typed ?page=abc must not reach the query key as NaN — that is a cache
   * entry nothing can ever match, so the screen loads forever and never errors.
   * The failure is invisible: no request, no error, a permanent skeleton. */
  it.each(['abc', '0', '-4', ''])('falls back to page 1 for ?page=%j', async (bad) => {
    mounted(`/tickets?page=${bad}`);
    await waitFor(() => expect(listTickets).toHaveBeenCalled());
    expect(vi.mocked(listTickets).mock.calls[0]![0]!.page).toBe(1);
  });
});

describe('AC-026-04 — the control shows what the SERVER returned', () => {
  it('renders the clamped pageSize, not the one that was requested', async () => {
    /* BR-7.2 clamps rather than rejecting: asking for 500 is a 200 carrying 100.
     * A control rendering what was SENT shows 500 above a hundred rows and
     * disagrees with the data beside it, with nothing failing. */
    vi.mocked(listTickets).mockResolvedValue(page({ pageSize: 100, page: 1 }));
    mounted('/tickets?pageSize=500');
    await screen.findByText('TCK-2026-000042');
    const select = screen.getByRole('combobox');
    expect((select as HTMLSelectElement).value).toBe('100');
  });
});

describe('the five states', () => {
  it('shows a skeleton while pending, and no rows', () => {
    vi.mocked(listTickets).mockImplementation(() => new Promise(() => {}));
    const { container } = mounted();
    expect(
      container.querySelectorAll('tbody tr[aria-hidden="true"]').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('TCK-2026-000042')).toBeNull();
  });

  it('shows the empty state, and keeps the column headings', async () => {
    vi.mocked(listTickets).mockResolvedValue(
      page({ items: [], totalCount: 0, totalPages: 0 }),
    );
    mounted();
    expect(
      await screen.findByText(i18n.t('tickets:list.emptyTitle')),
    ).toBeInTheDocument();
    /* An empty state that also drops the headings reads as a broken page rather
     * than an empty list. */
    expect(
      screen.getByRole('columnheader', { name: i18n.t('tickets:list.column.subject') }),
    ).toBeInTheDocument();
  });

  it('shows the error state with the server detail, and retries', async () => {
    const u = userEvent.setup();
    vi.mocked(listTickets).mockRejectedValue(
      /* ApiError takes (problem, contentLanguage) — `status` comes off the
       * problem, not a separate argument. Got this wrong first time and the
       * test failed by rendering our fallback copy, which is exactly what it
       * would have done on a real transport failure. Right symptom, wrong
       * cause: the assertion was fine, the fixture was malformed. */
      new ApiError(
        {
          type: 'errors/unexpected',
          title: 'Unexpected',
          status: 500,
          detail: 'الخادم غير متاح',
          traceId: '00-abc-def-00',
        },
        'ar',
      ),
    );
    mounted();
    const alert = await screen.findByRole('alert');
    /* The SERVER's message when it authored one — our copy would be less useful
     * and would hide that the server said something. */
    expect(within(alert).getByText('الخادم غير متاح')).toBeInTheDocument();

    vi.mocked(listTickets).mockResolvedValue(page());
    await u.click(within(alert).getByRole('button'));
    expect(await screen.findByText('TCK-2026-000042')).toBeInTheDocument();
  });
});

describe('changing the page size returns to page 1', () => {
  it('does not keep the reader on a page that may not exist', async () => {
    /* Page 7 of 20-row pages is not page 7 of 100-row pages. Keeping the number
     * lands the reader somewhere they did not choose, and on a short list lands
     * them past the end — an empty screen that looks like a data problem. */
    const u = userEvent.setup();
    mounted('/tickets?page=7&pageSize=20');
    await screen.findByText('TCK-2026-000042');
    vi.mocked(listTickets).mockClear();

    await u.selectOptions(screen.getByRole('combobox'), '100');
    await waitFor(() => expect(listTickets).toHaveBeenCalled());
    expect(vi.mocked(listTickets).mock.calls[0]![0]).toEqual({ page: 1, pageSize: 100 });
  });
});

/*
 * AC-026-16 — THE CACHE RULE, ASSERTED AT THE SOURCE.
 *
 * Spec §5: a body returned by a write is what the server HAD, not what it
 * STORED. The two already differ by four digits of a timestamp, and a list is
 * exactly where a helpfully reused write response would go. `setQueryData` into
 * a list key seeds a value the server will never return again — nothing throws,
 * the row simply differs from the same row after a refresh.
 *
 * This cannot be asserted by rendering: the defect is a call that is ABSENT.
 * Only reading the source can prove an absence.
 */
describe('AC-026-16 — nothing under features/tickets seeds the cache from a write', () => {
  const dir = resolve(process.cwd(), 'src/features/tickets');
  const NL = String.fromCharCode(10);

  const sources = readdirSync(dir)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.'))
    .map((f) => ({ file: f, text: readFileSync(resolve(dir, f), 'utf8') }));

  it('reads more than one file, so an empty sweep cannot pass', () => {
    /* A guard that silently scanned nothing would be green forever. */
    expect(sources.length).toBeGreaterThan(3);
  });

  it.each(sources.map((s) => s.file))('%s calls no setQueryData', (file) => {
    const src = sources.find((s) => s.file === file)!.text;
    const code = src
      .split(NL)
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('*') && !l.startsWith('/*') && !l.startsWith('//'))
      .join(NL);
    expect(code).not.toContain('setQueryData');
    expect(code).not.toContain('setQueriesData');
  });

  it('renders the timestamp from the query payload, not from a literal', async () => {
    /* The other half: the date on screen comes from what the GET returned. */
    vi.mocked(listTickets).mockResolvedValue(
      page({ items: [{ ...ROW, createdAtUtc: '2026-01-09T00:00:00Z' }] }),
    );
    mounted();
    expect(await screen.findByText('09/01/2026')).toBeInTheDocument();
  });
});
