# 018 — Task Breakdown

**Phase:** 5 · **Story:** US-004 · **Feature:** `018-customer-overview` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

Agents are **named** here and **not dispatched** until the plan is approved. Naming is
the plan; dispatching is the implementation.

### What this migration changed

The source is `docs/sdd/story-artifacts/US-004-customer-overview/tasks.md`.

| # | Change |
|---|---|
| 1 | **Renumbered** every id from `*-004-nn` to `*-018-nn`, and every "Depends on" reference with it. The number is the feature folder's, per `specs/README.md` |
| 2 | **Added `Agent` and `Skill` columns** to every row, from the table in `specs/README.md` |
| 3 | **Repaired the layering.** Task outcomes that named `Wasl.Application` / `Wasl.Infrastructure` paths or a `CustomersController` now name one slice folder under `src/Wasl.Api/Features/Customers/GetCustomerOverview/` and a minimal-API endpoint (ADR-010) |
| 4 | **Repaired the database.** `Testcontainers` PostgreSQL → `Testcontainers.MsSql`; `psql \d+` → a `sys.indexes` query; and `datetime2(3)`'s millisecond precision produced a **new** task, `BE-018-04`'s ordering tie-break, which the PostgreSQL-era plan did not need (`research.md` R-4) |
| 5 | **Added the audit obligation** — as a documented *no*. See below |
| 6 | **Added a Review section**, including `REV-018-03`, which compares the generated OpenAPI against the frozen contract |
| 7 | **Added `FE-018-00`**, the screen preview, ahead of any wiring (ADR-009) |
| 8 | **Added `FE-018-06`**, the query-key sweep. It is not in the original because the original had no frontend-spec and no notion that this feature changes what *other* features must invalidate |

### The audit obligation, and why it is not a task

ADR-008 postdates the original artifacts, so they carry no audit task at all. Adding a
`Customer.Viewed` row would have been the wrong repair: **this feature changes no state**,
and BR-9.1 audits state changes. Instead the obligation is discharged in three tasks, each
of which asserts something that would otherwise be indistinguishable from an omission:

| Obligation | Task |
|---|---|
| No audit row on a successful read (BR-9.1) | `BE-018-09`, `TEST-018-09` |
| One audit row on the `401`, written **outside** any transaction (BR-9.2, BR-9.4) | `BE-018-10`, `TEST-018-08` |
| The type stays an `IQuery`, so NFR-10's architecture test keeps holding after a refactor | `BE-018-09` |

There is **no `403` path** on this endpoint: BR-6 permits both `Agent` and `Manager` to
view any customer. `TEST-018-10` asserts that rather than leaving the absence unexplained.
Full reasoning in `research.md` R-6.

## Critical path

```text
BE-018-01 → BE-018-03 → BE-018-04 → BE-018-05 → FE-018-02
```

Five tasks. Everything else makes the story correct, localized, verified, or reviewable —
these five make it exist. Note that `BE-018-02` (the index) is not on the critical path,
because the query returns the right answer without it; it is on the *not droppable* list
anyway, for the reason given there.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-018-01 | `CustomerOverviewQuery` named query object exists in the slice: three `AsNoTracking` reads projected straight to DTO shapes, one caller, no interface, no `Include` anywhere | `008`, `009`, `010` | Code reads as three `Select`s; `dotnet build`, then `TEST-018-03` | AC-1, AC-4 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-018-02 | `IX_Tickets_Customer` exists on `dbo.Tickets (CustomerId)`. Migration `AddTicketsCustomerIndex` creates it **only if absent** (spec Q-1) | `009` | `dotnet ef database update`, then the `sys.indexes` query in `data-model.md` returns exactly one row on `CustomerId` | AC-17 | `voltagent-lang:sql-pro` | works from `data-model.md` |
| BE-018-03 | The grouped count returns one row per present status and is projected onto **all six** BR-1 statuses, zero-filling the rest | BE-018-01 | Unit test over the projection, plus `TEST-018-02` | AC-3, AC-7 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-018-04 | Recent tickets read `Take(11)`, ordered `CreatedAtUtc DESC, Id DESC`, returning 10 and setting `recentTicketsTruncated` from the eleventh | BE-018-01 | `TEST-018-04`, `TEST-018-05` | AC-2, AC-9 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-018-05 | `GET /api/customers/{id}/overview` minimal-API endpoint returns `200` with a body matching the frozen contract, including the embedded `008` customer shape | BE-018-03, BE-018-04 | Integration test asserting the full shape against `contracts/customer-overview-api.md` | AC-1, AC-13, AC-14 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-018-06 | An unknown id returns `404` `errors/not-found` through the shared middleware, and a customer with zero tickets returns `200` — not `404` | BE-018-05 | `TEST-018-06`, `TEST-018-02` | AC-5, BR-7.6 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-018-07 | A non-GUID id returns `400` as `ProblemDetails`. The route carries **no** `:guid` constraint, deliberately | BE-018-05 | `TEST-018-06` — asserting the **body shape**, not only the status | AC-6 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-018-08 | The endpoint requires authentication and is reachable by both roles; no `403` path exists | `004`, BE-018-05 | `TEST-018-08`, `TEST-018-10` | AC-10, AC-12 | `voltagent-lang:dotnet-core-expert` | — |
| BE-018-09 | The request type is an `IQuery`, not an `ICommand`: no transaction is opened and no audit row is written on success. The NFR-10 architecture test still passes | `003`, BE-018-05 | Architecture test green; `TEST-018-09` asserts the audit table is unchanged across a successful read | AC-11, BR-9.1, NFR-10 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-018-10 | A `401` on this endpoint leaves exactly one `Auth.Unauthenticated` audit row, written **outside** any transaction | `003`, BE-018-08 | `TEST-018-08` | AC-10, BR-9.2, BR-9.4 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-018-11 | OpenAPI metadata declares `200`, `400`, `401`, `404` — and declares **no** `403` | BE-018-07, BE-018-08 | `/swagger` inspected, then `REV-018-03` | Contract | `voltagent-lang:dotnet-core-expert` | — |

## Frontend

Starts as soon as [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) exists. It does not
wait for `BE-018-05`.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-018-00 | Screen preview: real tokens, real copy, plausible data volumes, **all** the states in `frontend-spec.md`, both languages. Specifically the empty state at full size, Arabic status labels in a 240px rail, and ten rows of long Arabic subjects. **Approved before any wiring** | `006`, `008` | Rendered and reviewed (Phase 3b) | AC-3, AC-15, AC-16 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-018-01 | Provisional TS types and the `useCustomerOverview` hook, keyed `['customer', id, 'overview']`. Types marked **provisional** until generated from OpenAPI | Contract frozen | `npm run typecheck` | AC-1 | `voltagent-lang:typescript-pro` | — |
| FE-018-02 | `CustomerProfilePage` reads the overview endpoint instead of `GET /api/customers/{id}`; `CustomerTicketRail` and `CustomerTicketsSection` render from props and fetch nothing | FE-018-01, FE-018-00 | Manual run against the API, plus a component test asserting neither child issues a request | AC-1, ADR-011 §4 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-018-03 | Empty state: the rail renders all six statuses at `0`, and the section renders a title, a sentence, and the create-ticket action — styled as normal, not as an error | FE-018-02 | `TEST-018-13` | AC-3 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-018-04 | "See all" appears only when `recentTicketsTruncated`, linking to `/tickets?customerId={id}` | FE-018-02 | Component test at both boundary values | AC-9 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-018-05 | Loading skeleton, `404` not-found, `400` broken-link, and error states are each distinct and each reachable | FE-018-02 | `TEST-018-13` | AC-6, AC-15 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-018-06 | **Every** `invalidateQueries` call that targeted `['customer', id]` is repointed to the prefix so it matches the overview key too. Swept across `015`, `016`, `017` and anywhere else that has landed | FE-018-02 | `grep` for the old key across `src/wasl-web`, plus a test that a `017` save refreshes the strip | AC-1 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-018-07 | Provisional types replaced with types generated from the OpenAPI document | BE-018-11 | `npm run typecheck` after regeneration | ADR-011 §6 | `voltagent-lang:typescript-pro` | — |
| FE-018-08 | Every string from a catalogue, present in `en` and `ar`; the screen walked in Arabic; rail on the inline-end; email, phone, and `ticketNumber` still LTR; plurals correct at 0/1/2/3/11/100 | `005`, `014`, FE-018-03 | Key-parity test, plus the Arabic pass recorded in `tests.md` | AC-16, BR-8.11, BR-8.14 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-018-01 | The `200` shape, field by field, against the frozen contract | BE-018-05 | Test run | AC-1, AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-018-02 | Zero-ticket customer: `total: 0`, **all six** status keys present at `0`, `recentTickets: []`, still `200` | BE-018-03 | Test run | AC-3, AC-7, BR-7.6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-018-03 | **Exactly three** database commands per request, counted by a `DbCommandInterceptor` against `Testcontainers.MsSql` | BE-018-05 | Test run | AC-4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-018-04 | The 10-item cap and the `CreatedAtUtc DESC, Id DESC` order, including eleven tickets created in the **same millisecond**, asserted stable across two calls | BE-018-04 | Test run | AC-2 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-018-05 | `recentTicketsTruncated` is `false` at exactly 10 and `true` at 11 | BE-018-04 | Test run | AC-9 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-018-06 | `404` for an unknown id and `400` for a non-GUID id, both with a `ProblemDetails` **body** and distinct `type` values | BE-018-06, BE-018-07 | Test run | AC-5, AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-018-07 | `Resolved` and `Closed` tickets appear in `recentTickets`; the list is not status-filtered | BE-018-04 | Test run | AC-8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-018-08 | `401` without a token, **and** exactly one `Auth.Unauthenticated` audit row, present after the failed request | BE-018-10 | Test run | AC-10, BR-9.2, BR-9.4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-018-09 | A successful read leaves the audit table **unchanged** — row count identical before and after | BE-018-09 | Test run | AC-11, BR-9.1 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-018-10 | Both `Agent` and `Manager` receive `200`; no request to this endpoint produces `403` | BE-018-08 | Test run | AC-12, BR-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-018-11 | An inactive customer's overview returns `200` with counts and history intact | BE-018-05 | Test run | AC-14 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-018-12 | Arabic `fullName`, `companyName`, `notes`, and ticket `subject` round-trip byte-identical; `byStatus` keys and every enum value are byte-identical between an `en` and an `ar` request | BE-018-05 | Test run | AC-7, AC-16, BR-8.7, ADR-013 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-018-13 | Frontend: empty state, loading skeleton, `404` not-found, `400` broken-link, error, and the truncation link | FE-018-03, FE-018-05 | `npm run test` | AC-3, AC-6, AC-9, AC-15 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-018-14 | The actual execution plan for both ticket reads recorded in `tests.md`, showing a seek on `IX_Tickets_Customer` | BE-018-02, BE-018-05 | Plan captured and pasted, not summarised | AC-17 | `voltagent-lang:sql-pro` | `superpowers:verification-before-completion` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-018-01 | `docs/sdd/documentation/api/overview.md` describes the endpoint as built, including that a zero-ticket customer is a `200` | BE-018-11 | Read it | DoD | main session | — |
| DOC-018-02 | `summary.md` written: what changed, the trade-offs from `plan.md` that survived, and the known limitations | All | DoD checklist | DoD | main session | — |
| DOC-018-03 | `tests.md` and `ai-notes.md` completed with **observed** output; `08-board.md` and `12-delivery-log.md` updated | DOC-018-02 | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-018-01 | Layer boundaries, `CancellationToken` on every async path, no `Include` in the query object, no fetch below the route component, and **the query-key sweep in `FE-018-06` actually swept everything** | All | `review.md` verdict `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-018-02 | Security: the response carries no assignee email or role, the `404` reveals nothing about why, the `400` body leaks no framework detail, and no PII reaches a log | BE-018-07, BE-018-05 | `review.md`, against `docs/sdd/testing/security-checklist.md` | DoD | `comprehensive-review:security-auditor` | — |
| REV-018-03 | Generated OpenAPI compared against `contracts/customer-overview-api.md`, field by field, including the absence of `403` | BE-018-11 | Any difference fixed in one of the two before closing | DoD | main session | — |
| REV-018-04 | The screen as built compared against the approved `FE-018-00` preview; every divergence recorded with a reason | FE-018-03, FE-018-08 | `frontend.md` | DoD | `ui-ux-pro-max:ui-styling` | `frontend-design` |

## Droppable if time runs short

This whole feature is droppable — it is fourth in the Phase 5 cut order, and `spec.md`
says why. Inside it:

| Task | What is lost |
|---|---|
| `FE-018-04` "see all" link | Navigation to the customer's full ticket list. The list is still reachable from the main nav and still filterable by customer, so this costs one extra step, not a capability |
| `BE-018-07` / the `400` path | A broken link renders the not-found page instead of "that link is not valid". The user does the same thing either way — goes back to the list. Drop only as a last resort and record it |
| `TEST-018-14` the recorded execution plan | The evidence that the index is actually *chosen*, not merely present. `BE-018-02` still proves it exists and `TEST-018-03` still proves the command count. This is the cheapest thing on the list to lose |
| `Q-3`'s inactive chip | An inactive customer looks like an active one. `AC-14` still holds — the data is correct, only the marker is missing |

## Not droppable

| Task | Why |
|---|---|
| `BE-018-03` the zero-filled status map | Without it, a status with no tickets is simply missing from the response. The rail then has four rows instead of six, the response is well-formed, every count present is correct, and nobody reports it — the agent concludes there are no `InProgress` tickets, which is true, and never learns the row would be absent either way. `AC-3` cannot pass |
| `TEST-018-03` the command count | It is the only thing standing between this feature and the implementation that gets written by default. The story's own notes exist because of it, and `AC-4` is unverifiable without it |
| `BE-018-04` the ordering tie-break | `datetime2(3)` makes same-millisecond ties ordinary. Without the tie-break, `TEST-018-04` is flaky and the ticket list reshuffles between refetches, which a user reads as data changing on its own |
| `FE-018-03` the empty state | A customer with no tickets is the common case, and a section that renders nothing is indistinguishable from a section that failed to load. This is the single highest-value piece of frontend work in the feature |
| `FE-018-06` the query-key sweep | It fails silently, and it fails in **another feature**: `017` saves an edit, invalidates the key nothing reads any more, and the strip shows stale data with no error anywhere |
| `FE-018-08` the Arabic pass | Constitution: every screen touched is viewed in Arabic. The rail's status labels are the specific risk, and no assertion catches a 240px rail sized to English |
| `BE-018-09` / `BE-018-10` the audit assertions | An absent audit row that was *decided* and an absent audit row that was *forgotten* look identical in a diff. These two tasks are the difference |
| `BE-018-02` the index | Two table scans per profile view on the fastest-growing table in the product, behind a fully green test suite. Correct, and quietly getting worse |
