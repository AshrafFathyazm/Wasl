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

/* ---- The in-session culture override — FE-014-10 ---------------------------
 *
 * THE PROBLEM IT SOLVES. A token is signed and immutable, so the
 * `preferred_language` claim keeps its old value for the rest of the session
 * after a language change. That claim OUTRANKS `Accept-Language` (BR-8.5), so
 * without this the interface flips to Arabic and every server-authored sentence
 * — every validation message, every error title — keeps arriving in English
 * until the next sign-in. Arabic labels around an English error.
 *
 * THE FIX IS BR-8.4 ORDER, NOT A NEW MECHANISM. `?culture=` is the TOP of the
 * resolution order, above the claim, precisely so an explicit intent outranks a
 * stored one — and a user who just chose a language is an explicit intent.
 * Measured 2026-08-30: `QueryStringRequestCultureProvider` is registered first,
 * ahead of `PreferredLanguageCultureProvider`. `005` rewrote that list, so this
 * was checked rather than assumed.
 *
 * It costs no token reissue, no per-request database read, and no contract
 * change. The alternative — reissuing the token from the language endpoint —
 * turns a `204` into a `200` carrying a token, which is a contract other
 * features cite.
 *
 * IT MUST NOT OUTLIVE THE TOKEN. Once a new token is issued the claim carries
 * the right value and the override is not merely redundant, it is a stale
 * opinion that would outrank a correct claim. `clearSessionCulture()` is called
 * on every credential change — sign-in AND sign-out — so the override cannot
 * survive the thing that made it necessary.
 * -------------------------------------------------------------------------- */

let sessionCulture: string | null = null;

/** Set after an in-session language change. Dropped at the next token issue. */
export function setSessionCulture(culture: string): void {
  sessionCulture = culture;
}

/** Called on every credential change. The new token carries the new claim, so
 *  the override has done its job and must stop. */
export function clearSessionCulture(): void {
  sessionCulture = null;
}

/** Exported for the tests that prove it is set, sent, and then dropped. */
export function currentSessionCulture(): string | null {
  return sessionCulture;
}

/* ---- Auth — 025 ------------------------------------------------------------
 * The credential and the `401` response are wired here through resolvers, for
 * the same reason the language is: this module must not import `AuthContext`,
 * `tokenStorage`, or the router. It knows there is a credential and that a `401`
 * has a consequence; it does not know what a session is or how to navigate.
 * -------------------------------------------------------------------------- */

/** What `Authorization` carries, already composed. `null` = send no header. */
export interface Credential {
  /** From the sign-in response, NEVER a hard-coded `'Bearer'` (AC-025-03). */
  tokenType: string;
  accessToken: string;
}

let resolveCredential: () => Credential | null = () => null;

export function setCredentialResolver(resolver: () => Credential | null): void {
  resolveCredential = resolver;
}

let onUnauthenticated: (() => void) | null = null;

/**
 * Called when an authenticated request comes back `401`.
 *
 * The handler clears the session and redirects. It is NOT called for a `401`
 * from the sign-in endpoint — see `SIGN_IN_PATH` below.
 */
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

/**
 * THE ONE PATH THE INTERCEPTOR MUST NOT ACT ON. AC-27, and it is the whole
 * reason the exclusion is written as a constant rather than a condition at the
 * call site.
 *
 * Without it: a wrong password returns `401`, the interceptor clears a session
 * that does not exist and redirects to `/login` — the page the user is already
 * on. React Router replaces the route, the `LoginPage` remounts, its form state
 * and its error block go with it, and the screen looks like the submit button
 * does nothing at all. No error appears anywhere; nothing is logged. It is the
 * single most expensive defect available in this feature and it costs one
 * comparison to avoid.
 */
export const SIGN_IN_PATH = '/api/auth/token';

/**
 * Guarded so the handler fires ONCE per burst (AC-025-05).
 *
 * A screen with three parallel queries and a stale token gets three `401`s
 * within a few milliseconds. Un-guarded, that is three clears and three
 * redirects; React Router coalesces the navigations but the third arrives after
 * the first has already unmounted the caller, and the visible result is a
 * `/login` that flickers. The flag is released on the next successful request,
 * which is the first thing that happens after a fresh sign-in.
 */
let unauthenticatedHandled = false;

/** Exported for the test that proves the burst is collapsed, and called by
 *  `AuthContext` after a successful sign-in. */
export function resetUnauthenticatedGuard(): void {
  unauthenticatedHandled = false;
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

  /* THE OVERRIDE GOES ON EVERY REQUEST, INCLUDING SIGN-IN — and that is
   * harmless: it is null until someone changes language in-session, and the
   * only way to reach sign-in with it set is to sign out, which clears it.
   *
   * Appended LAST and only when absent, so a caller that passes its own
   * `culture` wins. A caller doing that is being explicit about one request,
   * which is exactly what the query parameter means. */
  if (sessionCulture !== null && !url.searchParams.has('culture')) {
    url.searchParams.append('culture', sessionCulture);
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

  /* 025. The scheme comes from the RESPONSE's `tokenType`, never from a literal
   * here: the contract issues that field precisely so the client does not
   * hard-code `'Bearer '`, and a concatenated literal keeps working until the
   * day it silently does not. */
  const credential = resolveCredential();
  if (credential !== null) {
    headers['Authorization'] = `${credential.tokenType} ${credential.accessToken}`;
  }

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
    /* THE INTERCEPTOR. AC-27.
     *
     * `path`, not the built URL: the exclusion compares what the caller asked
     * for, and `buildUrl` has already turned that into an absolute string with
     * an origin and a query on it. Comparing the built URL would mean matching
     * a substring, which is how `/api/auth/tokens-audit` would one day be
     * excluded by accident.
     *
     * The handler still runs BEFORE the throw, not instead of it: the caller
     * gets its `ApiError` either way, so a screen that wants to render
     * something on the way out still can. */
    if (response.status === 401 && path !== SIGN_IN_PATH) {
      if (!unauthenticatedHandled) {
        unauthenticatedHandled = true;
        onUnauthenticated?.();
      }
    }
    throw new ApiError(await problemFrom(response), contentLanguage);
  }

  /* A successful request means the credential is good again — release the burst
   * guard so a LATER expiry is still intercepted. Without this, one `401` in a
   * session would disarm the interceptor for the rest of the page's life. */
  unauthenticatedHandled = false;

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
