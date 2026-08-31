import { apiFetch, apiFetchDetailed } from '../../lib/api';
import type {
  CreateCustomerRequest,
  CreateCustomerResponse,
  CustomerDetail,
} from '../../lib/api-types.provisional';

/* ============================================================================
 * customers.api.ts — the two fetchers for `032`
 * ============================================================================
 * Thin, exactly as `tickets.api.ts` is: build a path, call the wrapper, return
 * the body. No error handling, no toast, no navigation — `lib/api.ts` throws a
 * typed `ApiError` and the ROUTE decides what a `404` means on this screen.
 *
 * NO STUB IN THIS FILE, and that is worth stating because the sibling has one.
 * `tickets.api.ts` still answers customer SEARCH from `STUB_CUSTOMERS` behind
 * `STUBBED_CUSTOMER_SEARCH`; both endpoints below are delivered and reachable,
 * so there is nothing to stand in for. (The stub flag is `026`/`024`'s to
 * retire — `GET /api/customers` shipped with `008`, and the flag is still
 * `true`. Noted in `032`'s `summary.md`, not touched here: a lane that deletes
 * another lane's stub in passing is how a picker regresses on a Friday.)
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
