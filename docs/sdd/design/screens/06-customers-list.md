# Screen — Customers list

**Route** `/customers` · **Story** US-002 · **Agent, Manager**

## Purpose

Find an existing customer. This screen is the **preventive half of the duplicate rule** —
most duplicates are created by someone who could not find the record that existed.

## Layout

```text
Customers                                    [+ New customer]
[search name, email or phone………………]
┌──────────────────────────────────────────────────────┐
│ Name        Email        Phone      Company  Tickets │
│ rows, 61px                                           │
└──────────────────────────────────────────────────────┘
Rows per page [10 ⌄]                          ‹ 1 2 … ›
```

Simpler than the ticket list on purpose: no tabs, no filter panel. A customer has no
status to filter on, and adding a panel with one control in it would be furniture.

## Elements

| Element | Component | Tokens | Icon | i18n key |
|---|---|---|---|---|
| Page title | — | `--text-page-title` | — | `customers:list.title` |
| New customer | Button, Primary, md | header inline-end | `add` | `customers:new` |
| Search | Input | h40, debounce 300ms, bound to the URL | `search` | `customers:list.search` |
| Name | — | flex, ellipsis, **`dir="auto"`** | — | — |
| Email | — | fixed 220, ellipsis, `--text-secondary` | — | — |
| Phone | — | fixed 150, `tabular-nums`, E.164, Latin digits | — | — |
| Company | — | flex, ellipsis, `dir="auto"`, "—" when absent | — | — |
| Tickets count | Badge | neutral pill; 0 renders muted, not hidden | — | — |

## Actions

| # | Trigger | Guard | Request | Success | Failure |
|---|---|---|---|---|---|
| 1 | Search | ≥1 char | `GET /api/customers?search=` | List refetches, URL updates | Error state |
| 2 | Row click | — | — | Navigate `/customers/:id` | — |
| 3 | New customer | — | — | Navigate `/customers/new` | — |
| 4 | Page change | — | `&page=` | Refetch | — |

Search matches name, email, and phone, case-insensitively. A term containing `%`, `_`,
or a quote is treated as literal text (AC-8).

## States

| State | Condition | Renders |
|---|---|---|
| Loading | — | Skeleton rows at 61px |
| Empty — none exist | No customers, no search | Illustration plus CTA |
| Empty — no matches | Search active | Different message, `Clear search`, and a create-new CTA carrying the search term |
| Error | — | Message, `traceId`, retry |

The second empty state matters more than it looks: this is the exact moment someone is
about to create a duplicate. Offering "create with this term" is helpful; offering it
without first having shown a real search would be the thing that causes duplicates.

## RTL

Column order reverses. Names and company are `dir="auto"`. **Phone stays Latin and
LTR even in Arabic** — an E.164 number rendered right-to-left is unreadable and
un-diallable.

## Not on this screen

Filters · bulk actions · export · merge · import · inline editing.
