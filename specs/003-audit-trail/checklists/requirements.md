# 003 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is trusted, and
again before the feature closes.

> **Reconciled 2026-08-25.** `003` was specified before `001` and `002` existed and before
> ADR-010 was rejected. Three structural facts changed — see `research.md` R-7, R-14, R-15 —
> and the least-privilege block moved to `003b` by product-owner decision. The rows below are
> checked against the reconciled `spec.md`, not against the original.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md` |
| ☑ | Every excluded item names the feature that owns it instead | `spec.md`, Out of scope — `019`, `004`, `002`, `009`, `007`/`011`/`012`/`013` |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-8 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-1 – Q-6. Q-1 and Q-2 are the blueprint's own Q-9 and Q-10, carried forward unresolved on purpose |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-25, each tagged `·C` (`003`, 23 of them) or `·b` (`003b`: AC-12, AC-13) |
| ☑ | Edge cases include failure and permission cases, not only happy variations | `spec.md`, Edge cases — 13 rows, of which 8 are failures and 2 are permission cases |
| ☑ | Referenced rules are cited by ID, not restated | `spec.md`, Rules referenced |
| ☑ | The absence of an HTTP surface is stated, and the owner of the surface is named | `contracts/README.md` → `019` |
| ☑ | The absence of a UI is stated, and the owner is named | `frontend-spec.md`, `FRONTEND-API-GUIDE.md` → `019` |
| ☑ | Every file the plan will create or change is named | `plan.md`, Backend design |
| ☑ | At least two real alternatives were considered and rejected with reasons | `plan.md` — four rejected, two of them genuinely attractive (the pipeline owning `SaveChanges`; one `sa` connection string). `research.md` R-14 adds a third that was put to the product owner as a live choice: an `IUnitOfWork` wrapper versus moving the behaviours to `Wasl.Infrastructure` |

## Testability

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task | AC-1→TEST-003-07 · AC-2→TEST-003-07 · AC-3→TEST-003-07 · AC-4→TEST-003-07 · AC-5→TEST-003-07 · AC-6→TEST-003-09 + TEST-003-10 · AC-7→TEST-003-11 · AC-8→TEST-003-12 · AC-9→TEST-003-13 · AC-10→TEST-003-14 · AC-11→TEST-003-15 · AC-12→TEST-003-16 · AC-13→TEST-003-06 + TEST-003-16 · AC-14→TEST-003-03 **and** TEST-003-04 · AC-15→TEST-003-05 · AC-16→TEST-003-17 · AC-17→TEST-003-01 + TEST-003-18 · AC-18→TEST-003-19 · AC-19→TEST-003-19 · AC-20→TEST-003-20 · AC-21→TEST-003-21 · AC-22→TEST-003-22 · AC-23→TEST-003-23 · AC-24→TEST-003-24 · AC-25→TEST-003-09 |
| ☑ | No AC needs a follow-up question to turn into a test | Each names a query, a command, or an observable count |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell in `tasks.md` is a command, a catalogue query, or an inspection with a stated expected value |
| ☑ | Counts are asserted exactly, not loosely | AC-6, AC-25, and TEST-003-09 assert `COUNT(*) = 1`; BR-9.1 says *exactly one*, and `> 0` would pass on a double write |
| ☑ | The silent failures each have their own criterion | AC-3 (filter dropped) · AC-8 (denial row rolled back with the thing that failed) · AC-10 (row lost to a cancelled token) · AC-13 (`DENY` on a principal it cannot restrict — `003b`) · AC-15 (a behaviour order that audits requests it should have rejected) · AC-14 (rule test with an empty population) · AC-18/AC-19 (diff read after `SaveChanges` accepted it) |
| ☑ | Every task that serves nothing is removed | Each row's `Serves` names an `AC-*`, a `BR-*`, an `NFR-*`, or a named edge case |

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | The physical shape of `AuditLog` matches the blueprint column for column | `docs/sdd/03-domain-model.md`, *Physical shape* |
| ☑ | `bigint IDENTITY(1,1)` key, and the deviation from `uniqueidentifier` is justified | ADR-008, *`bigint` primary key* |
| ☑ | No foreign keys at all, and it is stated as deliberate rather than left to look accidental | BR-9.12, ADR-008 |
| ☑ | Actor email and role snapshotted, never joined | BR-9.6, ADR-008 |
| ☑ | `nvarchar(max)` + `ISJSON` in place of `jsonb`; `varchar` only where the value is ASCII by definition | ADR-013 rows 6 and 8 |
| ☑ | `DENY`, not `REVOKE` — **specified in `003`, built in `003b`** | ADR-013 row 10, BR-9.5 |
| ☑ | All four indexes, and the filtered one's `filter_definition` verified non-null | `docs/sdd/03-domain-model.md`, *Query-to-index map* |
| ☑ | No `rowversion` on an append-only table | ADR-006 as amended by ADR-013 |
| ☑ | The audit row is written by a pipeline behaviour, not by each handler | Constitution V, ADR-002, `docs/sdd/02-architecture.md` |
| ☑ | One transaction per request, opened by a behaviour | ADR-002; ADR-008, *the same-transaction exception* |
| ☑ | The BR-9.4 asymmetry is specified, not merely mentioned, and is tested on both halves | BR-9.4, ADR-008, `docs/sdd/testing/test-strategy.md` |
| ☑ | The interceptor is used only to capture the diff; the action still comes from the command | ADR-008, *Explicit writes, not an EF Core interceptor* — the objection is quoted in `research.md` R-1 rather than paraphrased |
| ☑ | Architecture test for NFR-10 exists and its vacuity at this phase is handled | NFR-10, `docs/sdd/testing/test-strategy.md`, *Architecture tests* |
| ☑ | Integration tests run against a real engine via Testcontainers; EF `InMemory` appears nowhere | `docs/sdd/testing/test-strategy.md`, ADR-013 |
| ☑ | `TimeProvider` injected, never `DateTime.UtcNow` | Constitution V, AC-23 |
| ☑ | Audit content is always English; nothing in the row is localized | BR-9.10, BR-8.9, AC-22 |
| ☑ | Redaction lives in the domain because BR-9.7 is a business rule | Constitution III |
| ☑ | Behaviour file names match the blueprint's spelling | `docs/sdd/02-architecture.md` — `Behaviours/`, `AuditBehaviour.cs`; `research.md` R-11 |
| ☑ | The seams this feature consumes were checked against `002` as specified, not assumed | `research.md` R-13 — the `traceId` accessor is reused rather than re-derived, and the denial path was corrected because `002` produces `401`/`403` with no exception |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| The NFR-10 rule test has an **empty population** when this feature closes | `Wasl.Application` has no `ICommand` implementation until `004`. Handled rather than hidden: AC-14b runs the scanner over a deliberate violator, so the mechanism is proven even though the real set is empty. `research.md` R-5, assumption A-5 |
| BR-9.2's `401` / `403` rows are not written here | A request rejected by the authentication or authorization middleware never reaches MediatR, so a pipeline behaviour cannot see it. `003` ships the writer; `004` calls it. Named in `spec.md` Out of scope so the gap is not read as an oversight |
| BR-9.6 is not proven across a real role promotion | `SupportUsers` and tokens arrive in `004`. `003` proves the copy-at-write mechanism with a stubbed actor (AC-20); `004` proves the retroactive-role failure cannot happen |
| BR-9.11 (`Audit.Read`, Manager only) is not implemented | There is nothing to read until `019`. Auditing a read of a log nobody can read would be an invented requirement |
| No retention or purge behaviour | Q-9 / `spec.md` Q-1. The answer is legal, not engineering, and inventing "90 days" would be a requirement nobody asked for |
| No read auditing | Q-10 / `spec.md` Q-2. Structurally excluded rather than merely omitted: queries do not implement `ICommand`, so they cannot enter the audit path by accident |
| A `400` validation failure writes no row | `spec.md` Q-3, with the working assumption and the one-line change if it is wrong. The decision is what makes the pipeline order load-bearing, so AC-15 exists to protect it |
| No load or volume verification on a table designed to grow without bound | `docs/sdd/testing/test-strategy.md` lists load and performance as deliberately untested. Each index is justified by a named query in `contracts/README.md`, not by measurement |
| Assumption A-3 (MediatR constrained open generics) is unverified at specification time | It is a property of a package version and is verified by running `TEST-003-05`, not by recall. The fallback is designed in `research.md` R-3 so it is not invented under pressure |
| The probe command and `POST /__test/probe` exist only in the test assembly | The exit condition in `specs/README.md` is met by a real dispatch through the real pipeline. A production probe endpoint was rejected in `research.md` R-12; a reviewer grepping `__test` finds the reason in `contracts/README.md` |
| `EntityLabel` carries personal data into a table with indefinite retention | ADR-008 already lists this as a consequence. `spec.md` Q-6 records it and sharpens Q-1 instead of resolving it quietly |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — this feature is awaiting approval before implementation |
| Plan names every file it will create or change | ☑ `plan.md` |
| Contract frozen | ☑ Not applicable — no HTTP surface. `contracts/README.md` states it and names `019` |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` |
| Dependencies on unspecified features are named with what fails without them | ☑ `plan.md`, Dependencies — `002` is required for AC-21 and the `Denied` half of AC-8 |
| AI usage recorded for the specification phase, with the implementation sections empty | ☑ `ai-notes.md` |
