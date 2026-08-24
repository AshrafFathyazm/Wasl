# 019 — Frontend Spec

**Screen:** Audit log · **Route:** `/audit` · **Story:** US-015 ·
**Who can reach it:** `Manager` only (BR-6, BR-9.11)

> ## This screen was authored here, not inherited
>
> Every other feature's frontend spec points at an element-by-element screen spec in
> [`docs/sdd/design/screens/`](../../docs/sdd/design/screens/). **There is none for the
> audit log.** That directory holds eleven screens; this is not one of them, and US-015's
> own out-of-scope line excludes a UI entirely (see `spec.md`, *Scope note — the screen*,
> and `Q-019-1`).
>
> So this screen is **composed**, not matched:
>
> | Source | What is taken from it |
> |---|---|
> | [`10-shared-patterns.md`](../../docs/sdd/design/screens/10-shared-patterns.md) | The four states, the toast rules, the form-field spec, the pagination pattern — **and the explicit rejection of that pagination pattern**, below |
> | [`component-inventory.md`](../../docs/sdd/design/component-inventory.md) | The `Table` primitive, its required states, and the column rules (fixed-width identifiers, `tabular-nums`, `dir="auto"` plus ellipsis together) |
> | [`layout-patterns.md`](../../docs/sdd/design/layout-patterns.md) | The list-page composition — title, toolbar, table, footer |
> | [`03-tickets-list.md`](../../docs/sdd/design/screens/03-tickets-list.md) | Read as the closest existing precedent for a list screen. Not inherited from |
>
> **Nothing below claims to match an approved design.** `FE-019-00` renders it and a
> person approves it before anything is wired. Claiming to match a design that was never
> seen is the one thing not to do: the next question is "match what?", and there is no
> answer.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md). The contract is
[`contracts/audit-api.md`](contracts/audit-api.md).

---

## The rule that shapes everything else

**Every successful fetch of this screen writes a row into the table the screen displays**
(BR-9.11). This is the only screen in the product where reading has a side effect.

| Rule | Reason |
|---|---|
| No polling. `refetchInterval: false` | A 30-second poll writes 2,880 rows a day per open tab. Four managers leaving the tab open overnight write more audit rows than the business does |
| No `refetchOnWindowFocus`, no `refetchOnMount` | Alt-tabbing is not a request for data |
| Long `staleTime` (5 minutes) | Cache hits cost nothing and write nothing |
| An explicit **Refresh** button | A person asking for fresh data is exactly the event BR-9.11 wants recorded |
| A filter change **does** refetch | Also a deliberate action; one row per deliberate query is the intent |

A default `refetchOnWindowFocus: true` is invisible in review and fills the table. It is
written down here so it is a decision rather than an oversight.

## Entry point

`02-app-shell.md` states *"Manager — same nav; the roles differ in permissions, not in
navigation"*, so a Manager-only nav item would change the shell.

**Decision:** the entry point is in the **user popover, beside `Settings`** — the shell's
own answer for a destination used monthly rather than hourly. Hidden for an `Agent`. The
route is deep-linkable regardless, which is why the `Forbidden` state exists. Recorded as
`Q-019-2` for a design owner's confirmation.

## Layout

```text
Audit log                                                    (page title)
[ Entity ⌄ ] [ Actor ⌄ ] [ Action…… ] [ Outcome ⌄ ] [ From ][ To ]  [Clear] [⟳ Refresh]
┌──────────────────────────────────────────────────────────────────────────┐
│ When  Actor  Role  Action  Entity  Label  Outcome  Trace  ⌄              │
│ ─────────────────────────────────────────────────────────────────────────│
│ rows, 61px each · the ⌄ cell expands the change diff in place            │
└──────────────────────────────────────────────────────────────────────────┘
Rows [20 ⌄]   showing 20                          ‹ Newer        Older ›
```

No status tab bar. `outcome` has three values and belongs in the filter bar; promoting it
to tabs would need a count per tab, and there is no count (`research.md` R-4).

## Components

| Component | Kind (ADR-011 §4) | Fetches? | Responsibility |
|---|---|---|---|
| `AuditLogPage` | **Route / page** | **Yes** | Owns the query, reads and writes the URL, owns the cursor stack, renders every state |
| `AuditFilterBar` | Feature component | No | The six controls; values and an `onChange` arrive as props |
| `AuditTable` | Feature component | No | Header, rows, row expansion, the empty body |
| `AuditChangesCell` | Feature component | No | Renders the `{field:{from,to}}` diff, or raw JSON for an unrecognised shape |
| `Table`, `Badge`, `Select`, `Input`, `Button` | Primitive | No | From `006-design-system`. **No new primitive is introduced** |

Fetching only at the route level (ADR-011 §4) — which on this screen is not merely a
performance rule: a feature component that fetched would write an audit row on mount.

No global store. Filters and the cursor are URL state; the row-expansion set is local
component state and is deliberately not in the URL — nobody links to an expanded row.

## Filters

All optional, AND'ed, all in the URL (ADR-011 §2), so a filtered view is a link a manager
can paste into an incident ticket.

| Filter | Control | Values | Mirrors |
|---|---|---|---|
| `entityType` | `Select` | `Ticket`, `Customer`, `SupportUser`, `AuditLog` + "Any" | AC-2 |
| `entityId` | `Input` | A `Guid`. **Disabled until `entityType` is chosen** — the API returns `400` without it, so the control enforces it instead of letting the user earn an error | AC-16 |
| `actorUserId` | `Select` | Support users, from `GET /api/support-users`. Free-text `Guid` fallback, because the actor may no longer exist — the log has no foreign key (BR-9.12) | AC-2, AC-7 |
| `action` | `Input` | Free text, **prefix** match. Placeholder `Auth.` to make the prefix behaviour discoverable | AC-3 |
| `outcome` | `Select`, multiple | `Success`, `Denied`, `Failed`. A **"Denials and failures"** preset selects the latter two in one click | AC-4 |
| `from` / `to` | Two date inputs | ISO, sent as `Z`. Inverted range shows the server's message on **both** | AC-2, AC-16 |

The "Denials and failures" preset is the post-incident query — the one the filtered index
exists for. One click, because a query that matters after an incident should not require
knowing which two of three checkboxes to tick.

## Columns

Per the `Table` column rules in `component-inventory.md`.

| Column | Width | Treatment |
|---|---|---|
| When | fixed 160 | Local time, `tabular-nums`. UTC in the `title` attribute — an auditor correlating with a server log needs UTC |
| Actor | flex, min 200 | `actorEmail`, ellipsis, full value in `title`. `—` when null (anonymous event) |
| Role | fixed 90 | `actorRole` as stored. **A snapshot** — the tooltip says so, because a reader will otherwise assume it is current (BR-9.6) |
| Action | fixed 200 | Verbatim, `nowrap`. **Never translated** |
| Entity | fixed 110 | `entityType`, or `—` for an auth event |
| Label | flex, min 180 | `entityLabel`, **`dir="auto"` and ellipsis together**, full value in `title` |
| Outcome | fixed 120 | `Badge`. Success = success token, Denied = warning, Failed = danger. **Label always present** — never colour alone |
| Trace | fixed 120 | First 12 characters, monospace, click to copy the whole `traceId`. Latin digits in every locale |
| ⌄ | fixed 44 | Expands `changes` in place. Absent, not disabled, when `changes` is null |

`ipAddress` and `userAgent` are **not** columns — nine columns is already the widest table
in the product. They appear in the expanded row.

**`dir="auto"` and ellipsis are required together** on Actor and Label. One without the
other truncates the wrong end of the string and shows the wrong half — which looks like
bad data rather than bad CSS.

## Rendering `changes`

| Case | Rendered |
|---|---|
| `{ "Field": { "from": …, "to": … } }` | One row per field: name, old value struck through, new value. Values `dir="auto"` — they may be Arabic |
| Valid JSON of another shape | `<pre>` with the raw JSON. **Not an error.** The server passes the column through unvalidated (`research.md` R-6); a row you cannot pretty-print must still be visible |
| `null` | The expander is absent. `Auth.LoginFailed` and `Audit.Read` have no diff |

Values are rendered as text and never as HTML. `changes` holds data a user typed.

## States — all six, none optional

`10-shared-patterns.md` requires four; this screen has six, and absence of a state is a
defect, not a gap.

| State | Condition | Renders | AC |
|---|---|---|---|
| **Loading** | First load | Skeleton rows at 61px — the real row height, so nothing shifts when data arrives | AC-19 |
| **Refetching** | Filter change, Refresh, page move | Table dims to 60%, spinner in the toolbar. Rows are **not** replaced by skeletons — that makes a fast screen feel slow | AC-19 |
| **Empty — nothing yet** | `items` empty, no filters | Message: the log is empty. No CTA — there is no action a person takes to create an audit row | AC-11, AC-19 |
| **Empty — no matches** | `items` empty, filters active | Different message plus **Clear filters**. Never the same component as the row above | AC-11, AC-19 |
| **Error** | `500` or network | Message, `traceId`, **Retry**. Never a spinner that stops | AC-19 |
| **Forbidden** | `403` | Inline on the page: this is a Manager-only record. Shows the `traceId`. Not a toast, not a redirect — the user needs to see what they cannot do, where they tried | AC-5, AC-19 |

`401` is not a state: the session expired, so it redirects to sign-in.

A **`400`** is not a page state either — each message attaches to the filter control the
server named, `from`/`to` to both.

The two empty states are the pair most often collapsed into one. "Nothing has happened
yet" and "your filter matched nothing" call for different actions, and one component
serving both always gets one of them wrong.

## i18n keys

Namespace `audit`. Every string is a key; no literals in JSX (BR-8.8), enforced by lint.

| Key | `en` | Note |
|---|---|---|
| `audit.title` | Audit log | Page heading |
| `audit.subtitle` | Who did what, and whether it was allowed | |
| `audit.filters.entityType` | Record type | |
| `audit.filters.entityId` | Record id | Disabled until a record type is chosen |
| `audit.filters.actor` | Actor | |
| `audit.filters.action` | Action | Placeholder is the literal `Auth.`, **not** a key — it is an example value, not prose |
| `audit.filters.outcome` | Outcome | |
| `audit.filters.outcomePreset` | Denials and failures | The post-incident preset |
| `audit.filters.from` | From | |
| `audit.filters.to` | To | |
| `audit.filters.clear` | Clear filters | |
| `audit.refresh` | Refresh | |
| `audit.columns.when` | When | |
| `audit.columns.actor` | Actor | |
| `audit.columns.role` | Role | |
| `audit.columns.action` | Action | |
| `audit.columns.entity` | Record | |
| `audit.columns.label` | Label | |
| `audit.columns.outcome` | Outcome | |
| `audit.columns.trace` | Trace | |
| `audit.roleSnapshotHint` | The role held at the time of this action | Tooltip on the Role header (BR-9.6) |
| `audit.changes.expand` | Show changes | |
| `audit.changes.collapse` | Hide changes | |
| `audit.changes.from` | Before | |
| `audit.changes.to` | After | |
| `audit.changes.unrecognised` | Raw record | Heading for the `<pre>` fallback |
| `audit.empty.none` | No audit activity has been recorded yet | |
| `audit.empty.noMatches` | No entries matched these filters | Paired with Clear filters |
| `audit.error.title` | The audit log could not be loaded | Shown with `traceId` and Retry |
| `audit.forbidden` | Only a manager can read the audit log | The `403` state |
| `audit.rowsShown` | Showing {{count}} entries | **Plural key**, never concatenation (BR-8.12) |
| `audit.pager.newer` | Newer | |
| `audit.pager.older` | Older | |
| `audit.copyTrace` | Copy trace id | Icon-button `aria-label` |

Every key exists in `ar`, enforced by the parity test (BR-8.11) — not by discipline.

**Server-authored messages are not in this table.** The `400` messages arrive already
translated (BR-8.6) and are rendered as received.

**And these are never translated at all** (BR-9.10, BR-8.9): `action`, `outcome`,
`entityType`, `entityLabel`, `changes`, `traceId`, `ipAddress`, `id`. No key exists for
`Customer.Updated`, deliberately — adding one would put the audit record's meaning in a
catalogue that can drift.

## Right-to-left

A nine-column table is the highest-risk RTL layout in the product, and RTL defects here
are geometric rather than logical.

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6) |
| Layout | CSS logical properties throughout: `padding-inline`, `margin-inline-start`, `inset-inline-end`. Never `left`/`right` |
| Column order | **Mirrors.** When becomes the inline-start column in `en` and inline-end in `ar` |
| Pager | Mirrors: Newer/Older swap sides and their chevrons flip |
| `entityLabel`, values inside `changes` | `dir="auto"` — Arabic names and Arabic ticket subjects appear inside an English audit record and the reverse |
| **Does NOT mirror** | `traceId`, `ipAddress`, `userAgent`, `id`, the `Action` value, the timestamp's digits. All identifiers; Latin digits in both locales (BR-8.13) |
| **Does NOT mirror** | The `Outcome` badge's dot relative to its label — it is `gap`, not a margin, so it follows automatically. Verify rather than assume |
| Copy icon | Mirrors with the layout |
| Column widths | The Arabic headers for Outcome and Action are longer than the English. Fixed widths are set from the **longest real value plus a couple of characters, in both languages** — not from the English mock |

`FE-019-09` walks this screen in Arabic and records what it found in `tests.md`. No
assertion catches a fixed 120px column that fits `Outcome` and clips `النتيجة`.

## Accessibility

| Requirement | Verified by |
|---|---|
| A real `<table>` with `<th scope="col">` — not a grid of `<div>`s. A nine-column data table is exactly what table semantics exist for | `FE-019-09` |
| Every control keyboard reachable, with a visible focus ring | `FE-019-09` |
| The row expander is a `<button>` with `aria-expanded`, and the expanded region is associated with it | `FE-019-09` |
| The `Outcome` badge carries a text label, never colour alone | `FE-019-09` |
| Copy-trace is an icon button with an `aria-label` | `FE-019-09` |
| Filter errors associated via `aria-describedby` and announced on appearance | `FE-019-09` |
| Loading and refetching announced politely — a screen-reader user must not be left reading stale rows | `FE-019-09` |
| The `Forbidden` state is in the page, in the reading order, not only a visual panel | `FE-019-09` |

## Preview before build — not optional

`FE-019-00` renders this screen with real tokens, real copy, plausible data volumes, all
six states, and both languages **before** anything is wired.

It matters more here than on a form, for two reasons:

1. **There is no approved design to fall back on.** This spec is the first time the screen
   has existed, so the preview is the review, not a formality.
2. **Nine columns is where a table stops fitting.** A `userAgent` string is 400 characters
   and a `traceId` is 55; discovering that the table needs a horizontal scroll container,
   or the responsive card fallback from `layout-patterns.md`, costs minutes in a preview
   and hours after the screen has tests, translation keys and query wiring (ADR-009,
   `docs/sdd/design/preview-first-workflow.md`).

The preview must include: an Arabic `entityLabel` in an English layout, a row with
`changes: null`, a row with an unrecognised `changes` shape, a 400-character `userAgent`,
an `actorEmail` long enough to truncate, and the `Forbidden` state.

## Not on this screen

| Excluded | Where |
|---|---|
| Export to CSV or JSON | Out of scope in `spec.md`. It is also a bulk extraction of personal data, and Q-9 has no answer yet |
| Any edit, delete, or annotate control | BR-9.5. There is no endpoint, and `DENY UPDATE, DELETE` means there could not be one |
| Numbered pagination and a total count | `research.md` R-4. The shared pagination pattern does not apply — Newer/Older instead |
| A status tab bar with counts | No counts exist. `outcome` lives in the filter bar |
| Free-text search across all columns | Not in FR-6.7; `action` prefix is the search that was asked for |
| Searching inside `changes` | No JSON index (ADR-013). It would be the slowest query in the system |
| Alerting on repeated `Auth.LoginFailed` | Named in ADR-008 as valuable and out of scope here. Detecting a pattern is not reading a log |
| A link from `entityId` to the record | Deliberate. The record may be deleted (BR-9.12) — a link that is broken half the time is worse than a label that is always right. Copying the id is offered instead |
| Auto-refresh, live tail, "new entries" banner | Every fetch writes a row. See the rule at the top |
