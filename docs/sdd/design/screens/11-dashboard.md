# Screen — Dashboard

**Route** `/dashboard` · **Story** US-016 · **Agent, Manager** (different content, same route)

## The principle

**Lead with what needs action, not with totals.**

Most dashboards open with "1,248 tickets" — a number nobody can act on. The first row
here answers one question: *what needs attention right now?* Totals and trends come
second, because they inform rather than prompt.

The test for any tile: **if this number changes, does someone do something differently?**
If not, it belongs lower down or nowhere.

## Two audiences, one route

| | Agent | Manager |
|---|---|---|
| Row 1 | Assigned to me · Unassigned pool · My oldest · Waiting on customer | Unassigned · Escalated & open · Oldest untouched · Waiting on customer |
| Trend | Mine, created vs resolved | Team, created vs resolved |
| Status breakdown | Mine | All |
| Needs attention | Mine and unassigned | All |
| Channel mix | Yes | Yes |
| Team load | **No** | **Yes** |

Same endpoint, filtered by role — not two endpoints. The role is already on the token
and the filter is one predicate; two endpoints would be two places to keep in step.

## Layout

```text
Dashboard                                    [7d] [14d] [30d]
Manager view · Asia/Riyadh · updated a minute ago

┌ Unassigned ─┬ Escalated ──┬ Oldest ─────┬ Waiting ────┐   ← act on these
│ 12          │ 3           │ 4d          │ 21          │
└─────────────┴─────────────┴─────────────┴─────────────┘
┌ Created vs resolved ──────────────┬ Open by status ───┐
│ 14-day paired bars                │ bars + medians    │
└───────────────────────────────────┴───────────────────┘
┌ Needs attention (list) ───────────┬ Channel mix ──────┐
│ oldest first, unassigned+escalated│ + Team load       │
└───────────────────────────────────┴───────────────────┘
```

## The metrics, and why each is there

| Metric | Why it earns its place |
|---|---|
| **Unassigned** | The single most actionable number in a support tool. Above zero, somebody should act now |
| **Escalated & open** | Explicitly marked as needing attention (BR-3) |
| **Oldest untouched** | The one that becomes an embarrassment. Age of the oldest ticket with no comment and no assignee |
| **Waiting on customer** | Shown so it can be *excluded* from judgement. That clock is not ours (BR-1.4) |
| **Created vs resolved** | The only trend that matters: are we keeping up? Two bars per day, not a ratio — a ratio hides volume |
| **Open by status** | The shape of the queue |
| **Median first reply / resolution** | **Median, never mean.** One three-week ticket destroys a mean and nobody notices |
| **Channel mix** | Where demand comes from — the reason `Channel` is modelled at all (FR-3) |
| **Team load** | Manager only. Assigned and open per agent |

### Deliberately not shown

| Not shown | Why |
|---|---|
| Total tickets ever | Grows forever, prompts nothing |
| Total customers | Same |
| Satisfaction score | Not collected |
| SLA compliance | No SLA engine (`00-project-context.md`) |
| A leaderboard | Ranking agents by closed count rewards closing, not resolving |

## Backend design

### One endpoint

`GET /api/dashboard?range=7d|14d|30d`

One round trip, one authorization check, one query batch. Six separate endpoints would
be six auth checks and six chances for the numbers to disagree with each other because
they were taken a second apart.

### Aggregate, do not count in a loop

The naive implementation issues one `COUNT` per status, per channel, per day. That is
roughly forty queries for one screen.

| Block | Query |
|---|---|
| Status counts | One `GROUP BY status` over open tickets |
| Channel counts | One `GROUP BY channel` over the range |
| Attention tiles | One query with conditional aggregates — `count(*) FILTER (WHERE …)` |
| Team load | One `GROUP BY assigned_to_user_id` |
| Daily series | One `GROUP BY date` per series, joined to a generated date spine |
| Medians | One query using `percentile_cont` |

Roughly **six queries**, and an integration test asserts the executed command count —
the same guard used on the ticket list (US-006 AC-9).

### The empty-day trap

```sql
SELECT d::date AS day,
       count(t.id) AS created
FROM   generate_series(@from, @to, interval '1 day') AS d
LEFT   JOIN tickets t
       ON t.created_at_utc >= d AND t.created_at_utc < d + interval '1 day'
GROUP  BY d
ORDER  BY d;
```

`GROUP BY date` alone **omits days with no tickets**, so the chart silently compresses
and a quiet Friday looks like it never happened. The date spine is what makes the shape
honest.

### Median, not average

```sql
percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (closed_at_utc - created_at_utc)))
```

A single ticket left open over a holiday moves a mean by hours and a median by minutes.
Support-time distributions have long tails by nature; the mean describes the tail, the
median describes the day.

### Time zone — a real trap

Everything is stored UTC (`03-domain-model.md`). But "today" and "by day" are **local**
questions. A team in Riyadh bucketing by UTC day sees its evening tickets land on
tomorrow.

**Decision:** bucket in the organisation's timezone, passed to the query, not in UTC.
The header states which zone is being used, so the number is never ambiguous.

This is not a detail — it is the most common silently-wrong thing in a dashboard, and
it is invisible to anyone testing in UTC.

### Caching

**None.** Six aggregate queries on a table of this size do not need it, and caching a
dashboard means explaining why a number is stale.

Threshold to revisit: if the endpoint exceeds ~300ms at realistic volume, add a
short-TTL cache and put the trade in an ADR — not before.

### Authorization

The role filter is applied in the query, not after. An Agent's response never contains
team-load data at all, rather than containing it and hiding it client-side.

## States

| State | Renders |
|---|---|
| Loading | Skeletons matching each card's real height — no layout shift |
| Empty system | A first-run panel: no tickets yet, with a create CTA. Not twelve zeros |
| Zero in one tile | `0`, in muted grey. Zero unassigned is good news and should look calm, not alarming |
| Error | One message for the whole screen with a `traceId`, not eight broken cards |
| Agent with no assigned tickets | "Nothing assigned to you" plus the unassigned pool count — a next action, not an empty box |

## Visual notes

- Attention tiles use the **status dot** language: red for act now, amber for watch.
- **Zero is muted, not red.** A red zero trains people to ignore red.
- Numbers are `tabular-nums` so columns align.
- Bars use the navy ramp, not the status palette — channel is not a state (BR-8.7's
  sibling rule: only status colours carry status).
- Every subject line carries `dir="auto"`.

## RTL

Cards reverse order; bars fill from the inline-start; the chart's x-axis reverses so the
most recent day sits at the inline-end, which in Arabic is the left. **Dates and counts
stay Latin digits** (BR-8.13).
