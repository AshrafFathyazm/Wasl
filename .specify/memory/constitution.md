# Wasl Constitution

Wasl is a Customer Support CRM for an internal support team: customers, tickets, and
interactions across channels, in English and Arabic.

This document governs how it is built. It supersedes habit, convenience, and anything a
generated plan asserts to the contrary. `CLAUDE.md` carries the runtime detail; this
carries the rules that do not bend.

## Core Principles

### I. Specification Before Code (NON-NEGOTIABLE)

No implementation begins without an approved `spec.md` for the feature. A specification
states scope **and** out-of-scope, records assumptions instead of holding them silently,
lists edge and failure cases, cites the business rules it implements by ID, and gives
acceptance criteria that are each independently testable as written.

Exit condition: an acceptance criterion could be handed to a stranger and turned into a
test without a follow-up question.

A requirement that appears to be missing goes to **Open Questions** in the spec. It never
goes into the code as a guess. A written-down open question is evidence of judgement; a
quietly guessed one is a defect waiting to surface.

### II. Evidence Over Assertion (NON-NEGOTIABLE)

No result is recorded that was not observed. "Tests pass" without a run is a false
statement and the easiest thing for a reviewer to catch.

Every claim of completeness names the artifact that evidences it: the test command and
its real output, the migration applied to a clean database, the screen viewed in Arabic.
"Done" is a property of the evidence, not of a document having been produced.

### III. Rules Live in the Domain, Once

`Wasl.Domain` owns the ticket state machine, the escalation preconditions, the contact
invariants, and the value objects. It depends on nothing — no EF Core, no ASP.NET, no
MediatR — and is unit-testable with no database.

No business rule is re-implemented anywhere else. The frontend may mirror a rule to
improve the experience, and is never the authority: every mirrored rule is enforced
server-side, and the server tells the client what is permitted rather than the client
deriving it.

Validation happens at the boundary. Invariants are enforced in the domain. Endpoints
bind, authorize, delegate, and map a result to a status code — nothing more.

### IV. One Uniform Contract

One error shape everywhere: RFC 7807 `ProblemDetails`, produced by a single
exception-handling middleware, carrying a `traceId` that matches the server log. No
endpoint builds an error response by hand. `200` is never returned with an error in the
body, and `detail` never leaks a stack trace, SQL, an exception type name, or a
connection string.

Status codes follow the documented table. Machine-readable values — `type`, the keys of
`errors`, enum values, `TicketNumber`, `traceId` — are identical in every locale. Only
human sentences are translated. A client that branches on `type` keeps working in Arabic;
one that branches on `title` was already broken.

DTOs are never domain entities.

### V. Structural Correctness Over Remembered Discipline

Where a rule can be made structural, it is, because the one time it is forgotten is the
time it matters:

- The audit row is written by a pipeline behaviour inside the same transaction as the
  change — not by each handler remembering to. It is therefore absent when the
  transaction rolls back, and an architecture test enforces that state-changing commands
  are auditable.
- One transaction per request, opened by a behaviour, not per handler.
- The concurrency token is maintained by the database (`rowversion`), never incremented
  by application code.
- Time comes from an injected `TimeProvider`, never `DateTime.UtcNow` inline, so tests
  control it.
- Localization is infrastructure from day one, on both sides. Retrofitting it means
  revisiting every string and every stylesheet.

### VI. AI Is a Reviewed Collaborator

AI-assisted work fails in a specific way: plausible code referencing APIs that do not
exist. That failure mode is invisible to a reader checking only style, so every accepted
output is **run**, not just read, and every referenced package, API, and method is
confirmed to exist.

Each feature records what AI was used for, what was accepted as-is, what was modified and
how, what was rejected and why, and how each accepted output was verified. No secrets and
no production data go into a prompt.

"The AI wrote it" is not an answer to "why is this here?". If a file in the diff cannot be
explained and changed without help, the feature is not done — regardless of whether the
tests pass.

## Technology Constraints

Fixed by the product owner. A change to any row of this table requires an amendment to
this document, not a decision inside a feature plan.

| Concern | Choice |
|---|---|
| Backend | ASP.NET Core Minimal APIs, .NET 10, C#. Two projects, vertical slices, thin domain core (ADR-010) |
| Data access | EF Core 10, `Microsoft.EntityFrameworkCore.SqlServer` |
| Database | **SQL Server** |
| Mediation | MediatR — justified solely by three cross-cutting pipeline concerns: validation, the audit row, and the transaction boundary |
| Validation | FluentValidation at the boundary |
| Frontend | React 18 + TypeScript, Vite, feature folders |
| Server state | TanStack Query. No fetching inside components |
| Forms | React Hook Form + Zod |
| Localization | `IStringLocalizer` over `.resx` server-side; `react-i18next` client-side |
| Backend tests | xUnit + FluentAssertions + Moq; `WebApplicationFactory` + `Testcontainers.MsSql` |
| Frontend tests | Vitest + React Testing Library on the critical forms |
| Auth | JWT, two roles: `Agent` and `Manager`, enforced server-side |

**No repository abstraction.** `DbSet<T>` is already one, and an interface with exactly
one implementation and no second in prospect is ceremony. Non-trivial queries get named
query objects with one caller.

**No new abstraction without a second implementation in hand or in prospect.** This
applies to provider wrappers, channel abstractions, and generic base classes alike.

SQL Server is not interchangeable in four places, and each must be implemented as
specified: `rowversion` with `.IsRowVersion()` for the concurrency token, filtered unique
indexes (`WHERE [col] IS NOT NULL`) for the optional-but-unique contact rule, an
explicit case-insensitive collation for email uniqueness, and `nvarchar` for every column a
human writes into — `varchar` returns `????` for Arabic. Integration tests run against a
real SQL Server container; EF `InMemory` is never a substitute because it does not
enforce constraints.

## Product Constraints

The must-have flow, completed at full quality before anything else starts:

```text
Create Customer → View Customer → Create Ticket → Assign Agent
  → Change Status → Add Comment → View Ticket History
```

The interface and every server-authored message exist in English and Arabic, with correct
right-to-left layout. No user-facing string is hard-coded; every key exists in both
locales, verified by a key-parity test. Layout uses CSS logical properties, never
`left`/`right`. Counted nouns use plural forms, never string concatenation.

Out of scope, and not to be added by a plan: real WhatsApp/SMS/email delivery, file
attachments, an automatic time-based SLA engine, analytics and dashboards beyond the
committed scope, a customer-facing portal, reopening a closed ticket, multi-tenancy,
machine translation of user-entered content, microservices or a message broker, and
locales beyond English and Arabic.

Repository language is English — code, comments, commit messages, documentation, and
artifacts — so any reviewer can read it. That is separate from the product's languages.

No secrets, connection strings, or tokens in source control.

## Development Workflow

Spec Kit is the pipeline. One feature in progress at a time.

```text
/speckit-specify → /speckit-clarify → /speckit-plan → /speckit-tasks
  → /speckit-analyze → /speckit-implement
```

A plan names every file it will create or change, and records at least one real
alternative that was considered and rejected, with the reason. Tasks are ordered,
dependency-aware, and individually verifiable; a task that cannot be verified on its own
is too big and is split.

Before a screen is built, its layout is previewed with real tokens, real copy, plausible
data volumes, all four states, and both languages. Approving a layout costs minutes there
and hours after the screen is wired, tested, and translated.

Deviating from the plan while implementing is expected and fine. Deviating **silently** is
not: the deviation and its reason are recorded.

Every commit is small, buildable, and explains intent.

## Quality Gates

A feature is Done only when every applicable item holds and its evidence exists:

- Business rules in the domain; input validated at the boundary
- `CancellationToken` threaded through every async path
- Errors through the shared middleware; status codes per the contract
- Migration created, applied, and verified on a clean database; every new index justified
  by a named query; a constraint wherever an invariant must hold
- UI on the real API, with loading, error, empty, and validation states handled
- Every state-changing operation writes an audit row, in-transaction, with nothing
  sensitive in it
- Every screen touched viewed in Arabic and rendering RTL correctly
- Unit tests for the business rules; integration tests for the happy path and the main
  failure path; every acceptance criterion mapped to a named test
- Anything knowingly untested listed with its reason
- Layer boundaries respected, no scope creep beyond the approved spec, review verdict
  recorded as Approved
- Known limitations stated honestly

**When time runs short, cut scope — never quality.** Drop a feature from the release and
record the reason. A half-implemented feature is worth less than an honestly deferred one.

## Governance

This constitution supersedes other practice. Where a feature plan, a generated task list,
or a convenient shortcut conflicts with it, this document wins.

Amendments are made by editing this file with a version bump and a dated note of what
changed and why. A principle is never bypassed inside a feature; it is amended in the
open or it holds.

Complexity must be justified in writing at the point it is introduced. Any deviation from
a principle is recorded in the feature's review artifact with its reason — an
unrecorded deviation is a defect regardless of whether the code works.

`CLAUDE.md` carries runtime development guidance and is kept consistent with this file.
`specs/README.md` carries the phase plan, the feature numbering, and who builds what.

**Version**: 1.0.0 | **Ratified**: 2026-08-23 | **Last Amended**: 2026-08-23
