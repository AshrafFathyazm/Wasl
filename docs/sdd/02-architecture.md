# Architecture

## Stack

### Backend

| Concern             | Choice                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Framework           | ASP.NET Core Web API (.NET 10)                                                                |
| Language            | C#                                                                                            |
| API style           | Controllers, thin — bind, authorise, dispatch, map the result to a status code                 |
| Architecture        | Four-project Clean Architecture, with feature folders inside the Application layer              |
| Request handling    | MediatR for commands and queries                                                              |
| Data access         | Entity Framework Core through `IApplicationDbContext`. No repository abstraction                |
| Database            | SQL Server 2022 — see `decisions/ADR-013-database-sql-server.md`                               |
| Validation          | FluentValidation through a MediatR pipeline behaviour; domain invariants remain in the domain   |
| Unit testing        | xUnit + FluentAssertions                                                                      |
| Faking              | Moq, only where a collaborator must be faked                                                   |
| Integration testing | `WebApplicationFactory` + Testcontainers (SQL Server)                                          |
| Localization        | `IStringLocalizer` over `.resx`, with `RequestLocalizationMiddleware`                          |

### Frontend

| Concern      | Choice                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| Framework    | React + TypeScript — see `decisions/ADR-003-frontend-stack.md`                                            |
| Server state | TanStack Query                                                                                            |
| Forms        | React Hook Form + Zod schema validation                                                                   |
| Structure    | Feature-based folders                                                                                     |
| Styling      | Design tokens extracted from the existing design system — see `decisions/ADR-009-design-system-source.md` |
| Testing      | Vitest + React Testing Library for critical forms                                                         |
| Localization | `react-i18next` with JSON catalogues per locale                                                           |
| Direction    | `dir` on the document root, CSS logical properties throughout                                             |

## Architectural approach

**Four projects, layered — and feature folders inside the Application layer, so a story's
diff lands in one place.**

The layering is what `decisions/ADR-002-architecture-style.md` chose and what
`decisions/ADR-010-vertical-slices.md` challenged and failed to unseat. Read ADR-010 for
the evaluation. The short version: it is the house convention, the assessment rewards
separation of concerns that is *visible* without explanation, and the developer builds
fastest in a familiar structure under a deadline.

Two refinements came out of that evaluation and both are adopted:

- **Feature folders inside `Wasl.Application`.** Grouping by use case, not by technical
  type. `Features/Tickets/ChangeStatus/` rather than `Commands/`, `Handlers/`, and
  `Validators/` directories that a story's diff has to be reassembled from.
- **No `IRepository<T>`.** `IApplicationDbContext` instead — declared in the Application
  layer, implemented by Infrastructure. `DbSet<T>` is already a repository; the interface
  exists to keep EF Core out of the Application layer, not to re-implement what EF Core
  provides.

CQRS is used pragmatically:

* Commands change state.
* Queries read and project data.
* Both live in the feature folder for their use case.
* CQRS does not introduce separate databases, read models, or deployments.

The deployment decision is unchanged: one deployable application, one database, no
microservices, no message broker.

## Solution structure

```text
src/

  Wasl.Domain/                          no EF Core, no HTTP, no MediatR
    Customers/
      Customer.cs
      EmailAddress.cs
      PhoneNumber.cs
    Tickets/
      Ticket.cs
      TicketStatus.cs
      TicketPriority.cs
      TicketStatusTransitions.cs
      EscalationPolicy.cs
    Communications/
      Interaction.cs
      CommunicationChannel.cs
    Audit/
      AuditEntry.cs
    Common/
      Exceptions/                       domain exceptions for invariant violations

  Wasl.Application/                     depends only on Wasl.Domain
    Features/
      Customers/
        CreateCustomer/
          CreateCustomerCommand.cs
          CreateCustomerHandler.cs
          CreateCustomerValidator.cs
          CustomerDto.cs
        GetCustomer/
        UpdateCustomer/
        GetCustomerOverview/
      Tickets/
        CreateTicket/
        ChangeStatus/
        AssignTicket/
        EscalateTicket/
        ListTickets/
        Timeline/
        AddComment/
      Me/
        SetLanguage/
    Common/
      Abstractions/
        IApplicationDbContext.cs
        ICurrentUser.cs
        ITicketNumberGenerator.cs
      Behaviours/
        ValidationBehaviour.cs
        TransactionBehaviour.cs
        AuditBehaviour.cs
      Exceptions/
      PagedResult.cs
    Resources/                          .resx for server-authored messages

  Wasl.Infrastructure/                  implements what Application declares
    Persistence/
      WaslDbContext.cs                  implements IApplicationDbContext
      Configurations/
      Migrations/
      SequenceTicketNumberGenerator.cs
    Queries/
      TicketTimelineQuery.cs            the union — US-010
      DashboardAggregatesQuery.cs       the six aggregates — US-016
    Auth/
      JwtTokenService.cs
      CurrentUser.cs
    Communications/
      MockCommunicationProvider.cs

  Wasl.Api/                             composes everything at startup
    Controllers/
      CustomersController.cs
      TicketsController.cs
      MeController.cs
      AuthController.cs
      AuditController.cs
    Middleware/
      ExceptionHandlingMiddleware.cs
    Localization/
      ClaimsRequestCultureProvider.cs
    Program.cs

  wasl-web/                             React + TypeScript client

tests/

  Wasl.Domain.Tests/                    pure unit tests — no database, no HTTP
  Wasl.Application.Tests/               use case tests with faked infrastructure
  Wasl.Api.IntegrationTests/            real HTTP + real SQL Server via Testcontainers
```

The exact list of features evolves with the user stories. The rule that does not change: a
use case is organised around its behaviour within the Application layer, rather than
scattered across technical-type directories.

## Feature folder structure

A command feature:

```text
Features/
  Tickets/
    ChangeStatus/
      ChangeTicketStatusCommand.cs
      ChangeTicketStatusHandler.cs
      ChangeTicketStatusValidator.cs
      TicketStatusDto.cs
```

A query feature follows the same principle:

```text
Features/
  Tickets/
    ListTickets/
      ListTicketsQuery.cs
      ListTicketsHandler.cs
      TicketListItemDto.cs
      TicketFilterSpecification.cs
```

Not every feature needs every file — a simple query needs no validator.

A feature-specific specification or policy class lives with the feature that uses it.
`TicketFilterSpecification` (US-006) and `TicketAssignmentPolicy` (US-007) are
Application-layer types belonging to their feature, not shared services and not domain
types: they encode how a use case reads or decides, while the rules that must hold for
every caller stay in `Wasl.Domain`.

## Dependency direction

```text
Wasl.Api ──────────────┐
                       ├──> Wasl.Application ──> Wasl.Domain
Wasl.Infrastructure ───┘
```

| Project | Depends on | Never depends on |
|---|---|---|
| `Wasl.Domain` | nothing | anything |
| `Wasl.Application` | `Wasl.Domain` | EF Core, ASP.NET Core, HTTP types, `DbContext` |
| `Wasl.Infrastructure` | `Wasl.Application`, `Wasl.Domain` | `Wasl.Api` |
| `Wasl.Api` | all three, for composition only | — |

`Wasl.Application` declares the interfaces it needs — `IApplicationDbContext`,
`ICurrentUser`, `ITicketNumberGenerator` — and `Wasl.Infrastructure` implements them.

That inversion is the point of the layering: the Application layer is testable without a
database because it never names one.

`Wasl.Api` composes the graph at startup and owns nothing but the HTTP boundary.

## Layer responsibilities

### Domain

Entities, value objects, enums, and the rules that must hold regardless of who calls them:
the ticket state machine, escalation preconditions, contact-detail invariants. No EF Core
attributes, no HTTP types, no MediatR.

The domain is deliberately thin. It is not a container for speculative abstractions,
generic services, repositories, or infrastructure concerns.

### Application

One folder per use case. A handler validates its input, loads what it needs through
`IApplicationDbContext`, calls into the domain, persists, and returns a DTO.

For example, `ChangeStatus`:

1. Receive and validate the request.
2. Load the ticket.
3. Apply the domain state-transition rule.
4. Persist the change and its history row.
5. Produce the response.

Whether a transition is permitted is a **domain** decision. Orchestrating the use case is
an **Application** one.

Authorisation decisions that depend on data — "is this user the assignee?" — live here,
because this is the only layer with the data. Role-only checks live at the API boundary as
policies.

DTOs are never domain entities.

### Infrastructure

The `WaslDbContext` implementation of `IApplicationDbContext`, entity configurations,
migrations, the ticket-number generator over a database sequence, the JWT token service,
the `ICurrentUser` implementation, the mock communication provider, and the two named
query classes.

This is the only layer that knows the database exists.

### API

Controllers are thin: bind, authorise, dispatch through MediatR, map the result to a
status code. Exception-to-`ProblemDetails` translation lives in one middleware. OpenAPI
metadata is declared here.

Business rules never live in a controller.

### Frontend

Presentation and interaction only. It mirrors backend rules to improve the experience —
disabling a status button the state machine would reject — but it is never the authority.
Every rule it mirrors is also enforced server-side, and the API returns
`allowedTransitions` rather than the client deriving them.

It owns every string it authors: labels, buttons, headings, empty states, and the display
names of enum values. It does not own server-authored messages, which arrive already
translated. See `decisions/ADR-007-localization.md`.

## Persistence

### `IApplicationDbContext`, not a repository

```text
Wasl.Application/Common/Abstractions/IApplicationDbContext.cs      declared
Wasl.Infrastructure/Persistence/WaslDbContext.cs                   implements
```

The interface exposes `DbSet<T>` properties and `SaveChangesAsync`. One interface for the
whole application, not one per aggregate.

**Why not `IRepository<T>`:**

| | `IRepository<T>` per aggregate | `IApplicationDbContext` |
|---|---|---|
| Interfaces to maintain | One per aggregate, growing | One, total |
| Application depends on EF Core? | No | No |
| Testable without a database? | Yes | Yes |
| Duplicates what `DbSet<T>` already does | Yes | No |
| Query expressiveness | Whatever methods were added in advance | Full LINQ at the call site, where the query's intent is |

The last row decides it. A repository method list is a guess at which queries will be
needed, and the guess is always slightly wrong, so the interface grows a method per
surprise. `DbSet<T>` is already a queryable repository; wrapping it produces an
abstraction over an abstraction.

Handlers therefore query `IApplicationDbContext` directly. Configurations and migrations
stay in Infrastructure, where the database is allowed to be known about.

### Two named query classes

Exactly two queries are complex enough to name and test on their own, and they live in
`Wasl.Infrastructure/Queries/`:

| Query | Why it earns a class |
|---|---|
| `TicketTimelineQuery` (US-010) | Comments and history are two tables with different shapes, ordered together and paginated across the boundary |
| `DashboardAggregatesQuery` (US-016) | Six aggregates that must not become six round trips |

These are **query objects, not repositories**: one caller each, no interface, no second
implementation in prospect. A repository is something you programme against; a query
object is a name for a complicated piece of SQL.

A third one requires a written reason, because "this query is a bit long" is how a query
folder turns into a repository layer.

## MediatR and pipeline behaviours

MediatR dispatches commands and queries. Its architectural value here is not indirection
at fifteen endpoints — it is that three cross-cutting concerns apply to every command
**without anyone remembering to apply them**.

```text
HTTP Request
    ↓
Controller
    ↓
MediatR
    ↓
ValidationBehaviour
    ↓
TransactionBehaviour            commands only
    ↓
AuditBehaviour                  IAuditableCommand only
    ↓
Feature Handler
    ↓
Domain + IApplicationDbContext
```

If those three requirements did not exist, neither would MediatR here.

## Transactions

`TransactionBehaviour` opens one transaction per state-changing request. Not per handler.

That makes "the audit row is in the same transaction as the change" a property of the
pipeline rather than something each handler must not forget. Queries do not open write
transactions.

## Audit and history

Two distinct things, and `decisions/ADR-008-audit-log.md` explains why they are not
merged:

- **`TicketHistory`** is a product feature — the ticket timeline. Typed columns, foreign
  keys, cascades with its ticket.
- **`AuditLog`** is a forensic record. No foreign keys, actor email and role snapshotted
  onto the row, and **append-only by database permission** as of `003b` (2026-08-30) — it
  used to say *"never deleted by application code"*, which described a convention rather
  than a guarantee.

### The two connection strings — `003b`

The application runs as `wasl_app`, a principal with `SELECT` and `INSERT` on `dbo.AuditLog`
and an explicit `DENY` on `UPDATE` and `DELETE`. A second string, `WaslMigrator`, carries the
DDL rights that `--provision`, `--seed` and the integration fixture need.

**The migrator has no presence in the request path.** `AddInfrastructure` reads only
`ConnectionStrings:Wasl`, nothing registers the migrator in the container, and there is no
fallback from one to the other — a denied permission must never be retried with a privileged
principal, because that turns a permissions defect into privilege escalation while reading as
resilience. The host refuses to start if the two strings hold the same value.

**This restricts the application, not the database administrator.** SQL Server does not apply
permission checks to `sysadmin` at all, so a `DENY` protects nothing against a DBA on SSMS. That
was measured, not assumed: with the `DENY` correctly in place and the application connected as
`sa`, the audit log was exactly as mutable as before. A stronger claim needs cryptographic
integrity or ledger tables, and that decision has not been made.

A command requiring an audit row implements `IAuditableCommand`, declaring its action
name. `AuditBehaviour` writes the row inside the same transaction as the change, so it is
absent when that transaction rolls back. Denied and failed actions have no business
transaction to join and are written independently — that asymmetry is BR-9.4 and it is
tested.

An architecture test fails the build if any `ICommand` does not implement
`IAuditableCommand` (NFR-10). The rule targets types, not projects, so the layout does not
affect it.

Domain entities remain responsible for domain behaviour. The Application layer and the
pipeline are responsible for the required record being persisted as part of the request.

## Validation

Two levels, and neither replaces the other.

### Request validation

FluentValidation, applied at the Application boundary through `ValidationBehaviour`:
required fields, maximum lengths, request format, ranges, and values a specific use case
needs.

### Domain invariants

Rules that must hold regardless of the caller belong in `Wasl.Domain`: forbidden state
transitions, invalid contact details, escalation preconditions that must not be bypassed.

The same entity may be called by another feature, a background process, or a future
integration. A rule enforced only in a validator is a rule that holds only for HTTP.

## Error handling

Domain and application exceptions represent invariant and business violations.
Exception-to-HTTP translation is centralised in one middleware in `Wasl.Api`, which maps
known exceptions to the `ProblemDetails` contract in `05-api-conventions.md`.

Unexpected exceptions return a trace id and nothing else. `detail` never carries a stack
trace, SQL, an exception type name, or a connection string.

One error-handling approach, everywhere. `Result<T>` is the better pattern in a larger
system, and mixing both is worse than either.

## Time

`TimeProvider`, injected. Nothing calls `DateTime.UtcNow` inline where the value affects
behaviour, so time can be controlled in a test.

## Current user

`ICurrentUser` is declared in `Wasl.Application/Common/Abstractions` and implemented in
`Wasl.Infrastructure/Auth`, resolved from JWT claims. Features depend on the abstraction
rather than reading HTTP claims throughout the application.

## Localization

`RequestLocalizationMiddleware` is registered in `Wasl.Api` **after**
`UseAuthentication()`. Registered before it, the custom culture provider cannot see the
user and silently returns nothing — `decisions/ADR-007-localization.md` calls this the
single most likely defect in this build.

Server-authored resources live in `Wasl.Application/Resources`, next to the code that
raises the messages. The client owns the strings it authors. Machine-readable values —
`ProblemDetails.type`, the keys of `errors`, enum values, `TicketNumber`, `traceId` — are
never translated.

## Cross-cutting concerns

| Concern | Where it lives |
|---|---|
| Validation | `ValidationBehaviour` in `Wasl.Application/Common/Behaviours`; invariants in `Wasl.Domain` |
| Error translation | Single exception-handling middleware in `Wasl.Api` |
| Audit | `AuditBehaviour`, writing in the same transaction as the change |
| History | The domain raises the change; the handler writes `TicketHistory` in the same transaction |
| Transactions | `TransactionBehaviour`, one per state-changing request |
| Time | `TimeProvider`, injected |
| Current user | `ICurrentUser`, declared in Application, implemented in Infrastructure |
| Authorisation | Endpoint policies for role-only checks; handler-level checks where the decision needs data |
| Persistence | `IApplicationDbContext` declared in Application; `WaslDbContext`, configurations, and migrations in `Wasl.Infrastructure/Persistence` |
| Localization | `RequestLocalizationMiddleware` in `Wasl.Api`, after authentication; resources in `Wasl.Application/Resources` |

## Testing strategy

### `Wasl.Domain.Tests`

Pure unit tests: value objects, entity invariants, the full ticket transition matrix,
escalation rules. No database, no HTTP.

Tools: xUnit, FluentAssertions, and Moq only where a collaborator genuinely has to be
faked.

### `Wasl.Application.Tests`

Use case tests with faked infrastructure. `IApplicationDbContext` is the seam that makes
these possible without a database, which is the practical return on declaring it.

### `Wasl.Api.IntegrationTests`

Real HTTP through `WebApplicationFactory`, real SQL Server through Testcontainers, the
real EF Core configuration, and authentication set up as the test needs.

Never EF `InMemory`: it enforces no unique constraints, no foreign keys, and no
concurrency tokens, which are exactly what these tests exist to verify.

Covers routing, validation, authorisation, persistence, transactions, error translation,
and the business behaviour of the endpoint.

## Architectural rules

1. `Wasl.Domain` has no dependency on ASP.NET Core, EF Core, HTTP, or MediatR.
2. `Wasl.Application` has no dependency on EF Core or ASP.NET Core. It declares the
   interfaces it needs; `Wasl.Infrastructure` implements them.
3. `Wasl.Infrastructure` never depends on `Wasl.Api`.
4. A use case is organised as a feature folder inside `Wasl.Application`, not as
   `Commands/` and `Handlers/` directories.
5. Commands change state; queries read and project it.
6. CQRS is organisational. It does not imply separate databases or deployments.
7. EF Core is reached through `IApplicationDbContext`. No generic repository.
8. A named query class exists only where a query is complex enough to name and test. A
   third one needs a written reason.
9. Validation, transactions, and auditing are applied structurally through the pipeline.
10. Domain invariants are enforced independently of request validation.
11. Every state-changing operation requiring an audit record has that record in the same
    transaction as the change.
12. Authorisation decisions requiring data live in the handler; role-only checks live at
    the boundary.
13. Controllers bind, authorise, dispatch, and map. They contain no business rules.

## Why this structure

The layering provides the boundaries that matter: the domain does not know about EF Core,
and the API does not know about the database. Those are what SOLID and DDD are asking for.
Process boundaries are a deployment concern, not a design one.

Four projects do mean that adding one endpoint touches four of them. That cost is real and
it is accepted for the reasons in `decisions/ADR-010-vertical-slices.md`: the shape is
what a reviewer expects, it is what the developer is fastest in, and the assessment
rewards separation of concerns a reader can see without being walked through it. The
feature folders inside `Wasl.Application` are what stop that cost also meaning four
*unrelated* folders.

The domain project stays isolated because this system genuinely has business logic
spanning multiple use cases — ticket state transitions, escalation rules, customer contact
invariants, shared value objects — and those rules must be testable without a database.

If the system grew, with stronger module boundaries, multiple teams, or substantial
independent infrastructure concerns, the layer boundaries are where it would be cut.
Keeping them clean now is what makes that possible later.
