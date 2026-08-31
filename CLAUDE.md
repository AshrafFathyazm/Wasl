# Wasl Development Guidelines

Customer Support CRM. Spec-Driven Development with GitHub Spec Kit.

Repository language is **English** — code, comments, commits, docs, artifacts.
Product language is **English + Arabic (RTL)**. Translated strings live in resource
catalogues, never in code or docs.

**Before planning or implementing anything, read
[.specify/memory/constitution.md](.specify/memory/constitution.md) and the feature's own
`spec.md`.** The blueprint they draw on is [docs/sdd/](docs/sdd/) — `FR-*`, `BR-*`,
`NFR-*`, `US-*`, and `ADR-*` identifiers all resolve there.

## Active Technologies

- C# / .NET 10 + ASP.NET Core Web API, controllers (main)
- MediatR pipeline behaviours: validation, transaction, audit (main)
- EF Core + Microsoft.EntityFrameworkCore.SqlServer (main)
- SQL Server 2022 (main)
- TypeScript + React 18 + Vite (main)
- FluentValidation, xUnit, FluentAssertions, Moq, Testcontainers.MsSql (main)
- TanStack Query, React Hook Form + Zod, React Router, react-i18next, Vitest + React Testing Library (main)

## Project Structure

```text
docs/sdd/                            the blueprint: FR/BR/NFR/US/ADR, design, testing
specs/NNN-feature/                   one folder per feature — see specs/README.md
src/
  Wasl.Domain/                       no EF, no HTTP, no MediatR, no packages at all
    Customers/                       Customer, ContactNormalisation
    Tickets/                         Ticket, TicketComment, TicketHistoryEntry,
                                     TicketStatus, TicketStatusTransitions
    Communications/                  CommunicationChannel. NO Interaction — this line named one
                                     until 034 went looking for a home for a customer's message
                                     and found the folder holds one file. It was never built
    Audit/                           AuditEntry
  Wasl.Application/                  depends only on Wasl.Domain
    Features/                        one folder per USE CASE, not per technical type
      Customers/CreateCustomer/      Command · Handler · Validator · Dto
      Tickets/ChangeStatus/
      ...
    Common/
      Abstractions/                  IApplicationDbContext · ICurrentUser · IRequestContext
                                     IAuditWriter · ITicketNumberGenerator · IAccessTokenIssuer
                                     ISignInThrottle · WaslJwtClaimNames — the claim names live
                                     here because the ISSUER is in Infrastructure and the READER
                                     is in Api, and this is the only project both of them see
      Behaviours/                    Validation only — Transaction and Audit are in Infrastructure
      Messaging/                     ICommand · IAuditableCommand
      Exceptions/  PagedResult.cs
    Resources/                       .resx for server-authored messages
  Wasl.Infrastructure/               implements what Application declares
    Persistence/                     WaslDbContext, Configurations/, Migrations/
    Queries/                         TicketTimelineQuery · DashboardAggregatesQuery
    Persistence/Behaviours/          TransactionBehaviour · AuditBehaviour — they need a real
                                     transaction, and IApplicationDbContext exposes no EF type
    Persistence/Audit/               interceptor · accumulator · serializer · writer
    Auth/                            IdentityPasswordHasher · InMemorySignInThrottle ·
                                     JwtAccessTokenIssuer · JwtOptions  (`005` moved the last two
                                     out of Wasl.Api — signing a JWT implements an Application
                                     abstraction; VALIDATING one is an HTTP concern and stays)
    Persistence/Seed/                DemoSeeder · SupportUserSeeder · SeedOptions — they touch
                                     WaslDbContext directly, so the API only invokes them
    Communications/
  Wasl.Api/                          composes everything at startup
    Controllers/  Middleware/  Program.cs
    Common/Localization/             SharedResource.cs + SharedResource{,.ar}.resx SIDE BY SIDE,
                                     and AddLocalization() takes NO ResourcesPath — with one, the
                                     factory looks under Resources/Common/Localization/ and every
                                     lookup silently returns the key (`005`, measured)
    Common/Auth/                     AuthenticationRegistration · AuthDenialResultHandler ·
                                     HttpCurrentUser · SignInThrottleFilter · WaslPolicies ·
                                     ActorClaimTypes — the HTTP half only
    DependencyInjection.cs           AddPresentation() — controllers, JSON, ICurrentUser, 002
    Common/WaslPipeline.cs           THE ordered behaviour list. Validation → Transaction → Audit
  wasl-web/                          React + TypeScript, feature folders
tests/
  Wasl.Domain.Tests/                 pure unit tests, no database, no HTTP
  Wasl.Application.Tests/            use cases with faked infrastructure
  Wasl.Api.IntegrationTests/         real HTTP + real SQL Server via Testcontainers
```

Dependency direction: `Wasl.Api` and `Wasl.Infrastructure` → `Wasl.Application` →
`Wasl.Domain`. Never the reverse.

`Wasl.Domain` has **zero package references**, and `Wasl.Application` must not be able to
see EF Core or ASP.NET Core — it declares interfaces, Infrastructure implements them. An
architecture test fails the build on either, because those two boundaries are the whole
return on four projects.

## Commands

```bash
# backend
dotnet build                                         # warnings are errors
dotnet test                                          # all tests
dotnet test tests/Wasl.Domain.Tests                  # unit only (no Docker needed)
dotnet test tests/Wasl.Api.IntegrationTests          # needs Docker running
dotnet ef migrations add <Name> -p src/Wasl.Infrastructure -s src/Wasl.Api
dotnet ef database update -p src/Wasl.Infrastructure -s src/Wasl.Api
dotnet run --project src/Wasl.Api                    # /health only — see below
dotnet run --project src/Wasl.Api -- --provision      # schema + the restricted principal (003b)
dotnet run --project src/Wasl.Api -- --seed          # provision, then demo data
docker compose up -d db                              # SQL Server 2022

# frontend
cd src/wasl-web && npm ci && npm run dev
npm run build && npm run test && npm run lint
```

**There is no `/swagger`, and there never was.** That line said there was until `002c` measured it
— the path returned `401` from the fallback policy on an unmatched route, which reads like a
protected endpoint rather than an absent one. An OpenAPI document IS generated now, and
deliberately **not served**: it would need `AllowAnonymous` and become the third anonymous
endpoint after `/health` and `POST /api/auth/token`, a list `004` AC-10 counts. It is produced
in a test and compared against the frozen `contracts/` — which is the Definition of Done item
that had never been satisfiable for any feature.

Full run-from-clean-clone script: [specs/001-solution-skeleton/quickstart.md](specs/001-solution-skeleton/quickstart.md).

## Code Style

**C#** — nullable enabled, warnings as errors, set once in `Directory.Build.props`.
`TimeProvider` injected, never `DateTime.UtcNow` inline. `CancellationToken` threaded
through every async path. One use case = one folder under `Application/Features/`.

**No `EmailAddress` / `PhoneNumber` value objects.** Normalisation is static methods on
`ContactNormalisation`, ruled 2026-08-28 — see `12-delivery-log.md`. A value object earns its place
by making an invalid instance impossible to construct, and `Customer` has private setters and one
factory, so that door is already shut. Two wrappers would cost an EF converter each and a
conversion on every read while enforcing nothing `Customer.Create` does not. **Do not add them back
on the grounds that a structure diagram once named them.**

**No `IRepository<T>` and no per-aggregate repository** — reach EF Core through
`IApplicationDbContext`, declared in `Application/Common/Abstractions` and implemented by
`Infrastructure/Persistence/WaslDbContext`. `DbSet<T>` is already a repository; the
interface exists to keep EF Core out of the Application layer, not to re-implement it.
Query it with LINQ at the call site. A named query class only where a query is genuinely
non-trivial, in `Infrastructure/Queries/`. **`TicketTimelineQuery` is built** (`013`) — it unions
`dbo.TicketComments` and `dbo.TicketHistory`, neither of which is on `IApplicationDbContext`, and
keeping it there is what stops the tie-break having two implementations. `DashboardAggregatesQuery`
is the second and is not built. **A third needs a written reason.**

Controllers bind, authorise, dispatch, and map. Domain exceptions for invariant
violations, mapped to `ProblemDetails` in one middleware — no hand-built error responses,
no mixing in `Result<T>`.

**TypeScript** — feature folders, no barrel files. Server state through TanStack Query
only; fetching happens at the route level, never in a child component. Forms are React
Hook Form + Zod, one schema driving both types and validation. No global store — filters
and pagination live in the URL. No hard-coded colour, spacing, or radius: semantic
design tokens only. CSS logical properties (`margin-inline-start`), never `left`/`right`.
No user-facing string in JSX — every one comes from a catalogue present in both `en`
and `ar`.

## Recent Changes

- main: repository initialized; spec-kit scaffolded; blueprint vendored to `docs/sdd/` and converted to SQL Server; **ADR-010 rejected — four-project Clean stands (ADR-002)**; the product scope document traced in `docs/sdd/15-scope-coverage.md`; nine-hour plan in `docs/sdd/16-three-day-plan.md`
- **`001-solution-skeleton` delivered** 2026-08-25 — four projects, `IApplicationDbContext`, UTC converter, `Customers` + `InitialCreate`, `GET /health`, CI green (17 tests)
- **`002-error-contract` core delivered** 2026-08-25 — domain exception hierarchy, the 13-row `ProblemTypes` registry, one `ProblemDetailsFactory`, `TraceContext`, `ValidationBehaviour` (33 tests). `002b` — `UseStatusCodePages`, malformed request, Swashbuckle — deferred with a reason per task
- **`003-audit-trail` core delivered** 2026-08-25 — `dbo.AuditLog`, capture-only diff interceptor, BR-9.7 redaction, `TransactionBehaviour` + `AuditBehaviour` **in `Wasl.Infrastructure`**, one ordered behaviour registration in `Wasl.Api`, NFR-10 scanner + self-test (93 tests). `003b` — **closed 2026-08-30**: append-only is a database permission now
- **`009-create-ticket` backend delivered** 2026-08-26 — `Ticket` + `TicketHistory` + `dbo.TicketNumberSeq`, `POST /api/tickets`, `GET /api/tickets/{id}`, the BR-1 map with **all 36 cells**, `IAuditableEntity` stamping in `SaveChangesAsync`, `IRequestTimestamp` (214 tests). Form is `024-frontend-create-ticket-form`
- **`012-change-ticket-status` backend delivered** 2026-08-26 — `PUT /api/tickets/{id}/status`, three distinct `409` codes, explicit optimistic concurrency **before** the transition rules (250 tests)
- **`010-ticket-list-and-detail` backend delivered** 2026-08-26 — `GET /api/tickets`, paged envelope, BR-7.2 clamping (263 tests). Filters, search and sorting to `015`; both screens to the frontend lane
- **`004-auth-and-roles` backend half delivered** 2026-08-27 — `dbo.SupportUsers` + the four FKs `009` deferred, two seeded users, `POST /api/auth/token`, real `ICurrentUser`, `ManagerOnly` + `RequireAuthenticatedUser` as the **fallback**, `UseAuthentication` before `UseRequestLocalization` (303 tests). Login screen and route guard belong to the frontend lane
- **`004b` delivered** 2026-08-29 — the two gaps `004` named as open, closed together because they are one path: a request refused before any handler runs. `AuthDenialResultHandler` writes `Auth.Unauthenticated` / `Auth.Forbidden` **and envelopes those bodies**, which AC-19 forces (it compares the row's trace id to the one *in the response*, and there was no response body). A **(address, email)** throttle answers `429 errors/rate-limited` with `Retry-After` and writes `Auth.RateLimited`. `expectedVersion` is length-checked before any base64 buffer (442 tests). **The ruling said "per IP" and AC-37 forbids locking out a NAT office — the two contradicted, and a negative control settled it, not an argument**
- **`005-localization-core` server half delivered** 2026-08-29 — `.resx` in `en` + `ar` (63 keys), `LocalizedProblemMessageSource` replacing `002`'s dictionary, `PreferredLanguageCultureProvider`, the three-provider order with the **cookie provider removed**, and `UseRequestLocalization()` **between `UseAuthentication()` and `UseAuthorization()`** (472 tests). **The frontend reported one defect; measuring found three with three owners** — and `AC-11` is recorded **unmet**: a response produced by *throwing* loses `Content-Language` because `ExceptionHandlerMiddleware` clears the response, which is `002`'s. Ruled **server-only**; the switcher and `PUT /api/me/language` are **`014`**
- **`002b-error-contract-completion` delivered** 2026-08-30 — `404`/`405` enveloped by `UseStatusCodePages`, the **`415`** by substituting MVC's `ProblemDetailsFactory` (which is what makes `002` AC-2 — one producer — finally true), a malformed body split from an invalid one, and `Content-Language` re-applied after `ExceptionHandlerMiddleware` clears it (495 tests). Closed `005` AC-11/AC-2/AC-19 and `008` AC-3 + `011` D-2. **`002`'s summary called the `415` an empty body; it was MVC's own envelope with an RFC section URI — worse, because a plausible envelope branches nowhere while an empty one breaks a parser loudly.** The tail is **`002c`**
- **`003b-audit-least-privilege` delivered** 2026-08-30 — `wasl_app` with `DENY UPDATE, DELETE` on `dbo.AuditLog`, **two connection strings**, and a guard that refuses to start if they match (501 tests). **BR-9.5 is a database permission now, not a convention.** Two negative controls produced identical output — removing the `DENY`, and keeping it while running as `sa` — which is the proof that **the connection string is the load-bearing half**. `dotnet ef database update` alone is no longer enough: `--provision` is the second step
- **`002c-error-contract-tail` delivered** 2026-08-30 — the OpenAPI document (generated, **not served**), the contract comparison, `002`'s four unwritten tests, and the framework's English validation messages replaced by catalogue keys (521 tests). **The Definition of Done's OpenAPI item had never been satisfiable for any feature.** The comparison immediately found two endpoints in frozen contracts nobody had counted. `002`, `002b` and `002c` close together; **AC-3 is not claimed** — no action carries `[ProducesResponseType]`, so the document declares no statuses
- **`014-language-preference-and-rtl` backend half delivered** 2026-08-30 — `PUT /api/me/language`, `SupportUser.ChangeLanguage` (the entity's first mutator), **no migration** (533 tests). **A user who switches sees no change until the next sign-in** — the token is signed and immutable — and the `204` carries `Content-Language` naming the **old** language. That is behaviour, not a defect, and AC-6 asserts it so nobody files it as one. Switcher screen is the frontend lane's. **The numbering conflicts with `014`'s frozen contract and is recorded, not resolved**
- **Placement cleanup** 2026-08-29 — `JwtAccessTokenIssuer` + `JwtOptions` → `Wasl.Infrastructure/Auth/`, the three seeders → `Wasl.Infrastructure/Persistence/Seed/`, and `JwtRegisteredClaimNames` → **`WaslJwtClaimNames`** in `Wasl.Application/Common/Abstractions/`. The old name shadowed `System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames`, imported in the same file, so every reference bound silently to the local type
- **`011-assign-ticket` backend delivered** 2026-08-28 — `PUT /api/tickets/{id}/assignee`, `GET /api/support-users`, BR-2 in full, `Assigned`/`Unassigned` history rows, a second seeded Agent, **no migration** (340 tests). Fixed a defect two releases old: `TicketHistory.PerformedByUserId` was NULL on every row ever written. Picker UI is the frontend lane's
- **`007-create-customer` backend delivered** 2026-08-29 — `Customer.Create`, `ContactNormalisation` (**no value objects**, ruled), `POST /api/customers`, BR-4.8's two **filtered** unique indexes with the violation translated into the pre-check's exception (434 tests, run twice). **AC-13 is the project's first concurrency test.** Found that `Customer` timestamps had never been stamped, and that a create and a read returned different timestamps for the same resource
- **`008-customer-list-and-profile` backend delivered** 2026-08-28 — `GET /api/customers` with search, `GET /api/customers/{id}`, explicit CI collation on every searched column (408 tests, run twice). Built the **query counter** and used it to close `013` AC-14 and `010` AC-12 as well as its own AC-11. **AC-3 recorded unmet** — a malformed id returns `404`, `002b` owns it
- **`013-ticket-timeline-and-comments` backend delivered** 2026-08-28 — `dbo.TicketComments`, `POST /api/tickets/{id}/comments`, `GET /api/tickets/{id}/timeline` **cursor-paged**, `TicketTimelineQuery` in `Infrastructure/Queries/` (378 tests, run twice). First feature able to exercise `003`'s comment-body redaction and to make `010`'s stable-sort guard provable — every comment writes two rows from one memoized instant, so the tie is guaranteed. **AC-14 is open with an argument and no test:** nothing counts query round trips
- **`004b` partial** 2026-08-28 — the `401` body's `title` was the wrong one of the two this `type` carries, and `detail` was a **raw resource key** on the login screen. Fixed with an optional `TitleKey` on `DomainException` and `CarriesDetail: false`; the `type` did not change. **The guard written to stop it recurring found seventeen more:** every FluentValidation message in the API was unresolved (355 tests). AC-17/AC-18 — the audit row on a middleware denial — are still open
- **The development connection string points at the compose container**, port 14330, not `.\SQLEXPRESS`. Supersedes `001` AC-10 — see `12-delivery-log.md` 2026-08-27

<!-- MANUAL ADDITIONS START -->

## Working agreement — the gates, in order

**No feature is implemented without an approved spec, and no commit happens without
permission. Both gates are per feature, every time.**

```text
1. spec        write the spec for the feature — nothing else, no code
2. questions   anything unclear or needing a change → ask. Do not assume, do not
               guess a requirement into the spec
3. review      the product owner reads the spec in full. Wait
4. approval    ask explicitly: "may I implement this spec?" and wait for yes
5. implement   build it, task by task
6. summary     write summary.md inside the same spec folder: what was built, the
               trade-offs, what deviated from the plan and why, known limitations
7. permission  ask before `git commit` and before `git push`. Every time
```

| Gate | Do not |
|---|---|
| 1 | Write code, scaffold a project, or install a package before the spec exists |
| 2 | Invent a missing requirement. It goes to **Open Questions** in `spec.md`, never into the design |
| 3–4 | Start implementing because the spec "looks approved". Approval is a yes, not an absence of objection |
| 6 | Leave the feature without a `summary.md`. An implemented feature with no summary cannot be reviewed against what it promised |
| 7 | Run `git commit`, `git push`, or `gh pr create` without being asked. Approval of one commit is not approval of the next |

Writing, editing, and `git add` need no permission. The line is at commit and push.

**Always `git commit <paths>`, never a bare `git commit`. The lanes share one index, so
whoever commits first takes whatever anyone else has staged — and it protects only the
lane that uses it.** `029` measured this: `20d7785 feat(031)` carries `029`'s motion
tokens, `--ld-dir`, the `Skeleton` reason and two i18n keys, because `031` committed
without paths while `029` was still building. Nothing was lost and nothing was
duplicated; the *attribution* was — `git log -- tokens.css` now says the motion tokens
arrived with a dropdown.

One feature in progress at a time. The plan — phases, feature numbering, task IDs, and
who builds what — is [specs/README.md](specs/README.md).

```text
/speckit-specify   → spec.md            what, and what is out of scope
/speckit-clarify   → ambiguity removed before any design
/speckit-plan      → plan.md · data-model.md · research.md
                     contracts/*-api.md ← FROZEN. both lanes read it
                     FRONTEND-API-GUIDE.md · frontend-spec.md
/speckit-tasks     → tasks.md           ordered, verifiable, one owner each
/speckit-analyze   → cross-artifact consistency
/speckit-implement → build, task by task
verify-story       → tests.md + ai-notes.md + the Definition of Done gate
```

Task IDs: `BE-007-03`, `FE-007-02`, `TEST-007-08`, `DOC-007-01`, `REV-007-01` — the
number is the feature folder's number. Every task row carries **Agent** and **Skill**;
a task with neither is a task nobody owns. Agents are named in `tasks.md` before they
are dispatched, and whatever they return is recorded in `ai-notes.md`.

Never invent a requirement. A missing one goes to **Open Questions** in `spec.md`, never
into the code. Never write down a test result that was not observed. A deviation from the
plan is fine; an **undocumented** deviation is not.

## The contract between backend and frontend

The frontend does not wait for the backend, and it does not guess either.

```text
spec.md                    one set of acceptance criteria
   ↓
contracts/<name>-api.md    FROZEN before either lane starts
   ↓                  ↓
BE implements it     FE reads FRONTEND-API-GUIDE.md and starts
   ↓                  ↓
generated OpenAPI  →  compared against the contract before the feature closes
                      a difference is a defect in one of the two, never fixed silently
```

Hand-written client types are marked **provisional** in the file that declares them and
replaced with types generated from OpenAPI once the endpoint is real. A contract change
mid-flight goes under **Contract changes** in `plan.md` and both lanes are told.

## Domain rules that must not be re-implemented

`BR-*` are in [docs/sdd/04-business-rules.md](docs/sdd/04-business-rules.md). Cite them
by ID in specs and tests.

**Ticket state machine (BR-1)** — one static permitted-transition map in `Wasl.Domain`.
Never duplicated in an endpoint or in React; the API returns `allowedTransitions` with
the ticket and the UI renders only what it was given.

| From ↓ / To → | New | Open | InProgress | PendingCustomer | Resolved | Closed |
|---|---|---|---|---|---|---|
| **New** | – | yes | no | no | no | yes |
| **Open** | no | – | yes | no | no | yes |
| **InProgress** | no | yes | – | yes | yes | no |
| **PendingCustomer** | no | no | yes | – | no | no |
| **Resolved** | no | no | yes | no | – | yes |
| **Closed** | no | no | no | no | no | – |

Anything not `yes` is `409 Conflict`. `Closed` is terminal — no reopen, reassign,
escalate, or comment. A same-status transition is `409`, not `200`. `InProgress` requires
an assignee. `PendingCustomer → Resolved` is not permitted directly.

- **BR-2 assignment — implemented by `011`** — a `Manager` assigns anyone; an `Agent` may only
  self-assign an unassigned ticket. Assigning a `New` ticket does not move it to `Open`. The
  endpoint carries **no role policy** and cannot: `ManagerOnly` there would refuse every Agent.
- **BR-4 duplicate customer** — email and phone each optional but unique when present,
  case-insensitive on email. A second create returns `409 duplicate-customer` naming the
  field and **nothing else** — no id, no name.
- **BR-6 authorization** — server-side. Role-only checks as endpoint policies;
  data-dependent checks ("is this user the assignee?") in the handler. **The split is not a
  style choice, and `011` measured it: a handler denial is audited, a policy denial is not.** A
  `ForbiddenException` reaches `AuditBehaviour`, which classifies it `Denied` and writes an
  independent row; a `403` from the authorization middleware throws nothing, so MediatR never sees
  it and no row exists — `004` AC-18, open. Moving BR-2 into `ManagerOnly` and re-running the
  suite reported `found 0: {empty}` for that row while the API still answered a correct `403`. A
  policy `403` also has an **empty body** (no `type`, no `traceId` — `002b`), and a policy cannot
  express a check ordering at all, because it runs before every handler.
- **BR-7.2** — `pageSize` above 100 clamps to 100; `page` is 1-based, clamps up to 1.
- **BR-8 localization** — the server localizes only strings it authors. Never localized:
  `ProblemDetails.type`, the keys of `errors`, enum values, `TicketNumber`, `traceId`.
  **`UseRequestLocalization()` goes after `UseAuthentication()` AND before
  `UseAuthorization()`** — it is registered between them, and both halves are load-bearing.
  ADR-007 fixes only the first half and calls the wrong order the most likely defect in the
  build; the second half is `005`'s addition, ruled 2026-08-29, and it is what makes a `401`
  and a `403` translatable at all, because `004b`'s `AuthDenialResultHandler` produces those
  bodies **inside** `UseAuthorization`. **Both orderings fail silently** — the build stays
  green, ADR-007 does not forbid the old position, and Arabic users get English on exactly the
  two responses that refuse them. Control 1 in `005`'s `tests.md` measured it: seven tests red,
  `Content-Language` `<null>` and the title back in English.
- **Localizing an error response reads the culture from `IRequestCultureFeature` on the
  `HttpContext`, never from `CultureInfo.CurrentUICulture`.** The outermost exception handler
  runs at the top of the pipeline, so by the time it builds a body the localization middleware
  has unwound and restored the ambient culture. `002` wrote the instruction and called it
  belt-and-braces; `005` measured that without it **every error is English while every success
  is Arabic**.
- **`Content-Language` is re-applied in `GlobalExceptionHandler`, and that line is load-bearing.**
  `ExceptionHandlerMiddleware` calls `Response.Clear()` before invoking any `IExceptionHandler`,
  taking the header the localization middleware wrote on the way down. `002b` restores it —
  reading `IRequestCultureFeature`, never the ambient culture, for the reason in the row above.
  **The probe that found it is the one to repeat:** on one endpoint, a `400` from model binding
  keeps the header and a `400` from FluentValidation loses it. Same status, same request headers.
- **Every status the framework produces on its own goes through `MvcProblemDetailsFactory` or
  `StatusCodeEnvelope`** (`002b`). `404` and `405` arrive with an empty body and
  `UseStatusCodePages` fills them; a `415` arrives with MVC's OWN envelope, so
  `UseStatusCodePages` never sees it and the substituted factory is what fixes it. **Two
  mechanisms, and each has its own negative control** — removing one leaves the other green.
  `002`'s summary recorded the `415` as an empty body; it was not, and **a plausible envelope
  with a foreign `type` is worse than an empty one**, because it passes every parser and every
  shape assertion while `code === 'unsupported-media-type'` stays false forever.
- **A non-nullable reference parameter is implicitly REQUIRED at the model binder**, which refuses
  before the MediatR pipeline runs — so `ValidationBehaviour` never executes and the symbolic key
  is never reached. `002c` set
  `MvcOptions.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true` to move that
  check into FluentValidation. **It is gated:** `RequiredMemberCoverageTests` requires every
  non-nullable member of every `ICommand` to have a validator rule, because without one a missing
  field arrives as `null` in a non-nullable property and reaches a handler — a `500` in place of a
  `400`, *a worse defect wearing a localization fix*. **If that test goes red, the setting comes
  out.**
- **The OpenAPI document is generated and NOT served** (`002c`). `AddOpenApi()` is registered;
  `MapOpenApi` is deliberately absent, because serving it needs `AllowAnonymous` and would make it
  the third anonymous endpoint after `/health` and `POST /api/auth/token` — a list `004` AC-10
  counts and asserts. **There is no `/swagger`, and there never was.** `OpenApiContractTests`
  compares the document to the frozen `contracts/` in both directions: a built endpoint missing
  from every contract has **no exception list at all**, and a contracted endpoint that is unbuilt
  is named individually with its owning feature — never resolved by loosening the comparison.
- **A body that could not be parsed is `errors/malformed-request` with NO `errors` object**
  (`002b`). A field that could not be parsed stays `errors/validation`, with the field named and
  the message replaced by `Validation.Request.FieldUnreadable`. **Never let a parser diagnostic
  reach the wire:** the measured one carried a fully-qualified internal type name and a byte
  offset, and `002` has a test for that exact request which passes because it asserts the status
  and never reads the message.
- **The audit log is append-only by PERMISSION, and the connection string is what enforces it**
  (`003b`). `wasl_app` holds `SELECT` and `INSERT` on `dbo.AuditLog` and an explicit `DENY` on
  `UPDATE` and `DELETE`. **`DENY` does nothing to a `sysadmin`**, so the grant is not the
  guarantee — the principal the application connects as is. Two controls measured it and produced
  IDENTICAL failures: removing the `DENY`, and keeping it while connecting as `sa`.
- **Two connection strings, and the migrator has NO presence in the request path.**
  `AddInfrastructure` reads only `ConnectionStrings:Wasl`; `WaslMigrator` is read at the call site
  by `--provision`, `--seed` and the test fixture, is never registered in the container, and has
  **no fallback** — retrying a denied permission with a privileged principal is privilege
  escalation that reads as resilience. The host refuses to start if the two hold the same value.
- **`dotnet ef database update` is not enough on its own.** It applies the schema and does not
  create the principal. `dotnet run --project src/Wasl.Api -- --provision` is the second step, and
  it exists because a password cannot live in a committed migration file.
- **A per-role grant, not a per-table list** — `db_datareader` + `db_datawriter`, made safe by the
  audit `DENY`. A per-table list is a list somebody forgets to extend, and the next feature's
  table becomes a `500` that reads as a bug in the feature. **But a SEQUENCE is covered by neither
  role:** `dbo.TicketNumberSeq` needs its own `GRANT UPDATE`, and without it every
  `POST /api/tickets` fails on a principal that can read and write everything else.
- **BR-9 audit** — every state-changing command implements `IAuditableCommand`; a
  pipeline behaviour writes the row in the **same transaction** as the change, so it is
  absent when that transaction rolls back. Denials and failures write a row too, outside
  any transaction. Nothing sensitive in `Changes`. An architecture test enforces it.

The frontend may mirror a rule for UX (disable a button that would be rejected) but is
never the authority. Every mirrored rule is enforced server-side.

## API contract

Base `/api`, `application/json`, UTC ISO-8601 with `Z`, ids are `Guid` strings, enums as
strings. **`200` is never returned with an error in the body.**

`201` carries `Location`. `409` covers duplicate customer, forbidden transition, stale
version, and already-escalated — each with its own `type`:
`errors/duplicate-customer`, `errors/invalid-status-transition`,
`errors/concurrency-conflict`, `errors/already-escalated`.

`429 errors/rate-limited` exists on **`POST /api/auth/token` and nowhere else** (`004b`), and it
carries `Retry-After`. `error-contract.md` originally listed `429` as *not produced by this API*;
that is recorded as a **contract change** at the foot of the file, not edited away.

Every non-2xx is RFC 7807 `ProblemDetails` with a `traceId` matching the server log.
`errors` appears only on `400` and `409`. `detail` never contains a stack trace, SQL, an
exception type name, or a connection string.

**Two pagination shapes, deliberately.** An **envelope** —
`{ items, page, pageSize, totalCount, totalPages }` — for stable, jumpable lists: `GET /api/tickets`,
and `015` takes the envelope. A **cursor** — `?before=<cursor>&limit=` — for feeds that grow at the
point the reader is looking: `GET /api/tickets/{id}/timeline` (`013`). The difference is not a
preference. A ticket list grows at the end the user is *not* reading, so page 2 stays page 2; a
timeline grows at the end they *are* reading, so a page number silently skips or repeats entries
between two requests. Without this paragraph the first person to meet both reads it as an
inconsistency and unifies them.

Sub-resource `PUT` (`/status`, `/assignee`) instead of `PATCH` on the ticket — each is a
distinct business action with its own rules and its own history row.

`/health` is the exception: outside `/api`, unauthenticated, and it returns the health
report shape rather than `ProblemDetails`.

## SQL Server specifics — ADR-013

Four provider-coupled points. Each fails **quietly** if done wrong:

| Concern | Implementation |
|---|---|
| Concurrency token | `rowversion` + `.IsRowVersion()`. **Not** `xmin`, **not** a manual `int`. `expectedVersion` on the wire is the base64 rowversion |
| Duplicate rule (BR-4) | Filtered unique index: `.HasFilter("[Email] IS NOT NULL AND [IsActive] = 1")`. Verify `filter_definition` comes back **non-null** from `sys.indexes` — an unfiltered index rejects the second customer with no email |
| Case-insensitive email | Explicit CI collation on the column. SQL Server cannot build a filtered index on `LOWER(Email)`, so the expression form does not exist here |
| Arabic text | `nvarchar` (the EF default for `string`). Never `varchar` — it returns `????` and looks like a font bug |
| Timestamps | `datetime2(3)` + a global UTC value converter. SQL Server has no `timestamptz` |
| Integration tests | `Testcontainers.MsSql`, a real engine per run. Never EF `InMemory` — it enforces no constraints |


## Testing rules that were learned the hard way

Two of these came from defects that a green test run was actively hiding.

**Verification means the whole suite. `--filter` is for diagnosis, never for proof.**
Seven integration classes each passed under `--filter` and the suite died of
`System.OutOfMemoryException` — because `IClassFixture` creates a fixture per class, so seven
classes started seven SQL Server containers at once. The failures landed on unrelated
validation assertions, so it read as a feature bug rather than resource exhaustion. A filtered
run tells you about a class; it tells you nothing about the suite.

**One `ICollectionFixture` for every integration class, so one container. Which means the
tests share a database — so scope every assertion.** Filter by ticket id, customer id, or
audit action. **Never `COUNT(*)` over a whole table**: an assertion that was correct with one
container per class is wrong now, and it fails intermittently depending on which tests ran
first, which is the worst way to find out.

**Assert content, not presence.** `003` moved its diff interceptor one hook later and four
tests went red while the audit row still existed, `COUNT(*)` still returned 1, and `Changes`
came back `null` on every command. A test checking that a row exists, or that a field is
present, would have stayed green on a broken audit trail.

**A guard that has never been seen to fail has not been verified.** `001` shipped an
architecture test that was a false negative until someone broke it on purpose. Break the thing
the test protects, watch it go red, put it back — and record that in `tests.md`.

**An entity written only from outside the real path is an entity nothing has verified. The first
request that goes through the real path is its first test.** This has now happened three times,
and each looked like a different bug:

| Feature | What was never exercised | How it presented |
|---|---|---|
| `009` | `CommunicationChannel` / `TicketPriority` / `TicketCategory` written from a contract example | Two invented members and two wrong values, in an enum that compiles |
| `011` | `TicketHistory.PerformedByUserId`, because `--seed` and one test wrote history rows directly | **NULL on every row ever written.** The timeline would have said "someone" for every event |
| `007` | `Customer` timestamps, because `--seed` writes SQL and `008`'s tests use reflection | `"createdAtUtc":"0001-01-01T00:00:00"` on the first real `201` — the CLR default, served as a fact |

**So when a feature seeds or fixtures data with raw SQL or reflection, say so and treat the entity
as unverified until something drives it end to end.** The shortcut is often correct — `007` and
`011` both needed it, because the factory did not exist yet — and it is the *silence* that costs:
each of these was invisible for several features and then obvious in one request.

**A time-ordered id is a poor source of a unique PREFIX.** `Guid.CreateVersion7()` leads with a
timestamp, so two minted milliseconds apart share their leading hex digits. `008` used a
seven-character slice as a search term and matched the wrong row; `007` used a ten-character slice
as an email local-part and two customers collided on a unique index. **Recording it in `008`'s
evidence did not stop it recurring in the very next feature** — which is why it is here. Use
`RandomNumberGenerator` for a test discriminator.

**A create and a read of the same resource must return the SAME body, asserted byte for byte.**
`007` AC-14 caught `"createdAtUtc":"…57.7129947Z"` from a `POST` against `"…57.712Z"` from the
`GET`: full .NET tick precision in memory, `datetime2(3)` in the column. Every create in the
product had that shape, and a field-by-field comparison walks straight past it. Truncation lives in
`RequestTimestamp` — the one place both `Stamp()` and every handler read — because `009` was
already correct and `013` was not, and fixing it per-handler would have fixed one of five.

**"The query does not issue one round trip per row" is measurable, and there is a tool for it.**
`factory.CountQueries()` returns a probe; assert the count over a small result **equals** the count
over a larger one, never that it is under a threshold — a threshold drifts with every unrelated
change to the request. Built in `008` after the whole category had been met by reading the LINQ,
which cannot see a lazy load, a client-side `ToList` added later, or a projection that stops being
translatable. It closed three criteria in three features on the day it was written, and **it throws
rather than returning zero** when the interceptor is unattached, because `BeLessThan(3)` is
satisfied by zero.

**A test proving two results are identical does not prove the order is determined — it proves the
engine agreed with itself twice.** `013` deleted its tie-break and the repeatability test still
passed: SQL Server returned the same order on two consecutive requests over nine rows. `010` found
the same thing after three attempts and had to record its stable-sort guard as unproven. **What
catches a missing tie-break is an assertion about a specific order.** Repeatability earns its place
by proving a tie **exists** — which is what stops the order assertion passing on data that never
tied. `013` has both, and only one of them went red.

**A cursor compares exactly the keys the `ORDER BY` sorts by, in the same sequence.** `013`
ordered by `Id` and filtered the cursor on the id **as text** — and SQL Server orders
`uniqueidentifier` by a byte order of its own, not lexically, which is not readable from the code.
The two disagreed, and one comment appeared on two consecutive pages. Caught by an assertion that
no entry appears twice; counting entries per page passed. Both directions of the mismatch were then
broken deliberately and both produced a broken feed.

**`errors[field]` with one entry is not a content assertion

**`errors[field]` with one entry is not a content assertion — it is a shape assertion.** Read the
message. Six assertion sites across the suite checked a `400` this way — `TryGetProperty("subject")
is true`, `EnumerateArray().HaveCount(1)` — and **all seventeen unresolved keys went out under
them**, because a raw key is exactly one array entry under exactly the right field name. Counting
entries proves the envelope; only reading the string proves the message.

**A missing message key is invisible, and it has shipped three times.** `002`'s message source
resolves an unknown key by **returning the key** rather than throwing — correct at runtime, since a
missing translation must not turn a `400` into a `500`, and it makes the response well-formed and
useless. `012` AC-3 caught one `409`; the frontend lane caught a `401` rendering
`Error.Auth.InvalidCredentials` on the login screen; and the guard written for that second one
found that **every** FluentValidation message in the API was a raw key — seventeen of them, under
every form field, with no server test noticing because each asserted the field was *present*.
Two guards now, and neither is optional: `ResourceKeyLeakTests` asserts no response field matches
the *shape* of a key, and `MessageKeyCoverageTests` scans the source for key-shaped literals and
requires each in the catalogue. **Add the message in the same commit as the key.**

**A stale binary reports a green build.** `Copy-Item` preserves the source file's
`LastWriteTime`, so reverting a change from a backup can make the source look **older** than the
compiled DLL — MSBuild then skips recompiling it and `dotnet build` prints `0 Errors`. `011`
measured its second negative control against the first one's binary and nearly recorded
"swapping the check order breaks five tests": specific, plausible, and wrong. The only tell was
that the failures did not match the change. **Re-measure every negative control with
`--no-incremental`**, and kill stray `Wasl.Api` processes first — a file lock turns the same
build into `MSB3061`, which at least fails loudly.

**Verify a measurement with something below it.**
 A `grep` over `src/` cannot see what
the framework builds inside itself — `002`'s AC-2 guard was green while three request
shapes returned the framework's envelope. Five tools have lied here: that grep, a
regex that matched the wrong table, a preview toggle that said `en` while rendering
Arabic, a measurement block that named the wrong label, and the **build** (see above). Each produced a
well-formed report about nothing. **A measurement that names the wrong thing is worse
than no measurement, because it is believed.**

## Correctness under concurrency and abuse — check these on every write

Not a general security list. Every row below is a defect that this codebase
has already had, or that the shape of a feature makes likely.

| Before you finish a write endpoint | Why |
|---|---|
| **Does a duplicate request create a duplicate row?** `POST /api/tickets` is not idempotent. The client guard is not the guarantee — the guarantee is a unique index or a rule | Two clicks, two tickets, no error. Found by the support team, not the developer |
| **Does the version check run on every path?** `PUT /status` and `/assignee` check `rowversion`. A new path that skips it loses the update silently | Last-write-wins is the default when nobody looks |
| **Is a sequence relied on for uniqueness, or the code?** `ITicketNumberGenerator` under three parallel requests | If the code allocates, it races. If the sequence does, it does not |
| **Does the DTO carry a field the client must not set?** `Id`, `TicketNumber`, `Status`, `CreatedByUserId`, `RowVersion` are server-owned | Mass assignment. The endpoint looks correct and the client controls state it should never touch |
| **Does the error distinguish "not found" from "not permitted"?** BR-4.4 forbids it for customers | The distinction is an enumeration oracle. Applies to every resource, not just customers |
| **Does anything write two tables without a transaction?** | A ticket with no history row is invisible to the timeline and nothing failed |
| **Does the database compute a value the code also computes?** | `009` shipped `DEFAULT 'Normal'` that silently overrode the caller's `Low` |
| **Is an enum stored as an int?** | A reordered enum rewrites the meaning of every existing row |
| **Is `DateTime.UtcNow` called anywhere?** `IRequestTimestamp` or `TimeProvider`, never inline | Two timestamps in one request that should be one |
| **Is `pageSize` clamped on every path?** BR-7.2 | An unclamped page size is a denial of service with one query string |
| **Is any SQL built by interpolation?** `ExecuteSqlRaw`, `FromSqlRaw` | EF1002 is an analyser rule, and the habit formed in a test moves to `015`, which builds a query from user input |

### Authentication — `004`'s backend half is built. Read this before touching it

`ICurrentUser` returns real values from the token. It returns `null` **only** for a genuinely
unauthenticated principal, which after the fallback policy can happen on exactly two endpoints:
`GET /health` and `POST /api/auth/token`.

**`RequireAuthenticatedUser` is the fallback policy.** An endpoint with no `[Authorize]` is
closed, not open — so a forgotten attribute is a `401` in a test rather than an open door. Add
`[Authorize]` anyway: `AuthorizationSurfaceTests` enumerates endpoint **metadata**, and a
fallback policy is not metadata.

Four settings in `AddWaslAuthentication` are load-bearing and every one of them fails silently
if reverted. This was **measured**, not reasoned: reverting two of them turns four tests red,
and one of the four is that `dbo.AuditLog` stops naming any actor while every request still
succeeds.

| Setting | Reverted, what breaks |
|---|---|
| `MapInboundClaims = false` | `sub` becomes a WS-Federation URI. `FindFirst("sub")` returns null, `ICurrentUser` returns null, **and every audit row's actor columns go null.** Nothing throws |
| `RoleClaimType = "role"` | Every Manager gets `403`. Asserting only the Manager's success looks identical to asserting only the Agent's refusal — so AC-7 asserts both |
| `ValidAlgorithms = [HS256]` | A token whose header says `alg: none` is accepted |
| `ClockSkew = TimeSpan.Zero` | Expired tokens keep working for five minutes, and the expiry test passes or fails depending on when it runs |

**BR-2 was `011`, and it is built.** `004` built the identity BR-2 stands on; `011` built the
rules, in `PUT /api/tickets/{id}/assignee`. Role-only checks go on the endpoint as
`[Authorize(Policy = WaslPolicies.ManagerOnly)]`; data-dependent checks ("is this user the
assignee?") go in the handler off `ICurrentUser.UserId` — and the reason is in BR-6 above, because
`011` measured what happens when you put them in the wrong place.

**`ManagerOnly` still has no production consumer.** `011` deliberately did not use it: BR-2.2 lets
an Agent self-assign, so a role gate on that endpoint would refuse the legitimate case. It is
proven by `004` AC-7 against a test-host endpoint, which is honest and is not the same as proven in
the product. The first endpoint that is genuinely Manager-only should carry it.

**Never fill any remaining gap with a fake actor** — a seeded "system" user, a header, a
constant claim. ADR-005 rejects it by name, and the rule still applies: `004` closed the gap by
building the identity, not by inventing one.

**Both gaps `004` left open were closed by `004b` on 2026-08-29.** What that means for anything
you touch on this path:

- **A denial writes an audit row now**, from `AuthDenialResultHandler` — an
  `IAuthorizationMiddlewareResultHandler`. `Auth.Unauthenticated` on a `401`, `Auth.Forbidden` on
  a `403`, both `Outcome = Denied`, both outside any transaction. **It also envelopes those two
  bodies**, which used to be empty. `002b` still owns the statuses produced by *routing* —
  `404` on an unmatched route, `405`, `415` — a different mechanism.
- **`POST /api/auth/token` is throttled**: ten failed sign-ins in five minutes per **(address,
  email) pair**, answering `429 errors/rate-limited` with `Retry-After` and writing
  `Auth.RateLimited`. Successes are never counted. **The pair is load-bearing and was measured:**
  keying by IP alone locks out an office behind one NAT address (AC-37 goes red, and so does a
  Manager who never failed), and keying by email alone is an account lockout anyone could trigger
  against a named user from anywhere. Do not "simplify" it to one key.
- **The throttle is in memory and per process.** Two instances each count to ten; a restart
  forgets everything. Stated, not hidden — *it slows a script, it does not stop a determined
  attacker.* **There is no lockout, by ruling**, and adding one needs a new decision.
- **`429` is on that one action, not on the API.** A general rate limit is a different feature
  with different numbers.

The secrets have no defaults and the host refuses to start without them. **There are FIVE, and
this line listed three until 2026-08-31** — `011` added the second Agent and `003b` added the
restricted principal, and neither release extended the list, so a fresh clone following this file
sets three and is then refused twice more:

| Key | Added by | Guard |
|---|---|---|
| `Jwt:SigningKey` (32 bytes minimum) | `004` | `AddWaslAuthentication` |
| `Seed:ManagerPassword` | `004` | `SeedOptions.cs:72,80` — presence **and** a minimum of 8 |
| `Seed:AgentPassword` | `004` | same |
| `Seed:AgentTwoPassword` | **`011`** | same |
| `Database:AppPassword` | **`003b`** | `LeastPrivilegeProvisioner.cs:173`, and it fires **after** the migration |

Set them with `dotnet user-secrets -p src/Wasl.Api`. Do not add a fallback value: a random key
per restart invalidates every token silently, and a hard-coded one is a signing key in the
repository. **The five guards and their order were measured, not read** — `003b` `tests.md`,
Controls D1 to D3, and the list was found short because D1 had to be run four times before it
reached the key it was actually testing.


## Definition of Done

Full list: [docs/sdd/09-definition-of-done.md](docs/sdd/09-definition-of-done.md). The
five that get skipped:

- Every AC maps to a named test, and the run output is **recorded** — never asserted
  from memory
- Every state-changing operation writes an audit row, in the same transaction
- Every new i18n key exists in `en` and `ar`; every touched screen viewed in Arabic and
  rendering RTL correctly
- The generated OpenAPI matches `contracts/`
- Every accepted AI output was **run**, not just read

**The ownership test, independent of the list:** can this change be explained and
modified without help? If not, it is not Done, regardless of whether tests pass.

## Decisions already made — do not relitigate

| Decision | Where |
|---|---|
| **Four-project Clean** — `Domain` · `Application` · `Infrastructure` · `Api`, with feature folders inside Application | ADR-002. ADR-010 proposed vertical slices, was evaluated, and was **rejected**: house convention, separation of concerns that is visible without explanation, and the developer is fastest in a familiar structure |
| MediatR stays — it is what makes validation, audit, and the transaction boundary structural rather than remembered | ADR-008, ADR-002 |
| SQL Server, not PostgreSQL | ADR-013 (supersedes ADR-001, resolves Q-3) |
| `ProblemDetails`, not the house `{ IsSuccess, Data, Errors }` envelope | The assessment counts `200`-with-an-error against you |
| **.NET 10** — confirmed by the product owner 2026-08-23, while the house platform targets `net8.0` | `specs/001-solution-skeleton/research.md` R-3 — current LTS, one line to revert. `global.json` pins the SDK band because a preview `10.0.400` is also installed and would otherwise win |
| React, not Angular | ADR-003 (Q-4, Q-12 closed) |
| No global state store | ADR-011 §1 |
| `ICommunicationProvider` + one Mock **is** built | `docs/sdd/08-board.md`, feature `021`. Channels is a named module in the requirement |
| Attachments are **out of scope**, stated explicitly in the affected `spec.md` | `docs/sdd/00-project-context.md` |
| Theming: token architecture in `006`, settings screen deferred | ADR-012, accepted in part |
| **`TransactionBehaviour` and `AuditBehaviour` live in `Wasl.Infrastructure`**, not beside `ValidationBehaviour` | `003` `research.md` R-14, product owner 2026-08-25. Both need a real transaction; `IApplicationDbContext` exposes no EF Core type and `IDbContextTransaction` is one, so putting it there would fail the architecture test. The `IUnitOfWork` wrapper was the alternative and was turned down — the boundary keeps **no exemption** |
| **Each layer registers itself** — `AddApplication()` · `AddInfrastructure(config)` · `AddPresentation()`, three chained calls in `Program.cs`, which names no type from another layer. A layer registering its own implementations is what lets them stay `internal` | 2026-08-26. `TimeProvider` and the `WaslDbContext` health check belong to `AddInfrastructure`, not to the composition root |
| **All three behaviours are registered once, in `Wasl.Api/Common/WaslPipeline.cs`** — the **one exception** to the row above, called last from `Program.cs` | `003` `research.md` R-15. Registration order is execution order and `Program.cs` calls `AddInfrastructure` first, so per-project registration was **observed** producing `Transaction → Audit → Validation` — a `400` then writes an audit row, and nothing throws. Do not move a registration back into `AddApplication` or `AddInfrastructure` |

## Still open — and they are for the evaluator, not for us

| # | Question |
|---|---|
| Q-1 | What does the Productivity criterion measure? The sheet's description is blank |
| Q-2 | The Quality gate is stated as 24/40 while that axis's weights sum to 20 |
| Q-5, Q-6 | Session length; live or recorded demo |
| Q-8 | Who writes and reviews the Arabic copy |
| Q-11 | How far the house design assets may be reused |
| Q-15 | The Arabic typeface — it may never have been chosen |

Asking a specific question raises the Requirement & Specification score. Guessing
silently lowers it. All of them are in
[docs/sdd/11-open-questions.md](docs/sdd/11-open-questions.md) with a working assumption.

<!-- MANUAL ADDITIONS END -->
