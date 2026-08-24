# 004 — Research

Questions that had to be answered before the plan could be written, what was checked,
and what each one settled. A question that turned out not to matter is recorded as such,
because "we looked and it did not matter" is information too.

---

## R-1 · Where does `PasswordHasher<T>` come from, and does using it drag in ASP.NET Core Identity?

**Checked:** ADR-005 names `PasswordHasher<T>` (PBKDF2) explicitly. The type lives in the
`Microsoft.AspNetCore.Identity` namespace, which reads as "adopt Identity".

**Settled:** it ships in **`Microsoft.Extensions.Identity.Core`** — the primitives
package. Referencing it gives `IPasswordHasher<TUser>`, `PasswordHasher<TUser>`,
`PasswordHasherOptions`, and `PasswordVerificationResult`. It brings **no** `DbContext`,
no `IdentityUser`, no store interfaces, no `AddIdentity()` schema, and no
`AspNetUsers`-style tables. The `TUser` generic parameter is unconstrained and is only
used for options resolution, so `PasswordHasher<SupportUser>` over our own entity is the
intended use.

`PasswordHasherOptions.CompatibilityMode` defaults to `IdentityV3`: PBKDF2-HMAC-SHA512,
100 000 iterations, a 128-bit salt, a 256-bit subkey, encoded as one base64 string with a
leading format marker. That is what lands in `PasswordHash`.

**Rejected:** hand-rolling PBKDF2 over `Rfc2898DeriveBytes`. It is fifteen lines and it is
a security primitive written by us, with our own choice of iteration count, our own salt
handling, and our own encoding — three things that are wrong in a way no test here would
catch. A package reference is cheaper and better reviewed.

**Rejected:** BCrypt or Argon2 via a third-party package. Both are defensible and neither
is what ADR-005 says. Changing the hash algorithm is an amendment to that ADR, not a
decision inside this plan.

**Consequence for the plan:** `Wasl.Domain` still references nothing. `SupportUser.Create`
takes an already-hashed string, so the domain has no code path that could receive, log, or
persist a plaintext password. That is a structural guarantee rather than a rule to
remember, and it is why the hasher lives in `Wasl.Api` next to the seeder and the handler.

---

## R-2 · Does JWT bearer rewrite claim names, and what does that break?

**Checked:** the inbound claim-type mapping in the Microsoft token handlers, against what
`spec.md` AC-6 and AC-7 need.

**Found, and it is the defect this feature is most likely to ship:**

`JwtSecurityTokenHandler.DefaultInboundClaimTypeMap` translates short JWT claim names
into WS-Federation URIs during validation. `sub` becomes
`http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier`, `email` becomes
`.../claims/emailaddress`, and `role` becomes
`http://schemas.microsoft.com/ws/2008/06/identity/claims/role`.

So a token minted with `sub` arrives as a principal where `FindFirst("sub")` returns
**null**. Nothing throws. The claim is present under a different name, `ICurrentUser`
returns nothing, and the failure surfaces as "the audit row has no actor" several features
later.

**Settled, and both halves are required:**

| Setting | Value | Without it |
|---|---|---|
| `JwtBearerOptions.MapInboundClaims` | `false` | `sub`, `email`, and `role` are renamed — AC-6 fails |
| `TokenValidationParameters.NameClaimType` | `"sub"` | `User.Identity.Name` is null |
| `TokenValidationParameters.RoleClaimType` | `"role"` | **`RequireRole`, `IsInRole`, and every role policy silently never match — every Manager gets `403`** — AC-7 fails |

The second row is the nastier of the two: with `MapInboundClaims = false` the role claim
stays `role`, but `ClaimsIdentity`'s default `RoleClaimType` is still the WS-Federation
URI, so authorization looks for a claim type that no longer exists. Turning the map off
without setting `RoleClaimType` produces an application where authentication works, the
token visibly contains `"role": "Manager"`, and every manager-only action is denied. That
is the exact shape of a defect that survives review, which is why AC-7 tests the policy
rather than the claim.

**Also settled:** use `Microsoft.IdentityModel.JsonWebTokens.JsonWebTokenHandler` for
issuing, not the legacy `JwtSecurityTokenHandler`. The legacy handler applies an *outbound*
map as well, which quietly rewrites `ClaimTypes.Role` back into a URI on the way out — the
same class of surprise in the other direction. `JsonWebTokenHandler.CreateToken` writes
the claim names it is given.

---

## R-3 · What is the default `ClockSkew`, and does it matter?

**Checked:** `TokenValidationParameters.ClockSkew`.

**Found:** it defaults to **five minutes**. A token that expired four minutes ago is
accepted.

**Why it matters here specifically:** AC-3 asserts an exact 8-hour lifetime and AC-9
asserts that an expired token is rejected. With the default skew, a test that fast-forwards
a fake clock to `exp + 1 second` **passes validation**, so the test either fails for the
wrong reason or is written to fast-forward past the skew and then silently tolerates a
five-minute hole in the only revocation control this system has.

**Settled:** `ClockSkew = TimeSpan.Zero`, with AC-9 asserting it. The skew exists to absorb
clock drift between issuer and validator; here they are the same process, so there is
nothing to absorb.

---

## R-4 · Fallback policy, or `RequireAuthorization()` on every endpoint?

**Checked:** what FR-4.1 requires ("every API endpoint except health requires an
authenticated user") against the two mechanisms ASP.NET Core offers.

| Option | Failure mode when someone forgets |
|---|---|
| `.RequireAuthorization()` per endpoint, or on a route group | A new endpoint added outside the group is **public**, returns `200`, and nothing reports it |
| `AuthorizationOptions.FallbackPolicy = RequireAuthenticatedUser()` | A new endpoint is protected by default. Forgetting `.AllowAnonymous()` on a genuinely public one produces a loud `401` on the first call |

**Settled: the fallback policy**, with `GET /health` and `POST /api/auth/token` carrying
`.AllowAnonymous()`. This is Principle V — the safe state is the default, and the unsafe
state requires a deliberate, named, reviewable opt-out.

**And a test, because the policy alone is not enough.** `FallbackPolicy` applies only to
endpoints with **no** authorization metadata at all. An endpoint that somehow acquires
`[AllowAnonymous]` is exempt from it, and route groups can attach metadata in ways that
are not obvious at the call site. AC-10 therefore enumerates `EndpointDataSource` at
runtime and asserts the anonymous set is exactly two endpoints — a test that reads the
assembled application rather than the source that assembled it.

**Rejected:** `RequireAuthenticatedUser` as the *default* policy
(`AuthorizationOptions.DefaultPolicy`). `DefaultPolicy` applies to
`[Authorize]` with no arguments; it does nothing for an endpoint with no attribute, which
is the case that matters.

---

## R-5 · How is a `401` or `403` audited when there is no MediatR pipeline to hook?

**The problem:** BR-9.2 requires an audit row for every `401` and `403`. Both are produced
by the authorization middleware, long before any MediatR request exists, so the pipeline
behaviour that `003` uses cannot see them.

**Options checked:**

| Option | Verdict |
|---|---|
| Terminal middleware that inspects `HttpContext.Response.StatusCode` after `await next()` | **Rejected.** It cannot distinguish an authorization denial from a `403` the application produced for its own reasons, and by then the response has often started, so a database call sits after the point of no return |
| `JwtBearerEvents.OnChallenge` / `OnForbidden` | **Partly.** `OnChallenge` fires for the missing-token case but not for a wrong-role denial, and `OnForbidden` fires only for the bearer scheme's own forbid. Two hooks, two shapes, and a policy failure can bypass both |
| `IAuthorizationMiddlewareResultHandler` | **Chosen.** One replaceable service that sees `PolicyAuthorizationResult` before the response is written, and can tell `Challenged` (→ `401`, `Auth.Unauthenticated`) from `Forbidden` (→ `403`, `Auth.Forbidden`). It covers a missing token, an expired token, a bad signature, and a failed policy through the same code path, because all four arrive as one of those two results |

**Settled:** a custom `IAuthorizationMiddlewareResultHandler` that writes the audit row and
then delegates to the default handler for the response itself, so the `ProblemDetails`
shape stays owned by `002`. `JwtBearerEvents.OnAuthenticationFailed` is still wired, but
only to **log** why validation failed (expired versus bad signature) — that reason is
useful to an engineer and must not reach the client (NFR-4), and it does not belong on the
audit row either.

**Consequence:** the write happens with no ambient transaction, which is exactly BR-9.4.
It is not an exception carved out for this case; it is the only shape available at that
point in the pipeline, which is a good sign the rule was written by someone who had looked.

---

## R-6 · Can the sign-in audit rows go through the MediatR auditing behaviour?

**Checked:** BR-9.3 (in-transaction for a successful mutation), BR-9.4 (independent for a
denial or failure), and NFR-10 (the architecture test requiring every `ICommand` to
implement `IAuditableCommand`).

**Found a genuine conflict**, recorded in `spec.md` Q-C rather than resolved by preference:

- Sign-in changes no state, so a transaction has nothing to protect.
- A **failed** sign-in must still write a row (BR-9.2). If the row were written by an
  in-transaction behaviour and the handler threw, the transaction would roll back and take
  the row with it — the failure would be unrecorded, which is the precise outcome BR-9.4
  exists to prevent.
- But NFR-10's architecture test would fail the build if `IssueTokenCommand` did not
  implement `IAuditableCommand`.

**Settled:** `IssueTokenCommand` carries an `INonTransactionalRequest` marker that opts it
out of both the transaction behaviour and the auditing behaviour, and the slice writes its
own two rows through the auth-event writer — the same writer the `401`/`403` handler uses,
with no ambient transaction. NFR-10's predicate becomes
`ICommand && !INonTransactionalRequest`.

**Rejected:** writing the rows from the endpoint after the handler returns. The endpoint
would then own a business obligation, and any early return or thrown exception skips it —
which is how "we forgot one" happens.

**Rejected:** modelling sign-in as a query so it never meets the command behaviours. It is
a `POST` with a body that produces a credential; calling it a query to dodge an
architecture test is naming something wrongly to satisfy a tool.

---

## R-7 · Minimum signing-key length for HS256, and when does a short key fail?

**Checked:** `SymmetricSecurityKey` with HMAC-SHA256.

**Found:** the key must be at least 256 bits — 32 bytes — or signing throws
`ArgumentOutOfRangeException` with `IDX10653` ("the algorithm requires a key size of at
least 256 bits"). Crucially, **it throws at signing time, not at startup.** With a 20-byte
key the application starts cleanly, `/health` returns `200`, every protected endpoint
returns `401` as designed, and the first sign-in returns `500`.

**Settled:** validate the key at startup with `ValidateOnStart`, and fail with a message
naming the configuration key and nothing else (AC-11). The failure mode is otherwise a
demo that boots, looks healthy, and cannot log anybody in.

**Also settled:** the key is configuration only — user secrets locally, environment
variables elsewhere — and `appsettings.json` carries a placeholder, consistent with
`001` AC-10 and `testing/security-checklist.md`.

---

## R-8 · Seed passwords: configuration, or a documented development default?

**Checked:** `testing/security-checklist.md` — "the application fails fast at startup if a
required secret is missing, rather than falling back to an insecure default" — against
NFR-7, which requires the system to run from a clean clone in documented steps.

**The tension is real.** Fail-fast means a clean clone cannot start until two
`dotnet user-secrets set` commands have been run.

**Settled: fail fast, and put the two commands in `quickstart.md`.** A committed default
password is a committed credential; the fact that it is called a development default does
not change what it is, and it is exactly the thing that ends up in a deployed environment
because nobody overrode it. "Documented steps" is satisfied by documenting the steps.

**Rejected:** a random password generated at first startup and printed to the console. It
sounds better than a default and is worse in practice — nobody can sign in on the second
run, and the natural fix is to write it to a file, which is a plaintext credential on disk.

---

## R-9 · Where does the browser keep the token?

**Checked:** `testing/security-checklist.md` — "the token is not stored anywhere a stray
script could read it casually, **and the chosen storage and its trade-off are recorded**"
— which asks for a recorded decision rather than a specific answer.

| Option | Cost |
|---|---|
| In-memory only | Immune to a stray script reading it. Lost on every reload and on every new tab, so the user signs in again after F5. Hostile enough that it would not survive the demo |
| `sessionStorage` | Survives reload, dies with the tab, not shared across tabs. Readable by any script on the origin |
| `localStorage` | Survives everything until sign-out. Readable by any script on the origin |
| `httpOnly` cookie | Not readable by script at all — the only option that closes the XSS read. Requires cookie authentication on the API, a CSRF token or `SameSite=Strict`, and a same-site or proxied deployment. ADR-005 specifies a bearer token |

**Settled:** `localStorage` when the screen's existing *remember me* checkbox is ticked,
`sessionStorage` otherwise. The control already exists in
`docs/sdd/design/screens/01-login.md`, so this gives it a meaning instead of leaving it
decorative, and the difference between the two is exactly what the label promises.

**Recorded honestly:** both are readable by any script on the origin, so the token is
XSS-exposed by construction. The mitigations are the ones the checklist already requires —
no `dangerouslySetInnerHTML` anywhere, user content rendered as text — plus the 8-hour
lifetime. An `httpOnly` cookie would be the answer if there were a stated requirement to
resist XSS token theft; there is not, and inventing one to justify a redesign of ADR-005
would be inventing a requirement.

---

## R-10 · Can the frontend lane of this feature run at position 4?

**Checked:** `specs/001-solution-skeleton/plan.md` — "**None in this feature.** The React
application, tokens, and primitives are `006`" — and `specs/README.md`, whose Phase 0 exit
condition for `004` is "a token carries the role; a wrong-role call returns `403`, proven
by test".

**Settled: no.** There is no React application, no token file, and none of the eight
primitives until `006`. The backend lane runs at position 4 and satisfies the phase gate on
its own; the frontend lane runs after `006`.

This is not a workaround. The gate for `004` was already written as a backend statement,
which means the split was intended by whoever wrote the phase table. Recording it here
turns an implicit ordering into a named dependency in `tasks.md`.

**What it changes about the design:** nothing. What it changes about the plan is that
`FE-004-*` tasks carry `006 complete` in **Depends on**, so a reader does not conclude the
frontend was forgotten.

---

## R-11 · There is no Manager-only endpoint yet. How is `403` proven?

**Checked:** the endpoint inventory in `docs/sdd/05-api-conventions.md` against what exists
by the end of Phase 0. Every consumer of `ManagerOnly` — escalate (`016`), reassign
(`011`), audit read (`019`) — is later than this feature.

**Options:**

| Option | Verdict |
|---|---|
| Add a Manager-only endpoint to the application now | **Rejected.** An endpoint that exists only to be tested is production surface with no consumer, and it would have to be found and deleted later |
| Test the policy in isolation via `IAuthorizationService.AuthorizeAsync(principal, "ManagerOnly")` | **Kept**, and it is the direct test of AC-7. It exercises the real policy and the real `RoleClaimType` wiring with no endpoint at all |
| Register a `/test-only/manager-only` endpoint **inside the test host** | **Kept.** `WebApplicationFactory` can add endpoints in `ConfigureWebHost`, so the endpoint lives in the test project and never ships. It exercises the real authorization middleware, the real result handler, the real audit write, and the real `ProblemDetails` mapping |

**Settled: both.** The isolated policy check proves the claim wiring; the test-host endpoint
proves the end-to-end `403` including its audit row (AC-18), which is what the phase gate
asks for. AC-10's enumeration test runs against the **production** application, not the
test host, so the test-only endpoint cannot weaken it — and that is stated in `plan.md`
because a test endpoint appearing in an "every endpoint is protected" assertion would
quietly invalidate it.

---

## R-12 · Does the seeded users' `PreferredLanguage` matter to this feature?

**Checked:** whether anything in `004` behaves differently for `en` versus `ar`.

**Found: no.** The claim is issued, put in the response body, and applied by the client.
Nothing on the server branches on it — culture resolution is `005`.

**Recorded anyway, because the question had a second half.** `005` needs a user whose
stored preference differs from a plausible `Accept-Language` header, or its culture-provider
test proves nothing. Seeding the Manager as `ar` costs this feature one literal and gives
`005` that fixture. So the answer is "it does not matter here, and it matters next door" —
which is why it is an assumption (A-5) rather than an arbitrary choice.

---

## R-13 · `PasswordHash` as `nvarchar`, when the value is base64 ASCII?

**Checked:** `docs/sdd/03-domain-model.md`. Its physical shape specifies
`PasswordHash nvarchar(400) NOT NULL`. Its own notes say `TraceId`, `IpAddress`, and
`UserAgent` "stay `varchar`: they are ASCII by definition" — and a PBKDF2 hash is equally
ASCII by definition.

**Settled: follow the physical shape — `nvarchar(400)`.** The blueprint's DDL is the
specification for the column, the cost is 400 bytes per row against 200 on a
two-row table, and diverging from a written spec to save nothing is how a schema and its
documentation drift apart. The inconsistency is real and is reported upward rather than
silently corrected.

**Sized at 400 rather than 100:** the `IdentityV3` encoding is about 84 characters today.
400 leaves room for an iteration-count or algorithm change without a migration, which is
the one change this column is likely to see.

---

## R-14 · Three omissions in the blueprint's own `SupportUser` description

**Checked:** the ER diagram, the entity table in `docs/sdd/03-domain-model.md` § SupportUser,
and the physical shape, against each other.

| Field | ER diagram | Entity table | Physical shape (DDL) | ADR-005 |
|---|---|---|---|---|
| `PasswordHash` | absent | absent | **present** | **required** |
| `RowVersion` | absent | absent | **present** | — |

The DDL and ADR-005 agree, and the concurrency note in the same file says "`RowVersion` on
`SupportUsers`, `Customers`, and `Tickets` only", which confirms the DDL again.

**Settled:** the DDL plus ADR-005 is authoritative; both columns exist. The ER diagram and
the entity field table are incomplete, and that is reported to the blueprint's owner rather
than fixed inside a feature folder — `data-model.md` states which source it followed and
why, so a reviewer comparing the two documents finds the answer already written down.

`RowVersion` on `SupportUsers` has no consumer in this feature: nothing here updates a user
row. It is created because the schema says so and because `014` will update
`PreferredLanguage`, which is the edit ADR-006 is protecting.

---

## R-15 · Anything in the house platform worth copying?

**Checked:** `azm-formbuilderBE` for its authentication setup.

**Found:** nothing to take. `docs/sdd/11-open-questions.md` already records that the
supplied export "covers the All Requests module only. There is no authentication" — so
there is no house login screen or token endpoint to align with, and the login layout in
`docs/sdd/design/screens/01-login.md` is recorded there as original work built from the
extracted tokens.

**Recorded as a question that turned out not to matter**, so nobody checks it twice.
