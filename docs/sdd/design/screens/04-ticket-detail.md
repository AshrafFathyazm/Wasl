# Screen — Ticket detail

**Route** `/tickets/:id` · **Stories** US-005, US-007, US-008, US-010 · **Agent, Manager**

The densest screen in the product. Almost every business rule surfaces here.

## Layout

```text
‹ Back    TCK-2026-000042              [Timeline] [Take action ⌄]
┌──────────┬───────────────────────────────────────────────────┐
│ rail     │ ┌ summary strip ───────────────────────────────┐  │
│ 240      │ │ Status · Customer · Assignee · Channel ·     │  │
│          │ │ Priority · Created                            │  │
│ priority │ └───────────────────────────────────────────────┘  │
│ escalated│                                                    │
│          │ ▾ Description                          (expanded)  │
│ anchors  │ ▸ Comments                                         │
│          │ ▸ Activity                                         │
├──────────┴───────────────────────────────────────────────────┤
│ ‹ Back                                        [Take action ⌄] │
└───────────────────────────────────────────────────────────────┘
```

Four things taken from the house pattern: a key-value summary strip under the title, a
left rail that doubles as section anchors, accordion body sections, and a **sticky bottom
action bar** so a long page never forces a scroll back up to act.

## Elements

| Region | Element | Component | Tokens | Icon | i18n key |
|---|---|---|---|---|---|
| Header | Back | Button, Secondary-Outline, md | h40 | `chevronDown` rotated | `common:back` |
| Header | Ticket number | — | `--type-title-1` / 700, `tabular-nums`, Latin digits | — | — |
| Header | Timeline | Button, Secondary-Outline | opens the drawer | `comment` | `tickets:timeline` |
| Header | Take action | Button, Primary + menu | renders from `allowedTransitions` | `chevronDown` | `tickets:takeAction` |
| Strip | Key-value pair | — | label `--type-caption` / `--text-muted`; value `--type-label-md` | — | per field |
| Strip | Status | Badge | per BR-1 colour map | — | `tickets:status.*` |
| Rail | Priority | Badge, large | filled at High and Critical | — | `tickets:priority.*` |
| Rail | Escalated | Callout | `--state-danger-bg`, shows reason and who | `escalate` | `tickets:escalated.by` |
| Rail | Anchors | — | active gets 3px `--navy-900` bar inline-start | — | per section |
| Body | Section header | — | h48, `--type-title-3` / 600, chevron at inline-end | `chevronDown` | per section |
| Body | Description | — | `--type-body-md`, `--leading-normal`, **`dir="auto"`**, preserves line breaks | — | — |
| Body | Comment | — | avatar + name + relative time + body `dir="auto"` | — | — |
| Body | Internal badge | Badge | `--state-warning-bg` outline | — | `tickets:comment.internal` |
| Body | Composer | Textarea + controls | hidden entirely when Closed, not disabled | — | `tickets:comment.placeholder` |
| Body | Internal toggle | Checkbox | | — | `tickets:comment.markInternal` |
| Body | Channel select | Select | optional | `chevronDown` | `tickets:comment.channel` |
| Body | Send | Button, Primary, md | disabled while body is empty | `add` | `tickets:comment.send` |
| Footer | Sticky bar | — | white, `border-top` 1px, `position: sticky; bottom: 0` | — | — |

## Take-action menu

**Rendered from `allowedTransitions` on the response. The client holds no copy of the
state machine** (ADR-004). If the array is empty — a Closed ticket — the button is not
rendered at all.

| Menu item | Condition | Opens |
|---|---|---|
| Move to Open | in array | Confirm |
| Start work | in array | Confirm; **rejected server-side if unassigned** (BR-1.3) |
| Wait on customer | in array | Confirm |
| Resolve | in array | Confirm |
| Close | in array | Confirm **with a required note** (BR-1.2) |
| Assign / Reassign | Manager, or Agent self-assigning an unassigned ticket (BR-2) | Assignee picker |
| Escalate | Manager only, not Resolved or Closed, not already escalated (BR-3) | Reason dialog |

## Actions

| # | Trigger | Guard | Request | Success | Failure |
|---|---|---|---|---|---|
| 1 | Status change | Confirm accepted | `PUT /tickets/:id/status` with `expectedVersion` | Toast, refetch ticket and timeline | `409 invalid-status-transition` → message + refetch actions · `409 concurrency-conflict` → explain and offer reload, **never auto-retry** · `403` → not permitted |
| 2 | Close | Note non-empty | same, `note` | Toast, actions disappear, composer hides | `400` → field error on the note |
| 3 | Assign | Per BR-2 | `PUT /tickets/:id/assignee` | Toast, strip updates, activity row appears | `403` · `400` inactive user · `409` closed |
| 4 | Escalate | Manager | `POST /tickets/:id/escalate` | Rail callout appears; priority raised to a **floor** of High, never lowered | `409` already escalated · `403` |
| 5 | Add comment | Body non-empty ≤4000 | `POST /tickets/:id/comments` | Prepend optimistically, reconcile on response | `409 ticket-closed` → hide composer, explain |
| 6 | Open timeline | — | `GET /tickets/:id/timeline` | Drawer, newest page first | Error inside the drawer |
| 7 | Anchor click | — | — | Expand and scroll to section | — |

## States

| State | Condition | Renders |
|---|---|---|
| Loading | First load | Skeleton for strip, rail, and first section |
| Not found | `404` | Full-page empty state, back to list |
| Forbidden action | `403` | Inline message near the control, not a toast — the user needs to see what they cannot do, next to it |
| Concurrency conflict | `409` | Banner above the strip: someone else changed this, with `Reload` |
| Closed ticket | `Status = Closed` | No action button, no composer; `Closed` badge outline; timeline read-only |
| Unassigned | `AssignedToUserId` null | "Unassigned" in the strip; `Start work` visibly unavailable with a reason |
| No comments | Empty | Empty state inside the section, composer still shown |

## RTL

Rail moves to the inline-end. Anchor bars follow via `inset-inline-start`. The back
chevron mirrors; the up-arrow inside the escalate icon does **not** — vertical meaning
has no direction. Description and comments keep `dir="auto"`; the ticket number stays
Latin.

## Not on this screen

Editing a comment · deleting a comment · attachments · reopening a closed ticket ·
merging or linking tickets · time tracking · SLA countdown · related tickets.
