import { apiFetch, apiFetchDetailed } from '../../lib/api';
import type {
  CreateCustomerRequest,
  CreateCustomerResponse,
  CustomerDetail,
  CustomerListItem,
  PagedResult,
  UpdateCustomerRequest,
  UpdateCustomerResponse,
} from '../../lib/api-types.provisional';

/* ============================================================================
 * customers.api.ts — the two fetchers for `032`
 * ============================================================================
 * Thin, exactly as `tickets.api.ts` is: build a path, call the wrapper, return
 * the body. No error handling, no toast, no navigation — `lib/api.ts` throws a
 * typed `ApiError` and the ROUTE decides what a `404` means on this screen.
 *
 * NO STUB ANYWHERE ANY MORE, as of 2026-08-31. This paragraph used to say the
 * sibling answered customer SEARCH from `STUB_CUSTOMERS` behind
 * `STUBBED_CUSTOMER_SEARCH`, and that the flag was still `true` three days after
 * `008` shipped `GET /api/customers`. It was, and it is not: the flag and the
 * array are deleted and `tickets.api.ts` calls the endpoint.
 *
 * The old note also said a lane deleting another lane's stub in passing is how a
 * picker regresses on a Friday — which was the right caution and is why the
 * switch was measured against the running API first, and why the deletion came
 * with the whole suite green rather than with a flipped boolean.
 * ============================================================================ */

/**
 * `GET /api/customers/{id}` — `008`.
 *
 * **A malformed id arrives here as `404`, not `400`.** The frozen contract says
 * `400 errors/validation` naming `id` and states there is no route constraint;
 * the built action is `[HttpGet("{id:guid}")]`, so an unparseable value never
 * matches the route and `UseStatusCodePages` envelopes a `404`. Asserted green
 * by `A_malformed_id_returns_404_which_the_contract_says_should_be_400`.
 *
 * Nothing is done about it here. The caller renders one not-found state for both
 * causes (AC-2), which is the only behaviour that is correct under either
 * resolution of the difference.
 */
export function getCustomer(id: string, signal?: AbortSignal): Promise<CustomerDetail> {
  return apiFetch<CustomerDetail>(
    `/api/customers/${encodeURIComponent(id)}`,
    signal ? { signal } : {},
  );
}

/**
 * `POST /api/customers` — `007`. Returns the body AND the `Location`.
 *
 * The contract promises `Location: /api/customers/{id}` and the client is told
 * to navigate by reading it rather than by re-deriving the server's route.
 * `024` measured that the running server sends the ABSOLUTE form
 * (`http://localhost:5272/api/customers/…`) where the contract shows the
 * relative one — both legal per RFC 9110 — so the caller parses it with
 * `new URL(value, origin)` and uses the pathname only.
 *
 * There is no retry, here or in the wrapper. This endpoint is not idempotent and
 * has no duplicate rule beyond BR-4.8's index: a blind retry of a `POST` that
 * timed out is how a second customer gets created.
 */
export async function createCustomer(
  body: CreateCustomerRequest,
  signal?: AbortSignal,
): Promise<{ customer: CreateCustomerResponse; location: string | null }> {
  const result = await apiFetchDetailed<CreateCustomerResponse>('/api/customers', {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
  return { customer: result.data, location: result.location };
}

/* ============================================================================
 * `033` — the directory, its filters, and the company vocabulary
 * ========================================================================= */

/**
 * `GET /api/customers`'s query, `008` as amended by `033`.
 *
 * **Every filter is optional and omitted when empty, never sent blank.** `015`
 * measured what a blank repeated parameter does on the server: `?status=` binds
 * as an array holding one empty string, which its invalid-check then refused —
 * a `400` for a filter bar that had just been CLEARED. The customers endpoint
 * drops blanks too (`CustomerFilters.Companies`), and sending nothing is
 * unambiguous against any server.
 */
export interface CustomerListParams {
  page?: number;
  pageSize?: number;

  /** Substring over name, email and phone. Debounced by the caller. */
  search?: string;

  /** `fullName` | `createdAtUtc`. An unknown value is a `400`, not a fallback. */
  sort?: CustomerSort;
  dir?: SortDirection;

  /** EXACT company names, OR-ed. The server clamps to twenty. */
  company?: readonly string[];

  /** `CompanyName IS NULL`, OR-ed with `company`. */
  noCompany?: boolean;

  /** ISO days — `2026-08-31` — read as UTC days, inclusive at both ends. */
  createdFrom?: string;
  createdTo?: string;

  /** `hijri` makes BOTH bounds Hijri. Omitted means Gregorian. */
  calendar?: 'hijri' | 'gregorian';
}

export type CustomerSort = 'fullName' | 'createdAtUtc';
export type SortDirection = 'asc' | 'desc';

/**
 * `GET /api/customers` — `008`, with `033`'s five parameters.
 *
 * **NOTHING IS SORTED OR FILTERED HERE**, and that is a rule rather than an
 * omission: the order is a contract, and sorting one page in the browser
 * produces an order that is right on the page you are looking at and wrong
 * across pages — failing on exactly the rows the tiebreak exists for.
 *
 * `page` and `pageSize` come back as the EFFECTIVE values after the server's
 * clamping (BR-7.2 clamps rather than rejecting), so the control renders what
 * came back and never what was sent.
 */
export function listCustomers(
  params: CustomerListParams,
  signal?: AbortSignal,
): Promise<PagedResult<CustomerListItem>> {
  return apiFetch<PagedResult<CustomerListItem>>('/api/customers', {
    /* Spread, not a hand-built object: `apiFetch` drops `undefined` entries and
     * repeats an array, so every filter is one line and the next one is a
     * property rather than a branch. */
    query: {
      page: params.page,
      pageSize: params.pageSize,
      ...(params.search ? { search: params.search } : {}),
      ...(params.sort ? { sort: params.sort } : {}),
      ...(params.dir ? { dir: params.dir } : {}),
      ...(params.company && params.company.length > 0
        ? { company: [...params.company] }
        : {}),
      ...(params.noCompany ? { noCompany: true } : {}),
      ...(params.createdFrom ? { createdFrom: params.createdFrom } : {}),
      ...(params.createdTo ? { createdTo: params.createdTo } : {}),
      ...(params.calendar ? { calendar: params.calendar } : {}),
    },
    ...(signal ? { signal } : {}),
  });
}

/** `GET /api/customers/companies` — `033` §5.3. */
export interface CustomerCompanies {
  items: string[];

  /**
   * Whether ANY active customer has no company — a fact about the directory, not
   * about this search.
   *
   * **It is not derivable from `items`.** The server caps the list, so an absent
   * name may exist beyond the cap, and a null company is not in `items` by
   * construction. The server answers it with its own `EXISTS`.
   */
  hasUncompanied: boolean;
}

/**
 * The companies the filter panel may offer.
 *
 * **Server-backed, which is an adjustment to the canvas** (`033` §5.3): the
 * canvas filters a hard-coded array of six in the browser. With 137 customers
 * that fits; the mechanism has to be the one that still works at ten thousand,
 * and a client-side filter over a truncated list silently hides companies that
 * exist. The cost is a debounce on that input, where the canvas is instant.
 */
export function getCustomerCompanies(
  params: { search?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<CustomerCompanies> {
  return apiFetch<CustomerCompanies>('/api/customers/companies', {
    query: {
      ...(params.search ? { search: params.search } : {}),
      ...(params.limit ? { limit: params.limit } : {}),
    },
    ...(signal ? { signal } : {}),
  });
}

/**
 * The cache keys. Shaped like `ticketKeys`, and for the same reason: the whole
 * parameter object is the key, so caching per filter combination falls out of it
 * and a filter added tomorrow needs no key change.
 */
export const customerKeys = {
  list: (params: CustomerListParams) => ['customers', 'list', params] as const,
  detail: (id: string) => ['customers', 'detail', id] as const,

  /** NOT under `['customers', …]`: the vocabulary is not a customer, and nesting
   *  it there would mean invalidating a customer refetches it. `027` learned the
   *  same thing about the tag set. */
  companies: (search?: string) => ['customer-companies', search ?? ''] as const,
};

/**
 * `PUT /api/customers/{id}` — `017`'s frozen contract, built by `035`.
 *
 * **NO RETRY, and unlike the create the reason is not idempotency.** This
 * endpoint *is* idempotent in the HTTP sense, but a retry would carry the same
 * `expectedVersion` — which the first attempt has already consumed if it
 * reached the server. The second attempt then answers `409` for a save that
 * succeeded, and the reader is told their copy is stale when it is not.
 *
 * The caller refetches on success and takes `version` from the response, which
 * the contract guarantees is immediately usable as the next `expectedVersion`.
 */
export function updateCustomer(
  id: string,
  body: UpdateCustomerRequest,
  signal?: AbortSignal,
): Promise<UpdateCustomerResponse> {
  return apiFetch<UpdateCustomerResponse>(`/api/customers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body,
    ...(signal ? { signal } : {}),
  });
}
