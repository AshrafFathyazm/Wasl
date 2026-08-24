# 004 — Task Breakdown

**Phase:** 0 · **Role:** Story Planner · **Skill:** `speckit-tasks`

Every task has one owner, one verification, and something it serves. A task that cannot be
verified on its own is too big and is split.

Agents named here are **not dispatched until the plan is approved**. Naming is the plan;
dispatching without recording the result in `ai-notes.md` is the thing that turns evidence
into a claim.

## Critical path

```text
BE-004-01 → BE-004-02 → BE-004-03 → BE-004-05 → BE-004-06 → BE-004-07
  → BE-004-12 → BE-004-13 → TEST-004-01 → TEST-004-07 → TEST-004-16 → DOC-004-04
```

`TEST-004-07` and `TEST-004-16` are on the critical path rather than after it, because they
are the two the phase gate names: a token carries the role, and a wrong-role call returns
`403`. Everything else hardens the path; these prove it.

**The frontend lane is not on this path.** It depends on `006-design-system`
(`research.md` R-10) and the Phase 0 gate for this feature is backend-only.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-004-01 | `SupportUser` and `SupportRole` exist in `Wasl.Domain/Users/`. `Create` normalises the email, rejects an empty hash, and rejects a language outside `{en, ar}`. `Wasl.Domain` still has zero package references | — | `dotnet build`, plus `001`'s `DomainHasNoDependenciesTests` staying green | AC-14, BR-8.1 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-004-02 | `SupportUserConfiguration` and the `AddSupportUsers` migration produce the columns, types, `Latin1_General_100_CI_AS` collation, `rowversion`, and the **unfiltered** unique email index of `data-model.md` | BE-004-01 | `dotnet ef database update` on an empty database, then the four queries in `data-model.md` § *Migration verification* | AC-22 | `voltagent-lang:sql-pro` | — |
| BE-004-03 | `SeedOptions`, its validator, and `SupportUserSeeder`: two users, passwords from configuration with **no default**, hashed before insert, idempotent by email | BE-004-02, BE-004-04 | Start the app twice against one database; `SELECT Id, Email, PasswordHash FROM dbo.SupportUsers` returns two rows unchanged by the second start | AC-12, AC-13, AC-14 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-004-04 | `JwtOptions` + `JwtOptionsValidator` + `ValidateOnStart()`. Startup **fails** when `Jwt:SigningKey` is missing or shorter than 32 bytes, or when `Jwt:LifetimeHours` is absent. The message names the key and never the value | BE-004-01 | Remove the secret, run `dotnet run`, read the startup failure; confirm no value is echoed | AC-11 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-004-05 | `JwtTokenIssuer` + `WaslClaimTypes`. Issues HS256 via `JsonWebTokenHandler` with `sub`, `email`, `role`, `preferred_language`, `jti`, `iss`, `aud`, `iat`, `exp`, using the injected `TimeProvider` | BE-004-04 | Decode an issued token at [jwt.io equivalent, offline] or in a unit test; `exp - iat == 28800` | AC-2, AC-3 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-004-06 | `AddWaslAuthentication`: `MapInboundClaims = false`, `NameClaimType = "sub"`, `RoleClaimType = "role"`, `ValidAlgorithms = [HS256]`, `ClockSkew = TimeSpan.Zero`, issuer and audience validated | BE-004-04 | `TEST-004-06`, `TEST-004-08`, `TEST-004-09` all pass; each fails when its one setting is reverted | AC-6, AC-8, AC-9 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-004-07 | `AddWaslAuthorization`: `FallbackPolicy = RequireAuthenticatedUser()` and the `ManagerOnly` policy requiring the `Manager` role | BE-004-06 | `TEST-004-07` and `TEST-004-10` | AC-7, AC-10, BR-6 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-004-08 | `ICurrentUser` + `ClaimsPrincipalCurrentUser`, scoped, reading `sub`, `email`, `role`, `preferred_language` from the principal | BE-004-06 | An integration test resolves `ICurrentUser` inside an authenticated request and asserts all four values | BR-6 (data-dependent half), AC-6 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-004-09 | `IAuthEventAuditor` + `AuthEventAuditor`, writing with **no ambient transaction**. Its signature has no parameter through which a password, hash, or token could arrive | BE-004-08, `003` complete | `TEST-004-13`, `TEST-004-14`; and a read of the interface confirming there is no such parameter | BR-9.4, BR-9.7 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-004-10 | `AuthAuditingAuthorizationResultHandler` writes `Auth.Unauthenticated` on `Challenged` and `Auth.Forbidden` on `Forbidden`, then delegates the response to the default handler so `002` keeps owning the body | BE-004-09 | `TEST-004-15`, `TEST-004-16`, and the `401`/`403` bodies still matching `contracts/auth-api.md` | AC-17, AC-18, BR-9.2 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-004-11 | `INonTransactionalRequest` exists and `003`'s transaction behaviour, auditing behaviour, and NFR-10 architecture test all honour it (`ICommand && !INonTransactionalRequest`) | `003` complete | `003`'s architecture test is green **with** `IssueTokenCommand` present, and still red when a state-changing command drops `IAuditableCommand` | NFR-10, BR-9.4, `spec.md` Q-C | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-004-12 | The `Features/Auth/IssueToken/` slice: `Endpoint`, `Command`, `Handler`, `Validator`, `Response`, `SupportUserByEmailQuery`. Verification runs against a fixed dummy hash when the email is unknown, so the timing does not distinguish the two | BE-004-03, BE-004-05, BE-004-09, BE-004-11 | `TEST-004-01`, `TEST-004-04`, `TEST-004-05` | AC-1, AC-4, AC-5 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-004-13 | `Program.cs`: `UseAuthentication()` then `UseAuthorization()`, the position for `UseRequestLocalization()` marked and after both, `.AllowAnonymous()` on `GET /health` and `POST /api/auth/token` | BE-004-07, BE-004-12 | `TEST-004-10`, `TEST-004-18`, `TEST-004-19` | AC-10, AC-20, AC-21 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-004-14 | `appsettings.json` carries `Jwt:Issuer`, `Jwt:Audience`, `Jwt:LifetimeHours` and **placeholders only** for `Jwt:SigningKey`, `Seed:AgentPassword`, `Seed:ManagerPassword` | BE-004-04 | `git grep -inE "signingkey|password" -- src/` returns only placeholders and configuration keys | `001` AC-10, security checklist | `comprehensive-review:security-auditor` | — |

## Frontend

**This lane starts when `006-design-system` is complete**, not when the backend lane
finishes. There is no React application, no `tokens.css`, and no `Button`/`Input`/`Checkbox`
before then (`research.md` R-10). Recorded in every `Depends on` cell so the ordering reads
as a decision rather than an omission.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-004-00 | Both screens previewed with real tokens, real copy, plausible lengths, every state in `frontend-spec.md`, and both languages — **before anything is wired** | `006` complete | The preview is reviewed and approved; any divergence from it is later recorded with a reason | ADR-009, DoD *Design* | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-004-01 | `features/auth/api.ts`, `schema.ts`, and the **PROVISIONAL** types from `FRONTEND-API-GUIDE.md`, with the swap to generated types recorded as pending | `006` complete | `tsc --noEmit` clean; the provisional block is marked and the swap is listed in `DOC-004-03` | ADR-011 §6 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-004-02 | `locales/{en,ar}/auth.json` and `{en,ar}/common.json` with every key in `frontend-spec.md` § *Localization* | `006` complete | The key-parity test from `005` passes over the new namespaces | AC-29, BR-8.11 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-004-03 | `tokenStorage.ts` — the **only** module touching web storage. `localStorage` when *remember me*, `sessionStorage` otherwise; `clear()` clears both | `006` complete | `grep -rn "localStorage\|sessionStorage" src/` returns hits in this file only | AC-28, `spec.md` Q-A | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-004-04 | `AuthContext` + `useAuth`, hydrated from storage **once, before the first paint** | FE-004-03 | `TEST-004-26` — no frame renders the wrong screen | AC-25 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-004-05 | `lib/apiClient.ts` attaches `Authorization` and `Accept-Language`, and on `401` clears the token and redirects — **excluding `POST /api/auth/token`** | FE-004-04 | `TEST-004-28`: a wrong password renders the form error and performs no navigation | AC-27 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-004-06 | `RequireAuth`, `RedirectIfSignedIn`, `routes.tsx`, and the protected `TicketsPlaceholderPage` | FE-004-04 | `TEST-004-25`, `TEST-004-26` | AC-24, AC-25 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-004-07 | `BrandPanel` — plain: solid surface, lockup, headline, subtitle. `aria-hidden="true"`, nothing focusable, no canvas, no animation | FE-004-00, FE-004-02 | Tab from the top of the page: the first stop is the email input | `frontend-spec.md`, ADR-009 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-004-08 | `LoginPage` + `LoginForm`: a real `<form>`, `name` and `autocomplete` on both inputs, one `role="alert"` error block, focus back to email on failure, the seven states of `frontend-spec.md` | FE-004-01, FE-004-05, FE-004-07 | `TEST-004-27`, `TEST-004-31` | AC-26, AC-30 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-004-09 | `AppShell`, `Sidebar`, `SidebarNavItem`, `Header`, `navItems.ts` (one entry), and the drawer below 780px. Logical properties only | FE-004-06 | `grep -rnE "margin-(left|right)|padding-(left|right)|text-align: *(left|right)" src/` returns nothing | AC-29, ADR-007 §6 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-004-10 | `UserPopover` + `UserAvatar` + sign-out. Focus trapped while open, returned to the trigger on close, `Escape` closes | FE-004-09 | `TEST-004-29`, plus a keyboard-only pass | AC-28 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-004-11 | Both screens walked in Arabic and by keyboard; every finding written into `tests.md`, including the seam shadow's flipped inset and the longer Arabic headline | FE-004-08, FE-004-10 | The walk is recorded with findings — an empty findings list is only credible with a note saying what was looked at | AC-29, DoD *Localization* | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-004-01 | `200` returns `accessToken`, `tokenType`, `expiresAtUtc`, and the `user` block; no response field carries the hash | BE-004-12 | Test run | AC-1 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-02 | The issued token carries `sub`, `email`, `role`, `preferred_language`, `jti`, `iss`, `aud`, `iat`, `exp` — asserted by name | BE-004-05 | Test run | AC-2 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-03 | `exp - iat == 28800`, and `expiresAtUtc` equals `exp`, against a fixed fake `TimeProvider` | BE-004-05 | Test run | AC-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-04 | Wrong password, unknown email, and an inactive user produce `401` bodies identical apart from `traceId` | BE-004-12 | Test run comparing the three bodies field by field | AC-4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-05 | Blank, whitespace, and malformed inputs return `400` `errors/validation` naming the field — never `401` | BE-004-12 | Test run | AC-5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-06 | Inside a request, `User.FindFirst("sub")` and `FindFirst("email")` return the values; no `schemas.*` URI appears in the principal's claim types | BE-004-06 | Test run; then set `MapInboundClaims = true` and watch it go red | AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-07 | `IAuthorizationService.AuthorizeAsync(principal, "ManagerOnly")` succeeds for the Manager's token and fails for the Agent's | BE-004-07 | Test run; then change `RoleClaimType` and watch **both** go to failure | AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-08 | A token signed with another key, one with `alg: none`, and one signed with a non-HS256 algorithm each return `401` | BE-004-06 | Test run using `TestHost/TokenFactory` | AC-8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-09 | A token expired by one second returns `401` | BE-004-06 | Test run; then restore the default `ClockSkew` and watch it pass wrongly | AC-9 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-10 | Enumerating the **production** `EndpointDataSource`, every endpoint has authorization metadata or `IAllowAnonymous`, and the anonymous set is exactly `GET /health` and `POST /api/auth/token` | BE-004-13 | Test run; then map a new endpoint with neither and watch it go red | AC-10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-11 | The host fails to build with a missing signing key, and with a 20-byte key. The failure message contains the key name and not the value | BE-004-04 | Test run asserting the exception and scanning its message | AC-11 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-12 | The host fails to build with either seed password absent | BE-004-03 | Test run | AC-12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-13 | A successful sign-in writes exactly one `Auth.LoginSucceeded` row, `Outcome = Success`, with the email and role snapshotted | BE-004-12 | Test run against the real table | AC-15, BR-9.6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-14 | A failed sign-in writes exactly one `Auth.LoginFailed` row carrying the attempted email, and **no column of that row contains the submitted password or any hash** | BE-004-12 | Test run scanning every column of the row for the password string | AC-16, BR-9.7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-15 | A tokenless call to a protected endpoint returns `401` and writes exactly one `Auth.Unauthenticated` row, `Outcome = Denied` | BE-004-10 | Test run | AC-17 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-16 | An Agent's token against the test host's `ManagerOnly` endpoint returns `403` `errors/forbidden` and writes one `Auth.Forbidden` row that **persists although no business transaction committed** | BE-004-10, BE-004-11 | Test run; the row is read back after the request completes | AC-18, BR-9.4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-17 | The `TraceId` on each of the four audit rows equals the `traceId` in the corresponding response body | TEST-004-13 … TEST-004-16 | Test run | AC-19, BR-9.9 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-18 | `GET /health` returns `200` with no `Authorization` header and writes no audit row | BE-004-13 | Test run asserting the row count is unchanged | AC-20 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-19 | `MiddlewareOrderTests` fails if `UseRequestLocalization(` appears before `UseAuthentication(` in `Program.cs`, or if `UseAuthorization(` precedes `UseAuthentication(` | BE-004-13 | Test run; then swap the two lines and watch it go red | AC-21, ADR-007 §4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-20 | `dbo.SupportUsers` matches `data-model.md` — columns, types, lengths, collation, `rowversion` — and `UX_SupportUsers_Email` is unique with `filter_definition IS NULL` | BE-004-02 | Test run issuing the `INFORMATION_SCHEMA` and `sys.indexes` queries | AC-22 | `voltagent-lang:sql-pro` | — |
| TEST-004-21 | Arabic in `FullName` round-trips byte-identical, and `MANAGER@WASL.LOCAL` signs in against a stored `manager@wasl.local` | BE-004-03 | Test run — `varchar` or a case-sensitive collation each fails one half | AC-23, ADR-013 | `voltagent-lang:sql-pro` | — |
| TEST-004-22 | Seeding twice leaves two rows with both hashes unchanged | BE-004-03 | Test run comparing the hashes before and after | AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-23 | The stored `PasswordHash` is not the plaintext, and `VerifyHashedPassword` returns `Success` against it | BE-004-03 | Test run | AC-14 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-24 | `SupportUser.Create` rejects an empty name, an empty email, an empty hash, an undefined role, and a language outside `{en, ar}`; and lowercases the email | BE-004-01 | Test run, no database | BR-8.1, AC-14 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-25 | A signed-out visit to `/tickets` lands on `/login?returnUrl=%2Ftickets`, and sign-in returns to `/tickets` | FE-004-06 | Vitest + RTL run | AC-24 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-26 | A signed-in visit to `/login` never renders the form — asserted on the first commit, not after a tick | FE-004-06 | Vitest + RTL run | AC-25 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-27 | Enter submits; both inputs carry `name` and the right `autocomplete`; the `401` produces one `role="alert"` block and no field-level message; focus returns to `email` | FE-004-08 | Vitest + RTL run | AC-26 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-28 | A `401` from a protected request clears the token and redirects once; a `401` from `POST /api/auth/token` does neither | FE-004-05 | Vitest run asserting the navigation count is zero in the second case | AC-27 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-29 | Sign-out clears **both** storages and redirects to `/login` | FE-004-10 | Vitest run reading both storages afterwards | AC-28 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-30 | Every key used by `/login` and the shell exists in `en` and `ar`; no literal string reaches JSX | FE-004-02 | The key-parity test plus the i18n lint rule | AC-29, BR-8.11 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-004-31 | Signing in as the `ar` Manager switches the interface to Arabic and sets `dir="rtl"` on the document root | FE-004-08 | Vitest run reading `document.documentElement.dir` | AC-30 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-004-01 | `quickstart.md` carries the three `dotnet user-secrets set` commands, verified by following them on a clean clone with an empty secret store | BE-004-03, BE-004-04 | Delete the secret store, follow the file as written, note anything that had to be guessed | NFR-7, AC-11, AC-12 | main session | — |
| DOC-004-02 | The README's limitations section lists every row of ADR-005's *What is deliberately not built*, with the 8-hour lifetime named as a **weak** mitigation | BE-004-13 | Read against ADR-005 § *Consequences*, which requires the gaps to be listed and not hidden | ADR-005 | main session | — |
| DOC-004-03 | `FRONTEND-API-GUIDE.md` regenerated from the real OpenAPI document, and the provisional types replaced by generated ones | FE-004-01, REV-004-02 | The provisional marker is gone and `tsc --noEmit` is clean | ADR-011 §6 | main session | — |
| DOC-004-04 | `tests.md` and `ai-notes.md` completed with **observed** output, and the board and delivery log updated | All | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-004-01 | The *Secrets*, *Authentication*, *Authorization*, *Logging*, *Audit*, and *Frontend* sections of `docs/sdd/testing/security-checklist.md` walked line by line; every box either ticked with its evidence or recorded as a known gap | All BE, all TEST | `review.md` verdict is `Approved`, with the storage trade-off of `spec.md` Q-A recorded rather than ticked | DoD *Review* | `comprehensive-review:security-auditor` | `code-review:code-review` |
| REV-004-02 | The generated OpenAPI document compared against `contracts/auth-api.md`, including the `401`/`403` shapes the whole product inherits | BE-004-13 | Any difference is fixed in one of the two before closing | DoD | main session | — |
| REV-004-03 | Layer boundaries, `CancellationToken` on every async path, no domain entity serialised, no secret in a committed file, and no hard-coded colour or `left`/`right` in the new components | All BE, all FE | `review.md` verdict is `Approved` | DoD *Review* | `comprehensive-review:code-reviewer` | `code-review:code-review` |

## Droppable if time runs short

| Task | What is lost |
|---|---|
| The drawer half of FE-004-09 (below 780px) | The shell is unusable on a phone. The demo runs on a laptop and every screen spec in `docs/sdd/design/screens/` is desktop-first, so this is the cheapest real cut |
| The Caps Lock hint in FE-004-08 | One failed sign-in from Caps Lock reads as a forgotten password. Annoying, recoverable, and it costs a `getModifierState` call to add back |
| The `jti` claim in BE-004-05 | Nothing consumes it. It exists so a future revocation list has something to name, and there is no revocation (ADR-005) |
| DOC-004-03 (regenerating the guide from OpenAPI) | The provisional types stay provisional. Acceptable **only** if `REV-004-02` still compares the contract by hand, because that comparison is the gate, not the regeneration |
| TEST-004-21's Arabic half, if the container is unavailable | `varchar` creeping in would go uncaught. Drop last of the four database tests — it is the one that catches a defect presenting as a font problem |

## Not droppable

**BE-004-06.** Its four settings are the four silent failures of this feature. Each one
individually produces an application that starts, authenticates, and is wrong:
`MapInboundClaims` renames the claims, `RoleClaimType` denies every Manager,
`ValidAlgorithms` accepts a token the caller chose the algorithm for, and `ClockSkew`
grants five extra minutes to an expired token. Not one of them fails a build.

**BE-004-07 with TEST-004-10.** Without the fallback policy, protecting an endpoint is
something a developer remembers, and the failure mode of forgetting is a public endpoint
returning `200`. The test is half of the control: the policy makes the default safe, the
test pins the exceptions at two.

**BE-004-04 and BE-004-14.** A short signing key fails at *signing* time, so an
unvalidated one produces a demo that boots healthy and cannot sign anybody in — the worst
possible moment to discover it. And a committed placeholder that turns into a committed
credential is the one defect in this feature that cannot be fixed by a later commit.

**TEST-004-19.** ADR-007 §4 names the middleware ordering as the single most likely defect
in the whole build, and it fails silently: the application simply always uses
`Accept-Language`, and nobody notices until an Arabic user with an English browser
complains. `005` inherits this test the day it adds the call.

**BE-004-09, BE-004-10, TEST-004-16.** BR-9.4's asymmetry — a denial's audit row is written
outside a transaction and survives — is described in ADR-008 as "the kind of thing that
gets implemented wrongly by accident". The test is what makes it not an accident.

**TEST-004-04.** An endpoint that answers "wrong password" differently from "no such user"
is a user directory. It is one comparison to test and it is invisible without one.

**The exclusion in FE-004-05.** Two lines, and without them the sign-in screen redirects to
itself and appears to do nothing at all.
