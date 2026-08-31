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
 * `GET /api/customers` IS NOT BUILT (spec Q-1). Its contract is frozen, so the
 * shape below is real; only the transport is stubbed.
 *
 * The stub and the real call live side by side ON PURPOSE. Swapping is deleting
 * the stub and the branch — not editing a hook until it works — so there is
 * nothing to hunt for, and `STUBBED_CUSTOMER_SEARCH` is greppable.
 * -------------------------------------------------------------------------- */

/** Flip to `false` — or delete the branch — the moment `008` is reachable. */
export const STUBBED_CUSTOMER_SEARCH = true;

/* Arabic and Latin names together, deliberately: a picker tested only on Latin
 * data never shows that a result row needs `dir="auto"`. */
const STUB_CUSTOMERS: CustomerListItem[] = [
  {
    id: '8f1c2d34-5678-4abc-9def-0123456789ab',
    fullName: 'شركة الرياض القابضة',
    email: 'ali@example.com',
    phone: '+966501234567',
    companyName: 'شركة الرياض القابضة',
    createdAtUtc: '2026-08-01T09:00:00Z',
  },
  {
    id: '2c7e9b10-1111-4bbb-8ccc-2223334445ff',
    fullName: 'مؤسسة الخليج للتقنية',
    email: 'noura@example.com',
    phone: '+966555512345',
    companyName: 'مؤسسة الخليج للتقنية',
    createdAtUtc: '2026-08-03T11:30:00Z',
  },
  {
    id: '5d0e7a11-3c2b-4a8f-8e10-9f4b6c2a7d31',
    fullName: 'عبدالله بن محمد العتيبي',
    email: 'abdullah@example.com',
    phone: null,
    companyName: null,
    createdAtUtc: '2026-08-10T14:05:00Z',
  },
  {
    id: '9a1b2c3d-4e5f-4071-8899-aabbccddeeff',
    fullName: 'Gulf Logistics Co.',
    email: 'ops@gulflogistics.example',
    phone: '+966533000111',
    companyName: 'Gulf Logistics Co.',
    createdAtUtc: '2026-08-12T08:20:00Z',
  },
];

/**
 * `GET /api/customers?search=…&pageSize=…`
 *
 * The real call is written and unreachable. The stub matches the frozen
 * contract's own filter rule — case-insensitive substring over `fullName`,
 * `email`, and `phone` — so the picker is exercised against the behaviour it
 * will get, not against something easier.
 */
export async function searchCustomers(
  search: string,
  signal?: AbortSignal,
): Promise<PagedResult<CustomerListItem>> {
  if (!STUBBED_CUSTOMER_SEARCH) {
    return apiFetch<PagedResult<CustomerListItem>>('/api/customers', {
      query: { search, pageSize: 10 },
      ...(signal ? { signal } : {}),
    });
  }

  /* One frame of latency, so the searching state is reachable in a real run
   * rather than only in a preview. */
  await new Promise((resolve) => setTimeout(resolve, 120));

  const needle = search.trim().toLocaleLowerCase();
  const items =
    needle === ''
      ? []
      : STUB_CUSTOMERS.filter((c) =>
          [c.fullName, c.email, c.phone]
            .filter((v): v is string => v !== null)
            .some((v) => v.toLocaleLowerCase().includes(needle)),
        );

  return {
    items,
    page: 1,
    pageSize: 10,
    totalCount: items.length,
    totalPages: items.length === 0 ? 0 : 1,
  };
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

  /* `timeline` IS ABSENT, and that is FE-027-08's block rather than an
   * oversight. The key's parameters are exactly the thing in dispute — the
   * frozen contract says `{ page, pageSize }` and the server reads
   * `{ before, limit }` — so writing either one now bakes the wrong answer into
   * every cache entry and every invalidation. See the block at the foot of
   * `lib/api-types.provisional.ts`. */
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
