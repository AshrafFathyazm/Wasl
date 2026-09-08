# 020b — The Dashboard's Trend Arrows · BACKEND + FRONTEND

**Phase:** 5 · **Lane:** Backend first, then one frontend task
**Status:** spec **RULED 2026-09-07** — all five open questions decided by the product owner, in
§6. Ready for `/speckit-plan`; nothing implemented
**Closes:** the first of the two limitations `020` recorded in
[summary.md § Known limitations](../020-dashboard/summary.md)
**Consumer:** nobody is blocked. `/` ships today with no arrows

---

## 1 · What this is

The dashboard canvas of 2026-09-07 draws a delta under each of the four attention tiles:

```text
┌ Unassigned ──────────┐
│ 12   ▲ 3 vs prev     │
│ Nobody owns these →  │
└──────────────────────┘
```

`020` did not build it, and the reason is not effort. **The tiles are a STOCK and the arrow
asks for a stock's history, which this product does not keep.**

- *Unassigned* is `AssignedToUserId IS NULL AND Status <> 'Closed'` **right now** — a level, not
  a rate.
- The chart below the tiles is a **flow**: how many were created and resolved each day. A flow
  is derivable from the rows, because each row carries the instant it happened.
- `▲ 3 vs prev` asks *what was this level 14 days ago*. Nothing in the database answers that.

This feature makes it answerable, by writing down what the levels were.

## 2 · Three routes, and the measurements that eliminate two

### 2.1 · Rejected: reconstruct the level from `dbo.TicketHistory`

The tempting one, because it needs no new table and no new infrastructure: for an instant `T`,
each ticket's status is the `NewValue` of its last `StatusChanged` before `T`, its assignee the
last `Assigned` unless a later `Unassigned` intervenes, and escalation is monotonic — measured,
`Ticket.Create` sets `IsEscalated = false` and nothing anywhere sets it back, so
`EXISTS(Escalated before T)` would be sound.

**It is rejected on two measurements, not on taste.**

| Measured | Result |
|---|---|
| How many `TicketHistory` rows the seeders write | **Zero.** Grepped across all six files in `Persistence/Seed/` — `BulkTicketSeeder`, `DemoSeeder`, `ReferenceDataSeeder`, `SeedActor`, `SeedOptions`, `SupportUserSeeder`. None mentions history at all |
| Whether any code path writes an `Escalated` event | **No.** `016-escalate-ticket` is unbuilt, so `IsEscalated` is only ever set outside the history path |

So on the data the product ships with, reconstruction reports every seeded ticket as unassigned
and `New` at any past instant, and the arrow comes out **confidently wrong on the demo**. That
is the failure mode `CLAUDE.md` names for the SLA regions `027` refused to draw: a number
computed from nothing is indistinguishable from a working one.

It also has a limit that never goes away — it can only see back as far as history exists, so
every ticket created before its writer shipped is invisible to it.

### 2.2 · Rejected: redefine the delta as a flow

*"Created this period versus the previous period"* is one extra subquery and works today. It is
also **a different number from the one above it**: the tile says 12 unassigned and the arrow
would be describing arrivals. A plausible arrow pointing at the wrong thing is worse than none.

### 2.3 · Chosen: write the levels down, once a day

A snapshot row per local day. The delta is then arithmetic the read path already knows how to
do: the live count, minus the row for `today − N`.

This is the only route that stays correct as the product grows, and the only one whose failure
mode is **an absent arrow** rather than a wrong one.

## 3 · What gets built

### 3.1 · One table

```text
dbo.DashboardDailySnapshot
  LocalDate               date            -- in Wasl:OrganizationTimeZone, the same zone 020 uses
  ScopeUserId             uniqueidentifier NULL   -- NULL = the team; a user id = that agent's view
  UnassignedCount         int
  EscalatedOpenCount      int
  WaitingOnCustomerCount  int
  AssignedCount           int
  OldestUntouchedHours    int NULL
  CapturedAtUtc           datetime2(3)

  UNIQUE (LocalDate, ScopeUserId)   -- plain, NOT filtered. See the correction below
```

**CORRECTED 2026-09-07, by measurement.** This spec first said the index had to be *"filtered on
`ScopeUserId IS NULL` / `IS NOT NULL` as SQL Server requires"*. That was written without being
checked and it is **wrong**. SQL Server's `UNIQUE` index treats `NULL`s as **equal to each
other**, so a plain composite index already allows exactly one team row per day. Measured against
the running engine (`research.md` R-1):

```text
first  (2026-09-07, NULL) → inserted
second (2026-09-07, NULL) → REFUSED, error 2601 — NULLs compare EQUAL
       (2026-09-08, NULL) → inserted
```

`ScopeUserId IS NULL` meaning *the team* therefore needs no special handling at all, and no
filtered index. **AC-1 is corrected accordingly**: it asserts the constraint refuses the second
team row, not that `filter_definition` is non-null.

**The unique key is what makes the writer safe**, not a lock and not a check-then-act: the
capture is an **upsert**, so two instances firing the same minute, or one retry after a
failure, converge on one row. `CLAUDE.md`'s write-path table applies here in full — *is
check-then-act relied on as the guarantee?* — and the answer is the index, exactly as BR-4's is.

**`LocalDate` is a BUSINESS date and `CapturedAtUtc` is a TECHNICAL one, and conflating them is
the defect this row prevents.** `LocalDate` is the day the numbers describe, in
`Wasl:OrganizationTimeZone`; `CapturedAtUtc` is when the capture actually ran. A snapshot for
7 September taken at 00:05 local on the 8th stores `LocalDate = 2026-09-07` and
`CapturedAtUtc = 2026-09-07T21:05Z`, and the two disagreeing by three hours is correct rather
than a bug. Without the second column a row that ran late is indistinguishable from one that
ran on time, and nobody can tell afterwards which day's events it actually saw.

### 3.2 · One writer, sharing `020`'s predicates

The counts are the ones `DashboardAggregatesQuery.AttentionAsync` already computes. **The
predicates are extracted so both read them**, rather than written a second time — two copies
of `Status <> 'Closed' AND AssignedToUserId IS NULL` is the shape that drifts, and the drift
presents as an arrow that disagrees with the number above it by one.

### 3.3 · The trigger — RULED: in-process, and this product has none today

Measured: no `IHostedService`, no `BackgroundService`, no Hangfire, no Quartz, no cron anywhere
in `src/`. **This feature introduces the first scheduled work in the product**, which is why it
is a spec of its own and not a task on `020`.

**Ruled 2026-09-07: an in-process `IHostedService` with a `PeriodicTimer`**, its clock behind
`TimeProvider`, and an idempotent upsert. The reasoning is the product owner's and is recorded
because the rejected option is the one somebody will propose again:

- An external cron adds a **deployment and operations dependency for one feature**. There is no
  scheduler in the product's deployment story today, so this would be introducing one.
- The capture is **internal work on the application's own data**. It needs no public surface,
  and an endpoint would become the fourth thing `004` AC-10 counts.
- Multi-instance is already safe by construction — `UNIQUE (LocalDate, ScopeUserId)` plus an
  upsert means two instances firing the same minute converge on one row.
- **A missed day is not a defect to solve with a back-fill.** A snapshot is the level *at the
  moment of capture*; taking today's levels and filing them under yesterday is the
  reconstruction defect §2.1 rejects, wearing a different hat.

```text
Instance A ─┐
            ├── Capture(2026-09-07) ──┐
Instance B ─┘                         ↓
                          UNIQUE (LocalDate, ScopeUserId) + UPSERT
                                      ↓
                                one snapshot row
```

The comparison that produced the ruling is kept rather than deleted:

| | **In-process `IHostedService` + `PeriodicTimer` — CHOSEN** | An authenticated endpoint an external cron calls |
|---|---|---|
| New dependency | none | none in code, **one in deployment** |
| Fires per instance | **yes** — two instances capture twice, which the upsert absorbs | no |
| Survives the process being down at the capture minute | **no** — that day is missed, and stays missed | yes, the caller retries |
| New public surface | none | one endpoint, and it becomes the fourth thing `004` AC-10 counts |
| Testable without a real clock | needs the timer behind `TimeProvider` — which this codebase injects everywhere already | trivially — it is a request |

**The clock is `TimeProvider` and the day is computed through `Wasl:OrganizationTimeZone`.**
Never `DateTime.Now`, never `DateTime.UtcNow` — `CLAUDE.md` states the rule and here it is also
what makes the scheduler deterministic under test: a fake clock can drive a capture at any local
instant without waiting for one.

### 3.4 · Four fields on the read

```jsonc
"attention": {
  "unassignedCount": 12,
  // ...
  "previous": {                    // null when no snapshot exists for `today − N`
    "unassignedCount": 9,
    "escalatedOpenCount": 4,
    "waitingOnCustomerCount": 16,
    "oldestUntouchedHours": 51,
    "localDate": "2026-08-24"      // WHICH day this is compared against, echoed
  }
}
```

**`previous` is a nullable OBJECT, not four nullable numbers.** The four are true together or
absent together — they come from one row — and four independent nulls invite a client to render
three arrows and a gap.

**The client subtracts; the server does not send a delta.** The tile needs the direction, the
magnitude and the baseline, and sending `+3` alone throws away the baseline that makes it
checkable.

**It costs no eighth command.** The snapshot read is a `LEFT JOIN` onto the existing attention
statement, keyed on the same local date the spine already computes.

### 3.5 · The frontend, and the direction rule is the whole of it

The arrow, its direction, its tone, and the absent state.

**EVERY METRIC DECLARES ITS OWN DIRECTION. Nothing infers sentiment from the sign.** Ruled
2026-09-07. The banned shape is exactly this:

```ts
// FORBIDDEN — and an AC exists to keep it out
const tone = delta > 0 ? 'bad' : 'good';
```

Each tile carries `higherIsWorse` (or its inverse) as data beside the number, and the renderer
reads it. Three reasons, and the third is the one that made it a ruling rather than a
preference:

1. It is already false for the metrics this product has. More unassigned is worse; more
   resolved would be better. A generic rule is wrong for half of any dashboard that grows.
2. A rule living inside a renderer is a rule the next renderer re-derives, and the two disagree
   silently — `013`'s discriminator argument, applied to a colour.
3. **`oldestUntouchedHours` breaks the analogy even where the direction is right.** Lower IS
   better for it, but a fall does not mean the workload improved:

   ```text
   yesterday 48h → today 24h   ▼ 24h
   ```

   That can mean somebody finally answered the oldest ticket — or that the oldest ticket was
   simply **closed** and left the set. Both produce the same arrow.

**So the copy for that tile states what the number did, never what it implies.** *"Oldest
untouched age fell 24h"* is true in both cases; *"backlog improved"* is a claim the data does
not make. The distinction is a copy rule with an AC on it, not a tooltip.

## 4 · What is NOT being built

| | Why |
|---|---|
| **A back-fill of history before this ships** | §2.1. There is no honest source. The first `N` days after deployment have **no arrow at all** — see Q-2 |
| **Per-hour or per-request snapshots** | The tiles are read against a period, not a moment. A daily row is the coarsest thing that answers the question, and coarse is cheaper to keep correct |
| **A trend on anything but the four tiles** | The chart is already a trend. The medians' targets are `020`'s and are not a comparison against the past |
| **`2 breaching`** | The other limitation `020` recorded. It needs a per-ticket SLA, which is a different decision entirely and is not this feature's |
| **A retention policy on the snapshot table** | One row per day per scope. At team scope that is 365 rows a year; the decision to prune belongs to whoever first has a reason, and inventing a policy now is inventing a requirement |

## 5 · Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `dbo.DashboardDailySnapshot` carries a UNIQUE index on `(LocalDate, ScopeUserId)`, confirmed present in `sys.indexes` **and confirmed to refuse a second TEAM row for the same day** — the behaviour, not the metadata. `NULL`s compare equal in a SQL Server unique index (measured, `research.md` R-1), so no filtered form is involved; asserting `filter_definition` would assert the opposite of what is built |
| AC-1b | The capture **cannot stop the host.** `BackgroundServiceExceptionBehavior` defaults to `StopHost` (measured, R-4), so a capture that throws would take the API down with it. Asserted by making the capture throw and observing that the host stays up and the next tick still runs |
| AC-2 | Capturing twice for the same local day writes **one** row, not two, and the second is an update — asserted by capturing, mutating a ticket, capturing again, and reading the row |
| AC-3 | Two captures racing in parallel for the same day produce one row and no exception. The project's second concurrency test, in the shape `007` AC-13 established |
| AC-4 | The captured counts **equal** the ones `GET /api/dashboard` reports at the same instant — asserted by capturing and reading in one test, not by comparing two hand-written predicates |
| AC-5 | `attention.previous` is present when a snapshot exists for `today − N` and **`null` when it does not**, for each of the three ranges |
| AC-6 | `previous.localDate` names the day compared against, and it is the spine's first day − 1 rather than a re-derived date |
| AC-7 | An Agent's `previous` is scoped to that Agent, and a Manager's is the team's — asserted with two tokens against one snapshot day |
| AC-8 | The command count for one request is **still 7 for a Manager and 6 for an Agent**. `020` TEST-020-02 is extended rather than replaced, and it must not be loosened |
| AC-9 | A missed day is not back-filled: capturing on day 3 writes day 3 only, and day 2 stays absent |
| AC-10 | The tile renders an arrow with the direction the tile declares — up-is-bad for the three counts — and renders **nothing at all** when `previous` is null: no dash, no zero, no grey arrow |
| AC-11 | Arabic: the arrow does not mirror. It encodes an increase, not a reading direction, and `037`'s flip set is the list of glyphs that turn — this one is not on it |
| AC-12 | A negative control per mechanism: the unique index dropped, the scope predicate removed from the capture, and the `LEFT JOIN` keyed on the wrong date — each seen red, each recorded in `tests.md` |
| AC-13 | **The arrow's tone comes from the metric's declared direction, never from the sign.** Asserted by flipping one metric's declaration in a test and watching the SAME delta render the opposite tone — which is the only assertion that can tell a declaration from an inference |
| AC-14 | The oldest-untouched tile's copy states that the AGE changed and makes no claim about the backlog. Asserted on the rendered string, not on the presence of an element — the `errors[field]` lesson, applied to copy |
| AC-15 | **No `DateTime.Now` or `DateTime.UtcNow` in the capture path**, and the local day comes from `Wasl:OrganizationTimeZone` — a source scan with a control, in the shape `020`'s `dashboardGuards` uses. A capture driven by a fake clock produces the day that clock is in |
| AC-16 | The capture runs with **no HTTP context and no principal**. `ICurrentUser` is scoped to a request, so resolving it from a hosted service either throws or hands back a null actor — the capture takes its scope from the `SupportUsers` row it is capturing for, never from an ambient user |

## 6 · Rulings — decided 2026-09-07

The five questions this spec opened were answered by the product owner in full, with reasoning.
They are recorded as rulings rather than deleted, because each one closes off an alternative
somebody will propose again.

| # | Question | Ruling |
|---|---|---|
| Q-1 | Which trigger? | **In-process `IHostedService` + `PeriodicTimer`**, clock behind `TimeProvider`, idempotent upsert. An external cron would add a deployment dependency for one feature; the capture is internal work on the application's own data and needs no public surface; `UNIQUE` + upsert already makes multi-instance safe. §3.3 |
| Q-2 | What shows for the first N days? | **No arrow at all.** Not `—`, not `0 vs prev`, not "no data". `previous: null` means the question has no answer, and a UI implying a comparison that does not exist is worse than a tile that simply looks like today's |
| Q-3 | Do Agents get a delta? | **Yes, scoped per agent.** `ScopeUserId = NULL` is the team; a user id is that agent's view. An unscoped baseline under a scoped number is a semantic bug — *my unassigned = 3* under *▲ 5 vs prev* where the 5 is the team's |
| Q-4 | When is the day captured? | **Shortly after local midnight, describing the day that just ended.** A capture at 09:00 would fold the new day's events into the old day's row. `LocalDate` is the business date; `CapturedAtUtc` is the technical one, and they legitimately differ by the zone's offset. §3.1 |
| Q-5 | Is `oldestUntouchedHours` worth capturing? | **Capture it and render it — with an explicit direction rule, and copy that claims nothing beyond the age.** Lower is better, but a fall can mean the oldest ticket was answered *or* that it was closed and left the set. The tile says the age fell; it does not say the backlog improved. §3.5 |

**None of the five is a blocker any more.** Q-1, Q-2 and Q-3 changed what gets built and are now
in §3; Q-4 and Q-5 changed what it means and are in §3.1 and §3.5.

### What the rulings hardened, in one list

Seven statements this spec now makes without qualification:

1. The scheduler is **in-process**, and a missed day stays missed.
2. A snapshot is **never back-filled** from current state.
3. An Agent has a **snapshot of their own**; the team's is `ScopeUserId IS NULL`.
4. `LocalDate` is the **business date**, computed through the organisation's timezone;
   `CapturedAtUtc` is the technical one.
5. `previous` is **one nullable object**, and its absence renders **no arrow**.
6. Trend direction is **declared per metric**, never inferred from the sign.
7. `UNIQUE (LocalDate, ScopeUserId)` **plus the upsert** is the concurrency guarantee — not an
   application-level check-then-act, and not a lock.

## 7 · Definition of Done — additions

Beyond [`09-definition-of-done.md`](../../docs/sdd/09-definition-of-done.md):

- The capture's predicates are **shared with** `DashboardAggregatesQuery`, not copied. A test
  that captures and reads in one request and compares the two is what enforces it (AC-4).
- `contracts/dashboard-api.md` gains a **Contract changes** entry for `attention.previous`,
  appended in the shape `020` used — the frozen body is never edited in place.
- The first scheduled work in this product gets a paragraph in `CLAUDE.md` naming where it lives
  and what happens when it does not run.
- `tests.md` records the negative controls **as observed**, including any that do not fail.

- The direction rule gets a **guard, not a convention**: a source scan for the banned
  `delta > 0 ? … : …` shape in the dashboard feature, with a control proving the scanner ran
  (AC-13's other half).

## Gate

**Spec only, and still spec only.** No table, no migration, no scheduler, no endpoint change, no
arrow — nothing is implemented until gate 4 is passed with an explicit yes.

The five questions were **ruled on 2026-09-07** and are recorded in §6 with the reasoning
attached. None was guessed into the design, and none remains a blocker.

**Next artifact is `plan.md`**, not code.
