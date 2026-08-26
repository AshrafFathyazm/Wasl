# 012 — Test Evidence

**Implemented and run 2026-08-26.** Every command executed, every result pasted from its output.

Scope: **the backend.** Authorization (AC-14 to AC-16, AC-25) belongs to `004-auth-and-roles`;
the client half (AC-20, AC-21) to the frontend lane. Both in Gaps with the owner named.

---

## Build

```text
$ dotnet build --no-incremental
Build succeeded.
    0 Warning(s)
    0 Error(s)
```

## Tests

```text
$ dotnet test
Passed!  - Failed: 0, Passed: 166, Skipped: 0, Total: 166 - Wasl.Domain.Tests.dll
Passed!  - Failed: 0, Passed:   8, Skipped: 0, Total:   8 - Wasl.Application.Tests.dll
Passed!  - Failed: 0, Passed:  76, Skipped: 0, Total:  76 - Wasl.Api.IntegrationTests.dll
```

**250 tests, 250 passed, 0 skipped.** `012` added **36** — 20 domain and 16 integration:

```text
$ dotnet test tests/Wasl.Domain.Tests --filter ChangeStatusTests
Passed!  - Failed: 0, Passed: 20, Total: 20

$ dotnet test tests/Wasl.Api.IntegrationTests --filter ChangeTicketStatusTests
Passed!  - Failed: 0, Passed: 16, Total: 16
```

**36 rather than the 40-minute map plus an endpoint**, because `009` already shipped the BR-1
matrix with all 72 cell assertions. `012` is the endpoint, the version check, and the ordering.

---

## Acceptance criteria

| AC | Verified by | Result |
|---|---|---|
| AC-1 | `A_permitted_transition_returns_200_with_transitions_for_the_new_status` | **Pass** |
| AC-2 | `A_forbidden_transition_returns_409_naming_what_is_permitted`; the matrix itself is `009`'s 72 assertions | **Pass** |
| AC-3 | Same test — `detail` contains the current status **and** the permitted list | **Pass**, after a real gap (finding 1) |
| AC-4 | `In_progress_without_an_assignee_returns_its_own_409` — `errors/assignee-required` | **Pass** |
| AC-5 | `Closing_unworked_work_without_a_note_returns_400_on_the_note_field`, from `New` and from `Open` | **Pass** |
| AC-6 | `Closing_with_a_note_stores_it_sets_closed_at_and_writes_one_history_row` | **Pass** |
| AC-7 | `A_forbidden_transition_...` uses `PendingCustomer → Resolved` — BR-1.4, the cell readers most often assume is allowed | **Pass** |
| AC-8 | `No_transition_out_of_closed_is_accepted`; the domain suite covers all five targets | **Pass** |
| AC-9 | `Resolved_can_return_to_in_progress` (endpoint and domain) | **Pass** |
| AC-10 | `ClosedAtUtc` asserted non-null and `DateTimeKind.Utc` | **Pass** |
| AC-11 | Exactly one `StatusChanged` row, with old and new value | **Pass** |
| AC-12 | `A_refused_transition_leaves_no_history_and_no_audit_row` | **Partial** — a refused transition throws before any save, so there is nothing to roll back. The save-fails case is not injected. See Gaps |
| AC-13 | `Transitioning_to_the_current_status_returns_its_own_409` — `errors/same-status-transition` | **Pass** |
| AC-14, AC-15, AC-16 | — | **`004-auth-and-roles`.** No authenticated identity exists to compare against an assignee |
| AC-17 | `A_stale_expected_version_returns_a_concurrency_conflict` | **Pass** |
| AC-18, AC-19 | Shipped in `009` — `allowedTransitions` on the read, precondition-aware | **Pass** |
| AC-20, AC-21 | — | Frontend lane |
| AC-22 | `An_unknown_ticket_is_404_and_a_missing_or_undecodable_version_is_400` | **Partial** — the unknown id is `404`; a **malformed** id is `404`, not the `400` the AC asks for. See Gaps |
| AC-23 | `A_permitted_transition_...` asserts `allowedTransitions` recomputed for the **new** status | **Pass** |
| AC-24 | `An_accepted_transition_writes_exactly_one_audit_row_with_the_change` — one row, and the diff carries `Status: New → Open` | **Pass** |
| AC-25 | — | **`004`.** There is no `403` to audit |

### The two ordering tests

A request can break several rules at once and the frozen contract fixes which answer wins. Both
orderings are asserted at the endpoint **and** in the domain:

| Test | What it protects |
|---|---|
| `Closed_to_closed_reports_the_terminal_state` | Step 5 before step 7. A closed ticket does not become un-closed by reloading, so `ticket-closed` beats `same-status-transition` — get it backwards and a client is told to refetch a ticket that will never move |
| `A_stale_version_wins_over_a_forbidden_transition` | Step 6 before steps 7–9. The contract calls this **the easiest to get wrong and hardest to notice**: judge the transition first and every stale UI reports a rule violation that does not exist, naming a `currentStatus` the user cannot reconcile with their screen |
| `A_cell_outside_the_matrix_reports_the_transition_rule_not_the_precondition` (domain) | Step 8 before step 9. `New → InProgress` is outside the matrix *and* the ticket is unassigned. Reporting `assignee-required` would send the client to assign someone, after which the transition would still be refused |

---

## What the tests found

### 1. AC-3's detail was the raw message key

The forbidden-transition test failed:

```text
Expected detail "Error.Ticket.InvalidTransition" to contain "PendingCustomer".
```

The exception carried the current status and the permitted list as message arguments, and
`ProblemDetailsFactory` passed them through correctly — but `StaticProblemMessageSource` had no
entry for the key, so it returned the key itself. `002` built that fallback deliberately: a
missing sentence is cosmetic, while throwing while building an error response turns a `409` into
a `500` and loses the original failure.

So the response was well-formed and useless. **AC-3 is the reason it was caught**: it asks for
the detail to *name* things, and a test asserting only that `detail` is present would have passed.

Six detail entries added — one per `012` failure. They are the only place those sentences exist,
and `005` replaces that whole file with a localizer-backed implementation.

### 2. `InlineData` cannot carry an array

A compile error, not a defect, but worth one line because the fix changed a test's shape:
`[InlineData(new[] { "Open" })]` is not a constant expression. Rewritten to pass the starting
status as a string and branch — which reads better anyway, since the two cases differ by one
transition rather than by an array.

---

## Gaps, each with a reason

| Gap | Reason |
|---|---|
| **AC-22's malformed id returns `404`, not `400`** | The route constraint `{id:guid}` rejects it before the action runs, so the framework short-circuits with `404` and no envelope. Enveloping the statuses routing short-circuits is `002b`'s `UseStatusCodePages`. Asserted as the **current** behaviour so the deviation is visible in the suite rather than hidden by it |
| **AC-12's save-failure half** | A refused transition throws before any save, so nothing needs rolling back — asserted. Injecting a failing save needs a seam that does not exist, and adding one to make a test possible would weaken the guarantee. `003` already proves the transaction boundary itself with its own probes |
| **AC-14 to AC-16, AC-25** | `004-auth-and-roles`. The handler names the exact point the check goes — after the lookup, before the version check — in a comment rather than leaving a silent gap |
| **AC-20, AC-21** | Frontend lane. `allowedTransitions` is server-computed and recomputed on the `200`, which is what makes AC-20 possible without the client holding a copy of BR-1 |
| **`011` does not exist, so assignment is set by reflection in one test helper** | AC-4's positive half and every `InProgress` transition need an assignee. The alternative was leaving them untested until `011`. Confined to one method, and named there |
| **`DOC-012-02` not written** | The proposed amendment adding `same-status-transition` and `assignee-required` to `docs/sdd/05-api-conventions.md`, and correcting BR-1's `PendingCustomer` diagonal. The blueprint is not edited from inside a feature; the proposal is a product-owner action |
| **Deliberately untested** | That EF Core detects a `rowversion` mismatch — the check is explicit and does not rely on it, for the ordering reason above |

## One document still disagrees

`docs/sdd/04-business-rules.md` line 17 shows `PendingCustomer → PendingCustomer` as **permitted**,
where every other row carries `–` on its diagonal. `CLAUDE.md`'s table shows `–`, BR-1.9 says a
same-status transition is a `409`, and `009` shipped it as forbidden with
`A_status_never_permits_itself` covering all six statuses.

So the blueprint is the one file out of step, and the code matches everything else. `spec.md` Q-4
predicted this needed a ruling; the ruling happened when `009` was reviewed and approved. The fix
is a proposed amendment, not an edit from inside a feature.
