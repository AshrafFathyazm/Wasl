# ADR-010 — Vertical slices over a thin domain core

**Status:** **Accepted** (2026-08-23, by the product owner) · **Amends:** ADR-002 · **Related:** ADR-011

## Context

ADR-002 chose a modular monolith with four projects — `Domain`, `Application`,
`Infrastructure`, `Api`. That is the default Clean Architecture layout and it is what
the house platform uses.

Having now specified the whole system, the shape of it is clear: five entities, about
fifteen endpoints, two roles, one database, one developer, one week. It is worth asking
whether four projects is the right answer for *this*, or the right answer in general
applied without checking.

## The honest problem with four projects here

Layering protects against coupling **between features**. This system has almost none:
customers barely know about tickets, and nothing else crosses.

What four projects actually costs, at this size:

- **Adding one endpoint touches four projects.** Command in Application, config in
  Infrastructure, endpoint in Api, entity in Domain. Four files in four places for one
  slice of behaviour.
- **`IRepository` over EF Core is an abstraction over an abstraction.** `DbSet<T>` is
  already a repository. Wrapping it produces an interface with exactly one
  implementation and no second one in prospect — the same test ADR-009 applied to a
  provider abstraction and rejected.
- **The diff for a story scatters.** An SDD process organised story-by-story wants the
  diff for a story to land in one place. Layering guarantees it will not.

## Decision

**Two projects: a thin domain core, and vertical feature slices.**

```text
src/
  Wasl.Domain/                    no dependencies, no EF, no HTTP
    Tickets/       Ticket, TicketStatus, TicketStatusTransitions, invariants
    Customers/     Customer, EmailAddress, PhoneNumber
    Audit/         AuditEntry
  Wasl.Api/
    Features/
      Tickets/
        CreateTicket/             endpoint + handler + validator + DTOs + query
        ChangeStatus/
        AssignTicket/
        ListTickets/
        Timeline/
      Customers/
        CreateCustomer/
        GetCustomer/
      Me/SetLanguage/
    Common/
      Persistence/                DbContext, configurations, migrations
      Auth/  Errors/  Localization/  Audit/   pipeline behaviours
    Program.cs
tests/
  Wasl.Domain.Tests/
  Wasl.Api.IntegrationTests/
```

A slice owns everything it needs and is deleted in one go. The domain owns only what is
genuinely shared: the state machine, the escalation floor, the contact invariant, the
value objects. Those are real domain logic and they do span slices.

## What this keeps and what it drops

| Keeps | Drops |
|---|---|
| Domain isolated, unit-testable with no database — the thing layering actually buys | The Application / Infrastructure split |
| One place for every business rule | `IRepository` and its single implementation |
| Clear dependency direction: slices → domain, never back | Four-project navigation for one endpoint |

## Supporting decisions

**MediatR: keep, for one specific reason.** At fifteen endpoints it does not pay for
itself as an indirection. It pays because three cross-cutting concerns must apply to
every command without being remembered: validation, the audit row (BR-9.1), and the
transaction boundary that makes BR-9.3 structural. Pipeline behaviours are the right
mechanism for exactly that. If those three requirements did not exist, neither would
MediatR here.

**Minimal APIs, not controllers.** Controllers group by entity, which fights slice
organisation — `TicketsController` would collect six unrelated slices. An endpoint per
slice file keeps the slice whole.

**No repository. Named query objects where a query is non-trivial.** The timeline union
(US-010) and the duplicate check (US-001) get their own classes because they are complex
enough to name and test. That is a query object, not a repository — it has one caller
and no interface.

**One transaction per request, opened by a behaviour.** Not per handler. It makes "the
audit row is in the same transaction as the change" a property of the pipeline rather
than something each handler must not forget.

**Exceptions for everything, mapped once.** Domain exceptions for invariant violations,
mapped to `ProblemDetails` in the single middleware. `Result<T>` is the better pattern
in a larger system, but mixing both is worse than either, and the error contract is
already centralised.

## The risk, and the rule for resolving it

**If the house convention is four-project Clean Architecture, matching the convention
may beat being right.**

A reviewer reading against an expected shape will read divergence as unfamiliarity
before they read it as judgement. That is a real cost and it is not irrational of them.

The rule: **diverge only if you can state the trade in one sentence and mean it.**

> "I used vertical slices because this system has almost no coupling between features,
> and I wanted the diff for each story to land in one folder. The domain core keeps the
> state machine and the invariants isolated and testable, which is what the layering
> was protecting anyway. At ten times the size I would split it."

If that sentence cannot be delivered with conviction, use four projects. A conventional
structure understood beats an optimal one defended weakly.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Four-project Clean (ADR-002) | Correct at scale, ceremony at this scale. Still the safer answer if the house convention is strict |
| Single project, folders only | Nothing stops a controller importing `DbContext`; the domain stops being independently testable |
| Vertical slices with no domain project | The state machine and invariants genuinely span slices. Duplicating them is how they diverge |
| Modular monolith with a project per module | Right at three or four real modules. Here it would be two, and one of them is tiny |

## Consequences

- ADR-002's reasoning about *deployment* still stands: one deployable, one database, no
  microservices. This changes the internal layout only.
- Story artifacts naming `src/Wasl.Application/...` paths need updating to the slice
  layout if this is accepted.
- The architecture test enforcing `IAuditableCommand` (NFR-10) still works — it targets
  types, not projects.
