# Architecture

## Stack

### Backend

| Concern             | Choice                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Framework           | ASP.NET Core Web API (.NET 10)                                                               |
| Language            | C#                                                                                          |
| API style           | Minimal APIs, colocated with vertical feature slices                                        |
| Request handling    | MediatR for commands and queries                                                            |
| Architecture        | Vertical slices with a thin domain core                                                     |
| Data access         | Entity Framework Core                                                                       |
| Database            | SQL Server 2022 — see `decisions/ADR-013-database-sql-server.md`                          |
| Validation          | FluentValidation through MediatR pipeline behaviors; domain invariants remain in the domain |
| Unit testing        | xUnit + FluentAssertions                                                                    |
| Faking              | Moq, only where a collaborator must be faked                                         |
| Integration testing | `WebApplicationFactory` + Testcontainers (SQL Server)                                       |
| Localization        | `IStringLocalizer` over `.resx`, with `RequestLocalizationMiddleware`                       |

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

The system uses **vertical slices for application behavior** and a **thin domain core for business rules that genuinely span use cases**.

A feature owns everything required to execute its use case: its HTTP endpoint, command or query, handler, validation, request and response models, and any feature-specific query logic.

The domain remains independent and contains only business concepts and rules that must not depend on HTTP, EF Core, or ASP.NET.

CQRS is used pragmatically:

* Commands change state.
* Queries read and project data.
* Commands and queries live inside their feature slices.
* CQRS does not introduce separate databases, read models, deployments, or a top-level `Commands` / `Queries` project structure.

MediatR is retained primarily to apply cross-cutting concerns consistently through pipeline behaviors, including validation, auditing, and transaction handling.

This approach is defined by `decisions/ADR-010-vertical-slices.md`, which amends the internal layout decision in ADR-002. The deployment decision remains unchanged: one deployable application and one database.

## Solution structure

```text
src/

  Wasl.Domain/
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

  Wasl.Api/

    Features/

      Customers/

        CreateCustomer/
          Endpoint.cs
          Command.cs
          Handler.cs
          Validator.cs
          Response.cs

        GetCustomer/
          Endpoint.cs
          Query.cs
          Handler.cs
          Response.cs

        UpdateCustomer/
        AddNote/
        GetInteractionHistory/

      Tickets/

        CreateTicket/
          Endpoint.cs
          Command.cs
          Handler.cs
          Validator.cs
          Response.cs

        GetTicket/
        ChangeStatus/
        AssignTicket/
        EscalateTicket/
        ListTickets/
        Timeline/

      Communications/

        SendMessage/
        ReceiveMessage/

    Common/

      Persistence/
        WaslDbContext.cs
        Configurations/
        Migrations/

      Behaviors/
        ValidationBehavior.cs
        TransactionBehavior.cs
        AuditBehavior.cs

      Auth/
      Errors/
      Localization/

    Program.cs

  wasl-web/
    React + TypeScript client

tests/

  Wasl.Domain.Tests/
    Pure domain unit tests

  Wasl.Api.IntegrationTests/
    Real HTTP + real SQL Server via Testcontainers
```

The exact list of slices evolves with the user stories. The important rule is that a use case is organized around its behavior rather than distributed across technical layers.

## Feature slice structure

A typical command slice has the following shape:

```text
Features/
  Tickets/
    ChangeStatus/
      Endpoint.cs
      Command.cs
      Handler.cs
      Validator.cs
      Response.cs
```

A query slice follows the same principle:

```text
Features/
  Tickets/
    Timeline/
      Endpoint.cs
      Query.cs
      Handler.cs
      Response.cs
      TicketTimelineQuery.cs
```

Not every slice must contain every file. A simple query does not need a validator or a separate query object unless the complexity justifies it.

A complex query may have a named query object when naming and isolating the query improves clarity and testability. This is not a generic repository abstraction and does not require an interface when there is only one implementation.

## Dependency direction

```text
Wasl.Api ───────────────> Wasl.Domain
```

`Wasl.Domain` depends on nothing.

`Wasl.Api` contains:

* Vertical feature slices.
* The HTTP boundary.
* EF Core persistence concerns.
* Authentication and authorization infrastructure.
* Error handling.
* Localization infrastructure.
* MediatR pipeline behaviors.
* Application composition at startup.

Feature slices may depend on the domain.

The domain must never depend on:

* `Wasl.Api`
* ASP.NET Core
* HTTP types
* EF Core
* `DbContext`
* database-specific infrastructure

The architectural boundary is therefore enforced where it provides the most value for this system: around the business domain.

## Domain responsibilities

`Wasl.Domain` contains the business rules and concepts that must remain true regardless of which feature invokes them.

Examples include:

* Customer contact-detail invariants.
* `EmailAddress` and `PhoneNumber` value objects.
* Ticket state transitions.
* Valid and invalid status changes.
* Escalation preconditions and rules.
* Domain-level entities and enums.
* Other invariants genuinely shared by multiple use cases.

The domain does not contain EF Core attributes or HTTP types.

The domain is intentionally thin. It should not become a container for speculative abstractions, generic services, repositories, or infrastructure concerns.

## Feature responsibilities

Each feature slice represents one use case.

A slice may contain:

* Minimal API endpoint.
* Command or query.
* MediatR handler.
* FluentValidation validator.
* Request and response DTOs.
* Feature-specific authorization checks.
* Feature-specific query objects.
* Mapping logic.
* Calls into domain behavior.
* Persistence through `WaslDbContext`.

For example, `ChangeStatus` is responsible for the orchestration of changing a ticket's status:

1. Receive and validate the request.
2. Load the ticket.
3. Apply the domain state-transition rule.
4. Persist the change.
5. Produce the response.

The rule determining whether a transition is valid belongs in the domain. The orchestration of the use case belongs in the feature slice.

Authorization decisions that depend on application data, such as whether the current user is the ticket assignee, belong in the relevant feature. Role-only checks may be applied at the endpoint through authorization policies.

## Persistence

EF Core persistence lives in:

```text
Wasl.Api/Common/Persistence/
```

This includes:

* `WaslDbContext`.
* Entity configurations.
* Database migrations.
* EF Core persistence configuration.

Handlers use `WaslDbContext` directly where appropriate.

No generic repository abstraction is introduced over EF Core.

`DbContext` and `DbSet<T>` already provide the primary persistence abstraction required by this system. A repository should only be introduced when it represents a meaningful domain abstraction or when multiple implementations are genuinely required.

Complex read operations may use named query objects, for example:

```text
Features/
  Tickets/
    Timeline/
      TicketTimelineQuery.cs
```

A query object exists to give complex query logic a meaningful name and isolated responsibility. It does not require an interface when there is only one implementation and no alternate implementation is expected.

## API responsibilities

The API uses Minimal APIs rather than controllers.

Each endpoint is colocated with the feature it serves.

An endpoint is responsible for:

1. Binding the HTTP request.
2. Applying endpoint-level authorization.
3. Dispatching the command or query.
4. Returning the appropriate HTTP response.

Business rules do not live in endpoints.

A feature should be understandable by opening its folder without navigating through separate `Application`, `Infrastructure`, and `Api` projects.

## MediatR and pipeline behaviors

MediatR is used as the request dispatch mechanism for commands and queries.

Its primary architectural value in this system is the ability to apply required cross-cutting behavior consistently.

The pipeline is conceptually:

```text
HTTP Request
    ↓
Minimal API Endpoint
    ↓
MediatR
    ↓
Validation Behavior
    ↓
Transaction Behavior for commands
    ↓
Audit Behavior where applicable
    ↓
Feature Handler
    ↓
Domain + EF Core
```

Pipeline behaviors are used so that required concerns are structural rather than dependent on every handler remembering to implement them.

## Transactions

Commands that modify state execute within a transaction managed by the request pipeline.

The transaction boundary is not individually recreated by every handler.

This ensures that related changes, including required audit or history records, participate in the same transaction.

Queries do not open write transactions.

## Audit and history

Audit and history requirements are applied consistently to the commands that require them.

The audit record must participate in the same transaction as the business change.

The implementation may use a MediatR pipeline behavior where the applicable command types can be identified structurally.

For example, commands requiring auditing may implement a marker interface such as:

```text
IAuditableCommand
```

The architecture rule targets the command type and behavior rather than depending on a particular project layout.

Domain entities remain responsible for domain behavior. The feature and pipeline infrastructure are responsible for ensuring the required audit record is persisted as part of the request.

## Validation

Validation has two levels.

### Request validation

FluentValidation validates incoming command data at the feature boundary through a MediatR pipeline behavior.

Examples include:

* Required fields.
* Maximum lengths.
* Request format.
* Input ranges.
* Values required for a specific use case.

### Domain invariants

Rules that must always hold regardless of the caller belong in the domain.

Examples include:

* Invalid ticket state transitions.
* Invalid contact details.
* Escalation rules that must not be bypassed.

Request validation does not replace domain invariants.

The same domain entity may be called by another feature, background process, or future integration. Domain rules must therefore remain enforced independently of the HTTP request.

## Error handling

Invariant and business violations are represented through explicit application or domain exceptions as appropriate.

Exception-to-HTTP translation is centralized in a single exception-handling middleware.

The middleware maps known exceptions to the system's `ProblemDetails` contract.

Unexpected exceptions are handled separately and must not expose implementation details to clients.

The system uses one consistent error-handling approach rather than mixing multiple response patterns within feature handlers.

## Time

Time-dependent behavior uses `TimeProvider`.

Handlers and domain-adjacent services must not call:

```text
DateTime.UtcNow
```

inline when the value affects business behavior.

Using `TimeProvider` allows time to be controlled during tests.

## Current user

Current user information is exposed through an `ICurrentUser` abstraction resolved from JWT claims.

Features depend on the abstraction rather than reading HTTP claims directly throughout the application.

This keeps current-user access consistent while avoiding a repository-like abstraction where none is needed.

## Localization

`RequestLocalizationMiddleware` is configured in `Wasl.Api` after authentication.

Resources are colocated with the code that owns the message where practical.

The frontend owns strings it authors, including:

* Labels.
* Buttons.
* Headings.
* Empty states.
* Display names.

The frontend may mirror server-side rules to improve the user experience, for example by disabling a status action that would be rejected.

The frontend is never the authority for business rules.

Every rule mirrored by the frontend must also be enforced server-side.

Server-authored messages follow the ownership rules defined in `decisions/ADR-007-localization.md`.

## Cross-cutting concerns

| Concern           | Where it lives                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| Validation        | FluentValidation through a MediatR pipeline behavior; invariants remain in `Wasl.Domain`               |
| Error translation | Single exception-handling middleware in `Wasl.Api`                                                     |
| Audit / history   | Audit behavior and feature/domain changes participate in the same transaction                         |
| Transactions      | Transaction pipeline behavior for state-changing commands                                             |
| Time              | `TimeProvider` injected where time affects behavior                                                   |
| Current user      | `ICurrentUser` abstraction resolved from JWT claims                                                   |
| Authorization     | Endpoint policies for role-only checks; feature-level checks for decisions requiring application data |
| Persistence       | EF Core `WaslDbContext`, configurations, and migrations in `Wasl.Api/Common/Persistence`                |
| Localization      | `RequestLocalizationMiddleware` in `Wasl.Api`; resources colocated with the code that owns the message |

## Testing strategy

### Domain tests

`Wasl.Domain.Tests` contains pure unit tests for:

* Value objects.
* Entity invariants.
* Ticket state transitions.
* Escalation rules.
* Other domain behavior independent of HTTP and the database.

These tests use:

* xUnit.
* FluentAssertions.
* Moq only where a real collaborator must be faked.

### Integration tests

`Wasl.Api.IntegrationTests` verifies feature behavior through the real HTTP pipeline.

Tests use:

* `WebApplicationFactory`.
* SQL Server through Testcontainers.
* The real EF Core configuration.
* Authentication setup appropriate to the test environment.

Integration tests verify the complete behavior of important slices, including:

* Routing.
* Validation.
* Authorization.
* Database persistence.
* Transactions.
* Error translation.
* Feature-specific business behavior.

The primary testing boundary for a use case is therefore the feature itself, while pure business rules remain independently unit-testable in `Wasl.Domain.Tests`.

## Architectural rules

The following rules define the intended boundaries:

1. `Wasl.Domain` has no dependency on ASP.NET Core, EF Core, HTTP, or database infrastructure.
2. Features may depend on `Wasl.Domain`; the domain never depends on features.
3. A use case is organized as a vertical slice rather than being distributed across technical-layer projects.
4. Commands change state; queries read and project state.
5. CQRS is an organizational pattern and does not require separate databases or deployments.
6. EF Core is used directly through `WaslDbContext`; generic repositories are not introduced without a concrete need.
7. Complex queries may use named query objects when naming and isolating the query improves clarity.
8. Validation, transactions, and auditing are applied structurally through the request pipeline where applicable.
9. Domain invariants remain enforced independently of request validation.
10. Every state-changing operation requiring an audit record must ensure that record participates in the same transaction as the change.
11. Feature-specific authorization decisions remain close to the feature that requires them.
12. A feature should be understandable and changeable primarily from its own folder.

## Why this structure

The system has a limited number of entities and use cases, with relatively low coupling between features.

A four-project `Domain` / `Application` / `Infrastructure` / `Api` structure would distribute a single user story across multiple projects even when the behavior itself is small and self-contained.

Vertical slices keep the implementation of a use case together.

The domain project remains isolated because the system does have business logic that genuinely spans multiple use cases, particularly around:

* Ticket state transitions.
* Escalation rules.
* Customer contact invariants.
* Shared value objects.

This structure keeps those rules independent and testable without introducing additional application and infrastructure projects solely for structural symmetry.

If the system grows significantly, with stronger module boundaries, multiple teams, or substantial independent infrastructure concerns, the structure can be split further. The current architecture intentionally optimizes for the present system while preserving a clear path for future extraction.
