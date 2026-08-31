import {
  COMMUNICATION_CHANNELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
} from '../../lib/api-types.provisional';
import type { ListParams } from './tickets.api';

/* ---------------------------------------------------------------------------
 * `015` frontend half — the FILTER STATE, and it lives in the URL.
 *
 * ADR-011 §2 and `015` AC-14: the URL is the state container, so a filtered
 * list survives a reload, a back button, and being pasted into Slack. There is
 * no store and no `useState` mirror of it — a mirror is a second source of
 * truth that drifts the moment somebody navigates without going through the
 * setter.
 *
 * This module is the ONLY place that knows how a filter is spelled in a query
 * string. The page reads `readFilters` and writes `withFilters`; nothing else
 * touches a parameter name, so renaming one is one edit rather than a search.
 * ------------------------------------------------------------------------- */

/**
 * The six statuses, in BR-1's order.
 *
 * **This is the one list not imported from `api-types.provisional.ts`**, because
 * that file exports `TicketStatus` as a type and no runtime array for it — the
 * three it does export (`TICKET_PRIORITIES`, `TICKET_CATEGORIES`,
 * `COMMUNICATION_CHANNELS`) are imported above rather than repeated here, which
 * is what `lint:types` R1 is for and what it caught.
 *
 * Values, never translated labels: an enum value is an identifier, and a control
 * that submits its label submits something the server has never heard of.
 */
export const STATUS_VALUES = [
  'New',
  'Open',
  'InProgress',
  'PendingCustomer',
  'Resolved',
  'Closed',
] as const;

/**
 * The tabs across the top of the list, in the order the design draws them.
 *
 * FOUR OF SIX STATUSES, deliberately. `03-tickets-list.md` draws
 * `All · Open · In progress · Resolved`, and the tabs are a shortcut rather
 * than the whole filter — `New`, `PendingCustomer` and `Closed` are reachable
 * through the panel, which is where a filter that is not part of the daily
 * rhythm belongs. Adding all six would make the tab strip wider than the table
 * on a laptop.
 */
/* THE FOUR THE DESIGN DRAWS, and `Open` is deliberately not among them.
 *
 * The design frames supplied on 2026-08-31 show five chips: All, New, In
 * progress, Pending customer, Resolved. `Open` and `Closed` stay reachable from
 * the filter panel — a tab strip carries the states a queue is worked through,
 * not every value BR-1 defines.
 *
 * This list decides what the counts are fetched for: `TicketListPage` issues one
 * count query per entry plus one for `Closed`, and the labels come from
 * `status.*` in the catalogue. */
export const TAB_STATUSES = [
  'New',
  'InProgress',
  'PendingCustomer',
  'Resolved',
] as const;

/** How many values one repeated filter may carry before the server clamps. */
export const MAX_FILTER_VALUES = 20;

export interface FilterState {
  status: readonly string[];
  priority: readonly string[];
  category: readonly string[];
  channel: readonly string[];
  /** `''` (any), `'me'`, `'unassigned'`, or a user id. */
  assignee: string;
  /** `undefined` is "any" — NOT `false`, which means "not escalated". */
  escalated: boolean | undefined;
  search: string;

  /** ISO days — `2026-08-31` — or `''` for unset, the same shape `assignee`
   *  uses. THE BOUNDS ARE UTC DAYS and both ends are inclusive; the server owns
   *  that reading (GetTicketsQuery documents it), this only carries it. */
  createdFrom: string;
  createdTo: string;
}

export const NO_FILTERS: FilterState = {
  status: [],
  priority: [],
  category: [],
  channel: [],
  assignee: '',
  escalated: undefined,
  search: '',
  createdFrom: '',
  createdTo: '',
};

/**
 * Only values the server accepts survive.
 *
 * A URL is user input — hand-edited, pasted, or left over from an older build.
 * An unknown value would earn a `400` naming six accepted values, which is the
 * right answer to a client that guessed and the wrong thing to show somebody
 * who followed a stale link. So the page drops what it does not recognise and
 * renders the rest; the server's `400` stays the authority for anything that
 * reaches it another way.
 */
function known(raw: string[], allowed: readonly string[]): string[] {
  const lower = new Map(allowed.map((value) => [value.toLowerCase(), value]));

  return [...new Set(raw.map((value) => lower.get(value.trim().toLowerCase())))]
    .filter((value): value is string => value !== undefined)
    .slice(0, MAX_FILTER_VALUES);
}

/** `?assignee=` accepts three shapes and nothing else. */
function knownAssignee(raw: string | null): string {
  const value = (raw ?? '').trim();

  if (value === '') return '';
  if (value.toLowerCase() === 'me') return 'me';
  if (value.toLowerCase() === 'unassigned') return 'unassigned';

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : '';
}

/**
 * `?escalated=` is a THREE-STATE parameter and the absent state is not `false`.
 *
 * The server takes a nullable bool for the same reason: absent means "any" and
 * `false` means "not escalated". Reading it as a plain boolean would turn every
 * unfiltered list into a request for non-escalated tickets, which is invisible
 * until something is escalated.
 */
function knownEscalated(raw: string | null): boolean | undefined {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

/**
 * An ISO day the server's DateOnly will actually accept.
 *
 * The round-trip check is the half that matters: `2026-02-31` matches the
 * pattern, `new Date` silently rolls it to March 3rd, and the URL would then
 * filter by a day nobody typed. A value that does not survive the round trip is
 * dropped like every other unknown filter value.
 */
function knownIsoDay(raw: string | null): string {
  if (raw === null || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== raw
    ? ''
    : raw;
}

export function readFilters(params: URLSearchParams): FilterState {
  return {
    status: known(params.getAll('status'), STATUS_VALUES),
    priority: known(params.getAll('priority'), TICKET_PRIORITIES),
    category: known(params.getAll('category'), TICKET_CATEGORIES),
    channel: known(params.getAll('channel'), COMMUNICATION_CHANNELS),
    assignee: knownAssignee(params.get('assignee')),
    escalated: knownEscalated(params.get('escalated')),
    search: (params.get('search') ?? '').trim(),
    createdFrom: knownIsoDay(params.get('createdFrom')),
    createdTo: knownIsoDay(params.get('createdTo')),
  };
}

/**
 * The next URL for a filter change — and it RESETS THE PAGE.
 *
 * Page 5 of an unfiltered list is rarely page 5 of a filtered one, so keeping
 * the page number turns "filter to Open" into an empty table with a pager that
 * says 5 of 2. The reset is not a nicety: an empty result reads as "no matching
 * tickets" and the filter looks broken.
 *
 * `pageSize` is deliberately kept — it is a preference about the viewport, not
 * a position in a result set.
 */
export function withFilters(
  params: URLSearchParams,
  next: FilterState,
): URLSearchParams {
  const out = new URLSearchParams();

  const pageSize = params.get('pageSize');
  if (pageSize) out.set('pageSize', pageSize);

  for (const value of next.status) out.append('status', value);
  for (const value of next.priority) out.append('priority', value);
  for (const value of next.category) out.append('category', value);
  for (const value of next.channel) out.append('channel', value);

  if (next.assignee) out.set('assignee', next.assignee);
  if (next.escalated !== undefined) out.set('escalated', String(next.escalated));
  if (next.search) out.set('search', next.search);
  if (next.createdFrom) out.set('createdFrom', next.createdFrom);
  if (next.createdTo) out.set('createdTo', next.createdTo);

  return out;
}

/** Whether anything is filtering — decides *no matches* against *no tickets*. */
export function isFiltering(filters: FilterState): boolean {
  return (
    filters.status.length > 0 ||
    filters.priority.length > 0 ||
    filters.category.length > 0 ||
    filters.channel.length > 0 ||
    filters.assignee !== '' ||
    filters.escalated !== undefined ||
    filters.search !== '' ||
    filters.createdFrom !== '' ||
    filters.createdTo !== ''
  );
}

/** How many filters are active, for the badge on the Filters button. */
export function activeFilterCount(filters: FilterState): number {
  return (
    filters.status.length +
    filters.priority.length +
    filters.category.length +
    filters.channel.length +
    (filters.assignee ? 1 : 0) +
    (filters.escalated !== undefined ? 1 : 0) +
    (filters.createdFrom ? 1 : 0) +
    (filters.createdTo ? 1 : 0)
  );
}

/**
 * The request parameters. Empty values are omitted rather than sent blank.
 *
 * `?status=` — the parameter present and empty — is a `400` on some servers and
 * "no filter" on this one, and the backend half had exactly that defect on its
 * first run: the parameter binds as an array holding one empty string. Sending
 * nothing is unambiguous either way.
 */
export function toListParams(
  filters: FilterState,
  page: number,
  pageSize: number,
): ListParams {
  return {
    page,
    pageSize,
    ...(filters.status.length ? { status: [...filters.status] } : {}),
    ...(filters.priority.length ? { priority: [...filters.priority] } : {}),
    ...(filters.category.length ? { category: [...filters.category] } : {}),
    ...(filters.channel.length ? { channel: [...filters.channel] } : {}),
    ...(filters.assignee ? { assignee: filters.assignee } : {}),
    ...(filters.escalated !== undefined ? { escalated: filters.escalated } : {}),
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.createdFrom ? { createdFrom: filters.createdFrom } : {}),
    ...(filters.createdTo ? { createdTo: filters.createdTo } : {}),
  };
}
