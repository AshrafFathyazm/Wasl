# Summary — `020-dashboard`

Delivered 2026-09-07, both lanes. `GET /api/dashboard` and the `/` screen, built against two
design canvases the product owner supplied that day — the second a revision of the first — with
the standing instruction that **the design ships exactly as drawn**.

711 backend tests (from 672) · 1212 frontend tests (from 1148) · `dotnet build` 0 warnings, and
warnings are errors here.

## What was built

**Backend.** One endpoint, seven commands for a Manager and six for an Agent, inside one class:
`Wasl.Infrastructure.Queries.DashboardAggregatesQuery` — the second and last named query class
`CLAUDE.md` sanctions, and it is named there already. Attention tiles, the created-versus-resolved
day series, open-by-status, the two medians, the channel mix, the top-ten attention list, and
team load. Plus `OrganizationTimeZone` and `DashboardTargets`, both read once at startup and
both refusing to start on a bad value.

**Frontend.** `/` replaced `023`'s placeholder — the last one in the product, so `features/home/`
is deleted. `DashboardPage` fetches and owns the URL; `DashboardView` renders and takes props,
which is what lets `/_preview/dashboard` show five states across two languages without a server.
Six cards, a paired bar chart with its own axis, and a new `dashboard` i18n namespace in `en`
and `ar`.

## The trade-offs, and what deviated from the plan

**One query class, not the seven `plan.md` sketched.** BE-020-04 through BE-020-11 name
`DailySeriesQuery`, `AttentionTilesQuery` and five more as separate types. `CLAUDE.md` allows
two named query classes and says a third needs a written reason; seven would need five, for one
screen, and the sanctioned name is singular. Each block is a private method returning exactly one
command, so AC-17's count is unchanged and every statement is still readable on its own.

**`SqlQuery<T>` onto unmapped types, not the keyless entity types `plan.md` chose.** EF Core 10
reads raw SQL into an unmapped class, so nothing is added to the model and no migration is
involved. The cost is real and is handled: an unmapped projection **does not pass through the
UTC value converter**, so every `DateTime` arrives `Unspecified` and is stamped on the way out.
`001`'s converter test cannot see this path; `Every_instant_in_the_document_is_serialised_as_UTC`
is the one that does.

**The route stayed at `/`.** `11-dashboard.md` writes it as `/dashboard`, and `navItems.ts` has
pointed the item at `/` since `023`. Moving the path would change the nav, the breadcrumb, every
bookmark and the post-sign-in landing for a screen nobody had ever reached at the other address.
The design's route line is the one corrected.

**The two pagination-shaped decisions the canvases forced** are in `plan.md` § Contract changes:
four additive fields, and two elements deliberately not built.

## Known limitations

**Two canvas elements are absent, and both need a product-owner decision.**

- **`▲ 3 vs prev` on each tile.** The tiles are point-in-time counts — *unassigned right now* —
  and the product retains no daily snapshot, so the comparison is not computable from current
  state. Reconstructing it from `dbo.TicketHistory`'s assignment rows is a feature with a table
  and a scheduled job. A delta computed from a *different* population would be a plausible arrow
  pointing at the wrong thing.
- **`2 breaching` under an agent's load.** A breach needs a per-ticket SLA and this product has
  none. `027` left the SLA pill, the rail block and the breach banner unbuilt for the reason
  `CLAUDE.md` records: a countdown drawn from nothing looks exactly like a working one. The
  escalated count beside it is real and ships.

**The median targets are configuration, and they are not an SLA.** `Wasl:Targets:*`, defaulting
to the canvas's own 2 hours and 1 day. Two organisation-wide numbers compared against two
aggregates the endpoint already computes; nothing says anything about an individual ticket.

**TEST-020-16 (an empty database) and AC-11 (a latency threshold) are recorded UNMET**, with
reasons, in `tests.md`. Neither is claimed.

**The Arabic chart mirrors its time axis** — newest at the inline-start, so oldest sits on the
right. That falls out of using logical properties throughout and is the RTL convention, but the
canvases do not show an Arabic chart, so it is a decision this feature took and is worth a
product-owner glance.

## What the build found that the specs did not

Four things, each measured rather than reasoned, and each recorded in full in `tests.md`.

**`?range=` sent twice was first-wins, not `400`.** The contract says repetition is refused. It
was not: MVC hands a repeated parameter's first value to a scalar parameter and discards the
rest, so `?range=7d&range=30d` answered `200` with a seven-day body. Found by measuring the
running API, not by reading the code. The parameter binds as `string[]?` now.

**AC-6's own example could not catch AC-6's defect.** The criterion says a ticket created at
*22:00 local* must bucket on its local day. The negative control — deleting the timezone offset
from the spine, which is exactly that defect — left the test **green**, because Riyadh is UTC+3
and 22:00 local is 19:00Z on the same calendar date. The example discriminates only in a zone
with a negative offset. The test uses 01:00 local now.

**`datetime2(3)` rounds; it does not truncate.** The fixture's own read-back guard caught it on
its first run. `007` AC-14's note about the same column says truncation — which is what
`RequestTimestamp` does on the way in, so the product never meets the rounding and a fixture
writing raw instants does.

**Three CSS defects that 1148 green tests could not see**, because jsdom computes neither
cascade nor flex: all three range buttons rendered navy with no pressed state (`base.css` rule
17's `!important` on `button:not([class])` — the **third** time that rule has produced a defect,
after `026` and `032`); the chart's axis labels drawn inside the bars, inherited from the
canvas's own CSS; and every progress track collapsing to a hairline, because `.track` carries
`flex: 1` for a row and was reused in two columns. `dashboardGuards.test.ts` now scans the
feature's source for a classless `<button>` — the only guard that can see the first — and the
other two are recorded as browser measurements with before-and-after figures.

## Board and blueprint

- `GET /api/dashboard` removed from `OpenApiContractTests`'s `NotBuiltYet` — the gate went red
  naming it on the first full run after the endpoint existed, which is `002c`'s mechanism working.
- The two blueprint defects DOC-020-02 names are still open and are **not** worked around here:
  `docs/sdd/design/screens/11-dashboard.md` contains PostgreSQL that ADR-013 superseded, and
  BR-6's matrix has no dashboard row.
- `TicketListPage`'s chip-count block still issues one request per status and says in its own
  comment that `020` would replace it with one call. It is **not** changed: this endpoint serves
  the dashboard's aggregate, not the ticket list's per-filter counts, and rewiring that screen is
  its own change with its own tests.
