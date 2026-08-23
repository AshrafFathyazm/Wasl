# Layout Patterns

Read off the Abyan "All Requests" module export. These are the **conventions** to
inherit (ADR-009 level 3) — not screens to copy.

Every pattern below maps onto something this CRM already needs, which is why the module
is a useful reference at all: it is a queue of records with a status lifecycle, a
detail view, and an approve/reject action. Structurally that is a support queue.

---

## Source note

Two sources, and they disagree. The Figma export and the shipped application at
`abyan-qc.azm.sa` differ on sidebar width, corner radius, badge shape, and row height.
**The shipped app wins** — it is what people recognise, and the Figma file is marked
"To be completed". Patterns below are from the shipped app unless stated.

---

## App shell

### Exact geometry, from layer inspect

```text
1440 × 1024 frame

┌──────────────┬──────────────────────────────────────────┐
│              │  header  1440 × 68                       │  ← border-bottom 1px
│  sidebar     │  padding 16 / 56 / 16 / 24               │
│  288 × 896   ├──────────────────────────────────────────┤
│              │                                          │
│  padding     │  content  1152 × 956                     │
│  16 / 24     │  padding 56 all round, gap 24            │
│  gap 16      │  fill Neutral/00  #F9FAFB                │
│              │                                          │
│  fill #FFF   │                                          │
│  border-     │                                          │
│  inline-end  │                                          │
│  1px         │                                          │
│  Neutral/200 │                                          │
└──────────────┴──────────────────────────────────────────┘
   288                        1152
```

The arithmetic closes exactly: `288 + 1152 = 1440`, `68 + 956 = 1024`.

Two details worth preserving:

- **The header's inline-end padding is 56, matching the content's.** So right edges
  align all the way down the page. Inline-start is 24, matching the sidebar. The
  asymmetry is considered, not an oversight.
- **Only two surfaces exist in the shell.** Sidebar and header are white; the content
  area is `Neutral/00`. The content is the sunken surface, not the chrome.

```text
┌──────────────────────┬─────────────────────────────────────┐
│ [logo] Product name ‹│  Home › Workflow Requests           │
│                      │                                     │
│  ╔══════════════════╗│  Page title                         │
│  ║  + Create Form   ║│                                     │
│  ╚══════════════════╝│  ┌ tabs ─────┐  [search][Filters][⇅]│
│                      │                                     │
│  MAIN                │                                     │
│  ▢ Forms Management  │            page content             │
│  ▢ Submissions       │                                     │
│  ▢ Integrations    ⌄ │                                     │
│  ▢ Risk Engine     ⌃ │                                     │
│  ▢ Workflow Mgmt   ⌃ │                                     │
│  │ Workflow Requests │  ← active child: left bar + bold    │
│    My Tasks / Inbox  │                                     │
│    Events Log        │                                     │
│  ▢ Users Management  │                                     │
│  ──────────────────  │                                     │
│  (a) Tenant Admin  ⌄ │                                     │
└──────────────────────┴─────────────────────────────────────┘
        320px
```

- White sidebar, **288px** (confirmed on the layer — not the 226px in the vector export
  nor the 320px estimated from a screenshot), with a collapse chevron on its outer edge.
- **A primary CTA sits at the top of the sidebar**, above the nav — not in the page
  header. It is the one create action for the whole section.
- Section caption `MAIN` — uppercase, ~11px, letterspaced, muted.
- Nav items ~46px with outline icons. Groups expand in place with a chevron.
- **Active child item:** bold label plus a solid navy bar on the inline-start edge,
  indented under its parent. The parent stays expanded.
- **User block pinned to the bottom** — avatar, name, truncated email, chevron.
- The page header carries a **breadcrumb** above the title. No primary action there,
  because the CTA lives in the sidebar.

**For this CRM:** CTA is `New ticket`. `MAIN` → Dashboard, Tickets (with children All
tickets, My tickets, Unassigned), Customers. The user block sits at the bottom.

**Settings is deliberately not in the main nav.** In their app it lives in the user
popover, and following that keeps the main nav to what an agent touches hourly. A nav
item used once a month costs the same vertical space as one used constantly.

---

## User menu popover

Opens upward from the bottom user block:

```text
  (avatar)  Tenant Admin
            tenantadmin001@test.local
  ────────────────────────────────────
  Current Workspace
    (T)  Test001                    ✓
         Tenant Admin
  ────────────────────────────────────
  ⚙  Settings
  ⏻  Logout                    (red)
```

- Identity header, then a labelled section, then actions — dividers between all three.
- The current selection is marked with a **green check**, not by highlighting the row.
- `Logout` is the only red item in the whole navigation. Red is reserved for
  destructive and terminal actions, which is consistent with the badge palette.

**For this CRM:** no workspace concept, so the middle section becomes the role badge —
`Agent` or `Manager`. Same structure, one section lighter.

---

## Login page

```text
┌──────────────────────┬──────────────────────────── [🌐 EN] ┐
│                      │                                     │
│  dark navy panel     │        [logo]                       │
│  + dot grid          │        Login                        │
│  + gradient orbs     │        Welcome! Let's get you …     │
│                      │                                     │
│  Your gateway to     │        Email Address                │
│  digital compliance. │        [___________________]        │
│                      │        Password                     │
│  Designed to help    │        [_______________ 👁]         │
│  you stay compliant… │        ☑ Remember me   Forgot?      │
│                      │        [ reCAPTCHA ]                │
│                      │        [      Login      ]          │
│                      │                                     │
│                      │        © 2025 Abyan.                │
└──────────────────────┴─────────────────────────────────────┘
     ~35%                          ~65%
```

- **Split layout.** Dark navy brand panel on one side, white form on the other. Under
  RTL the panel moves to the other edge — this is a `flex` order, not a float.
- The dark panel carries a **subtle dot grid** and **soft blurred gradient orbs**
  (blue → teal) bleeding off the bottom corner. This is the only decorative surface in
  the entire product.
- Headline is large and tight; supporting line is muted and small.
- **Language switcher top-right**, globe icon plus code. Present *before* sign-in —
  someone who cannot read English cannot find a switcher that appears after login
  (US-014 AC-1 says the same thing, independently).
- Inputs are filled light grey with a hairline border, ~48px, radius ~8px. Password has
  a trailing eye toggle.
- `Remember me` checkbox on the inline-start, `Forgot password?` link on the
  inline-end, same row.
- Primary button is full-width and matches the input width exactly.
- Footer copyright, muted, bottom of the form column.

**Note on the button colour in the screenshot:** it renders muted purple while the
captcha is unchecked. That is the **disabled** state, not the brand colour. The primary
is the navy used by the sidebar CTA and the active pagination page. Reading the disabled
state as the brand colour is an easy and expensive mistake.

**For this CRM:** same skeleton, no captcha. Left panel copy becomes the product's own.
The dark panel and the orbs are the piece worth keeping — they are what makes the login
recognisable.

---

## Settings page

- Back chevron plus title, above everything.
- **Two-level left sub-nav** with its own section captions (`General`,
  `Workspace Experience`). Active item: navy inline-start bar plus a tinted row.
- Content: section title, one muted line of description, then cards.
- Required fields marked with a **red asterisk after the label**.
- Two-column field grid at desktop width.
- Note that `Localization` is a first-class settings page in the shipped app — the
  product treats language as a user-level setting, which is what US-014 assumes.

**For this CRM:** `General` → Profile, Localization. That is the whole settings surface;
anything more is scope that no story asked for.

---

## List page

Stacked top to bottom:

1. **Page header** — title left, one primary button right
2. **Status tab bar with counts** — `All 20 | In progress 20 | Approved 20 | Rejected 20`
3. **Toolbar** — search left, `Filters` and `Actions` right
4. **Table**
5. **Footer** — `Rows Per Page 10` left, pagination `1 2 3 … 100` right

The tab bar is the notable part. Status is the primary axis of navigation and is
promoted **out of** the filter panel into always-visible tabs with live counts.
Everything else lives behind `Filters`.

**For this CRM:** the tabs are the ticket statuses. Six is too many for a tab bar, so
group them — `All | Open | In progress | Resolved | Closed` — and leave the precise
status filter in the panel. That grouping decision belongs in US-006's spec.

---

## Filter panel

Opens **inline below the toolbar**, not as a drawer. Two-column grid of controls,
`Clear` and `Apply` bottom-right.

`Apply` means filters are **explicit**, not live-as-you-type. That is the right default
for a filter set that triggers a server round trip.

**Note this conflicts with US-006's current plan**, which assumes filters apply
immediately and live in the URL. Both are defensible; pick one and record it. The URL
binding (AC-14) works either way.

---

## Table

In the shipped app: column headers carry a **sort arrow and a per-column `…` menu**,
sitting on a tinted header row. Rows are ~61px — roomier than the export's 44px.

Status is a **pill with a leading dot**, not a solid block: light tinted background,
coloured dot, coloured text. Two variants seen — blue (`InReview`, `WaitingForClient`)
and amber (`In Progress`).

The tab bar uses the **same dot, without the pill**: `All 558` plain, then a green dot
for Submitted, grey for In Review, red for Cancelled, each with its count. So the dot
is the status token and the pill is just its container — a small, consistent idea worth
copying.

Columns observed in the Figma export: `# · Name · Creation Date · Status · AML Score ·
Screening · Risk · Product · File · Actions`.

- Status is a **filled badge**, not text.
- Two numeric columns render as **percentage plus an inline progress indicator**.
- Risk is a **pill** carrying both label and value: `High Risk : 80%`.
- Last column is a row action menu.

Their own notes flag the hover state as unresolved: *"table needs to be separated by
rows not columns"*. So row-level hover is the intended behaviour and is not yet built —
which means you are free to implement it and should.

**For this CRM:** `# · Subject · Customer · Created · Status · Priority · Channel ·
Assignee · Actions`. Priority takes the risk-pill treatment. There is no percentage
column, so the progress indicator is not needed.

---

## Card view

One frame renders the same records as stacked `label : value` cards instead of a table.

This is the responsive fallback — a table with nine columns cannot work on a narrow
screen, and this is their answer rather than horizontal scrolling. Worth inheriting.

---

## Detail page

```text
┌──────────┬────────────────────────────────────────────────┐
│ summary  │  Request Details      [Logs] [Download] [Take │
│ rail     │                                        Action] │
│          │  ┌──────────────────────────────────────────┐ │
│ · score  │  │ Request Number · Status · Company ·      │ │
│ · score  │  │ Request by · Creation Date · Product     │ │
│          │  └──────────────────────────────────────────┘ │
│ · anchor │                                                │
│ · anchor │  ▸ Business Information            (expanded)  │
│ · anchor │  ▸ Registered Address & Contact                │
│ · anchor │  ▸ Ownership & Management                      │
│ · anchor │  ▸ Business Activity & Operations              │
│          │  ▸ Banking Details                             │
│          │  ──────────────────────────────────────────── │
│          │  [Go Back]                       [Take Action] │
└──────────┴────────────────────────────────────────────────┘
```

Four things worth stealing:

- **A key-value summary strip** directly under the title. The facts you need at a glance
  are never behind a scroll.
- **A left rail that doubles as section anchors** and carries the derived scores.
- **Accordion sections** for the body, with the first expanded.
- **A sticky bottom action bar** repeating the primary action. Long detail pages
  otherwise make you scroll back up to act.

**For this CRM:** summary strip = ticket number, status, customer, assignee, created,
channel. Rail = priority, escalated flag, section anchors. Sections = Description,
Timeline, Comments. Bottom bar = `Go back` and the status action.

---

## Take Action

A dropdown on the primary button listing exactly the transitions available:
`Approve Request · Pending Request · Reject Request`. Selecting one opens a confirm
modal.

**This is a direct match for `allowedTransitions`.** Their menu is hard-coded to three
options because their lifecycle has three outcomes; this CRM's would render from the
array the API already returns (ADR-004). Same component, driven by data instead of
by a literal.

---

## Confirm modal

Centred, small, and identical in structure across all three variants:

```text
        ( ✓ )        circular icon, colour = semantics of the action
   Approve request   title, sentence case
   Are you sure you want to confirm request (#12345) approval?
   [ Confirm ]  [ Cancel ]
```

- The icon colour and the `Confirm` button colour both follow the action:
  green for approve, amber for pending, red for reject.
- **The record identifier is in the question**, not just in the title. The user confirms
  against a specific thing, which is what stops a mis-click on the wrong row.
- `Cancel` is always secondary and always second.

**For this CRM:** the close-ticket dialog adds a required note field (BR-1.2) above the
buttons. Everything else is unchanged.

---

## Right drawer

Used for `Request Overview`, `Sanction Screening Details`, `Request Logs`, and the
contract viewer. Full height, **dark indigo header** with the title and a close `×`,
white body.

The rule appears to be: **secondary detail opens in a drawer, actions open in a modal.**
A drawer keeps the underlying record visible; a modal demands a decision.

**For this CRM:** the ticket timeline is secondary detail → drawer. The status change is
a decision → modal.

---

## Status colour semantics

| Their state | Colour | Nearest CRM state |
|---|---|---|
| Approved | Green | `Resolved` |
| In progress | Amber | `InProgress` |
| Rejected | Red | — no equivalent |
| Low / Medium / High risk | Green / Amber / Red | `Low` / `Normal`+`High` / `Critical` |

Their lifecycle has three states; this CRM has six. Three colours are supplied and
three states — `New`, `Open`, `PendingCustomer`, `Closed` — have no mapping.

**Decided.** Recorded here and in `design/tokens.css`; US-008 implements it:

| Status | Treatment |
|---|---|
| `New` | Neutral gray — untriaged is the absence of a state, not a state |
| `Open` | Info blue — accepted, waiting |
| `InProgress` | Amber, matching theirs |
| `PendingCustomer` | Amber **outline** rather than filled — waiting, but not on us |
| `Resolved` | Green, matching theirs |
| `Closed` | Neutral gray, outline — terminal and quiet |

Red is reserved for `Critical` priority and for the escalated flag, so that red on a
ticket always means "this needs attention now" and never "this ended badly".

**The dot is the status token; the pill is only its container.** In the tab bar the dot
appears bare with a count; in the table it sits inside a tinted pill with a label. One
idea, two presentations — taken directly from their shipped app.

Every badge carries a label. Colour alone fails for colour-blind users and in a
monochrome print.
