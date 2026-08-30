# `011-assign-ticket` — test evidence

**Scope:** the backend half. The assignee picker UI (AC-15) belongs to the frontend lane and is
not claimed here.

**Run:** 2026-08-28, Windows 11, .NET 10.0.200 SDK, SQL Server 2022 via `Testcontainers.MsSql`
(one container for the whole integration suite), plus the `docker compose` container for the live
verification.

```text
dotnet build --no-incremental      0 Warning(s)   0 Error(s)
dotnet test --no-build

Wasl.Domain.Tests            Failed: 0   Passed: 177   Total: 177   470 ms
Wasl.Application.Tests       Failed: 0   Passed:   8   Total:   8   718 ms
Wasl.Api.IntegrationTests    Failed: 0   Passed: 155   Total: 155    33 s
                                         ─────────────────────────
                                         Passed: 340   Total: 340
```

Before `011`: 303. `011` added 37 — 11 domain, 26 integration.

---

## Acceptance criteria → named tests

| AC | Test | Result |
|---|---|---|
| AC-1 | `AssignTicketTests.A_manager_assigns_any_ticket_to_any_active_user` | pass |
| AC-2 | `AssignTicketTests.An_agent_may_take_an_unassigned_ticket` | pass |
| AC-3 | `AssignTicketTests.An_agent_assigning_to_anyone_else_is_forbidden` | pass |
| AC-4 | `AssignTicketTests.An_agent_may_not_reassign_a_ticket_owned_by_another_agent` | pass |
| AC-5 | `AssignTicketTests.An_agent_may_hand_back_their_own_ticket` | pass |
| AC-6 | `AssignTicketTests.Assigning_to_an_inactive_user_is_a_validation_error_on_the_field` | pass |
| AC-7 | `AssignTicketTests.An_unknown_assignee_has_its_own_not_found_type` | pass |
| AC-8 | `AssignTicketTests.A_closed_ticket_cannot_change_owner` | pass |
| AC-8 | `TicketAssignmentTests.A_closed_ticket_refuses_both_directions` (2 cases) | pass |
| AC-9 | `AssignTicketTests.Assigning_and_unassigning_each_write_their_own_history_row` | pass |
| AC-9 | `TicketAssignmentTests.Assigning_an_unassigned_ticket_...` · `Reassigning_records_both_sides` · `Unassigning_clears_the_column_...` | pass |
| AC-10 | `AssignTicketTests.Assigning_a_new_ticket_leaves_it_new` | pass |
| AC-10 | `TicketAssignmentTests.Assigning_never_changes_the_status` (2 cases) | pass |
| AC-11 | `AssignTicketTests.A_request_that_changes_nothing_is_a_conflict` (2 cases) | pass |
| AC-11 | `TicketAssignmentTests.Assigning_the_current_assignee_is_refused` · `Unassigning_an_already_unassigned_ticket_is_refused` | pass |
| AC-12 | `AssignTicketTests.A_stale_version_is_a_concurrency_conflict` | pass |
| AC-13 | `AssignTicketTests.The_picker_lists_active_users_and_never_a_hash` | pass |
| AC-14 | `AssignTicketTests.An_unknown_ticket_is_a_plain_not_found` | pass |
| AC-15 | **NOT BUILT** — the picker UI. Frontend lane | — |
| AC-16 | `AssignTicketTests.Assignment_changes_allowed_transitions_without_changing_status` | pass |
| AC-16 | `TicketAssignmentTests.Assigning_changes_the_allowed_transitions_it_does_not_change_the_status` | pass |
| AC-17 | `AssignTicketTests.A_denial_writes_exactly_one_audit_row_naming_the_actor_and_the_ticket` | pass |

Beyond the criteria:

| Test | What it holds down |
|---|---|
| `AssignTicketTests.Permission_is_decided_before_state` | `403` beats `409` on a closed ticket — the contract's step 5 before step 8 |
| `AssignTicketTests.A_stale_version_is_answered_before_a_denial` | `409` beats `403` — step 4 before step 5, and the **only** test protecting it |
| `AssignTicketTests.An_agent_may_not_unassign_another_agents_ticket` | `null` is a target like any other, so BR-2.3 covers it |
| `AssignTicketTests.An_accepted_assignment_writes_a_success_row` | Content, not presence: `Changes` contains `AssignedToUserId` |
| `AssignTicketTests.Both_endpoints_refuse_an_unauthenticated_caller` | The fallback policy, on `011`'s two new endpoints |
| `AssignTicketTests.A_missing_or_undecodable_version_is_a_validation_error` (3 cases) | Absent is `400`, undecodable is `400`, stale is `409` |
| `TicketAssignmentTests.A_refused_assignment_mutates_nothing` | `Assign` writes to a field, so a throw-after-mutate would leave the in-memory entity wrong |

---

## Negative controls — the claim measured, not argued

`spec.md`'s strongest claim is that BR-2's data-dependent half must live in the handler because
**a handler denial is audited and a policy denial is not.** That is testable, so it was tested
rather than reasoned about twice.

> **Superseded in part, 2026-08-29 by `004b`.** A policy denial **is** audited now — an
> `IAuthorizationMiddlewareResultHandler` writes `Auth.Forbidden / Denied` and gives the `403` a
> real `ProblemDetails` body. So the half of the claim about auditing no longer holds, and the
> measurement below was true when it was taken rather than wrong.
>
> **The conclusion is unchanged, and the reason is control 1's second finding, not its first:** a
> policy runs before any handler, so it cannot express the contract's step 4 → step 5 ordering, and
> `A_stale_version_is_answered_before_a_denial` still goes red under it. BR-2's data-dependent half
> stays in the handler because of **ordering**, which `004b` does not change — not because of
> auditing, which it does. Left here rather than rewritten: what a measurement showed on the day is
> evidence, and quietly editing it to match today would destroy the record of why the rule exists.

### Control 1 — BR-2 moved to an authorization policy

`[Authorize(Policy = WaslPolicies.ManagerOnly)]` added to the action, the `EnsurePermitted` call
removed.

```text
dotnet test --filter "FullyQualifiedName~AssignTicketTests"
Failed: 5, Passed: 21, Total: 26

  An_agent_may_take_an_unassigned_ticket                  ← BR-2.2 becomes impossible
  An_agent_may_hand_back_their_own_ticket                 ← so does AC-5
  An_agent_assigning_to_anyone_else_is_forbidden          ← 403, but an empty-bodied one
  A_stale_version_is_answered_before_a_denial             ← the policy runs before the handler
  A_denial_writes_exactly_one_audit_row_...
      Expected rows to contain 1 item(s) because one denial, one row — not zero and not
      two, but found 0: {empty}.
```

**`found 0: {empty}`.** The audit row does not merely lose a column — it does not exist. "An
Agent tried to take a ticket that was not theirs" would be absent from `dbo.AuditLog` entirely,
while the API returned a perfectly correct `403`. That is the whole argument for the placement,
and it is now a measurement.

Two side findings from the same control, neither of them predicted:

- The `403` a policy produces has an **empty body** — no `type`, no `traceId`. `002b` owns
  enveloping middleware-produced statuses, so a client could not even branch on it.
  **No longer true as of `004b`** (2026-08-29): the denial handler envelopes it. `002b` still owns
  the *other* middleware-produced statuses — `404` on an unmatched route, `405`, `415`.
- `A_stale_version_is_answered_before_a_denial` went red too, because a policy necessarily runs
  before any handler. So a policy cannot express the contract's step 4 → step 5 ordering at all.

### Control 2 — the version check moved after the permission decision

```text
dotnet test --filter "FullyQualifiedName~AssignTicketTests"
Failed: 1, Passed: 25, Total: 26

  A_stale_version_is_answered_before_a_denial
      Expected response.StatusCode to be Conflict, but found Forbidden.
```

**Exactly one test, and it is the one written for it.** Reverted, rebuilt with
`--no-incremental`, re-ran: 26/26. Then the whole suite: 340/340.

### Control 3 — observed rather than staged

The `TicketHistory` actor stamp was **not** deliberately broken. AC-9 failed on its first run:

```text
Expected assign.PerformedByUserId to be {01a04516-...}, but found <null>.
```

See *Defects found by running* below. The fix was verified by the same assertion going green,
which is the negative control arriving for free.

---

## A tool lied, and it nearly went into this file as a result

Between control 1 and control 2 the negative controls were reverted with
`Copy-Item $backup $source -Force`. **`Copy-Item` preserves the source file's `LastWriteTime`**,
so the restored `TicketsController.cs` looked *older* than `Wasl.Api.dll`, and MSBuild skipped
recompiling it. `dotnet build` reported `0 Warning(s) 0 Error(s)`.

The result: control 2 was measured against control 1's binary. Five tests were red, the same
five as control 1, and the reading would have been "swapping the check order breaks five tests"
— a confident, specific, entirely wrong conclusion, backed by a green build and a real test run.

Caught by comparing the DLL's timestamp against the source's:

```text
Wasl.Api.dll          00:22:52   ← control 1's build
Wasl.Application.dll  00:24:30
now                   00:29:23   ← two builds later
```

Every negative control here was re-measured with `--no-incremental` afterwards. This is a fifth
entry for `CLAUDE.md`'s list of tools that produced a well-formed report about nothing, and the
first one where the tool was the build.

A second, smaller instance of the same class: a stray `Wasl.Api` process from the live
verification held a file lock, so one `--no-incremental` build emitted `MSB3061` warnings and
`6 Error(s)` — that one at least failed loudly.

---

## Defects found by running

### `PerformedByUserId` was NULL on every history row this system had ever written

Not a `011` defect. `009` introduced `TicketHistoryEntry` with a `PerformedByUserId` column and
a factory parameter defaulting to `null`, and nothing ever passed it. `WaslDbContext.Stamp()`
loops over `ChangeTracker.Entries<IAuditableEntity>()` — and `TicketHistoryEntry` is deliberately
**not** an `IAuditableEntity`, because it is append-only and its actor column means "who did this
thing" rather than "who last edited this row". So the loop skipped it.

Consequence, live for two features: `Created` rows from `009` and `StatusChanged` rows from `012`
all carried a null actor. Nothing failed. `013`'s timeline would have rendered "someone changed
the status" for every event, and the column would have read as a feature not yet filled in rather
than as a stamp never applied.

**Found because AC-9 asserts the actor rather than the row's existence** — `CLAUDE.md`'s "assert
content, not presence", catching its third defect.

Fixed in `WaslDbContext.Stamp()` with a second loop over `TicketHistoryEntry`, beside the first.
`PerformedAtUtc` is deliberately not stamped there: the domain sets it from the instant passed
into `ChangeStatus`/`Assign`, because when an event occurred is a fact about the event, and
overwriting it would let two clocks disagree about one moment.

Verified in SQL after the fix, on the live database:

```text
EventType     | OldValue    | NewValue     | PerformedByUserId
Assigned      | NULL        | 01a04525-... | 01A04525-FBE0-72B2-BA66-2DAFCEC29106
StatusChanged | InProgress  | Resolved     | NULL
StatusChanged | Open        | InProgress   | NULL
```

The three `StatusChanged` rows are NULL **correctly**: they were written by `--seed`, which has no
authenticated user, so `ICurrentUser` returns null and the stamp is honestly absent. That is the
same row proving the stamp comes from the token and nowhere else.

### `SupportUserSeedTests` counted two users and there are now three

`004` asserted `HaveCount(2)`. `011` seeds a second Agent, so it went red. Updated to 3, and the
count is kept rather than loosened: this assertion going red is how a fourth seeded user
announces itself.

---

## Verified live, against the compose container

```text
docker compose up -d db · dotnet ef database drop -f
dotnet run --project src/Wasl.Api -- --seed
    Users: 3 written (manager@wasl.local, agent@wasl.local, agent2@wasl.local).
    Seeded 3 customers and 5 tickets, and wrote 14 audit rows.
```

**The picker, called as an Agent** — AC-13, and the role that BR-2.2 requires can reach it:

```json
[{"id":"01a04525-fbe0-...","fullName":"Omar Khalid","role":"Agent"},
 {"id":"01a04525-fc79-...","fullName":"نورة السالم","role":"Agent"},
 {"id":"01a04525-faa2-...","fullName":"منى العتيبي","role":"Manager"}]
```

No email, no `preferredLanguage`, no hash. Arabic names round-trip.

**An Agent self-assigns an unassigned ticket** — AC-2, AC-10, AC-16 in one call:

```text
before   TCK-2026-000002   status=Open   allowedTransitions=Closed
after    TCK-2026-000002   status=Open   allowedTransitions=InProgress,Closed
                           assignee = Omar Khalid / Agent
```

The status did not move (BR-2.7) and the permitted set did (BR-1.3). That is AC-16's whole point,
and it is the clearest reason the client must render the array it was given.

**The same Agent tries to hand it to the Manager** — AC-3:

```json
{
  "type": "https://wasl.local/errors/forbidden",
  "title": "You do not have permission to do that.",
  "status": 403,
  "detail": "You are not permitted to change this ticket's assignee.",
  "instance": "/api/tickets/01a04526-0109-.../assignee",
  "traceId": "00-ca21e64965cd04a6e98e08d84a492460-209b7734f58180ed-00"
}
```

No `errors` dictionary, and the `detail` names neither the current assignee nor the target.

**AC-17, read out of the real table** — and the `TraceId` is the one in that response:

```text
Action           | Outcome | ActorEmail         | ActorRole | EntityLabel      | TraceId
Ticket.Assigned  | Denied  | agent@wasl.local   | Agent     | NULL             | 00-ca21e649...492460-...
Ticket.Assigned  | Success | agent@wasl.local   | Agent     | TCK-2026-000002  | 00-fab7a8f2...
Ticket.Assigned  | Failed  | agent@wasl.local   | Agent     | NULL             | 00-34c83bad...
```

Three outcomes from one action name, which is `004` R-18's rule applied here. Worth reading the
third row: the `Failed` came from an `assignee-unchanged` `409` earlier in the session — a
conflict, not a refusal, so `AuditOutcomeClassifier` correctly did **not** call it `Denied`. The
distinction an incident investigation needs is intact in both directions.

`EntityLabel` is NULL on the two non-success rows because `DescribeTarget(null)` has no ticket
number to report — the id is in `EntityId`, which is what an investigation joins on.

**AC-11 fired unplanned during the live run.** The first attempt picked a ticket the seeder had
already assigned — filtered on the list projection's `assigneeId` while reading
`assignedToUserId`, which the list does not return — and the API answered `409`
`assignee-unchanged`. The mistake was mine and the answer was right.

---

## Deviations from the specification

| # | Spec / contract says | Built | Reason |
|---|---|---|---|
| D-1 | `PUT /assignee` returns a body whose assignee is a nested object, while `009`/`010` return a bare `assignedToUserId` — Q-5 | `assignee` **added** to the one shared DTO; `assignedToUserId` kept | Q-5's ruling was "return the nested object, change nothing else". Adding a field is backward-compatible; a second seventeen-field DTO plus a second mapper is the "second shape to keep in step" `012` declined. So all three ticket endpoints now carry both, and no frozen contract moved. Recorded in `plan.md` |
| D-2 | A malformed route `Guid` is `400` — Q-6 | `404`, asserted as observed. **Ruled deliberate 2026-08-30 (`002b` Q-B), and enveloped there** | The `:guid` route constraint fails the match before any action runs, so nothing `002` built sees the request. `002b` owns the fix. The test asserts today's behaviour and names the contract it violates, so it goes red the day `002b` lands. Recorded in `plan.md` under *Contract changes* |
| D-3 | AC-6's message is keyed on `assigneeId` in `errors` | Same, via a dedicated `AssigneeInactiveException` carrying `FieldErrors` | The spec did not say which mechanism. `InvariantViolationException` has no field-error channel, so this follows `012`'s `NoteRequiredException` pattern rather than inventing a second one |

## Not run, and therefore not claimed

| What | Why |
|---|---|
| AC-15 — the picker UI | The frontend lane owns it |
| Two clients assigning at the same instant | `expectedVersion` is asserted against a stale token and EF re-checks at `SaveChanges`. The genuine race was not run |
| An audit row on a **policy**-level `403` | Still `004b`. `011` avoids needing one; it does not close the gap |
| A rate limit on this endpoint | Nothing implements one anywhere |
| The FK refusing an unknown assignee | The handler answers first (`404 assignee-not-found`), so `FK_Tickets_Assignee` is never reached on that path. It remains the guarantee of last resort and is untested as such |
| `013`'s timeline rendering these rows | `013` is not built. The rows are asserted in the database |
