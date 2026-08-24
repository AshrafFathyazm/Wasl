# 004 — Plan

**Phase:** 0 · **Role:** Architecture · **Agent:** `feature-dev:code-architect` ·
**Skill:** `speckit-plan`

## Design summary

One slice issues the token. Everything else is cross-cutting and lands in `Common/Auth/`,
because "is this request authenticated" is not a feature.

Three decisions carry the feature, and each replaces a rule someone has to remember with
something that fails loudly instead:

| Decision | Replaces |
|---|---|
| Authentication is the **fallback policy**; two endpoints opt out by name | Every endpoint remembering `.RequireAuthorization()` — where forgetting means a public endpoint and a `200` |
| The claim names are pinned and the inbound map is **off** | Trusting that `sub` arrives as `sub`, which it does not by default |
| `401`/`403` audit rows are written by an `IAuthorizationMiddlewareResultHandler` | Each endpoint, or a status-code-sniffing middleware, remembering to record a denial |

## Backend design

Every file this feature creates or changes. A plan that does not name its files is a
description.

```text
src/
  Wasl.Domain/
    Users/
      SupportUser.cs                      entity; private setters; Create() factory
      SupportRole.cs                      enum: Agent | Manager
  Wasl.Api/
    Features/
      Auth/
        IssueToken/
          Endpoint.cs                     POST /api/auth/token, .AllowAnonymous()
          Command.cs                      IssueTokenCommand + INonTransactionalRequest
          Handler.cs                      look up, verify, issue, audit
          Validator.cs                    FluentValidation: email, password
          Response.cs                     TokenResponse + SignedInUser
          SupportUserByEmailQuery.cs      named query object; one caller; no interface
    Common/
      Auth/
        AuthenticationRegistration.cs     AddWaslAuthentication/AddWaslAuthorization
        JwtOptions.cs                     Issuer, Audience, SigningKey, LifetimeHours
        JwtOptionsValidator.cs            IValidateOptions<JwtOptions> — fail fast
        JwtTokenIssuer.cs                 IJwtTokenIssuer; JsonWebTokenHandler
        WaslClaimTypes.cs                 "sub" "email" "role" "preferred_language"
        AuthorizationPolicies.cs          policy names + ManagerOnly definition
        ICurrentUser.cs                   Id, Email, Role, PreferredLanguage, IsAuthenticated
        ClaimsPrincipalCurrentUser.cs     scoped; reads IHttpContextAccessor
        IAuthEventAuditor.cs              LoginSucceeded/LoginFailed/Unauthenticated/Forbidden
        AuthEventAuditor.cs               writes with NO ambient transaction (BR-9.4)
        AuthAuditingAuthorizationResultHandler.cs
                                          IAuthorizationMiddlewareResultHandler
        INonTransactionalRequest.cs        marker; opts out of both behaviours
      Persistence/
        Configurations/
          SupportUserConfiguration.cs     types, collation, index, rowversion
        Migrations/
          <ts>_AddSupportUsers.cs         generated
        Seed/
          SeedOptions.cs                  AgentPassword, ManagerPassword
          SeedOptionsValidator.cs         IValidateOptions<SeedOptions> — fail fast
          SupportUserSeeder.cs            idempotent by email; hashes before insert
    Program.cs                            CHANGED — see the ordering block below
    appsettings.json                      CHANGED — placeholders only, no values
tests/
  Wasl.Domain.Tests/
    Users/SupportUserTests.cs             factory guards
  Wasl.Api.IntegrationTests/
    Auth/TokenEndpointTests.cs            200 / 400 / 401, claim set, lifetime
    Auth/TokenValidationTests.cs          bad key, alg none, wrong alg, expired
    Auth/ProtectedEndpointTests.cs        401 paths, /health anonymous
    Auth/AuthorizationPolicyTests.cs      ManagerOnly via IAuthorizationService
    Auth/ForbiddenEndpointTests.cs        403 end to end, test-host endpoint only
    Auth/AuthAuditTests.cs                the four rows, BR-9.4, BR-9.7, BR-9.9
    Auth/EndpointAuthorizationInventoryTests.cs   AC-10
    Auth/MiddlewareOrderTests.cs          AC-21, over the source of Program.cs
    Persistence/SupportUserSchemaTests.cs AC-22, AC-23
    Persistence/SupportUserSeedTests.cs   AC-13, AC-14
    Startup/StartupValidationTests.cs     AC-11, AC-12
    TestHost/AuthTestEndpoints.cs         /test-only/manager-only — test project only
    TestHost/TokenFactory.cs              mints tokens with chosen keys/algs/expiry
```

### Where each decision is enforced

| Decision | Enforced by | Not by |
|---|---|---|
| Every endpoint needs a token (FR-4.1) | `FallbackPolicy` + `EndpointAuthorizationInventoryTests` | Each endpoint calling `.RequireAuthorization()` |
| Claim names survive validation | `MapInboundClaims = false` + `NameClaimType`/`RoleClaimType` + AC-6 | The claim names being short and obvious |
| Every Manager can act as a Manager | AC-7 testing the **policy**, not the claim | Reading the token in a debugger and seeing `"role": "Manager"` |
| An expired token is expired | `ClockSkew = TimeSpan.Zero` + AC-9 | The default, which grants five extra minutes |
| Only HS256 is accepted | `ValidAlgorithms` pinned + AC-8 | The token's own `alg` header |
| The app cannot start misconfigured | `IValidateOptions<>` + `ValidateOnStart()` + AC-11, AC-12 | A `null` reference on first sign-in |
| No plaintext password anywhere | `SupportUser.Create` takes a hash; the hasher lives in `Wasl.Api` | Remembering not to log it |
| A denial is recorded (BR-9.2) | `AuthAuditingAuthorizationResultHandler` | Each endpoint, or middleware sniffing a status code |
| A denial's row survives (BR-9.4) | `AuthEventAuditor` writing with no ambient transaction + AC-18 | The absence of a transaction happening to be true |
| Culture can be resolved without a query | `preferred_language` claim issued here | `005` adding a claim and reissuing every token |

### `Program.cs` — the ordering, written down before it is written

```csharp
// ── services ──
builder.Services.AddWaslAuthentication(builder.Configuration);   // JwtBearer + options validation
builder.Services.AddWaslAuthorization();                         // FallbackPolicy + ManagerOnly
builder.Services.AddScoped<ICurrentUser, ClaimsPrincipalCurrentUser>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<IPasswordHasher<SupportUser>, PasswordHasher<SupportUser>>();
builder.Services.AddSingleton<IAuthorizationMiddlewareResultHandler,
                              AuthAuditingAuthorizationResultHandler>();

// ── pipeline ──
app.UseAuthentication();        // ← 004
app.UseAuthorization();         // ← 004
// app.UseRequestLocalization(); ← 005 GOES HERE, AFTER BOTH. ADR-007 §4.
app.MapHealthChecks("/health").AllowAnonymous();
app.MapIssueToken();            // .AllowAnonymous()
```

**The commented line is deliberate and is not a to-do.** ADR-007 §4 calls this the single
most likely defect in the whole build, and it fails silently: put
`UseRequestLocalization()` before `UseAuthentication()` and the culture provider reads a
principal that does not exist yet, so the application always falls back to
`Accept-Language` and nobody notices until an Arabic user with an English browser
complains. `001`'s plan already reserved this constraint for whoever added the second
piece; this is that feature, so the reservation becomes a marked position plus AC-21.

`MiddlewareOrderTests` asserts the order **over the source text of `Program.cs`**, because
ASP.NET Core exposes no ordered list of middleware at runtime. It is a weak test — it can
be defeated by moving the calls into a helper — and it is kept because the defect it
catches is specific, silent, and named in an ADR. That trade-off is recorded rather than
presented as rigour.

### The slice

| Piece | Responsibility |
|---|---|
| `Endpoint` | Binds the body, sends the command, maps to `200`. `.AllowAnonymous()`. Nothing else |
| `Validator` | `email` required and syntactically valid, ≤320; `password` required, ≤256. Runs in the validation behaviour from `003`, producing the standard `400` |
| `SupportUserByEmailQuery` | `Email == normalised && IsActive` as one indexed lookup. A named query object with one caller and no interface — `DbSet<T>` is already the repository (ADR-010) |
| `Handler` | Normalise → look up → `VerifyHashedPassword` → issue → audit → map. On any failure: audit `Auth.LoginFailed` and throw the exception `002` maps to `401` |
| `JwtTokenIssuer` | The only place a token is created. `JsonWebTokenHandler`, HS256, claims from `WaslClaimTypes`, `exp` from `TimeProvider` + `JwtOptions.LifetimeHours` |
| `Response` | `TokenResponse` + `SignedInUser`. A DTO, never the entity — the entity has a `PasswordHash` |

**The lookup runs even when the email is unknown.** A missing user still costs a
`VerifyHashedPassword` call against a fixed dummy hash before `401` is returned, so the
response time does not distinguish "no such user" from "wrong password" (AC-4). Skipping
the verification for an unknown email is the natural implementation and it is a timing
oracle.

`SupportUser` is looked up with `IsActive` in the predicate rather than checked
afterwards, so an inactive user takes the same path as an unknown one and cannot
accidentally be given a distinguishable response.

### The domain

`SupportUser` is the whole domain surface, and it is small on purpose.

| Guard in `SupportUser.Create` | Rule |
|---|---|
| `FullName` non-whitespace, ≤200 | Schema |
| `Email` non-whitespace, ≤320, trimmed and lowercased **inside the factory** | Consistent with BR-4.2's treatment of customer email — normalisation happens once, in one place, so no caller can forget |
| `PasswordHash` non-whitespace | The entity cannot exist without a credential |
| `Role` is a defined `SupportRole` | BR-6 has exactly two roles |
| `PreferredLanguage` ∈ { `en`, `ar` } | BR-8.1 |

**The domain never hashes and never sees a plaintext password.** `Create` takes an
already-hashed string, because `PasswordHasher<T>` is a package reference and
`Wasl.Domain` has none, ever (ADR-010). That constraint produces a better design than it
costs: there is no code path in the domain that could receive, log, or persist a
plaintext password, which is a structural guarantee rather than a review item.

`SupportUser` has no `Deactivate()` and no `ChangeLanguage()`. There is no user management
(`spec.md` Out of scope) and `014` owns the language change. A setter with no caller is an
invitation.

### Audit — four rows, one writer, no transaction

| Event | Action | Outcome | Written by |
|---|---|---|---|
| Sign-in succeeded | `Auth.LoginSucceeded` | `Success` | `Handler`, via `IAuthEventAuditor` |
| Sign-in rejected | `Auth.LoginFailed` | `Failed` | `Handler`, via `IAuthEventAuditor` |
| No/invalid token on a protected endpoint | `Auth.Unauthenticated` | `Denied` | `AuthAuditingAuthorizationResultHandler` |
| Wrong role | `Auth.Forbidden` | `Denied` | `AuthAuditingAuthorizationResultHandler` |

Action names are taken from the registry in `docs/sdd/04-business-rules.md` § *Action
naming*, unchanged, so `WHERE action LIKE 'Auth.%'` keeps working.

Every one of the four is written **outside any transaction** (BR-9.4). For the two
denials this is not a choice — the authorization middleware runs before any MediatR
request exists, so there is no ambient transaction to join, which is a good sign BR-9.4
was written by someone who had looked at the pipeline.

For the two sign-in rows it *is* a choice, and it is the one recorded in `spec.md` Q-C:
`IssueTokenCommand` carries `INonTransactionalRequest`, which opts it out of both the
transaction behaviour and the auditing behaviour from `003`, and NFR-10's architecture
test predicate becomes `ICommand && !INonTransactionalRequest`. Without the opt-out, a
failed sign-in would roll its own audit row back — the failure would be unrecorded, which
is the precise outcome BR-9.4 exists to prevent.

**Redaction is by construction, not by filtering.** `AuthEventAuditor` accepts an email, an
action, an outcome, and a trace id. It has no parameter through which a password, a hash,
or a token could arrive, so BR-9.7 cannot be violated by a careless caller. AC-16 asserts
it anyway, by searching every column of the written row rather than reading the code that
wrote it.

`ActorEmail` and `ActorRole` are snapshotted onto the row (BR-9.6). For
`Auth.Unauthenticated` there is no actor at all, so `ActorUserId`, `ActorEmail`, and
`ActorRole` are null — which `AuditLog` allows precisely because it has no foreign keys
(ADR-008).

### Configuration and secrets

| Key | Source | Missing? |
|---|---|---|
| `Jwt:Issuer`, `Jwt:Audience` | `appsettings.json` — not secrets | Startup failure |
| `Jwt:SigningKey` | user secrets locally, environment variable elsewhere | **Startup failure.** Also fails when shorter than 32 bytes — HS256 throws at *signing* time, not at startup, so an unvalidated short key produces an app that boots healthy and cannot sign anyone in (`research.md` R-7) |
| `Jwt:LifetimeHours` | `appsettings.json`, value `8` | Startup failure. Not silently defaulted — the number is the mitigation for having no revocation and it should be visible in configuration |
| `Seed:AgentPassword`, `Seed:ManagerPassword` | user secrets locally, environment variable elsewhere | **Startup failure, with no development default** (`research.md` R-8) |

`appsettings.json` carries placeholders and no values, consistent with `001` AC-10.
`quickstart.md` gains the three `dotnet user-secrets set` commands, which is how NFR-7's
"documented steps" is satisfied without committing a credential.

## Frontend design

**The frontend lane of this feature runs after `006-design-system`.** There is no React
application, no token file, and none of the eight primitives before then
(`specs/001-solution-skeleton/plan.md`, `research.md` R-10). The Phase 0 gate for `004` in
`specs/README.md` is backend-only — "a token carries the role; a wrong-role call returns
`403`, proven by test" — so the split was already intended by the phase table. It is named
in `tasks.md` as a dependency so nobody reads the ordering as an omission.

```text
wasl-web/src/
  features/auth/
    api.ts                    postToken(); the only caller of /api/auth/token
    schema.ts                 Zod; mirrors the contract, is never the authority
    AuthContext.tsx           the one small context of ADR-011 §1
    useAuth.ts                consumer hook
    tokenStorage.ts           local vs session by "remember me"; one read/write point
    LoginPage.tsx             route component; owns the mutation
    LoginForm.tsx             feature component; handlers as props
    BrandPanel.tsx            feature component; the PLAIN panel
    RequireAuth.tsx           route guard → /login?returnUrl=
    RedirectIfSignedIn.tsx    route guard for /login; redirects before paint
  features/shell/
    AppShell.tsx              route layout: sidebar + header + <Outlet/>
    Sidebar.tsx               brand lockup, nav, user block
    SidebarNavItem.tsx        one item; active state
    Header.tsx                breadcrumb
    UserPopover.tsx           identity, role, settings, sign out
    UserAvatar.tsx            initials circle
    navItems.ts              THE nav registry — one array, added to by later features
  features/tickets/
    TicketsPlaceholderPage.tsx  protected route so AC-24 has a target; 010 replaces it
  lib/
    apiClient.ts              CHANGED — attaches the bearer; 401 interceptor
  routes.tsx                  CHANGED — public /login, protected shell subtree
  locales/en/auth.json  ar/auth.json  en/common.json  ar/common.json
```

### Components, by kind (ADR-011 §4)

| Component | Kind | Fetches? |
|---|---|---|
| `LoginPage` | Route / page | Yes — owns the sign-in mutation |
| `AppShell` | Route layout | No |
| `TicketsPlaceholderPage` | Route / page | No — there is nothing to fetch yet |
| `LoginForm`, `BrandPanel`, `Sidebar`, `SidebarNavItem`, `Header`, `UserPopover`, `UserAvatar` | Feature component | No |
| `Button`, `Input`, `Checkbox` | Primitive, from `006` | No |

**`UserAvatar`, the popover, and the icon button are feature components, not primitives.**
ADR-009 caps the primitives at eight and does not include them; ADR-011 §3 says to promote
something to `components/` when the **second** consumer appears, not when one is imagined.
They live in `features/shell/` until a second screen needs them. That keeps the cap intact
without pretending the shell needs nothing outside it.

### State — and what is not state

Per ADR-011 §1, and the list is complete:

| State | Home |
|---|---|
| Token and current user | `AuthContext`, written once at sign-in |
| Where the token is kept | `tokenStorage.ts` — `localStorage` if *remember me*, else `sessionStorage` |
| `returnUrl` | The URL — `/login?returnUrl=%2Ftickets` |
| Login form values | React Hook Form |
| Whether the popover is open | `useState` in `UserPopover` |

No store. Nothing here is server state that TanStack Query does not already own, and the
one piece of genuine client state is a token.

**The token is read from storage exactly once, at start-up, into the context.** Every other
consumer reads the context. A component reading `localStorage` directly is how two
components come to disagree about whether the user is signed in.

### The `401` interceptor, and the loop it must not create

`apiClient.ts` attaches `Authorization` from the context and, on a `401`, clears the token
and redirects to `/login?returnUrl=<current path>` — **except for `POST /api/auth/token`,
which is excluded by URL** (AC-27). Without the exclusion, a wrong password redirects the
user from `/login` to `/login`, discarding the form error and looking like nothing
happened.

### Route protection

```text
/login                    public       RedirectIfSignedIn → /tickets when a token exists
/                         protected    redirect → /tickets
/tickets                  protected    AppShell → TicketsPlaceholderPage   (010 replaces)
anything else             protected    404 inside the shell
```

`RequireAuth` decides from the context, which was populated **before first paint** from
storage, so a signed-in user never sees the login screen flash and a signed-out user never
sees the shell flash (AC-25). A guard that decides after the first render is a guard that
shows the protected content for one frame.

### The nav registry

`navItems.ts` is one array, and it lists only routes that exist. At `004` that is one
entry: Tickets. Dashboard and Customers are appended by `020` and `008`.

The alternative — shipping all three now, with two of them dead — trades a smaller diff
later for a demo where two thirds of the navigation does nothing. The screen spec's nav
structure (`docs/sdd/design/screens/02-app-shell.md`) is the target shape, reached one
feature at a time.

### What of the app-shell spec is built here, and what is not

| Built here | Deferred |
|---|---|
| Expanded sidebar, 288px, brand lockup, nav, user block | The 68px **collapsed** state, its flyout, its tooltips, and the `localStorage` persistence of the toggle → `010` |
| Header with breadcrumb | Auto-collapse below 1100px → `010` |
| User popover: identity, role row, sign out | The Settings row → `009-settings-localization`'s screen owns the destination |
| Drawer below 780px | — |

The collapsed state's hard part is the flyout for a nav group's children
(`docs/sdd/design/screens/02-app-shell.md`: "this is where most implementations quietly
break"). At `004` the nav has one item and no children, so a flyout would have nothing to
show and the width animation — a stated exception to `DESIGN-BRIEF.md` rule 19 — would be
carrying no load. It arrives with the children, in `010`.

### The login panel — plain, and why the plain version is the deliverable

`BrandPanel` renders a solid `--navy-900` surface, the brand lockup, the headline, and the
subtitle. No canvas, no particle simulation, no aurora, no `backdrop-filter`, no drag
physics, no entrance animation, no pointer parallax.

The designed panel (`docs/sdd/design/screens/01-login.md`) is a canvas redrawing every
frame with `blur(80px)` behind it and spring physics on seven bodies. It is the single
heaviest surface in the product, it is Phase 6, and building it now is the documented way
to lose a day (ADR-009).

What is **not** deferred, because each is a correctness requirement rather than an effect:
the 50/50 split with the form on a plain surface and no card, the contact-shadow seam, the
form being a real `<form>`, `autocomplete` on both inputs, `role="alert"` on the error,
focus returning to email after a failure, the panel being `aria-hidden="true"` with
nothing focusable inside it, and the RTL side swap.

## Data changes

See [`data-model.md`](data-model.md). One table, one migration, `AddSupportUsers`.

Two things in it are worth reading twice: `UX_SupportUsers_Email` is unique and
**unfiltered** — the inverse of `Customers`, and asserted as `filter_definition IS NULL`
(AC-22) — and `PasswordHash` is `nvarchar(400)` following the blueprint's DDL even though
its value is ASCII, with the inconsistency reported rather than silently corrected
(`research.md` R-13).

## Contract changes

**New contract, frozen:** [`contracts/auth-api.md`](contracts/auth-api.md).

Its second half — *How every other endpoint consumes the token* — is **inherited by every
endpoint contract in the product**. `007`'s contract already anticipates it: it lists
`401` `errors/unauthenticated` and requires `Authorization: Bearer <JWT>` on every call.
Nothing in that file has to change.

A later feature contract may **narrow** the role required for its own endpoints. It may
not restate or vary the `401`/`403` shapes, the anonymous-endpoint list, the claim names,
or the lifetime. A change to any of those is a change here, recorded under this heading,
with the guide regenerated and both lanes told.

**One requirement placed on another feature**, recorded rather than assumed
(`spec.md` Q-C): `003-audit-trail`'s architecture test predicate becomes
`ICommand && !INonTransactionalRequest`, and its transaction and auditing behaviours honour
the marker. If `003` has already frozen that predicate, this is a contract change against
`003` and is raised there before implementation starts here.

## Test strategy

| Level | What | Why there |
|---|---|---|
| Unit — `Wasl.Domain.Tests` | `SupportUser.Create` guards: email normalisation, the two-value language set, the two-value role set, non-empty hash | Pure domain rules, no database, no hasher |
| Unit, living in `Wasl.Api.IntegrationTests` | `JwtTokenIssuer` claim set and lifetime arithmetic against a fake `TimeProvider`; `JwtOptionsValidator`; the `ManagerOnly` policy via `IAuthorizationService` | ADR-010 gives `Wasl.Api` exactly one test project. These need no container and run in milliseconds. **A third test project was rejected** — see the trade-offs below |
| Integration — `Testcontainers.MsSql` | The token endpoint's `200`/`400`/`401`; token validation failures; `401` on protected endpoints; `403` end to end; all four audit rows; the schema and collation checks; seeding idempotency; startup validation | Every one is a property of the real engine, the real middleware pipeline, or both. EF `InMemory` enforces no constraint and no collation (`docs/sdd/testing/test-strategy.md`) |
| Architecture | The endpoint-authorization inventory (AC-10); the `Program.cs` middleware order (AC-21) | Both fail by **omission**, and omission is what review is worst at catching — the same argument `001` R-6 made for the domain-dependency test |
| Frontend — Vitest + RTL | Enter submits; `autocomplete` and `name` present; the `401` message is one `role="alert"` block and focus returns to email; `RequireAuth` redirects with `returnUrl`; `RedirectIfSignedIn` does not paint the form; sign-out clears both storages; the interceptor does not loop on the token endpoint | These are the critical form and the guards. `docs/sdd/testing/test-strategy.md` scopes frontend tests to exactly that |
| Manual, recorded in `tests.md` | The Arabic walk of `/login` and the shell (AC-29) | RTL defects are visual. No assertion catches a sidebar sized to English label text |

### Deliberately not tested, with the reason

| Not tested | Why |
|---|---|
| That `PasswordHasher<T>` implements PBKDF2 correctly | Testing the framework. What **is** tested is that the stored value is not the plaintext and that verification succeeds against it (AC-14) — our use of it, not its internals |
| That JWT signature validation works in general | Testing the library. What **is** tested is our configuration: the pinned algorithm, the zero skew, the claim names, the issuer and audience (AC-6, AC-8, AC-9) — because configuration is the part that is wrong, and wrong quietly |
| Brute-force resistance | There is none. Rate limiting is out of scope and ADR-005 names it as the most serious gap. A test asserting an absent control would be theatre |
| Token theft via XSS | Not automatable here, and the storage choice is XSS-exposed by construction (`spec.md` Q-A). The controls are review items in `testing/security-checklist.md`, not tests |
| The `401` audit flood under load | No load requirement (`docs/sdd/testing/test-strategy.md` lists performance as deliberately untested). The risk is recorded below |
| Cross-tab sign-out propagation | Not built. A second tab discovers the sign-out on its next request, which `401`s (`spec.md` edge cases) |
| The seeded passwords themselves | They are configuration. A test asserting a specific password would be a committed credential in a test file |

### One thing the test suite must not be allowed to weaken

`ForbiddenEndpointTests` needs a `ManagerOnly` endpoint and there is none until `016`
(`research.md` R-11), so the test host registers `/test-only/manager-only` in
`ConfigureWebHost`. It lives in the test project and never ships.

`EndpointAuthorizationInventoryTests` (AC-10) must therefore run against the **production**
endpoint set, not the test host's. If it enumerated the test host, a future test endpoint
added without authorization metadata would make the "every endpoint is protected" assertion
pass while being false. That is written here because it is the kind of erosion nobody
notices.

## Dependencies

| Depends on | For | If it is not there |
|---|---|---|
| `001-solution-skeleton` | The solution, `WaslDbContext`, the UTC converter, `TimeProvider` in DI, the container fixture | Nothing here can be built |
| `002-error-contract` | The `ProblemDetails` middleware and the `errors/unauthenticated` / `errors/forbidden` types | This feature would build error bodies by hand, which Principle IV forbids |
| `003-audit-trail` | The `AuditLog` table, the audit writer, and the behaviours whose opt-out marker this feature needs | AC-15 through AC-19 cannot be satisfied. **This is why `004` follows `003` and not the reverse**, even though `003` needs an actor from `004` — see the circularity below |
| `006-design-system` | The React application, the tokens, and `Button`/`Input`/`Checkbox` | The FE lane cannot start. The BE lane and the phase gate are unaffected |
| `Microsoft.Extensions.Identity.Core` | `PasswordHasher<SupportUser>` without adopting Identity's schema (`research.md` R-1) | Hand-rolled PBKDF2, which is a security primitive written by us |
| `Microsoft.AspNetCore.Authentication.JwtBearer` | Bearer validation, `JsonWebTokenHandler` | — |

### The circularity between `003` and `004`, stated rather than discovered

`003` writes audit rows and needs an actor. `004` produces the actor and needs somewhere to
write. Neither can be built first in the strong sense.

The resolution — `spec.md` Q-B — is that `003` declares `ICurrentUser` with a stub
implementation so its own behaviour has an actor shape to write, and `004` replaces the
implementation with the claims-backed one. The interface then has one consumer at `003` and
a second here, which is exactly the "one consumer" test in `specs/README.md`.

This is a genuine tension in the phase ordering, not a defect in either feature, and it is
raised for a human to confirm before `003` starts rather than resolved unilaterally here.

### What depends on this feature

`005` (the `preferred_language` claim and the middleware position), `007` onwards (every
endpoint's `401`), `011`/`012` (`ICurrentUser` for the data-dependent rules of BR-6),
`016`/`019` (the `ManagerOnly` policy), `014` (the language preference the claim carries).

## Risks and trade-offs

### Considered and rejected: `.RequireAuthorization()` on a route group instead of a fallback policy

The conventional approach, and it reads more explicitly at the call site: a
`/api` group with `.RequireAuthorization()` applied once.

Rejected because of what happens when someone maps an endpoint outside the group — which is
one line, in a different file, months later. The endpoint is **public**, it returns `200`,
and nothing reports it. A fallback policy inverts that: the mistake becomes a `401` on the
first call, which is loud, immediate, and self-diagnosing.

The cost is that the two anonymous endpoints now depend on `.AllowAnonymous()` being
present, and `/health` returning `401` would be a visible outage — the good direction for a
mistake to point. AC-10 pins the anonymous set at exactly two so neither drifts.

### Considered and rejected: ASP.NET Core Identity

The correct answer for a real product: password policy, lockout, token management, and
email confirmation, all reviewed by people whose job it is. It would close the single most
serious gap this feature ships with.

Rejected on scope, exactly as ADR-005 rejected it — and worth restating here because the
gap is real: it brings a sizeable schema, a store abstraction, and a configuration surface
that would dominate the build. What is taken from it is the one piece that costs nothing:
`PasswordHasher<T>` from `Microsoft.Extensions.Identity.Core`, without the schema
(`research.md` R-1). If this project continued, adopting Identity is the first
infrastructure task.

### Considered and rejected: a third test project for `Wasl.Api` unit tests

`JwtTokenIssuer`, `JwtOptionsValidator`, and the policy check need no container and run in
milliseconds. They sit awkwardly in a project called `IntegrationTests`.

Rejected because ADR-010 fixed the layout at two source projects and two test projects, and
a third exists to satisfy a naming preference. The awkwardness is contained by folder — the
container fixture is opt-in per test class, so a unit test in that project does not pay for
Docker. Recorded because "why is a unit test in the integration project?" is a fair
question with an answer.

### Considered and rejected: `httpOnly` cookie instead of a bearer token in web storage

The only option that makes the token unreadable by a stray script, and the one a security
reviewer will ask about first (`research.md` R-9).

Rejected because ADR-005 specifies a bearer token, and a cookie brings CSRF handling, a
`SameSite` decision, and a same-site or proxied deployment that nothing in NFR-7 asks for.
The honest position is that the chosen storage is XSS-exposed by construction, the
mitigations are the ones the security checklist already requires, and the trade-off is
recorded (`spec.md` Q-A) rather than presented as safe.

### Considered and rejected: re-reading the user row on every request

It would close two gaps at once — a deactivated user would be denied immediately, and a
changed `PreferredLanguage` would take effect without a new token.

Rejected because it is a database query on every single request, which is precisely what
ADR-007 §4 put `PreferredLanguage` in the token to avoid. The gap is instead stated: up to
8 hours (`spec.md` Q-F, and the contract says so in the section a client author reads).

### Accepted risk: the `401` audit flood

BR-9.2 requires a row for every `401`. A scanner, or one misconfigured client in a retry
loop, writes thousands. `/health` is anonymous so probes do not contribute, but nothing
else bounds it.

Accepted as written (`spec.md` Q-D). The missing control is rate limiting, which ADR-005
already names as the most serious gap — so this is that gap's second symptom rather than a
new one. Solving it by quietly not writing some of the rows would put the application in
disagreement with a business rule, which is worse than a large table.

### Accepted risk: `MiddlewareOrderTests` asserts over source text

It can be defeated by moving the calls into an extension method, and it will need updating
if `Program.cs` is restructured.

Kept anyway. ASP.NET Core exposes no ordered middleware list, the behavioural test that
would replace it belongs to `005` (an `ar`-preferring user with an English
`Accept-Language` receiving Arabic), and the defect it catches is named in an ADR as the
most likely one in the build. A weak test on the right thing beats no test, provided its
weakness is written down — which is what this paragraph is.

### Accepted risk: the 8-hour lifetime is the only revocation control

Stated in `spec.md`, in the contract, and here, because it is the sentence most likely to
be softened. There is no revocation. A stolen token works for up to 8 hours. Rotating the
signing key signs out every user simultaneously and is not a per-user mechanism. The
lifetime is a weak mitigation and calling it anything else would be a false statement.
