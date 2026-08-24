# 016 — Specification · Escalate Ticket

**Phase:** 5 · **Story:** US-009 · **Feature:** `016-escalate-ticket` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Understanding

A queue eventually needs a way to say "this one is different" that survives being passed
between people. Escalation is that mechanism, and in Wasl it is deliberately **not** a
status. It is a flag plus metadata on the ticket: `IsEscalated`, `EscalatedAtUtc`,
`EscalatedByUserId`, `EscalationReason`. A ticket can be escalated *and* `InProgress` at
the same time, because "who is working on it" and "does this need attention now" are
orthogonal facts. Modelling escalation as a seventh status would force a choice between
the two and break the BR-1 state machine (ADR-004).

Only a Manager may escalate. Escalation is a manual act with a written reason — there is
no timer, no SLA engine, and nothing that escalates a ticket while nobody is looking
(BR-3.1). It is one-way: BR-3.9 puts de-escalation out of scope, so an escalated ticket
stays escalated for its lifetime.

The rule this story exists to get right is **BR-3.6**. Escalation raises priority to a
**floor** of `High`. It does not *set* priority to `High`. An implementation that writes
`Priority = High` silently downgrades a `Critical` ticket — the ticket that most needed
the attention becomes less visible by being escalated, no exception is thrown, no test
fails unless one was written for it, and the defect is discoverable only by someone who
happens to remember what the priority was before. `docs/sdd/testing/test-strategy.md`
already names this as the rule most likely to be implemented wrongly. It gets its own
acceptance criterion (AC-6) and its own named test
(`Escalate_WhenPriorityIsCritical_LeavesPriorityUnchanged`).

## In Scope

- `POST /api/tickets/{id}/escalate` — one endpoint, one slice
- The Manager-only authorization policy at the endpoint boundary (BR-3.2), and the audit
  row that a denial writes (BR-9.2)
- The escalation preconditions in the domain: not `Resolved`, not `Closed` (BR-3.3), not
  already escalated (BR-3.4)
- A required, non-whitespace `reason` of at most 500 characters (BR-3.5)
- The **priority floor** (BR-3.6) — the single most important line of this feature
- Setting the four escalation fields (BR-3.7)
- An `Escalated` history row, plus a `PriorityChanged` row **only when the priority
  actually changed** (BR-3.8)
- One `Ticket.Escalated` audit row in the same transaction as the change (BR-9.1, BR-9.3)
- Optimistic concurrency on the escalate call, per ADR-006
- Exposing `isEscalated`, `escalatedAtUtc`, `escalatedBy`, `escalationReason`, and
  `canEscalate` on the ticket read shape, so the client is *told* what is permitted rather
  than deriving it (Constitution III)
- The escalate reason dialog and the escalated callout on the ticket detail rail

## Out of Scope

| Excluded | Reason |
|---|---|
| Automatic, time-based, or SLA-driven escalation | BR-3.1 puts it out of the MVP, and `01-product-spec.md` puts an SLA engine out of scope project-wide |
| De-escalation / un-escalating | BR-3.9. Adding it means a second history event type, a second policy, and a decision about whether priority comes back down — none of which is specified |
| Escalating to a named person or a tier | No requirement. Escalation raises visibility; it does not reassign. Assignment is `011` |
| Escalation notifications (email, WhatsApp, SMS) | Real delivery is out of scope project-wide; `021` is the provider abstraction |
| Changing priority directly | A separate Manager-only action per BR-6, with no story in this release |
| The `escalated=true` list filter | `015-ticket-filters-and-search`. See the AC-9 note below |
| A filtered index on `IsEscalated` | Belongs with the query that needs it (`015`), per the no-speculative-indexes rule |
| Re-escalating with a corrected reason | Not specified. BR-3.4 refuses a second escalation, and editing the reason is not an operation this feature defines. Recorded as a limitation, not silently allowed |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | "Non-empty" in BR-3.5 means **non-whitespace**, consistent with BR-5.1 for comment bodies | If a whitespace reason should be accepted, one validator rule changes and AC-5 loosens. Accepting `"   "` would put a blank justification in the audit trail, which is the outcome BR-3.5 exists to prevent |
| A-2 | The reason is **trimmed** before the 500-character limit is measured and before storage | A 502-character reason with two trailing spaces is accepted rather than rejected. Stated so the boundary is deterministic; measuring before trimming would make the limit depend on invisible characters |
| A-3 | `TicketPriority` is semantically ordered `Low < Normal < High < Critical`, as `03-domain-model.md` states | The floor comparison is meaningless. See "The one thing that fails silently" below — this assumption is load-bearing and is asserted by a test rather than trusted |
| A-4 | A Manager may escalate a ticket assigned to someone else, or unassigned | If escalation should require ownership, BR-6 gains a row and a data-dependent check joins the role-only policy. BR-6 lists Escalate as role-only, so the boundary policy is sufficient today |
| A-5 | The escalation reason is support-internal text, never shown to a customer | If a customer-facing view arrives it must exclude it, the way BR-5.4 handles internal comments. No customer-facing portal exists (out of scope project-wide) |
| A-6 | The escalation reason belongs in the audit row's `Changes` as a *fact that it was set*, not as 500 characters of free text | See Q-3. If the reviewer wants the text in the forensic record it is one line, but it then lives in three places |
| A-7 | `009-create-ticket` created `IsEscalated`, `EscalatedAtUtc`, `EscalatedByUserId`, and `EscalationReason` with the `Tickets` table | This feature needs a migration after all. Verified by a `sys.columns` query rather than assumed — see `data-model.md` |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | BR-3.3 blocks `Resolved` and `Closed`. Which `type` does that `409` carry? The registry in `docs/sdd/documentation/api/error-handling.md` has `errors/ticket-closed` (BR-1.5) but nothing for `Resolved` | **A single new type, `errors/ticket-not-escalatable`, for both.** `errors/ticket-closed` is deliberately not reused: a client that hides the comment composer on `errors/ticket-closed` (BR-5.2) would then hide it on a `Resolved` ticket, where commenting is still permitted. The error payload names the current `status` so the message can say which. `DOC-016-01` registers the new type |
| Q-2 | If a ticket is both `Closed` **and** already escalated, which `409` wins? | **BR-3.3 is evaluated before BR-3.4.** The terminal state is the more fundamental refusal, and a manager told "already escalated" about a closed ticket would look for de-escalation, which does not exist. Documented in the contract so a test does not have to guess |
| Q-3 | Does the audit row's `Changes` carry the escalation reason text? | **No.** It records `IsEscalated: false → true` and, when it changed, `Priority: <old> → <new>`. The reason text lives on `Tickets.EscalationReason` and on the `Escalated` history row's `Note`. Copying it a third time into the forensic table repeats the pattern BR-9.7 rejects for comment bodies. `EntityLabel` carries the `TicketNumber`, which is what an auditor searches by |
| Q-4 | Is `expectedVersion` required on escalate, when BR-3.4 already makes a double-submit a `409`? | **Required**, matching `PUT /status` and `PUT /assignee`. A client that has to remember which of three ticket mutations carries a version will forget on one of them, and the one it forgets is a silent lost update (Constitution V). The cost of requiring it is one field the client already holds |
| Q-5 | Should escalation also bump `UpdatedAtUtc`? | **Yes.** It is a change to the ticket row. Stated because "the flag changed but the ticket looks untouched" is the kind of inconsistency that surfaces later as a sorting bug on a "recently changed" view |
| Q-6 | AC-9's `escalated=true` filter lives in `015`, which is cut **before** `016` in the Phase 5 order | If `015` is dropped and `016` ships, **AC-9's filter clause is not met** and that is recorded in `summary.md` as a known limitation rather than quietly marked done. The visual-distinction half of AC-9 is delivered here and in `010`'s list column |

Nothing here outlives the story except Q-1, which changes a shared registry;
`DOC-016-01` carries it.

## Acceptance Criteria

AC-1 – AC-9 are the criteria from `docs/sdd/user-stories/US-009-escalate-ticket.md`,
preserved verbatim with their numbering because other features cite them. AC-10 – AC-17
are added by this specification for the paths the story leaves implicit: authentication,
existence, concurrency, audit, and the client.

| # | Criterion |
|---|---|
| AC-1 | `POST /api/tickets/{id}/escalate` with a Manager token and a reason returns `200` (BR-3.2) |
| AC-2 | An Agent attempting to escalate returns `403` (BR-3.2) |
| AC-3 | Escalating a `Resolved` or `Closed` ticket returns `409` (BR-3.3) |
| AC-4 | Escalating an already-escalated ticket returns `409` (BR-3.4) |
| AC-5 | An empty reason, or one over 500 characters, returns `400` (BR-3.5) |
| AC-6 | Priority is raised to `High` if it is currently `Low` or `Normal`, and left unchanged if it is already `High` or `Critical` (BR-3.6) |
| AC-7 | `IsEscalated`, `EscalatedAtUtc`, `EscalatedByUserId`, and `EscalationReason` are all set (BR-3.7) |
| AC-8 | An `Escalated` history row is written, plus a `PriorityChanged` row only when the priority actually changed (BR-3.8) |
| AC-9 | Escalated tickets are visually distinct in the list and filterable via `escalated=true` |
| AC-10 | A request without a valid token returns `401` with `errors/unauthenticated` |
| AC-11 | An unknown ticket id returns `404` with `errors/not-found`. An **Agent** calling with an unknown id still returns `403`, because the role policy runs before the lookup |
| AC-12 | A stale `expectedVersion` returns `409` with `errors/concurrency-conflict` (ADR-006) |
| AC-13 | A successful escalation writes exactly one `Ticket.Escalated` audit row in the **same transaction** as the change; a forced rollback leaves **no** audit row, no history row, and no change to the ticket (BR-9.1, BR-9.3) |
| AC-14 | The `403` in AC-2 writes an `Auth.Forbidden` audit row **outside** any transaction, with `Outcome` not `Success` (BR-9.2, BR-9.4) |
| AC-15 | The ticket read shape exposes `isEscalated`, `escalatedAtUtc`, `escalatedBy`, `escalationReason`, and `canEscalate`. `canEscalate` is `false` for an Agent, for an escalated ticket, and for a `Resolved` or `Closed` ticket — the client never derives it from `status` and role |
| AC-16 | The client renders the Escalate action only when `canEscalate` is true, requires a reason of 1–500 characters before enabling Confirm, shows the escalated callout on the rail after success, and renders a `403` or `409` **inline beside the control**, never as a toast |
| AC-17 | Every new string exists in `en` and `ar`; the escalation reason and the callout render with `dir="auto"`; the screen is walked in Arabic and the findings recorded in `tests.md` |

### The one thing that fails silently

AC-6 is the criterion this feature exists for, and there are **two** ways to get it wrong,
not one:

| Wrong implementation | What it looks like | What catches it |
|---|---|---|
| `ticket.Priority = TicketPriority.High` | A `Critical` ticket is silently downgraded to `High` by being escalated. No exception, no failed request, no log line. The most urgent ticket becomes less visible *because* someone raised it | `TEST-016-02`, `Escalate_WhenPriorityIsCritical_LeavesPriorityUnchanged` |
| `Priority = (TicketPriority)Math.Max((int)Priority, (int)High)` with the enum reordered | Correct today, wrong the moment somebody alphabetises `TicketPriority` or inserts a value between `Normal` and `High`. Enums are persisted **as strings**, so no data migration and no cast error announces the change | `TEST-016-03`, an explicit assertion that the rank order is `Low < Normal < High < Critical` |

An unconditional `PriorityChanged` history row is the third face of the same defect: it
records a change on a `Critical` ticket where none happened, and it is the row a reviewer
reads to decide whether the floor was implemented correctly. `TEST-016-04` asserts the
`Critical` case produces **exactly one** history row.

## Edge Cases

From `docs/sdd/testing/edge-cases.md`: escalating an already-escalated ticket (`409`,
BR-3.4); escalating a `Critical` ticket (succeeds, priority unchanged, BR-3.6). Plus the
generic set: empty string, whitespace-only, exactly at maximum length, one over, unicode
in the reason, `null` versus omitted, unknown field in the body, malformed JSON, two
simultaneous identical requests.

Specific to this story:

| Case | Expected |
|---|---|
| Reason of exactly 500 characters | Accepted. 501 returns `400` |
| Reason of 500 characters plus trailing whitespace | Accepted; stored trimmed at 500 (A-2) |
| Whitespace-only reason `"   "` | `400`, naming `reason` (A-1) |
| Arabic reason | Stored and returned byte-identical. `nvarchar(500)` — `varchar` would return `????` and read as a font problem (ADR-013 row 4) |
| Ticket already escalated **and** `Closed` | `409 errors/ticket-not-escalatable`. BR-3.3 is checked first (Q-2) |
| Ticket at priority `High`, escalated | `200`. Priority unchanged, one history row (`Escalated`), no `PriorityChanged` row |
| Ticket at priority `Low`, escalated | `200`. Priority becomes `High`, two history rows |
| Two Managers escalate the same ticket concurrently | One `200`, one `409` — `errors/concurrency-conflict` if the loser's `expectedVersion` is now stale, `errors/already-escalated` if it re-read first. Both are correct refusals; the test asserts exactly one succeeded and the ticket has exactly one `Escalated` history row |
| An **Agent** escalates a ticket that does not exist | `403`, not `404` (AC-11). The role policy runs at the boundary, before any database access |
| A Manager escalates a ticket that does not exist | `404` |
| `expectedVersion` omitted | `400`, naming `expectedVersion` (Q-4) |
| Escalation on a ticket with no assignee | `200`. Escalation does not require or change an assignee (A-4) |
| `escalatedBy` user later deactivated | The ticket still reports them. `EscalatedByUserId` is `ON DELETE NO ACTION` and there is no hard delete; the read projection tolerates an inactive user |

## Rules Referenced

BR-3.1 – BR-3.9 · BR-6 (Escalate: Agent ❌, Manager ✅) · BR-1.5 (`Closed` is terminal and
cannot be escalated) · BR-5.6 (`TicketHistory` is append-only) · BR-8.6, BR-8.7, BR-8.8,
BR-8.11 (localization) · BR-9.1 – BR-9.4, BR-9.6 – BR-9.10 (audit) · ADR-004 (escalation
is a flag, not a status) · ADR-006 as amended by ADR-013 (`rowversion` concurrency) ·
ADR-008 (audit) · ADR-010 (two projects, vertical slices) · ADR-011 §4, §5 (component
kinds, inline expected states) · ADR-013 (SQL Server) · NFR-10 (the architecture test that
fails the build on a command with no declared audit action)

Cited, not restated.
