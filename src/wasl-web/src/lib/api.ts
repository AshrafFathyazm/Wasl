/* ============================================================================
 * api.ts — the fetch wrapper
 * ============================================================================
 *
 * ZERO ENDPOINTS. ZERO DOMAIN TYPES.
 *
 * Nothing in this feature calls it. It exists so that the first feature needing a
 * request does not invent its own error handling inside a component — which is
 * how six screens end up with five different ways of showing a 409.
 *
 * What is deliberately absent, and where each belongs:
 *
 *   - No endpoint. No `getTickets`, no `createCustomer`, no path constant. The
 *     feature that owns an endpoint owns its path.
 *   - No domain type. `Ticket`, `Customer`, `TicketStatus`, `Role` do not appear.
 *     ADR-011 §6 requires the client's API types to be GENERATED from the OpenAPI
 *     document, never hand-written, so that a contract change becomes a compile
 *     error rather than a runtime surprise in whichever screen used the field.
 *     Hand-writing one here would be the exact defect that rule prevents.
 *   - No rendering. This throws a typed object; turning a 409 into a sentence is
 *     the screen's job.
 *   - No localization. `type`, the keys of `errors`, enum values, TicketNumber,
 *     and traceId pass through untouched (ADR-007 §3).
 * ============================================================================ */

/**
 * RFC 7807, exactly as docs/sdd/05-api-conventions.md defines it.
 *
 * This is a TRANSPORT shape, not a domain type: it describes the envelope every
 * non-2xx response arrives in, and it is identical for every endpoint in the
 * product. That is why it may live here while a `Ticket` may not.
 */
export interface ProblemDetails {
  /** Machine-readable, and NEVER localized. This is what a screen branches on —
   *  never `title`, never `detail`, both of which are translated. */
  type: string;

  /** Localized by the server, from its own catalogue. */
  title: string;

  status: number;

  /** Localized. Never a stack trace, SQL, an exception type name, or a
   *  connection string. */
  detail?: string;

  instance?: string;

  /** Always present, and it matches the server log entry. Show it when an error
   *  is unexplainable — it is the one string that makes a support call short. */
  traceId?: string;

  /** Field-level messages on a 400. The KEYS are request field names and are part
   *  of the contract, so they are never localized; the messages are. */
  errors?: Record<string, string[]>;
}

/**
 * Thrown for EVERY non-2xx, and for a transport failure.
 *
 * The wrapper never resolves with an error in the body, because the API never
 * returns one: `200` with an error inside is not part of this contract. So a
 * resolved promise is unambiguously a success, and a caller does not have to
 * inspect what it got back to find out which it is.
 */
export class ApiError extends Error {
  readonly problem: ProblemDetails;
  readonly status: number;

  /** The locale the server ACTUALLY applied, from Content-Language — so a caller
   *  can tell that its request for `ar` produced English. */
  readonly contentLanguage: string | null;

  constructor(problem: ProblemDetails, contentLanguage: string | null) {
    super(problem.title);
    this.name = 'ApiError';
    this.problem = problem;
    this.status = problem.status;
    this.contentLanguage = contentLanguage;
  }
}

export type QueryValue = string | number | boolean | undefined | string[];

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';

  /** JSON.stringify'd. Absent ⇒ no body and no Content-Type header. */
  body?: unknown;

  signal?: AbortSignal;

  /** Repeated for an array — `status=Open&status=InProgress`, per
   *  05-api-conventions. `undefined` entries are dropped, so a caller can spread
   *  optional filters without building the object conditionally. */
  query?: Record<string, QueryValue>;
}

/** Types the wrapper synthesises when the server did not supply a real one. */
export const TRANSPORT_PROBLEM_TYPES = {
  /** A non-2xx whose body was not a usable ProblemDetails. */
  unknown: 'errors/unknown',
  /** The request never reached a server, or the response never arrived. */
  network: 'errors/network',
} as const;

/**
 * SAME ORIGIN BY DEFAULT, and that default is now the one that works.
 *
 * The old default was a hard-coded `http://localhost:5000`, which was a guess
 * (spec Q-4) and wrong twice over: the API binds `5272`, and calling it directly
 * from `5199` is cross-origin, so the browser sends a preflight and the API —
 * which has no CORS policy — answers without `Access-Control-Allow-Origin`.
 * Measured, not deduced:
 *
 *   Access to fetch at 'http://localhost:5272/api/tickets' from origin
 *   'http://localhost:5199' has been blocked by CORS policy …
 *
 * `vite.config.ts` now proxies `/api` to the API in development, so requests are
 * same-origin and no preflight happens at all. `window.location.origin` is
 * therefore the right default, and `VITE_API_BASE_URL` stays as the override for
 * a deployment where the API is genuinely elsewhere — at which point that
 * deployment needs a CORS policy, and this comment is where to start reading.
 *
 * `||`, not `??`: an empty string is a value and must fall through, which
 * `??` would not do.
 */
const BASE_URL: string = import.meta.env.VITE_API_BASE_URL || window.location.origin;

/**
 * The locale to advertise. Overwritten by the i18n layer once it initialises —
 * a function rather than a value so this module does not import i18next and
 * become un-testable in isolation.
 *
 * TODO — stage 3 wires this to i18next's current language.
 */
let resolveLanguage: () => string = () => 'en';

export function setLanguageResolver(resolver: () => string): void {
  resolveLanguage = resolver;
}

function buildUrl(path: string, query: Record<string, QueryValue> | undefined): string {
  const url = new URL(path, BASE_URL);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, item);
      } else {
        url.searchParams.append(key, String(value));
      }
    }
  }

  return url.toString();
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/**
 * Read the body of a failed response without ever letting a parse error replace
 * the status the caller actually needed.
 *
 * A 500 that returns an HTML error page is the common case, and throwing
 * "Unexpected token '<'" from here would hide the 500 completely.
 */
async function problemFrom(response: Response): Promise<ProblemDetails> {
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }

  if (isProblemDetails(parsed)) {
    // Trust the server's own status over the envelope's, which can disagree.
    return { ...parsed, status: response.status };
  }

  return {
    type: TRANSPORT_PROBLEM_TYPES.unknown,
    title: response.statusText,
    status: response.status,
  };
}

/**
 * Perform one request.
 *
 * `T` is supplied by the CALLER — this module declares no response shape.
 *
 * Resolves only on 2xx. `204`, and any 2xx with an empty body, resolve as
 * `undefined`, which the signature reports as `T` so a caller declaring
 * `apiFetch<void>(…)` reads correctly.
 *
 * Throws `ApiError` on every non-2xx, on a transport failure, and never on
 * anything else. An `AbortError` is re-thrown unchanged, so a caller can tell a
 * cancelled request from a failed one — a cancelled request is usually the user
 * navigating away and must not surface as an error.
 *
 * There is NO retry. A 409 is information, not a transient fault, and retrying a
 * POST blindly is how a duplicate gets created.
 */
export async function apiFetch<T>(path: string, request: ApiRequest = {}): Promise<T> {
  return (await apiFetchDetailed<T>(path, request)).data;
}

/**
 * The same request, with the response metadata a few callers genuinely need.
 *
 * Added for one reason: `POST /api/tickets` promises `Location: /api/tickets/{id}`
 * and the client is told to navigate by reading it. Deriving the path from
 * `data.id` instead would work today and would be a client re-implementing a
 * server's routing — the exact class of duplication that goes stale silently.
 *
 * `apiFetch` stays the default because most callers want the body and nothing
 * else, and a two-field return at every call site is noise.
 */
export async function apiFetchDetailed<T>(
  path: string,
  request: ApiRequest = {},
): Promise<{ data: T; location: string | null; contentLanguage: string | null }> {
  const { method = 'GET', body, signal, query } = request;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    /* On EVERY request. This is the client half of ADR-007 §4's resolution
     * order — the server still outranks it with a stored PreferredLanguage. */
    'Accept-Language': resolveLanguage(),
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  /* TODO — 004-auth-and-roles: the bearer token is attached here, and a 401 is
   * intercepted here rather than in a screen. Nothing is stored yet, so there is
   * nothing to attach. */

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      /* `null`, not `undefined`: RequestInit.body is `BodyInit | null`, and under
       * exactOptionalPropertyTypes an explicit `undefined` is not assignable to
       * an optional property that does not list it. The compiler caught this. */
      body: body === undefined ? null : JSON.stringify(body),
      signal: signal ?? null,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause;
    }
    throw new ApiError(
      {
        type: TRANSPORT_PROBLEM_TYPES.network,
        title: cause instanceof Error ? cause.message : 'Network request failed',
        status: 0,
      },
      null,
    );
  }

  const contentLanguage = response.headers.get('Content-Language');

  if (!response.ok) {
    throw new ApiError(await problemFrom(response), contentLanguage);
  }

  const location = response.headers.get('Location');

  if (response.status === 204) {
    return { data: undefined as T, location, contentLanguage };
  }

  const text = await response.text();
  if (text === '') {
    return { data: undefined as T, location, contentLanguage };
  }

  return { data: JSON.parse(text) as T, location, contentLanguage };
}
