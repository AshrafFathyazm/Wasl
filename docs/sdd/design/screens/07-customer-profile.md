# Screen — Customer profile

**Route** `/customers/:id` · **Stories** US-002, US-004 · **Agent, Manager**

## Layout

```text
‹ Back    Riyadh Holdings Group                      [Edit]
┌──────────┬───────────────────────────────────────────────┐
│ rail     │ ┌ contact strip ────────────────────────────┐ │
│ 240      │ │ Email · Phone · Company · Since           │ │
│          │ └────────────────────────────────────────────┘ │
│ counts   │                                                │
│ by status│ ▾ Tickets              [+ New ticket]          │
│          │   the 10 most recent, newest first             │
│ anchors  │ ▸ Notes                                        │
└──────────┴───────────────────────────────────────────────┘
```

Same skeleton as the ticket detail. Two screens that share a shape are two screens
someone only has to learn once.

## Elements

| Region | Element | Component | Tokens | Icon | i18n key |
|---|---|---|---|---|---|
| Header | Customer name | — | `--type-title-1` / 700, **`dir="auto"`** | — | — |
| Header | Edit | Button, Secondary-Outline | US-003; hidden until that ships | — | `common:edit` |
| Strip | Email | — | `--type-label-md`, `mailto:` link, LTR always | `email` | `customers:field.email` |
| Strip | Phone | — | `tabular-nums`, LTR always, `tel:` link | `sms` | `customers:field.phone` |
| Strip | Company | — | `dir="auto"`, "—" when absent | — | `customers:field.company` |
| Strip | Since | — | `createdAtUtc`, locale-formatted, Gregorian | — | `customers:field.since` |
| Rail | Counts by status | — | one row per status: dot, label, count | — | `tickets:status.*` |
| Rail | Total | — | above the breakdown, `--type-title-3` | — | `customers:ticketTotal` |
| Body | Ticket row | — | h61, number + subject + status + created | — | — |
| Body | New ticket | Button, Primary, md | inside the section header; pre-fills this customer | `add` | `tickets:new` |
| Body | Notes | — | `--type-body-md`, `--leading-normal`, `dir="auto"`, preserves breaks | — | `customers:field.notes` |

## Actions

| # | Trigger | Request | Success | Failure |
|---|---|---|---|---|
| 1 | Load | `GET /api/customers/:id/overview` | Renders strip, counts, recent tickets | `404` → full-page not-found · `400` malformed id |
| 2 | Ticket row | — | Navigate `/tickets/:id` | — |
| 3 | New ticket | — | `/tickets/new?customerId=…`, customer pre-selected | — |
| 4 | See all tickets | — | `/tickets?customerId=…` — the ticket list, filtered | — |

The counts come from **one grouped query, not one query per status** (US-004 AC-4).
Asserted by an executed-command count in the integration test, because the naive
implementation is the one that gets written.

## States

| State | Condition | Renders |
|---|---|---|
| Loading | — | Skeleton strip, rail, and three rows |
| Not found | `404` | Full-page state, back to the list |
| No tickets | Counts all zero | Section empty state plus the create CTA; counts render as 0, not hidden |
| No notes | Empty | Muted "no notes" |
| More than 10 tickets | — | The 10 newest, plus `See all` |

## RTL

Rail moves to the inline-end. **Email and phone stay LTR inside an RTL layout** — an
address or an E.164 number reversed is unusable. Name, company, and notes are
`dir="auto"`.

## Not on this screen

Editing inline · deactivating · merging · full interaction feed across channels ·
attachments · per-customer SLA.
