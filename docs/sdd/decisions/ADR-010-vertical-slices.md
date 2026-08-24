# ADR-010 — Vertical slices: considered and rejected

**Status:** **Rejected** (2026-08-24) · **Relates to:** ADR-002, which stands unamended ·
**Adopted in part:** feature folders inside the Application layer, and no repository
abstraction

## Context

ADR-002 chose a modular monolith with four projects — `Wasl.Domain`,
`Wasl.Application`, `Wasl.Infrastructure`, `Wasl.Api`. That is the default Clean
Architecture layout and it is what the house platform uses.

Having specified the whole system, its shape was clear: five entities, about fifteen
endpoints, two roles, one database, one developer, one week. It was worth asking whether
four projects was the right answer for *this*, or the right answer in general applied
without checking.

This ADR is the record of asking. The answer was no.

## What was proposed

Two projects: a thin domain core, and vertical feature slices. A slice would own its
endpoint, command, handler, validator, DTOs, and any feature-specific query in one
folder, and be deletable in one go. Minimal APIs instead of controllers. No
`Application` / `Infrastructure` split. No repository.

## What slices would genuinely have bought

The analysis is kept because it was correct, and because rejecting a proposal without
recording what it was right about produces a document that never disagreed with itself.

Layering protects against coupling **between features**. This system has almost none:
customers barely know about tickets, and nothing else crosses. What four projects
actually costs, at this size:

| Cost | Detail |
|---|---|
| **Adding one endpoint touches four projects** | Entity in Domain, command in Application, configuration in Infrastructure, controller in Api. Four files in four places for one slice of behaviour |
| **The diff for a story scatters** | An SDD process organised story-by-story wants the diff for a story to land in one place. Layering guarantees it will not |
| **`IRepository` over EF Core is an abstraction over an abstraction** | `DbSet<T>` is already a repository. Wrapping it produces an interface with exactly one implementation and no second in prospect |

Two of those three are real problems and are addressed below. The first is the price of
the decision and is paid knowingly.

## Decision

**Rejected. The four-project Clean Architecture layout in ADR-002 stands.**

Controllers, not minimal APIs. `Wasl.Domain`, `Wasl.Application`,
`Wasl.Infrastructure`, `Wasl.Api`, plus `Wasl.Domain.Tests`,
`Wasl.Application.Tests`, and `Wasl.Api.IntegrationTests`.

## Why

| # | Reason |
|---|---|
| 1 | **It is the house convention.** The team's existing platform is built this way. A reviewer reading against an expected shape reads divergence as unfamiliarity before they read it as judgement — and that cost is real, not irrational of them |
| 2 | **The assessment rewards *visible* separation of concerns.** Four projects make the layering literal in the Solution Explorer: a reviewer sees it without being told. Vertical slices need explaining, and an explanation delivered under time pressure is a weaker artefact than a structure that speaks for itself |
| 3 | **The developer has deep daily experience with Clean.** Building in a familiar structure under a hard deadline has genuine value that no diagram captures. Novelty costs attention, and attention is the scarce resource in a one-week build |
| 4 | **Zero rewrite.** Every story artefact already specifies the layered paths. The layer names were already written; only the project prefix was standardised (see the note below) |

The proposal's own risk section anticipated this outcome and stated the rule for
resolving it: *diverge only if you can state the trade in one sentence and mean it.* The
sentence could be stated. It could not be meant with conviction against reasons 1 and 3
together, and a conventional structure understood beats an optimal one defended weakly.

**Note on reason 4.** The paths in the story artefacts read `Wasl.Application/...`
rather than `CRM.Application/...` because the project prefix was standardised on the
product name across the repository before this decision was taken. The *layer* names —
which is what reason 4 is about — were never touched. The rewrite is genuinely zero.

## What is adopted from the proposal

Rejecting the layout does not mean rejecting what it was right about.

### 1. Feature folders inside the Application layer

The strongest argument for slices was that a story's diff should land in one folder.
That is achievable without abandoning the layering.

```text
Wasl.Application/
  Features/
    Tickets/
      CreateTicket/      Command · Handler · Validator · Dto
      ChangeStatus/
      AssignTicket/
      ListTickets/
      Timeline/
    Customers/
      CreateCustomer/
      GetCustomer/
    Me/SetLanguage/
  Common/                Behaviours · Abstractions · Exceptions · PagedResult
```

Grouping by feature rather than by technical type. A folder per use case, not
`Commands/`, `Handlers/`, `Validators/` directories that a story's diff has to be
reassembled from. Type folders stop working at about three features, because a change to
one feature then scatters across all of them.

The layering stays visible at the project boundary; the cohesion arrives one level down.
The diff for a story now touches four projects but lands in one folder inside the layer
that carries most of it.

### 2. No `IRepository<T>` — `IApplicationDbContext` instead

The proposal's second point stands unaltered by the layout decision. Even in Clean
Architecture, `IRepository<T>` over EF Core is an abstraction over an abstraction:
`DbSet<T>` is already a repository, and an interface with one implementation and no
second in prospect is ceremony.

But the Application layer must not reference EF Core directly, or the dependency
direction the layering exists to protect is gone. So:

```text
Wasl.Application/Common/Abstractions/IApplicationDbContext.cs      declared here
Wasl.Infrastructure/Persistence/WaslDbContext.cs                   implements it
```

`IApplicationDbContext` exposes `DbSet<T>` properties and `SaveChangesAsync`. One
interface for the whole application rather than one per aggregate.

| | `IRepository<T>` per aggregate | `IApplicationDbContext` |
|---|---|---|
| Interfaces to maintain | One per aggregate, growing | One, total |
| Application depends on EF Core? | No | No |
| Testable without a database? | Yes | Yes |
| Duplicates what `DbSet<T>` already does | Yes | No |
| Query expressiveness | Whatever methods were added in advance | Full LINQ at the call site, where the query's intent is |

The last row is the one that decides it. A repository method list is a guess at which
queries will be needed, and the guess is always slightly wrong, so the interface grows a
method per surprise.

### 3. Named query classes, for exactly two queries

Two queries are complex enough to name and to test on their own, and they live in
`Wasl.Infrastructure/Queries/`:

| Query | Why it earns a class |
|---|---|
| The ticket timeline union (US-010) | Comments and history are two tables with different shapes, ordered together and paginated across the boundary |
| The dashboard aggregates (US-016) | Six aggregates that must not become six round trips |

These are **query objects, not repositories**: one caller each, no interface. The
distinction matters — a repository is an abstraction you program against, a query object
is a name for a complicated piece of SQL.

## What is not adopted

| Not adopted | Why |
|---|---|
| Minimal APIs | Controllers group by entity, which the feature folders inside Application already offset. And controllers are what the house convention and the assessment's *controller / service / data access* phrasing both expect |
| Two projects | The whole substance of this rejection |
| Dropping the Application / Infrastructure split | It is the boundary that makes reason 2 visible |

**MediatR stays**, and its justification is unchanged by this decision. It is not carried
for indirection at fifteen endpoints — it is carried because three cross-cutting concerns
must apply to every command without being remembered: validation, the audit row
(BR-9.1), and the transaction boundary that makes BR-9.3 structural rather than
per-handler discipline. Pipeline behaviours are the right mechanism for exactly that. The
house platform uses MediatR for the same reason.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Vertical slices over a thin domain core | This ADR. Correct about cohesion, wrong about the shape a reviewer expects and the structure the developer is fastest in |
| Four projects with type folders (`Commands/`, `Handlers/`) | The layering without the cohesion. Rejected in favour of feature folders — same projects, better diff |
| Single project, folders only | Nothing stops a controller importing `WaslDbContext`, and the domain stops being independently testable |
| A project per module (Customers, Tickets, …) | Right at three or four real modules. Here it would be two, and one of them is tiny |
| Keeping `IRepository<T>` because Clean Architecture examples show it | Cargo cult. The examples show it because they predate `DbSet<T>` being a queryable repository, not because the abstraction earns its place |

## Consequences

- ADR-002 needs no amendment. Its status returns to plain `Accepted` and its deployment
  reasoning — one deployable, one database, no microservices — was never in question.
- `02-architecture.md` gains the feature-folder structure, `IApplicationDbContext`, and
  the two named query classes.
- `PHASES.md` step 0.1 creates four projects rather than two. The estimate moves; the
  change is stated there rather than absorbed silently.
- Story artefact paths need no rewrite. That was reason 4 and it holds.
- The architecture test enforcing `IAuditableCommand` (NFR-10) is unaffected — it targets
  types, not projects.
- Adding an endpoint touches four projects. That is the accepted cost, and the feature
  folders are what stop it also touching four *unrelated* folders.
