# 004 — Auth and Roles

**Phase:** 0 · Foundation · **Story:** Auth · **Implements:** FR-4, BR-6, BR-9.2, BR-9.4
· **Status:** Specified, awaiting review

## Understanding

BR-6 is a matrix of permissions for two roles. Until a request carries a role, that
matrix is a table in a document — and an authorization test that reads a header the test
itself set proves only that a string was read (ADR-005). This feature makes the role
real, so that every later feature's `403` is a fact rather than a claim.

It is also the feature that decides, once, what "authenticated" means for every endpoint
that will ever exist here. That decision is made **structurally**: authentication is the
default for the whole application and the two anonymous endpoints opt out by name, so
forgetting to protect a new endpoint produces a loud `401` instead of an open door. The
inverse arrangement — each endpoint remembering `.RequireAuthorization()` — fails
silently and is the reason this is written as an acceptance criterion (AC-10) rather than
a convention.

Four of the mechanisms below fail **quietly** if configured wrongly, and each has its own
criterion for that reason:

| Fails silently as | Criterion |
|---|---|
| JWT bearer rewrites `sub` and `email` into WS-Federation claim URIs, so `FindFirst("sub")` returns nothing | AC-6 |
| The role claim is written as `role` but validated as the WS-Federation role URI, so **every** `Manager` gets `403` | AC-7 |
| `ClockSkew` defaults to five minutes, so an expired token keeps working and the expiry test is nondeterministic | AC-9 |
| `UseRequestLocalization()` registered before `UseAuthentication()`, so the stored `PreferredLanguage` is never read (ADR-007 §4 — "the single most likely defect in this piece of work") | AC-21 |

The `PreferredLanguage` claim is issued here, one feature before anything consumes it,
because `005-localization-core` resolves culture from a claim and ADR-007 §4 requires it
to cost no database query per request. A claim added later means reissuing every token.

**Token lifetime is 8 hours, and it is the only mitigation for having no revocation. It
is a weak one.** A stolen token is valid for up to eight hours and nothing in this system
can shorten that. The same gap means a user deactivated at 09:00 keeps working until
17:00. Both are stated here rather than in a footnote.

## In scope

### Backend

- `SupportUsers` table and its migration, `PasswordHash` included — PBKDF2 via
  `PasswordHasher<SupportUser>`, no plaintext anywhere, seeded accounts included
- Two seeded users, one `Agent` and one `Manager`, seeded idempotently at startup, with
  passwords supplied by configuration and **no default** (AC-12)
- `POST /api/auth/token` — email and password for a signed JWT carrying `sub`, `email`,
  `role`, and `preferred_language`, plus the user block so the client never parses a JWT
- Authentication as the application default: every endpoint requires a valid token except
  `GET /health` and `POST /api/auth/token`, which opt out by name (AC-10)
- ASP.NET Core authorization policies for the **role-only** rules of BR-6 —
  `ManagerOnly` for reassignment (BR-2.1), escalation (BR-3.2), direct priority change,
  and reading the audit log (BR-9.11)
- `ICurrentUser`, resolved from claims, for the **data-dependent** rules of BR-6 that the
  boundary cannot decide ("is this user the assignee?")
- The `401` and `403` audit rows (BR-9.2), written outside any transaction (BR-9.4), plus
  `Auth.LoginSucceeded` and `Auth.LoginFailed`
- Fail-fast startup validation of the signing key and the seed passwords (AC-11, AC-12)

### Frontend

- `/login` — the **plain** version. Solid brand panel, no canvas, no aurora, no drag
  physics, no entrance animation
- The app shell: expanded sidebar, header, user popover, sign-out
- Route protection: a signed-out visit to `/tickets` reaches `/login`, not the shell;
  a signed-in visit to `/login` redirects before paint
- One `AuthContext` written once at sign-in (ADR-011 §1), token storage chosen by the
  screen's existing *remember me* control, and a `401` interceptor that does not loop

## Out of scope

Everything below is absent by decision. The production consequence is stated because
"out of scope" without one is a gap pretending to be a boundary.

| Excluded | Production consequence | Where it lives |
|---|---|---|
| Registration | A user can only be added by changing configuration and restarting | Not planned. ADR-005 |
| User management (CRUD, deactivate, change role) | A departure is handled by editing the seed and redeploying. `IsActive` exists on the row and nothing sets it | Not planned. ADR-005 |
| Refresh tokens | At the eight-hour mark the user is signed out mid-task and loses unsaved form state | Not planned. ADR-005 |
| Password reset | A forgotten password needs an administrator with database access. The screen's *forgot?* link says exactly that | Not planned. ADR-005 |
| Token revocation | **A stolen token is valid for up to 8 hours and cannot be cancelled. Deactivating a user takes effect up to 8 hours later.** The 8-hour lifetime is the whole mitigation and it is weak | Not planned. ADR-005 |
| Lockout and rate limiting on login | **Unlimited password guesses against a known email. This is the most serious gap in the product and ADR-005 says so.** The only trace is one `Auth.LoginFailed` audit row per attempt, which records the attack without slowing it | Not planned. ADR-005 |
| MFA, email confirmation | Single-factor only; a leaked password is full access for 8 hours | Not planned. ADR-005 |
| The login panel's mesh, aurora, drag physics and entrance motion | The login screen is correct and plain rather than distinctive. Building the beautiful thing first is the documented way to lose a day (ADR-009) | Phase 6, `docs/sdd/design/screens/01-login.md` |
| The language switcher on `/login` | Someone who cannot read English cannot change the language *before* signing in. After sign-in the token's `preferred_language` is applied, so the signed-in experience is unaffected | `014-language-preference-and-rtl` |
| The 68px collapsed sidebar, its flyout and its tooltips | A 1280px laptop shows a sidebar it cannot narrow: 288 of 1280px spent on one nav item. A space cost, no data loss | `010-ticket-list-and-detail`, which is where the nav first has children for a flyout to show |
| `GET /api/support-users` | No assignee picker can be populated | `011-assign-ticket` |
| `PUT /api/me/language` | The language preference can be read from the token but not changed | `014-language-preference-and-rtl` |
| `GET /api/audit` | The `ManagerOnly` policy exists and no endpoint uses it yet. Audit rows are read with SQL | `019-audit-log-access` |
| The `AuditLog` table, the audit writer, and the transaction behaviour | — | `003-audit-trail`. This feature consumes them |
| The `ProblemDetails` middleware and the `errors/*` type registry | — | `002-error-contract`. This feature produces `401` and `403` through it |
| Culture resolution from the `preferred_language` claim | — | `005-localization-core`. This feature only issues the claim |
| Tokens, the eight primitives, and the React application itself | — | `006-design-system` |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | `003-audit-trail` ships an audit writer that can be called with **no ambient transaction**, and an `AuditLog` table matching `docs/sdd/03-domain-model.md` | The `401`/`403`/failed-login rows cannot satisfy BR-9.4 and this feature would have to introduce the writer itself. AC-15 through AC-19 fail loudly rather than degrade, which is the correct behaviour |
| A-2 | `002-error-contract` owns `errors/unauthenticated` and `errors/forbidden` and produces both through the shared middleware | This feature would build two error responses by hand, which Principle IV forbids. The contract in `contracts/auth-api.md` states the shapes it expects, so a mismatch is a diff and not a discovery |
| A-3 | There is no React application until `006-design-system`, per `specs/001-solution-skeleton/plan.md`. The frontend lane of this feature therefore runs **after** `006`, while the backend lane runs at position 4 | Nothing in the design changes; the FE tasks start earlier. The phase gate for `004` in `specs/README.md` is backend-only — "a token carries the role; a wrong-role call returns 403, proven by test" — which confirms the split rather than working around it |
| A-4 | `PasswordHasher<TUser>` is available from `Microsoft.Extensions.Identity.Core` **without** adopting ASP.NET Core Identity's schema or stores (`research.md` R-1) | The alternative is hand-rolling PBKDF2 over `Rfc2898DeriveBytes`, which is a security primitive written by us — worse than a package reference. ADR-005 names the hasher explicitly, so the package is the cheaper reading |
| A-5 | The seeded `Manager` is given `PreferredLanguage = ar` and the seeded `Agent` `en`, so `005` inherits a fixture that proves ADR-007 §4 end to end | If both are `en`, `005` must create an Arabic user itself before it can test culture resolution. Costs `005` a fixture; costs this feature nothing |
| A-6 | A protected placeholder route at `/tickets` is acceptable until `010` replaces it | Without it there is no protected route to redirect away from and AC-24 cannot be written. If the placeholder is refused, AC-24 targets `/customers` instead, on the same terms |
| A-7 | The two seeded emails are `agent@wasl.local` and `manager@wasl.local` | Only the fixtures and `quickstart.md` change. No behaviour depends on the values |
| A-8 | Docker is required for the integration suite, and is currently not running on this machine (`001/research.md` R-8) | Every integration AC here is unverifiable until Docker Desktop starts. Stated now rather than discovered by a red suite |

## Open questions

| # | Question | Working assumption |
|---|---|---|
| Q-A | Where does the browser keep the token? | **`localStorage` when *remember me* is checked, `sessionStorage` otherwise**, and the trade-off is recorded rather than implied: both are readable by any script on the origin, so this is XSS-exposed by construction. The mitigations are the ones already required — no `dangerouslySetInnerHTML` anywhere (`testing/security-checklist.md`), user content rendered as text, and the 8-hour lifetime. An `httpOnly` cookie would remove the XSS read, and was not assumed because ADR-005 specifies a bearer token; a cookie brings CSRF handling and a `SameSite` story that no requirement asks for (`research.md` R-9) |
| Q-B | `003` needs an actor for the audit row and `004` is the feature that produces one. Which declares `ICurrentUser`? | **`003` declares `ICurrentUser` with a single-property stub, and `004` replaces the implementation with the claims-backed one.** The interface has one consumer at `003` and a second here, which is the "one consumer" test in `specs/README.md`. If `003` instead hard-codes a system actor, `004` declares the interface and updates `003`'s behaviour in the same change — recorded in `plan.md` under **Dependencies** either way, never absorbed silently |
| Q-C | NFR-10's architecture test requires every `ICommand` to implement `IAuditableCommand`. `IssueTokenCommand` changes no state, must write its audit row **outside** a transaction (BR-9.4), and must write one on failure — which an in-transaction behaviour cannot do | **`IssueTokenCommand` carries a marker (`INonTransactionalRequest`) that opts it out of both the transaction and the auditing behaviours, and the slice writes its own two rows through the auth-event writer.** The architecture test's predicate becomes `ICommand && !INonTransactionalRequest`. This is a requirement this feature places on `003`; if `003` has already frozen the predicate, the marker is added there as a contract change |
| Q-D | Should a `401` on **every** tokenless request really write an audit row? BR-9.2 says yes, and a scanner or a misconfigured client can then write thousands | **Yes — BR-9.2 is followed as written.** `/health` is anonymous, so probes do not contribute. The flood risk is the same missing control as the login gap: there is no rate limiting (ADR-005). Recorded as a risk in `plan.md`, not solved by quietly disobeying the rule |
| Q-E | Where does the client-side i18next scaffolding land, given `005` precedes the creation of the React application in `006`? | **The client half of ADR-007's infrastructure lands with `006`**; `005` delivers the server half and the key-parity test, which is what its phase gate names. This feature's FE lane depends on whichever of the two provides it, and the dependency is named in `tasks.md` rather than assumed |
| Q-F | Does a deactivated user's live token keep working? | **Yes, until it expires.** `IsActive` is checked at sign-in only. Re-checking per request costs a database query on every call, which is exactly what ADR-007 §4 put `PreferredLanguage` in the token to avoid. Listed in **Out of scope** with its consequence rather than mitigated with a half-measure |

## Acceptance criteria

### The token endpoint

| # | Criterion |
|---|---|
| AC-1 | `POST /api/auth/token` with a seeded user's correct email and password returns `200` with `accessToken`, `tokenType`, `expiresAtUtc`, and a `user` block. No response field anywhere carries the password hash |
| AC-2 | The returned JWT carries `sub`, `email`, `role`, `preferred_language`, `jti`, `iss`, `aud`, `iat`, and `exp` — asserted **by claim name**, not by counting claims |
| AC-3 | `exp - iat` is exactly 8 hours (28 800 seconds), and `expiresAtUtc` in the body equals `exp`. The clock is the injected `TimeProvider`, so a test can fix it |
| AC-4 | A wrong password and an unknown email produce `401` responses that are byte-identical apart from `traceId`. Nothing in the body, the headers, or the response time distinguishes them |
| AC-5 | A missing, blank, or whitespace `email` or `password` returns `400` `errors/validation` naming the offending fields — never `401`. A malformed email address is also `400` |
| AC-6 | Inbound claim mapping is off: inside a request, `HttpContext.User.FindFirst("sub")` returns the user id and `FindFirst("email")` returns the email. Neither is rewritten to a `schemas.xmlsoap.org` or `schemas.microsoft.com` URI |
| AC-7 | The `ManagerOnly` policy **succeeds** for the seeded Manager's token and **fails** for the seeded Agent's. This is the criterion that catches a `RoleClaimType` mismatch, which otherwise denies every Manager silently |
| AC-8 | A token signed with a different key is rejected `401`. A token whose header says `alg: none` is rejected `401`. A token signed with an algorithm other than HS256 is rejected `401` |
| AC-9 | `ClockSkew` is `TimeSpan.Zero`: a token that expired one second ago is rejected `401`. Left at the default, five minutes of expired tokens are accepted and the expiry test passes or fails depending on when it runs |

### Every other endpoint

| # | Criterion |
|---|---|
| AC-10 | Every endpoint in the application's `EndpointDataSource` carries either authorization metadata or `IAllowAnonymous`, and the **only** anonymous endpoints are `GET /health` and `POST /api/auth/token` — asserted by enumerating the endpoints, not by reading `Program.cs`. An endpoint added later with neither returns `401`, because authentication is the fallback policy |
| AC-11 | The application **fails to start** when the JWT signing key is absent, or shorter than 32 bytes. The startup message names the configuration key and never the value. Left unvalidated, the application starts and only the first sign-in fails, with a `500` |
| AC-12 | The application **fails to start** when either seed password is not configured. There is no development default, because a default password is a committed credential wearing a different hat |
| AC-20 | `GET /health` returns `200` with no `Authorization` header, and writes no audit row |

### Persistence and seeding

| # | Criterion |
|---|---|
| AC-13 | Seeding runs twice and leaves exactly two rows, with both `PasswordHash` values unchanged by the second run |
| AC-14 | `SupportUsers.PasswordHash` never equals the submitted plaintext, and `PasswordHasher<SupportUser>.VerifyHashedPassword` returns `Success` against the stored value. Nothing in the repository, the logs, or an audit row contains the plaintext |
| AC-22 | `dbo.SupportUsers` exists with the columns, types, lengths, and `Latin1_General_100_CI_AS` collation of `docs/sdd/03-domain-model.md` — including `PasswordHash nvarchar(400)` and `RowVersion rowversion`. `UX_SupportUsers_Email` is unique and its `filter_definition` **is** `NULL`, which is correct here and is asserted rather than assumed: unlike `Customers`, this index is deliberately unfiltered, because email is the login identity and must be unique across inactive users too |
| AC-23 | Arabic text in `FullName` round-trips byte-identical, and `MANAGER@WASL.LOCAL` signs in against a stored `manager@wasl.local` — the case-insensitive collation, proven rather than trusted |

### Audit (BR-9.2, BR-9.4)

| # | Criterion |
|---|---|
| AC-15 | A successful sign-in writes exactly one `Auth.LoginSucceeded` row, `Outcome = Success`, with `ActorEmail` and `ActorRole` snapshotted onto the row (BR-9.6) |
| AC-16 | A failed sign-in writes exactly one `Auth.LoginFailed` row, `Outcome = Failed`, carrying the attempted email. **No column of that row contains the submitted password, any hash, or any token** — asserted by searching every column of the row, not by inspecting the code that wrote it (BR-9.7) |
| AC-17 | A request to a protected endpoint with no token returns `401` `errors/unauthenticated` and writes exactly one `Auth.Unauthenticated` row, `Outcome = Denied` |
| AC-18 | An Agent's token against a `ManagerOnly` endpoint returns `403` `errors/forbidden` and writes exactly one `Auth.Forbidden` row. The row is present **although no business transaction committed** — this is the BR-9.4 asymmetry, and it is the half that is implemented wrongly by accident |
| AC-19 | The `TraceId` on each of the four audit rows above equals the `traceId` in the response body (BR-9.9) |

### Middleware order

| # | Criterion |
|---|---|
| AC-21 | `UseAuthentication()` is registered before `UseAuthorization()`, and the position reserved for `UseRequestLocalization()` is after both. Verified by a test over the source of `Program.cs`, because ASP.NET Core exposes no ordered list of middleware at runtime. It is a weak test that catches the exact defect ADR-007 §4 calls the most likely one in the build |

### Frontend

| # | Criterion |
|---|---|
| AC-24 | A signed-out visit to `/tickets` lands on `/login?returnUrl=%2Ftickets`, and a successful sign-in returns to `/tickets` — not to a default landing page |
| AC-25 | A signed-in visit to `/login` redirects **before paint**. The login screen never flashes |
| AC-26 | The login form is a `<form>`: Enter submits; `email` and `password` carry `name` and `autocomplete="email"` / `"current-password"` so a password manager fills them; the `401` message is a single block above the submit with `role="alert"`, never attached to a field; focus returns to the email input after a failure |
| AC-27 | A `401` from any authenticated request clears the stored token and redirects to `/login`. A `401` from `POST /api/auth/token` does **not** — it renders the form error. Without that exclusion, a wrong password redirects to the page the user is already on, forever |
| AC-28 | Sign-out clears the token from **both** `localStorage` and `sessionStorage`, redirects to `/login`, and the browser Back button does not restore an authenticated view |
| AC-29 | Every string on `/login` and in the shell comes from a catalogue key present in both `en` and `ar` (BR-8.11). In `ar` the shell renders RTL with the sidebar on the inline-end, and the screen has been walked in Arabic with the findings written down |
| AC-30 | The `preferredLanguage` returned in the sign-in response is applied to the client immediately, so a Manager whose preference is `ar` lands in an Arabic interface without touching a switcher |

## Edge cases

| Case | Expected |
|---|---|
| Sign-in with correct email, wrong password | `401`, identical to an unknown email (AC-4). One `Auth.LoginFailed` row |
| Sign-in with an email that differs only in case | Succeeds. The column collation is case-insensitive (AC-23) |
| Sign-in with leading or trailing whitespace on the email | Succeeds. The email is trimmed and lowercased before lookup, the same normalisation BR-4.2 applies to customers |
| Sign-in for a user with `IsActive = 0` | `401`, with the same body as a wrong password. Not `403` — a deactivated account must not be distinguishable from a wrong password, or the endpoint becomes a user-directory oracle |
| A token presented after 8 hours | `401`. `ClockSkew` zero means at 8h00m01s, not 8h05m01s (AC-9) |
| A token whose signature is valid but whose `iss` or `aud` is wrong | `401`. Both are validated; a token minted for another audience is not this application's token |
| A malformed `Authorization` header (`Bearer`, no token; `Basic ...`; the raw JWT with no scheme) | `401` `errors/unauthenticated`, one audit row. Never `500` |
| Two `Authorization` headers | `401`. No attempt to pick one |
| A valid token for a user deleted from the database | Authorized. Nothing re-reads the row (Q-F). Recorded as a known limitation rather than patched with a per-request lookup |
| The signing key is rotated while a token is live | Every live token is rejected `401`. This is the only revocation mechanism that exists, it revokes everyone at once, and it is not a feature |
| Concurrent startup of two instances against one database | Seeding is idempotent by email, so the second finds both rows and inserts nothing. The unique index is the guarantee if both check at the same instant (AC-13, AC-22) |
| The seed password is changed in configuration and the app restarted | The existing hash is **not** updated — seeding is skip-if-exists. The old password keeps working. Stated because "I changed it and nothing happened" is otherwise a bug report |
| A `401` storm from a scanner | Thousands of `Auth.Unauthenticated` rows. Accepted (Q-D); the absent control is rate limiting, which ADR-005 already names |
| An Agent calls a `ManagerOnly` endpoint | `403` `errors/forbidden` with a localized `title`, an untranslated `type`, and one audit row (AC-18) |
| An Agent calls an endpoint whose rule is data-dependent, e.g. a ticket assigned to someone else | Out of this feature's reach: `ICurrentUser` is provided here, the decision belongs to `011` and `012`. The boundary does not have the data, per BR-6 |
| A request with a token and `Accept-Language: fr` | `200`, English. Locale resolution belongs to `005`; this feature only puts the claim in the token |
| The browser has a token in `localStorage` from before a signing-key change | Every request `401`, the interceptor clears the token and redirects to `/login` once (AC-27). It must not loop |
| Two tabs, one signs out | The other keeps its in-memory context until its next request, which then `401`s and redirects. No cross-tab broadcast is built; noted rather than implied |
| `/login` submitted twice by double-click | The submit is disabled while the mutation is pending, so one request is sent |
| JavaScript disabled | Nothing renders. A single-page application, per ADR-003. Not a supported case |

## Rules referenced

- **FR-4.1, FR-4.2, FR-4.3** — every endpoint but health authenticated; the user carries
  a role; enforcement is server-side and the UI only hides what the server would reject
- **BR-6** — the authorization matrix, and its own split between role-only policies at
  the boundary and data-dependent checks in the application layer
- **BR-2.1, BR-3.2, BR-9.11** — the three role-only rules the `ManagerOnly` policy serves
- **BR-8.1, BR-8.4, BR-8.7** — the two locales, the resolution order the
  `preferred_language` claim serves, and the machine-readable values that stay untranslated
- **BR-9.2** — every authentication and authorization event writes an audit row
- **BR-9.4** — a denied or failed action has no transaction to join, so its row is written
  independently. The asymmetry is deliberate and is tested
- **BR-9.6** — the actor's email and role are snapshotted, never joined
- **BR-9.7** — no password, hash, token, or signing key reaches an audit row
- **BR-9.9** — the audit row's `TraceId` matches the response `traceId`
- **NFR-2, NFR-4, NFR-10** — documented status codes, no leakage, an audit gap is a build
  failure
- **ADR-005** — the mechanism and, more importantly, its named limits
- **ADR-007 §4** — `UseRequestLocalization()` after `UseAuthentication()`, and the
  `PreferredLanguage` claim that makes the culture provider free
- **ADR-008** — the audit log, and why a denial is written outside a transaction
- **ADR-010** — two projects; the slice at `Features/Auth/IssueToken/`, the cross-cutting
  parts at `Common/Auth/`
- **ADR-011 §1, §4, §5** — one small auth context and no store; fetching at route level;
  expected states inline
- **ADR-013** — `nvarchar`, `datetime2(3)`, `rowversion`, the case-insensitive collation
  on `Email`, and a filter definition that must be verified

## Why this is not one big "add JWT" task

Adding JWT bearer authentication is roughly fifteen lines. Every criterion above exists
because one of those lines has a default that is wrong here and wrong quietly: the claim
map rewrites names, the role claim type mismatches, the clock skew accepts expired
tokens, the fallback policy is absent so a new endpoint is public, the signing key is too
short so only the first sign-in fails, the localization middleware sits in the template's
position and reads nobody's preference.

Not one of those produces an error at startup or a failing build. AC-6, AC-7, AC-9,
AC-10, AC-11, and AC-21 are the ones that turn each into something a stranger can catch.

---

# `004b` — Specification

**Status:** written 2026-08-29, **awaiting review** · **Parent:** `004-auth-and-roles`

No separate folder, the same as `002b` and `003b`: a deferred half belongs beside the feature that
deferred it, and its acceptance criteria are already numbered in this file.

## What `004b` owns, collected from where it was promised

Four commitments, made in four places over three days. Listed together because none of them has
been in one place until now.

| # | Commitment | Where it was recorded |
|---|---|---|
| 1 | **AC-17** — a `401` writes one `Auth.Unauthenticated` row, `Outcome = Denied` | `004` spec, `tasks.md`, `README.md`, and cited by `008` and `011` |
| 2 | **AC-18** — a `403` writes one `Auth.Forbidden` row | Same, and `011` built its whole BR-6 argument on this being absent |
| 3 | **Rate limiting and lockout** on `POST /api/auth/token` | `004` summary, `README.md`, `011` spec |
| 4 | `expectedVersion` is validated by allocating a buffer the size of the input | `README.md`'s recorded-gaps table |

## The gap, stated exactly

**`dbo.AuditLog` has no record of anyone being refused access.** Sign-in success and failure both
write rows, because `IssueTokenCommand` is an `IAuditableCommand` and `003`'s pipeline handles
both paths. A *denial by the authorization middleware* throws nothing, so MediatR never sees it and
no row exists.

`011` measured what that costs. Moving BR-2's checks into a policy made the denial's audit row
return `found 0: {empty}` — and the conclusion recorded there was that **the placement of a
permission check currently decides whether the refusal is recorded at all.** `004b` is what removes
that coupling: after it, a denial is audited wherever it is raised.

## In Scope

- An `IAuthorizationMiddlewareResultHandler` that writes the row and then delegates the response
- `Auth.Unauthenticated` and `Auth.Forbidden` rows, `Outcome = Denied`, through the existing
  `IAuditWriter.WriteIndependentAsync`
- Rate limiting on `POST /api/auth/token`
- The `expectedVersion` allocation

## Out of Scope

| Excluded | Reason |
|---|---|
| `UseStatusCodePages` and the `404`/`405`/`415` envelopes | `002b`. A different mechanism — those statuses are produced by routing and content negotiation, not by authorization |
| A malformed route `Guid` returning `404` | `002b`, and recorded as knowingly unmet in `007` and `011` |
| Account lockout | See Q-B. **A lockout is a denial-of-service vector against a named user**, and refusing it is a decision rather than an omission |
| Auditing a `401` on `/health` | `/health` is anonymous by design and probed every few seconds. `004` AC-20 asserts it writes no row, and that stays true |

---

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| **Q-A** | **The middleware's `401` and `403` currently have EMPTY bodies** — no `type`, no `traceId`, nothing a client can branch on. Measured in `004`'s live run (`body: []`) and again in `011`'s negative control. Does `004b` envelope them, or is that `002b`? | **`004b` envelopes them, and AC-19 forces the question.** AC-19 requires the `traceId` on each denial row to equal the `traceId` **in the response body** — and there is no body. So AC-17 and AC-18 cannot be verified as written unless the body exists. `002b` owns the statuses produced by *routing* (`404`, `405`, `415`), which is a different mechanism; `004b` is already building the one component that sits on the authorization path, and writing it twice is the alternative. **A ruling is needed because it widens `004b` beyond the four commitments above** |
| **Q-B** | **What shape of rate limiting?** Fixed window, sliding, token bucket; keyed by IP, by email, or by both; and does a lockout follow? | **A fixed window per IP, and NO account lockout.** ⟶ **CORRECTED 2026-08-29 to the (address, email) PAIR, and confirmed by the product owner:** *"I said per IP in order to prevent a lockout keyed by email. What was built is different: the throttle is on the PAIR, not on the email alone — so an attacker from one address is slowed while a legitimate user from another address is unaffected, and the denial-of-service hole I was guarding against does not exist. The pair is also more precise: it tells a script trying a hundred addresses from one IP apart from an office behind NAT signing in normally."* The paragraph below is the reasoning **as it was written**, and it is left standing because it is what the ruling was made on — see `tests.md` control B for the measurement that changed it. Reasons, in order: a lockout keyed by email is a denial-of-service vector against a named user — anyone who knows an address can lock its owner out, which converts a guessing attack into a guaranteed outage. Keying by IP alone is weaker against a distributed attacker and harms nobody. Fixed window over sliding because ASP.NET Core ships it, the numbers are legible in a log, and nothing here needs the precision. **The limit's real job is stated honestly: it slows a script, it does not stop a determined one.** A ruling is wanted on the numbers |
| **Q-C** | Does a rate-limited request write an audit row? | **Yes — `Auth.RateLimited`, `Outcome = Denied`.** It is the one signal that distinguishes a user who forgot their password from a script, and an audit trail that records failures but not the burst that triggered the limit answers the wrong half of the question. **This adds a fifth action name to BR-9's table**, which is a documented change |
| **Q-D** | `004` renamed sign-in to a single `Auth.SignIn` because one command carries one action string (D-2). Do these follow that, or use BR-9's two names? | **BR-9's two names, unchanged.** `Auth.Unauthenticated` and `Auth.Forbidden` are not written by a command — the handler chooses the name from the *result*, so it can name each precisely. The `Auth.SignIn` compromise existed because `IAuditableCommand.AuditAction` is one property evaluated on both paths; that constraint does not apply here. **The asymmetry is deliberate and worth stating**, because two conventions in one table otherwise reads as drift |
| **Q-E** | The `expectedVersion` allocation — Kestrel body limit, or a length check in the validator? | **A length check in the validator, not a Kestrel limit.** The README recorded Kestrel as "the cleaner fix" and that is wrong on inspection: a global body limit would also cap a legitimate 4000-character comment body, and the actual defect is one field. A `MaximumLength` rule on `expectedVersion` costs one line and refuses the input before `Convert.TryFromBase64String` allocates. **Recorded as a correction to a previously written recommendation** |

---

## Acceptance Criteria

AC-17, AC-18 and AC-19 are `004`'s, unchanged and finally satisfiable. AC-31 onward are new.

| # | Criterion |
|---|---|
| AC-17 | A request to a protected endpoint with no token returns `401` `errors/unauthenticated` and writes **exactly one** `Auth.Unauthenticated` row, `Outcome = Denied` |
| AC-18 | An Agent's token against a `ManagerOnly` endpoint returns `403` `errors/forbidden` and writes **exactly one** `Auth.Forbidden` row. The row is present **although no business transaction committed** |
| AC-19 | The `traceId` on each denial row equals the `traceId` in the response body (BR-9.9) |
| **AC-31** | The `401` and `403` bodies are `ProblemDetails` with a `type`, a `status`, an `instance` and a `traceId` — **not empty.** Asserted over the raw response text, because an empty body and a body with a null field are indistinguishable once deserialised |
| **AC-32** | The denial row names the actor **when there is one**: a `403` carries `ActorUserId`, `ActorEmail` and `ActorRole` from the token; a `401` carries none, because there is no authenticated principal — and that null is asserted, not omitted |
| **AC-33** | `GET /health` with no token still writes **no** row (`004` AC-20 preserved). A liveness probe runs every few seconds and auditing it would bury every real event |
| **AC-34** | The row carries **no token, no password and no `Authorization` header value** — asserted by searching every column, not by reading the writer |
| **AC-35** | Repeated failed sign-ins **for one (address, email) pair** are rate-limited with `429`, and the response carries `Retry-After`. *Was "from one IP"; corrected 2026-08-29 — the pair is what was built and what the product owner confirmed* |
| **AC-36** | A rate-limited request writes exactly one `Auth.RateLimited` row, `Outcome = Denied` |
| **AC-37** | **A successful sign-in is not rate-limited by another user's failures from the same address** — an office behind one NAT address must not lock out its own staff. This is the criterion that decides whether the limit is usable |
| **AC-38** | An `expectedVersion` of 10 MB is refused by a length rule **before** any base64 buffer is allocated |

## Edge Cases

| Case | Expected |
|---|---|
| A `401` on an endpoint that does not exist | `404`, not `401` — routing runs first, and no denial row. `002b` owns that body |
| A `403` where the handler *also* would have thrown | The middleware wins; it runs first. One row, `Auth.Forbidden`, not two |
| A denial during a request that had already opened a transaction | Cannot happen — authorization runs before MediatR. Stated because the row is written outside any transaction regardless, which is `WriteIndependentAsync`'s whole purpose |
| The audit write itself fails | The response is unchanged. `WriteIndependentAsync` never throws (`003` AC-11), and a `403` that becomes a `500` because logging failed is worse than an unlogged `403` |
| Two denials in one second from one caller | Two rows. Deduplication would hide exactly the burst an investigation is looking for |
| A rate-limited request with **correct** credentials | Still `429`. The limiter runs before the handler, and checking credentials first would make the limiter an oracle for whether a password was right |

## Rules Referenced

BR-9.2 (authentication and authorization events), BR-9.4 (denials and failures write a row outside
any transaction), BR-9.7 (nothing sensitive in the row), BR-9.9 (the `traceId` matches the
response), BR-6, ADR-005.

**This is the feature that makes `008`'s and `011`'s removed BR-9.2 references true again.** Both
struck it from their rules lists with a note that nothing writes a denial row; when `004b` lands,
both notes become stale and are corrected in the same commit.
