import { apiFetch, apiFetchDetailed } from '../../lib/api';
import type {
  AddTicketCommentRequest,
  ChangeTicketAssigneeRequest,
  ChangeTicketStatusRequest,
  CreateTicketRequest,
  CustomerListItem,
  PagedResult,
  SupportUser,
  TicketCommentResponse,
  TicketListItem,
  TicketResponse,
  TimelineFilter,
  TimelinePage,
} from '../../lib/api-types.provisional';

/* ============================================================================
 * tickets.api.ts — the fetchers for this feature
 * ============================================================================
 * Thin on purpose: build a path, call the wrapper, return the body. No error
 * handling, no toast, no navigation — `lib/api.ts` throws a typed `ApiError` and
 * the ROUTE decides what a `404` means on this screen. A fetcher that renders is
 * a fetcher that has to be re-decided per screen.
 * ============================================================================ */

/** `POST /api/tickets`. Returns the body AND the `Location`, because the
 *  contract promises `Location: /api/tickets/{id}` and the client is told to
 *  navigate by reading it rather than by re-deriving the server's route. */
export async function createTicket(
  body: CreateTicketRequest,
  signal?: AbortSignal,
): Promise<{ ticket: TicketResponse; location: string | null }> {
  const result = await apiFetchDetailed<TicketResponse>('/api/tickets', {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
  return { ticket: result.data, location: result.location };
}

/** `GET /api/tickets/{id}` — `009` owns it, and it exists so the `Location` a
 *  `201` returns actually resolves. */
export function getTicket(id: string, signal?: AbortSignal): Promise<TicketResponse> {
  return apiFetch<TicketResponse>(`/api/tickets/${id}`, signal ? { signal } : {});
}

/* ---- The customer search --------------------------------------------------
 * `GET /api/customers` IS BUILT, and this now calls it. `008` delivered it on
 * 2026-08-28 and the picker answered from a hard-coded array for three days
 * behind `STUBBED_CUSTOMER_SEARCH`.
 *
 * THE FLAG AND THE ARRAY ARE DELETED, not set to false. The comment they
 * carried offered both — "flip to false, or delete the branch" — and a dead
 * stub behind a boolean is the thing that comes back: it survives a merge, it
 * keeps compiling, and the next person to see a picker returning six familiar
 * names has no reason to suspect the transport.
 *
 * Measured against the running API before the switch, rather than trusted:
 *
 *   search=علي   -> ["علي الأحمد"]   total 1
 *   search=ali    -> ["علي الأحمد"]   total 1   ← matched the EMAIL, ali@example.com
 *   search=zzz    -> []               total 0
 *   row shape     -> id, fullName, email, phone, companyName, createdAtUtc
 *
 * The row is exactly `CustomerListItem`, so nothing here had to change shape.
 *
 * ONE BEHAVIOUR WORTH KNOWING, and it is the server's rather than a defect
 * here: the phone is stored E.164, so a local-format number does not match.
 *
 *   search=0501234567  -> 0
 *   search=501234567   -> 1
 *   search=+966501234567 -> 1
 *
 * An agent typing the number the way a customer says it finds nothing. This
 * client deliberately does NOT strip the leading zero: normalising a search
 * term here would be the frontend inventing a rule the contract does not
 * describe, and the two copies would then disagree the first time the server's
 * own rule changed. Raised for `008`/`033` instead.
 * -------------------------------------------------------------------------- */

/**
 * `GET /api/customers?search=…&pageSize=…` — `008`.
 *
 * Ten rows, which is the picker's whole appetite: it is a find-as-you-type
 * control, not a directory. `033` builds the directory.
 *
 * The term is passed through untrimmed on purpose — the server trims it and
 * treats whitespace-only as absent, and doing it here as well would mean two
 * places to keep in step for no behaviour the user can see.
 */
export async function searchCustomers(
  search: string,
  signal?: AbortSignal,
): Promise<PagedResult<CustomerListItem>> {
  return apiFetch<PagedResult<CustomerListItem>>('/api/customers', {
    query: { search, pageSize: 10 },
    ...(signal ? { signal } : {}),
  });
}

/* ---- `010`, the list -------------------------------------------------------
 * Source: specs/010-ticket-list-and-detail/contracts/tickets-list-api.md and
 * its FRONTEND-API-GUIDE. The endpoint IS built.
 * -------------------------------------------------------------------------- */

/* NOT a contract shape — it is the request parameters this feature sends, and
 * the same object the query key is built from. Named ListParams rather than
 * TicketListParams because check-no-domain-types.mjs reads a domain prefix as a
 * hand-written contract type, and it is right to: the prefix would claim this
 * came from tickets-list-api.md, which it did not. */
export interface ListParams {
  page: number;
  pageSize: number;

  /* `015`. Repeated on the wire — `status=Open&status=InProgress` — which
   * `apiFetch` already does for an array. OR within one key, AND across keys
   * (BR-7.3, BR-7.4).
   *
   * OPTIONAL AND OMITTED WHEN EMPTY, not sent blank. `?status=` binds on the
   * server as an array holding one empty string rather than an empty array, and
   * that was a real defect in the backend half's first run: the invalid-check
   * saw `[""]` and answered `400` for a parameter that must mean *no filter*.
   * It is fixed there, and sending nothing is unambiguous against any server. */
  status?: readonly string[];
  priority?: readonly string[];
  category?: readonly string[];
  channel?: readonly string[];

  /** `me` | `unassigned` | a user id. `me` is resolved from the TOKEN by the
   *  server, so this client never sends its own id for it. */
  assignee?: string;

  /** Three-state. Omitted is "any"; `false` is "not escalated". */
  escalated?: boolean;

  /** Ticket number, subject, or customer name. Debounced by the caller. */
  search?: string;
}

/**
 * `GET /api/tickets?page=&pageSize=`
 *
 * NOTHING IS SORTED OR FILTERED HERE, and that is a rule rather than an
 * omission: the order is a contract (`CreatedAtUtc DESC, Id DESC`). Sorting one
 * page in the browser produces an order that is right on the page you are
 * looking at and wrong across pages, and it fails on exactly the rows the tie
 * breaker exists for.
 *
 * `page` and `pageSize` come back as the EFFECTIVE values after the server's
 * clamping — BR-7.2 clamps rather than rejecting, so a request for pageSize 500
 * is a `200` carrying 100. The control renders what came back, never what was
 * sent.
 */
export function listTickets(
  params: ListParams,
  signal?: AbortSignal,
): Promise<PagedResult<TicketListItem>> {
  return apiFetch<PagedResult<TicketListItem>>('/api/tickets', {
    /* Spread, not a hand-built object: `apiFetch` drops `undefined` entries and
     * repeats an array, so every filter is one line and adding the next one is
     * a property rather than a branch. `ticketFilters.toListParams` is what
     * decides which of them are present. */
    query: {
      page: params.page,
      pageSize: params.pageSize,
      ...(params.status ? { status: [...params.status] } : {}),
      ...(params.priority ? { priority: [...params.priority] } : {}),
      ...(params.category ? { category: [...params.category] } : {}),
      ...(params.channel ? { channel: [...params.channel] } : {}),
      ...(params.assignee ? { assignee: params.assignee } : {}),
      ...(params.escalated !== undefined ? { escalated: params.escalated } : {}),
      ...(params.search ? { search: params.search } : {}),
    },
    ...(signal ? { signal } : {}),
  });
}

/**
 * THE KEY IS AN OBJECT FROM THE START, and the guide is explicit about why:
 * `015` adds filter properties to this same object, and caching per filter
 * combination falls out of it (ADR-011 §2). `['tickets', page, pageSize]` would
 * have to be restructured then, invalidating every cached list on the way.
 */
export const ticketKeys = {
  list: (params: ListParams) => ['tickets', 'list', params] as const,
  detail: (id: string) => ['tickets', 'detail', id] as const,

  /** `GET /api/support-users`. NOT under `['tickets', …]`: the picker's list is
   *  not a ticket, and nesting it there means invalidating a ticket refetches a
   *  bounded, seeded set that did not change. */
  supportUsers: () => ['support-users'] as const,

  /* `timeline` WAS ABSENT — FE-027-08's block, not an oversight: the key's
   * parameters were the thing in dispute, the frozen contract saying
   * `{ page, pageSize }` and the server reading `{ before, limit }`, so writing
   * either would have baked the wrong answer into every cache entry and every
   * invalidation.
   *
   * RULED 2026-08-31: the cursor is the truth, recorded as a Contract change at
   * the foot of `013/contracts/ticket-timeline-api.md`.
   *
   * SO THE KEY CARRIES THE FILTER AND NOT THE CURSOR. A cursor is a position
   * inside one logical list; putting it in the key makes every scroll-back a new
   * cache entry that nothing ever invalidates, and `hasMore`/`nextCursor` then
   * belong to whichever page was fetched last. The pages are accumulated by
   * `useInfiniteQuery` under this one key instead. The FILTER does belong here —
   * `Comments` and `History` are different lists, and the counts differ. */
  timeline: (id: string, filter?: TimelineFilter) =>
    ['tickets', 'timeline', id, filter ?? 'all'] as const,
};

/* ---- `027`, the detail screen ---------------------------------------------
 * `getTicket` is above — `009` owns it and `024` already needed it.
 *
 * Four contracts, and each fetcher names the one it was transcribed from. A
 * fetcher that reads one contract and assumes the rest is how a field goes
 * missing.
 * -------------------------------------------------------------------------- */

/**
 * `GET /api/support-users` — `011`.
 *
 * **The body is a bare array.** `apiFetch` is given `SupportUser[]`, not a
 * `PagedResult<SupportUser>`, and that is asserted rather than assumed: an
 * object body here would otherwise flow on as `undefined.length` at the render
 * site, three frames away from the cause.
 *
 * NOT SORTED HERE. The server orders by `FullName` under the database
 * collation, and the render site sorts with `Intl.Collator` for the display
 * language — sorting in the fetcher would fix the order at fetch time and go
 * stale the moment the language changes without a refetch.
 */
export async function getSupportUsers(signal?: AbortSignal): Promise<SupportUser[]> {
  const users = await apiFetch<SupportUser[]>(
    '/api/support-users',
    signal ? { signal } : {},
  );

  /* A shape guard, not a type assertion. `011` froze a bare array and recorded
   * that paging it later is a BREAKING change — so the day that happens this
   * throws with a sentence naming the contract, instead of the picker quietly
   * rendering empty. */
  if (!Array.isArray(users)) {
    throw new TypeError(
      'GET /api/support-users returned a non-array body. The frozen contract ' +
        '(011) specifies a bare JSON array; paging it is a breaking change.',
    );
  }

  return users;
}

/**
 * `POST /api/tickets/{id}/comments` — `013`.
 *
 * **No `expectedVersion`**, unlike the other two mutations, and that is the
 * contract's own point: adding a comment does not modify the `Tickets` row, so
 * there is nothing to conflict over.
 */
export function addTicketComment(
  ticketId: string,
  body: AddTicketCommentRequest,
  signal?: AbortSignal,
): Promise<TicketCommentResponse> {
  return apiFetch<TicketCommentResponse>(`/api/tickets/${ticketId}/comments`, {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
}

/**
 * `PUT /api/tickets/{id}/status` — `012`. Returns the updated ticket.
 *
 * The response carries a NEW `version`. The caller takes it from here and the
 * old one is a `409` from this moment — which is why this returns the body
 * rather than `void`, and why nothing renders from it: `026` §5 forbids
 * painting a ticket from a write response, so the caller reads `version` and
 * invalidates.
 */
export function changeTicketStatus(
  ticketId: string,
  body: ChangeTicketStatusRequest,
  signal?: AbortSignal,
): Promise<TicketResponse> {
  return apiFetch<TicketResponse>(`/api/tickets/${ticketId}/status`, {
    method: 'PUT',
    body,
    ...(signal ? { signal } : {}),
  });
}

/**
 * `PUT /api/tickets/{id}/assignee` — `011`. Returns the updated ticket.
 *
 * `assigneeId: null` is an UNASSIGN, and it is always sent explicitly. The
 * server treats an omitted property as `null` too, so leaving it off would work
 * — and would make the difference between "unassign" and "I forgot a field"
 * invisible at the call site.
 */
export function changeTicketAssignee(
  ticketId: string,
  body: ChangeTicketAssigneeRequest,
  signal?: AbortSignal,
): Promise<TicketResponse> {
  return apiFetch<TicketResponse>(`/api/tickets/${ticketId}/assignee`, {
    method: 'PUT',
    body,
    ...(signal ? { signal } : {}),
  });
}

/* `getTimeline` IS NOT HERE. FE-027-08 is blocked on the contract disagreement
 * recorded at the foot of `lib/api-types.provisional.ts`: the frozen contract
 * and its FRONTEND-API-GUIDE specify `?page=&pageSize=` over the BR-7 envelope,
 * and the server reads `?before=&limit=` and returns a cursor page.
 *
 * A fetcher written to the contract would send two parameters the server
 * ignores, get the newest page back every time, and produce a feed that refuses
 * to scroll back with no error anywhere. Writing one to the implementation
 * instead would ratify an unrecorded contract change from this side. Neither is
 * this lane's call to make. */

/**
 * `GET /api/tickets/{id}/timeline?before=&limit=&type=` — `013`, extended by `034`.
 *
 * A CURSOR, not pages. `before` is the previous page's `nextCursor` and is opaque:
 * it encodes an instant, a type rank and an id as text, in the same sequence the
 * server's `ORDER BY` uses. **Do not parse it and do not build one** — `013` broke
 * a feed by comparing the id lexically, and SQL Server orders `uniqueidentifier`
 * by a byte order of its own.
 *
 * There is no `totalCount`, so there is no last page to count back from. The only
 * way to older entries is the cursor you were handed.
 *
 * `type` is **plural** — `Comments` | `History`. The entries' own `type` field says
 * `Comment` singular, so the natural guess is a `400`. Measured, not assumed.
 */
export function getTicketTimeline(
  id: string,
  params: { before?: string | undefined; limit?: number | undefined; type?: TimelineFilter | undefined } = {},
  signal?: AbortSignal,
): Promise<TimelinePage> {
  return apiFetch<TimelinePage>(`/api/tickets/${id}/timeline`, {
    query: {
      ...(params.before ? { before: params.before } : {}),
      ...(params.limit ? { limit: params.limit } : {}),
      ...(params.type ? { type: params.type } : {}),
    },
    ...(signal ? { signal } : {}),
  });
}
