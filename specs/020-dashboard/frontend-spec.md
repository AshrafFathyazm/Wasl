# 020 — Frontend Spec

**Screen:** Dashboard · **Route:** `/dashboard` · **Story:** US-016 · **Who can reach it:**
any authenticated support user — Agent and Manager, same route, **different content**
(US-016 AC-3; BR-6 has no dashboard row, see `spec.md` Q-B)

The element-by-element screen spec, with regions, tokens, and the reason each tile earns its
place, is
[`docs/sdd/design/screens/11-dashboard.md`](../../docs/sdd/design/screens/11-dashboard.md).
It is not duplicated here. This file carries what is specific to **this feature's** build:
the components, every state, the i18n keys, the RTL obligations, and the accessibility
obligations the screen spec does not cover.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

---

## Components

One route, one query. Fetching at the route level only (ADR-011 §4) — so the request
waterfall this rule exists to prevent cannot occur here by construction: there is exactly
one request for the whole screen.

| Component | Kind (ADR-011 §4) | Fetches? | Notes |
|---|---|---|---|
| `DashboardPage` | **Route / page** | **Yes** — the single `useDashboard(range)` | Reads `range` from the URL, chooses which four tiles the scope shows, decides between first-run / normal / error |
| `RangeTabs` | Feature | No | Writes `?range=` to the URL. Never holds it in state (AC-13) |
| `AttentionRow` | Feature | No | The four tiles for the active scope |
| `AttentionTile` | Feature | No | One number, one label, one optional ticket link. Muted at zero (AC-10) |
| `CreatedVsResolvedBars` | Feature | No | Paired bars per local day + `ValueTable` |
| `OpenByStatusBars` | Feature | No | Status-dot colour language |
| `ChannelMixBars` | Feature | No | Navy ramp — channel is not a state |
| `MedianStats` | Feature | No | Two medians; `"—"` when `sampleSize` is 0 |
| `NeedsAttentionList` | Feature | No | Top ten, oldest first, each row a link to `/tickets/:id` |
| `TeamLoadList` | Feature | No | Rendered **only when `teamLoad` is present in the response** |
| `BarTrack` | Feature | No | The shared bar geometry. **Local to this feature, not a primitive** |
| `ValueTable` | Feature | No | The visually-hidden table every bar block renders (AC-21) |
| `DashboardSkeleton` | Feature | No | Per-card skeletons at real heights (AC-11) |
| `FirstRunPanel` | Feature | No | Empty system (AC-9) |
| `NothingAssignedPanel` | Feature | No | Agent with nothing assigned |
| `DashboardError` | Feature | No | One message, one `traceId` (AC-12) |
| `Button`, `Badge`, `Table` | **Primitive** | No | Consumed unchanged |

**No ninth primitive, and no chart library.** `docs/sdd/design/component-inventory.md` lists
*Charts — no reporting in scope*, and ADR-009 caps primitives at eight with a written reason
required for a ninth. `BarTrack` stays inside `features/dashboard/` because the dashboard is
its only consumer; ADR-011 §3 moves something to `components/` *when the second consumer
appears, not when a second one is imagined*. Reasoning in `spec.md` A-6, rejected
alternatives in [`research.md`](research.md) R-9.

## Range control

| Concern | Rule |
|---|---|
| Source of truth | The URL — `?range=7d\|14d\|30d`. `useSearchParams` in, typed parse out (ADR-011 §2) |
| Query key | `['dashboard', range]` — the parsed value *is* the key, so caching per range falls out of the design |
| Default | Absent `range` renders as `14d`, and the response echoes `range`. The client displays what came back, never what it assumed (AC-15) |
| Unknown value in the URL | The server answers `400`. The client shows the error state with the server's message, and does **not** silently rewrite the URL to a valid value — a URL that changes itself is how a shared link stops meaning what it said |
| Changing the range | Updates the URL, refetches, and the back button returns to the previous range (AC-13) |

## States — all of them, none optional

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`).

| State | Condition | What the user sees | AC |
|---|---|---|---|
| **Loading** | `isPending` | `DashboardSkeleton`: one skeleton per card, each at the height its real card will occupy, so nothing shifts when data arrives | AC-11 |
| **First run** | `200`, and every count is `0` **and** every series is empty | `FirstRunPanel`: one sentence, one "create a ticket" CTA. **Not** a grid of twelve zeros | AC-9 |
| **Nothing assigned** | `scope: "Mine"`, `assignedToMeCount === 0`, `unassignedCount > 0` | "Nothing assigned to you", the pool count, and a link to the unassigned list — a next action, not an empty box | — |
| **Zero in one tile** | Any single count is `0` in an otherwise populated system | `0` in muted text. Never in the danger colour: a red zero trains people to ignore red, and zero unassigned is good news | AC-10 |
| **No median data** | `medians.firstReplySampleSize === 0` | `"—"` with a muted caption. **Never `0`** — no data is not zero minutes | — |
| **Empty block, populated system** | e.g. `needsAttention: []` | That card's own empty line ("nothing needs attention"). The rest of the screen renders normally | BR-7.6 |
| **Error** | any non-2xx, any network failure | `DashboardError`: **one** message for the whole screen, the server's `title`, and the `traceId` rendered selectably. Not eight broken cards | AC-12 |
| **Session expired** | `401` | Not a screen state. Redirect to sign-in |
| **Forbidden** | `403` | Inline, with the server's message (ADR-011 §5). Reachable only for a token carrying neither role |

The distinction driving that last pair is ADR-011 §5: the API told us something meaningful
(`403`, `400`) so it renders inline; a thrown render error goes to the route-level
`ErrorBoundary`.

## Fields, and where each number comes from

| Card | Renders | Source field |
|---|---|---|
| Tile 1 (both scopes) | Unassigned | `attention.unassignedCount` — global in both scopes, by design |
| Tile 2 | Manager: escalated & open · Agent: assigned to me | `attention.escalatedOpenCount` · `attention.assignedToMeCount` |
| Tile 3 | Manager: oldest untouched · Agent: my oldest | `attention.oldestUntouched` · `attention.myOldest`, as an age plus a link |
| Tile 4 (both) | Waiting on customer | `attention.waitingOnCustomerCount` |
| Created vs resolved | Two bars per local day | `dailySeries[]` |
| Open by status | One bar per status | `openByStatus[]` |
| Medians | First reply · resolution | `medians` |
| Needs attention | Up to ten rows | `needsAttention[]` |
| Channel mix | One bar per channel | `channelMix[]` |
| Team load | One row per support user | `teamLoad[]` — **absent for an Agent** |

`TeamLoadList` is rendered on `teamLoad !== undefined`, never on `scope === 'Team'`. The two
agree today; keying off the data means the card cannot appear over data that is not there,
and cannot be hidden over data that is (AC-4).

The header renders `scope` as a label from the client's catalogue and `timeZoneId` verbatim,
so the buckets are never ambiguous (AC-6). `generatedAtUtc` becomes "updated a minute ago" —
a rendered relative time, not a live one; nothing on this screen polls.

## The date bug this screen is one line away from

`dailySeries[].localDate` is a **bare calendar date string** — `"2026-08-10"` — with no time
and no offset (contract, AC-16).

```ts
// WRONG — renders 9 August for any viewer west of the organisation's timezone
new Date(point.localDate).toLocaleDateString(locale);

// RIGHT — parse the parts, format the parts. formatLocalDate.ts owns this, once.
const [y, m, d] = point.localDate.split('-').map(Number);
formatLocalDate(y, m, d, locale);
```

`new Date("2026-08-10")` is parsed as **UTC midnight**, then rendered in the viewer's local
zone. A viewer in `America/New_York` sees 9 August. Nothing throws, no test fails without
one written for it, and the chart is simply wrong by one column — which still looks like a
plausible fortnight. `formatLocalDate.ts` exists so there is exactly one place this can be
got wrong, and a Vitest case asserts it under a non-UTC `TZ`.

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint. Namespace:
`dashboard`.

| Key | `en` | Note |
|---|---|---|
| `dashboard.title` | Dashboard | Page heading |
| `dashboard.scope.mine` | My view | Rendered from `scope`, which is an untranslated enum |
| `dashboard.scope.team` | Manager view | |
| `dashboard.timezoneNote` | Times shown in {{timeZone}} | Interpolated. `timeZoneId` is inserted verbatim, never translated (AC-6) |
| `dashboard.updatedAt` | Updated {{relative}} | From `generatedAtUtc` |
| `dashboard.range.7d` / `.14d` / `.30d` | 7 days / 14 days / 30 days | Labels; the URL value stays `7d` |
| `dashboard.range.label` | Range | `aria-label` on the tab group |
| `dashboard.tile.unassigned` | Unassigned | |
| `dashboard.tile.escalatedOpen` | Escalated & open | |
| `dashboard.tile.oldestUntouched` | Oldest untouched | |
| `dashboard.tile.waitingOnCustomer` | Waiting on customer | |
| `dashboard.tile.assignedToMe` | Assigned to me | |
| `dashboard.tile.myOldest` | My oldest | |
| `dashboard.tile.none` | None | Rendered for a `null` `oldestUntouched` / `myOldest` |
| `dashboard.age.hours` | {{count}} h | Plural-aware. Six Arabic categories (BR-8.14) |
| `dashboard.age.days` | {{count}} d | Plural-aware |
| `dashboard.trend.title` | Created vs resolved | |
| `dashboard.trend.created` | Created | Series label |
| `dashboard.trend.resolved` | Resolved | Series label. Means *entered Resolved*, not *closed* — the caption says so |
| `dashboard.trend.caption` | Resolved counts the first time a ticket reached Resolved | AC-19, said on the screen so the number is not misread |
| `dashboard.status.title` | Open by status | |
| `dashboard.status.caption` | Every status except Closed | Q-D, stated rather than inferred |
| `dashboard.median.firstReply` | Median first reply | |
| `dashboard.median.resolution` | Median resolution | |
| `dashboard.median.noData` | No data yet | Rendered beside `"—"` when `sampleSize` is 0 |
| `dashboard.median.sample` | from {{count}} tickets | Plural-aware |
| `dashboard.channel.title` | Channel mix | |
| `dashboard.needsAttention.title` | Needs attention | |
| `dashboard.needsAttention.empty` | Nothing needs attention | |
| `dashboard.needsAttention.seeAll` | See all tickets | Link into `/tickets` |
| `dashboard.needsAttention.unassignedFlag` | Unassigned | Badge label |
| `dashboard.teamLoad.title` | Team load | |
| `dashboard.teamLoad.assignedOpen` | Assigned & open | Column header |
| `dashboard.teamLoad.inactive` | Inactive | Badge on an inactive user still holding tickets |
| `dashboard.firstRun.title` | Nothing here yet | AC-9 |
| `dashboard.firstRun.body` | Create your first ticket and this screen starts answering what needs attention | |
| `dashboard.firstRun.cta` | Create a ticket | |
| `dashboard.nothingAssigned.title` | Nothing assigned to you | |
| `dashboard.nothingAssigned.body` | {{count}} tickets are waiting in the unassigned pool | Plural-aware |
| `dashboard.nothingAssigned.cta` | Open the unassigned pool | |
| `dashboard.error.title` | The dashboard could not be loaded | AC-12 |
| `dashboard.error.traceId` | Reference: {{traceId}} | `traceId` inserted verbatim, never translated |
| `dashboard.a11y.valuesFor` | Values for {{block}} | Caption on each hidden `ValueTable` (AC-21) |
| `dashboard.a11y.day` / `.value` / `.series` | Day / Value / Series | Hidden table headers |

Every key exists in `ar`, enforced by the parity test (BR-8.11) — not by discipline.

**Server-authored messages are not in this table.** `ProblemDetails.title` and the messages
inside `errors` arrive already translated (BR-8.6) and are rendered as received.
Re-translating them client-side would put the same sentence in two catalogues.

**Counted nouns use plural forms, never concatenation.** `dashboard.age.hours`,
`.median.sample`, and `.nothingAssigned.body` all interpolate `{{count}}` and carry all six
Arabic CLDR categories — `_zero`, `_one`, `_two`, `_few`, `_many`, `_other` (BR-8.14,
ADR-007 §9). Applying English's two forms to Arabic is grammatically wrong for most counts
and it is silent.

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6). This screen sets nothing itself |
| Layout | CSS logical properties throughout. `margin-inline-start`, `padding-inline`, `inset-inline-start` — never `left` / `right` |
| Card order | Cards reverse with the grid. Nothing pins a card to a physical side |
| Bar fill | Bars fill from the **inline-start** edge. A bar hard-coded to grow from `left` grows from the wrong end in Arabic and reads as a bug in the data |
| Trend axis | The x-axis reverses, so the **most recent day sits at the inline-end** — which is the left in Arabic. The chronology follows reading direction; a chart that reads right-to-left in an RTL layout is the point |
| Numbers | **Latin digits in both locales** (BR-8.13, ADR-007 §7). `tabular-nums` so columns of figures align |
| Dates | Gregorian, Latin digits, formatted per locale by `formatLocalDate` |
| `TicketNumber` | Latin digits, `nowrap`, `tabular-nums`, and **does not mirror**. It is quoted aloud and pasted into other systems |
| User content | Every `subject`, `customerName`, and `fullName` carries `dir="auto"` (AC-14, ADR-007 §8). Without it an Arabic subject inside an English card renders with its punctuation on the wrong side, which looks like a typo and survives review |
| Truncation | Every user-content cell carries **both** `dir="auto"` and ellipsis truncation. One without the other cuts the wrong end of the string and shows the wrong half (`component-inventory.md`) |
| Icons | The trend and range affordances mirror; the status dot does not; the escalation icon does not |

`FE-020-08` walks this screen in Arabic and records what it found in `tests.md`. RTL defects
are visual — no assertion catches a card sized to English label text, and "Waiting on
customer" is four words in English and a longer phrase in Arabic.

## Accessibility

A bar made of `div`s conveys nothing without sight, and a colour ramp conveys nothing to
someone who cannot distinguish it. `component-inventory.md` already requires that meaning is
never encoded by colour alone; AC-21 applies that rule to a shape the inventory did not
anticipate.

| Requirement | How | Verified by |
|---|---|---|
| Every plotted value reachable without seeing the bars | Each bar block renders a **visually-hidden `<table>`** (`ValueTable`) with one row per data point and a `<caption>`. Not `aria-label` on a `div` — a summary sentence is not the data | `FE-020-08`, AC-21 |
| Bars are decorative once the table exists | The bar container is `aria-hidden="true"`, so a screen reader is not read a wall of empty `div`s | `FE-020-08` |
| Range tabs are a real control | `role="tablist"` semantics or a radio group, arrow-key navigable, `aria-current` on the active range, one visible focus ring | `FE-020-08` |
| Tiles are not fake buttons | A tile with a ticket link contains a real `<a>`; a tile without one is not focusable | `FE-020-08` |
| Every needs-attention row is keyboard reachable | A real link per row, focus ring visible, `TicketNumber` inside the accessible name so rows are distinguishable | `FE-020-08` |
| Skeletons are announced as busy, not as content | `aria-busy` on the region; skeleton blocks `aria-hidden` | `FE-020-08` |
| The error message is announced when it appears | `role="alert"` on `DashboardError` | `FE-020-08` |
| Colour is never the only signal | Every status bar carries its label; the escalated flag carries a label as well as a colour | `FE-020-08` |
| Zero is muted, not red | A muted token, not the danger token (AC-10) | Vitest assertion on the applied class, plus `FE-020-08` |

## Preview before build — not optional

`FE-020-00` renders this screen with real tokens, real copy, plausible data volumes, **all
of the states above**, and both languages **before** anything is wired.

This screen has more to find in a preview than any other in the product: ten cards, six
label lengths that differ between English and Arabic, a bar block that has to fill from the
inline-start, and a skeleton set whose only job is to match heights it cannot match until
the real heights exist. "Waiting on customer" and "Escalated & open" are the two labels most
likely to wrap in one language and not the other. Finding that in a preview costs minutes;
finding it after the screen has tests, keys, and query wiring costs hours (ADR-009,
`docs/sdd/design/preview-first-workflow.md`).

## Not on this screen

| Excluded | Where |
|---|---|
| Ticket filters, search, sort, pagination | `010-ticket-list-and-detail`, `015-ticket-filters-and-search`. "See all" is a link |
| Any mutation — assigning, closing, escalating from a tile | `011`, `012`, `016`. This screen is read-only, and a one-click action from an aggregate is how the wrong ticket gets closed |
| A free date-range picker | Excluded by US-016. Three presets only |
| CSV export, configurable widgets | Excluded by US-016 |
| SLA compliance | No SLA engine (`00-project-context.md`) |
| Satisfaction scores | Not collected |
| **An agent leaderboard** | Excluded by US-016 **deliberately**. Ranking agents by tickets closed rewards closing, not resolving, and the fastest way up such a board is closing things that should have stayed open. `TeamLoadList` shows assigned-and-open, which prompts redistribution instead of competition |
| Total tickets ever, total customers | Excluded by the screen spec: both grow forever and prompt nothing. The test for any tile is *if this number changes, does someone do something differently* |
| Auto-refresh, polling, live updates | No requirement. "Updated a minute ago" is rendered from `generatedAtUtc`, and the way to refresh is to reload |
| A per-card error state | One error for the screen (AC-12). Per-card errors are what six endpoints would have bought, and the reasons against them are in `plan.md` |
| Drill-down from a bar into a filtered list | Would be genuinely useful, and it depends on `015`'s filter URLs existing. Recorded as a deliberate exclusion, not an oversight |
