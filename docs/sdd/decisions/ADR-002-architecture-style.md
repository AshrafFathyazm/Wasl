# ADR-002 — Architecture style

**Status:** **Accepted** · **Related:** ADR-010, which challenged the internal layout and
was rejected

## Context

The CRM has three feature areas (customers, tickets, channels), two user roles, one
database, and one team. It has to be built, explained, and reviewed in a short
window.

## Decision

A **modular monolith** with a Clean Architecture layering: `Domain`, `Application`,
`Infrastructure`, `Api`, plus a separate React client.

No microservices. No message broker. No event bus.

## Reasoning

- One deployable unit means one build, one migration path, one place to debug, and
  one thing to run for a reviewer.
- Every operation in the system is a single-database transaction. Splitting services
  would replace transactions with distributed consistency problems that the
  requirements do not ask anyone to solve.
- The layering already provides the boundaries that matter: the domain does not know
  about EF Core, and the API does not know about the database. Those boundaries are
  what SOLID and DDD are asking for. Process boundaries are a deployment concern,
  not a design one.
- If a module ever needs independent scaling or an independent release cadence, the
  layer boundaries are where it would be cut. Keeping them clean now is what makes
  that possible later.

## Alternatives considered

### Microservices

Rejected. Splitting customers, tickets, and notifications into services would add
inter-service contracts, distributed transactions or sagas, independent deployment
and versioning, and distributed tracing — all to serve a system with one database and
one team. The cost is paid immediately; the benefit is hypothetical.

### An in-process event bus / MediatR notifications for history writes

Rejected for the MVP, and this is the closer call. Publishing a `TicketStatusChanged`
event and having a handler write the history row is a cleaner separation. It was
rejected because the history write must be in the same transaction as the change
(NFR-5), and an event handler makes that guarantee implicit rather than visible.
Writing the history row inline in the use case makes the transactional coupling
obvious to the next reader. If history grows to feed notifications and reporting, the
event bus becomes worth its cost.

### A layerless single project

Rejected. It is faster for the first day and slower for every day after, and it makes
the domain rules untestable without a database.

## Challenged, and upheld

ADR-010 revisited the **internal** layout — four projects versus vertical slices over a
thin domain core — after the full system was specified and its actual size was clear.
That proposal was **evaluated and rejected** on 2026-08-24: the house convention is
four-project Clean, the assessment rewards separation of concerns that is visible without
explanation, and the developer builds fastest in the familiar structure. This decision
therefore stands unamended.

Two things were adopted from the rejected proposal, and both are refinements *within* this
layout rather than departures from it:

- **Feature folders inside `Wasl.Application`** — grouping by use case rather than by
  technical type, so a story's diff lands in one folder while the layering stays visible
  at the project boundary.
- **No `IRepository<T>`.** `IApplicationDbContext`, declared in the Application layer and
  implemented by Infrastructure, replaces it. `DbSet<T>` is already a repository; the
  interface exists to keep EF Core out of the Application layer, not to re-implement what
  EF Core provides.

Detail and reasoning: `decisions/ADR-010-vertical-slices.md`.

The deployment reasoning below was never in question: one deployable, one database, no
microservices.

## Consequences

- Deployment is one application and one database.
- All modules share a schema, so a change to a shared entity affects everything —
  contained by keeping the domain small and reviewing schema changes explicitly.
- Extracting a service later requires work. That work is deliberately deferred until
  a requirement justifies it.
