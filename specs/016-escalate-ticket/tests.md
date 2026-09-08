# US-009 — Verification

**Phase:** 5 · **Role:** Verification · **Status:** Complete · **Date:** 2026-09-08

Nothing in this file is written unless it was observed.

## Build

```text
$ dotnet build --no-incremental
Build succeeded.
    0 Warning(s)
    0 Error(s)
```

Warnings are errors here (`Directory.Build.props`), so this line is also a lint result.

```text
$ cd src/wasl-web && npx tsc -b
(no output)

$ npm run lint
> eslint .
(no output)
```

## Unit Tests

```text
$ dotnet test tests/Wasl.Domain.Tests
Passed!  - Failed: 0, Passed: 221, Skipped: 0, Total: 221

$ dotnet test tests/Wasl.Application.Tests
Passed!  - Failed: 0, Passed:  38, Skipped: 0, Total:  38
```

**27 of the 221 are `TicketEscalationTests`**, new in this feature. `AuditRedactionTests`
gained 5 (23 → 27 in that class, counted in the 221).

## Integration Tests

```text
$ dotnet test tests/Wasl.Api.IntegrationTests
Passed!  - Failed: 0, Passed: 540, Skipped: 0, Total: 540, Duration: 1 m 38 s
```

**26 of the 540 are `EscalateTicketTests`**, new. `ProblemRegistryTests` went 5 → 6; the
sixth is `Every_registered_type_is_in_the_documented_table`, added by this feature — see
finding 6.

**This number was recorded as 539 an hour earlier and corrected here**, because the type-table
guard was written after that run. A count copied forward from an earlier run is exactly the
kind of remembered result the Definition of Done forbids.

Whole suite, not `--filter`. A filtered run tells you about a class and nothing about the
suite (`CLAUDE.md`).

```text
BACKEND TOTAL   799   (221 + 38 + 540)     — was 737 before this feature
```

## Frontend Tests

```text
$ npx vitest run
Test Files  56 passed (56)
     Tests  1295 passed (1295)
```

Was 1226 in 54 files. **+69 tests, +2 files**: `EscalateTicketModal.test.tsx` (23) and
`locales/catalogues.test.ts` (38), plus 8 added to `TicketDetailPage.test.tsx`.

## Acceptance Criteria Traceability

| AC | Test name | Result |
|---|---|---|
| AC-1 | `EscalateTicketTests.A_manager_escalates_an_open_ticket` | **Pass** |
| AC-2 | `EscalateTicketTests.Escalate_AsAgent_ReturnsForbidden` | **Pass** |
| AC-3 | `EscalateTicketTests.A_resolved_or_closed_ticket_answers_ticket_not_escalatable` (×2) · `TicketEscalationTests.A_resolved_or_closed_ticket_cannot_be_escalated` (×2) | **Pass** |
| AC-4 | `EscalateTicketTests.An_already_escalated_ticket_answers_already_escalated` · `TicketEscalationTests.An_escalated_ticket_cannot_be_escalated_again` | **Pass** |
| AC-5 | `EscalateTicketTests.An_empty_reason_is_rejected` (×2), `…A_reason_over_five_hundred_characters_is_rejected`, `…A_reason_of_exactly_five_hundred_characters_is_accepted` (×2), `…A_missing_expected_version_is_rejected` · `EscalateTicketModal` FE-016-04 group (4) | **Pass** |
| AC-6 | **`TicketEscalationTests.Escalate_WhenPriorityIsCritical_LeavesPriorityUnchanged`** (TEST-016-02) · `…A_priority_below_the_floor_is_raised_to_it` (×2) · `…A_priority_already_at_the_floor_is_left_alone` · `…The_priority_rank_is_ascending_by_urgency` (×4, TEST-016-03) · `…The_floor_is_High` | **Pass** |
| AC-7 | `TicketEscalationTests.Escalating_sets_all_four_fields` · `EscalateTicketTests.A_manager_escalates_an_open_ticket` | **Pass** |
| AC-8 | `EscalateTicketTests.A_normal_ticket_writes_two_history_rows_and_a_critical_one_writes_one` (TEST-016-04) · `…Both_rows_appear_on_the_timeline` · `TicketEscalationTests.The_escalated_row_carries_the_reason_and_no_values`, `…Both_rows_share_one_instant` | **Pass** |
| AC-9 | Pre-existing from `026` — the list's escalated badge and `?escalated=true`. Re-verified in the browser (the dashboard's escalated tile moved 0 → 3 across the three live escalations) | **Pass, inherited** |
| AC-10 | `EscalateTicketTests.A_request_with_no_token_is_unauthenticated` | **Pass** |
| AC-11 | `EscalateTicketTests.A_manager_calling_with_an_unknown_id_gets_not_found` · `…An_agent_calling_with_an_unknown_id_still_gets_forbidden` | **Pass** |
| AC-12 | `EscalateTicketTests.A_stale_expected_version_answers_concurrency_conflict` · `…A_stale_version_on_a_resolved_ticket_answers_the_version_conflict` | **Pass** |
| AC-13 | `EscalateTicketTests.A_successful_escalation_writes_one_audit_row` · `…A_refused_escalation_writes_no_success_row` · `…A_critical_tickets_audit_diff_does_not_name_the_priority` | **Pass** |
| AC-14 | `EscalateTicketTests.The_forbidden_response_writes_an_audit_row` (TEST-016-11) | **Pass** |
| AC-15 | `EscalateTicketTests.CanEscalate_is_true_only_for_a_manager_on_an_escalatable_ticket` (TEST-016-13) · **`…Every_endpoint_reports_canEscalate_the_same_way`** · `TicketEscalationTests.IsEscalatable_is_false_once_escalated_even_on_an_open_ticket`, `…IsEscalatable_is_a_fact_about_the_ticket_only` | **Pass** |
| AC-16 | `EscalateTicketModal.test.tsx` — 23 tests across FE-016-02/04/05 · `TicketDetailPage.test.tsx` — the live/disabled menu item (3) and the BR-3-derivation scan | **Pass** |
| AC-17 | `locales/catalogues.test.ts` (38, all six namespaces) · the Arabic and English browser walks below | **Pass** |

Every AC maps to a named test. None is recorded unmet.

## Negative controls

**A guard that has never been seen to fail has not been verified.** Each was broken on
purpose, the failure read, and the change reverted.

| # | What was broken | Expected | Observed |
|---|---|---|---|
| C1 | `Ticket.Escalate`'s `if (Priority < EscalationPriorityFloor)` → `if (true)` — BR-3.6 as an assignment | TEST-016-02 red | **3 red**, TEST-016-02 among them: `Escalate_WhenPriorityIsCritical_LeavesPriorityUnchanged`, `A_priority_already_at_the_floor_is_left_alone`, `The_escalated_row_carries_the_reason_and_no_values` |
| C2 | A direct `CreateTicketCommandHandler.Map(` call reintroduced in `ChangeTicketStatusCommandHandler` | `TicketReadShapeTests` red, naming the file | **Red**, and the message names `Features/Tickets/ChangeStatus/ChangeTicketStatusCommandHandler.cs` |
| C3 | `TicketDetailReader` stops passing `tags.Tags` to the mapper | The second read-shape test red, naming `tags` | **Red**: `expected arguments to match regex "\btags\b"` |
| C4 | A documented `type` row deleted from `error-handling.md` (`tag-unchanged`) | `Every_registered_type_is_in_the_documented_table` red | **Red**, naming `{"tag-unchanged"}` |
| C5 | A `type` row added to the doc that no registry entry raises (`never-raised`) | The same test red, the other direction | **Red**, naming `{"never-raised"}` |
| C6 | An Arabic key deleted (`detail.escalatedReason`) and a placeholder dropped (`escalate.lead`) | `catalogues.test.ts` red twice | **Red twice**, naming `detail.escalatedReason` and `escalate.lead` |

### C2 could not be run as first written, and that is worth recording

The first attempt at C2 simply replaced the reader call with a `Map` call. It **did not
compile**: `error CS9113: Parameter 'currentUser' is unread`, and warnings are errors, so
the assertion never ran.

That is `037`'s C3 exactly — *a negative control that cannot fail for the reason it was
written*, because the compiler gets there first. It was re-run passing
`callerIsManager: currentUser.IsManager()` so the parameter stayed read, and the guard then
went red for its own reason.

**The incidental finding is real but narrow:** in a handler whose *only* use of
`ICurrentUser` is the reader call, forgetting the reader is a compile error. That is a
second line of defence in three of the four handlers today and it is not the guard — a
handler that reads the current user for anything else loses it silently.

## Edge Cases Exercised

| Case | Source | Result |
|---|---|---|
| `Critical` escalated | TEST-016-02, and **on the live server**: `TCK-2026-000189` `Critical → Critical`, one history row | Priority unchanged |
| `Low` and `Normal` escalated | TEST-016-04, and live: `TCK-2026-000184` `Normal → High`, two history rows | Raised to the floor |
| `High` escalated | `A_priority_already_at_the_floor_is_left_alone` | Unchanged, one row |
| Closed **and** already escalated | `A_closed_and_escalated_ticket_answers_the_status_conflict` | `ticket-not-escalatable` — BR-3.3 wins |
| Stale version **and** resolved | `A_stale_version_on_a_resolved_ticket_answers_the_version_conflict` | `concurrency-conflict` — the version check is ahead |
| `PendingCustomer` escalated | `A_ticket_waiting_on_the_customer_can_be_escalated` | Permitted. BR-3.3 names two statuses and this is not one |
| Reason of exactly 500, and 500 + trailing spaces | `A_reason_of_exactly_five_hundred_characters_is_accepted` | Both accepted; the trimmed value is stored |
| Arabic reason round trip | Live server, explicit UTF-8 body | Byte-identical, `-ceq True`, 27 chars both ways |
| Agent probing an unknown id | `An_agent_calling_with_an_unknown_id_still_gets_forbidden` | `403`, not `404` — no enumeration oracle |
| An escalated ticket's menu item | Browser, `TCK-2026-000186` | Disabled, titled «هذه التذكرة مُصعَّدة بالفعل…» |

## Live-server verification

The API on `:5272` against the compose SQL Server, the client on `:5173`. Signed in as the
seeded Manager and Agent.

| Probe | Result |
|---|---|
| Agent reads a ticket | `canEscalate = False` (same ticket, Manager: `True`) |
| Agent `POST /escalate` | `403`, body `{"type":".../errors/forbidden","title":"You do not have permission to do that.","status":403,"instance":"…","traceId":"…"}` — enveloped, per `004b` |
| Manager escalates a `Critical` ticket | `Critical → Critical`; timeline `Created, StatusChanged, Assigned, Escalated` |
| Manager escalates a `Normal` ticket | `Normal → High`; timeline `…, Escalated, PriorityChanged` |
| `escalatedBy` on the wire | `{ fullName: "منى العتيبي", role: "Manager" }` |
| `canEscalate` after success | `False` — in the response that reports the success |

**`ManagerOnly` has a production consumer now.** `CLAUDE.md` recorded that it was proven
only against a test-host endpoint; the `403` above is the policy refusing a real Agent on a
real endpoint.

## Browser walk — Arabic and English

`1440 × 960`, Chrome. Both languages on the same screens.

| What | Arabic (`dir="rtl"`) | English (`dir="ltr"`) |
|---|---|---|
| Header pill | «مُصعَّدة» | "Escalated" |
| Priority pill after a `Low` escalation | «مرتفعة», red | "High", red |
| Rail callout | «مُصعَّدة» / «صُعِّدت في 08/09/2026، 10:23 بواسطة منى العتيبي. لا يمكن التراجع عن التصعيد.» / «السبب» + the reason | "Escalated on 08/09/2026, 10:23 by منى العتيبي. Escalation cannot be undone." / "Reason" + the reason |
| Dialog, `Low` ticket | «سترتفع الأولوية من منخفضة إلى «عالية».» | "The priority will be raised from Low to High." |
| Dialog, `Critical` ticket | — | **"The priority stays Critical — escalation raises a ticket to High and never lowers one."** |
| Confirm at 0 / whitespace / 1+ chars | disabled / disabled / enabled | same |
| Timeline row | «رفع الأولوية من منخفضة إلى مرتفعة» | "raised the priority from Low to High" |
| Success | Dialog closes, toast «صُعِّدت التذكرة», callout appears | same, in English |

**An Arabic reason renders `dir="auto"` inside the English panel** and is right-aligned
there — the field the product deliberately never translates, displayed in the language the
manager wrote it in.

## Findings

### 1. The escalation reason was going into the audit diff in full — twice

**Found by a test, on its first run.** `A_successful_escalation_writes_one_audit_row`
asserted `Changes` does not contain the reason, per BE-016-06 and TEST-016-14, and the run
printed the whole diff:

```text
{"entity":"Ticket","field":"EscalationReason","before":null,"after":"Audited."}
{"entity":"TicketHistoryEntry","field":"Note","before":null,"after":"Audited."}
```

BR-9.7 enumerates a password, a hash, a token, a signing key and a full comment body — an
escalation reason is none of them literally, so nothing had ever redacted it.
`AuditRedaction` gained three entity-qualified rows and `04-business-rules.md` records the
extension. **Redacting only `Ticket.EscalationReason` would have been worse than redacting
nothing**: the same request writes the text to `TicketHistoryEntry.Note` in the same
transaction, so the row would have carried a `[redacted]` placeholder beside the value it
was hiding.

### 2. Four of the shared mapper's five call sites were returning incomplete bodies

Eleven missing fields across five endpoints, three of them live contract violations since
`011`, `012` and `034`. Table and reasoning in
[`009`'s contract changes](../009-create-ticket/contracts/tickets-api.md#contract-changes).
`TicketDetailReader` assembles the shape once now, and `TicketReadShapeTests` (C2, C3) is
what keeps it that way.

### 3. `PriorityChanged` rendered as a blank timeline row — found in a browser, not by a test

Adding `PriorityChanged` to the server's `TimelineEntryType` was mandatory:
`Enum.Parse<TimelineEntryType>` throws on an unknown value, so without it **every later
timeline read of an escalated ticket would have been a `500`**. That half had a test
(`Both_rows_appear_on_the_timeline`).

The client half had none. `sentence()`'s switch had no case, so the row reached
`default: return ''` and rendered an actor, a timestamp, a glyph and **no text**. Every
frontend test passed — none of them puts such an entry in the feed — and it took escalating
a `Low` ticket in a real browser and opening the History tab.

Fixed with a case, a label in both languages, its own glyph, and
`renders a priority-change row with both values translated` as the regression guard.

### 4. A claim in my own test comment was wrong, and the browser disproved it

`The_escalated_row_comes_before_the_priority_row` originally said the order exists so *"the
reader should see the cause above its consequence"*. The reader does not: `027`'s feed is
«الأحدث أولاً» and reverses each page, so with both rows sharing one instant `013`'s
tie-break puts `PriorityChanged` **above** `Escalated`. Renamed to
`…_in_the_returned_list` and the comment corrected to what the order actually fixes — the
id order the tie-break falls back to.

### 5. A footer that had never taken the width its own comment claimed

`components/Modal`'s `.foot` is `justify-content: flex-start`, so a single child div shrinks
to its content: the escalate dialog's footer measured **119px inside a 420px panel**, and
`.grow` grew the primary to fill 119px. `039`'s `CloseTicketModal` measured **151px in the
same 420px** — so *"the primary takes the remaining width, the way the mock draws it"* had
never been true on either. `inline-size: 100%` in both modules; fixed there rather than in
the primitive, which eight screens use.

### 6. `tickets` — the product's largest catalogue — had no parity guard

`020` wrote one for `dashboard` and `033`'s lane wrote one for `customers`, each inside its
own feature folder. `tickets`, `common`, `auth` and `settings` were unguarded, and the
Definition of Done has required `en`/`ar` parity since `001`.
`locales/catalogues.test.ts` covers all six, and found on its first run:

- **`tickets.new.age` had no Arabic `_zero`.** Unreachable today because the caller branches
  on `days === 0` first — added anyway, in both languages: "the caller guards it" is exactly
  the kind of reasoning that stops being true silently.
- **Three namespaces nest their JSON** (`common`, `auth`, `customers`) while three use flat
  dotted keys. Both resolve identically through i18next. The guard flattens; converting
  three files to satisfy a test would be a large diff with no behaviour in it.

### 7. Two of my own guards were written too broad and a run caught each

- The BR-3-derivation scan first banned `=== 'Closed'` anywhere in `TicketDetailPage.tsx`
  and went red on `noteRequiredFor` — a BR-1.2 mirror that predates `016` and is explicitly
  permitted. Narrowed to escalation lines only; it then went red on
  `if (type === 'Escalated')`, the timeline's label dispatch over an **entry type**. Final
  form is line-scoped *and* right-hand-side-scoped, with a control that proves the filter
  matches a real offender.
- `catalogues.test.ts`'s placeholder check first covered plural forms and reported
  `list.openCount_one` and two others, where English is `"{{formatted}} open ticket"` and
  Arabic is «تذكرة مفتوحة واحدة». Both are correct — Arabic's dual makes spelling the number
  out close to mandatory, and «تذكرتان» *is* "two tickets". Plurals are exempt now.

### 8. The measuring tool lied once, and it looked exactly like a known defect

A live Arabic reason came back `?????` while an Arabic *name* in the same output rendered
fine. That is the shape `CLAUDE.md` warns about for `varchar` — *"it returns `????` and
looks like a font bug"*.

It was **PowerShell 5.1**: `Invoke-RestMethod` encodes a string body as ISO-8859-1 when the
content type declares no charset. Re-probed with `[Text.Encoding]::UTF8.GetBytes` and an
explicit `charset=utf-8`, the reason round-tripped byte-identical. Sixth tool to produce a
well-formed report about nothing.

## Not Tested

| What | Why |
|---|---|
| Two **concurrent** escalations on one version (TEST-016-09's second half) | The sequential form is tested and passes. Inducing a genuine race needs two in-flight requests against one rowversion, and `007` AC-13 is the only concurrency test in the project — the mechanism it proves (`rowversion` + EF's re-check at `SaveChanges`) is the same mechanism here, unchanged. **Recorded as a gap, not as covered** |
| `POST /escalate` under the general write limit (`036` §3.4) | Inherited, not re-verified. The endpoint adds no throttle of its own and needs none: BR-3.4 makes a second escalation a `409`, so a repeat cannot double anything |
| Idempotency on `POST /escalate` | Deliberately none. BR-3.4 answers a duplicate with `409 already-escalated`, which is the same guarantee `POST /api/customers` gets from BR-4's unique index — the write is not idempotent, but a retry cannot create a second escalation |
| The dialog's focus trap and a screen-reader pass (FE-016-09) | Not done. `components/Modal` carries the trap and eight screens depend on it, but this dialog was not walked keyboard-only. **Listed as a known gap** per the task list's own droppable note |
| `403` and `503` inline in a real browser | Covered by component tests with mocked failures. Driving a real `403` needs an Agent reaching a dialog that `canEscalate` never offers them |
