# Screen — App shell

**Route** wraps every authenticated route · **Reachable by** Agent, Manager

## Purpose

Persistent navigation and identity. Everything else renders inside it.

## Layout

Exact geometry, confirmed on layers (`design/tokens.css`):

```text
1440 × 1024
┌──────────────┬──────────────────────────────────────┐
│ sidebar      │ header 68 · border-bottom 1px        │
│ 288 × 956    │ padding 16 / 56 / 16 / 24            │
│ padding      ├──────────────────────────────────────┤
│ 16 / 24      │ content 1152 × 956                   │
│ gap 16       │ padding 56 · gap 24                  │
│ border-      │ surface Neutral/00                   │
│ inline-end   │                                      │
└──────────────┴──────────────────────────────────────┘
```

`288 + 1152 = 1440`. `68 + 956 = 1024`.

## Elements

| Region | Element | Component | Tokens | Icon | i18n key |
|---|---|---|---|---|---|
| Sidebar | Brand tile + name | — | 32px tile `--navy-900` `--radius-md`; name `--type-label-md` / 700 | mark | `common:productName` |
| Sidebar | Collapse toggle | Icon button | on the outer edge | `chevronDown` rotated | `common:nav.collapse` |
| Sidebar | Primary CTA | Button, Primary, md | h40, full width, gap 4 | `add` | `tickets:new` |
| Sidebar | Section caption | — | `--type-caption` / 600 / uppercase / tracking .07em / `--text-placeholder` | — | `common:nav.main` |
| Sidebar | Nav item | — | h48, `--radius-sm`, hover `--surface-content` | per item | per item |
| Sidebar | Nav child | — | h40, inset 32, active: 3px `--navy-900` bar inline-start + 600 | — | per item |
| Sidebar | User block | — | pinned bottom, `border-top` 1px `--Neutral-200`, padding-top 16 | `chevronDown` | — |
| Sidebar | Avatar | Avatar | 32px circle, `--navy-900`, initials | — | — |
| Header | Breadcrumb | — | `--type-label-md`, trail `--text-muted`, current `--text-primary` / 500 | — | per route |
| Content | — | — | `--surface-content`, padding 56, gap 24 | — | — |

### Nav structure

```text
MAIN
  Dashboard              dashboard
  Tickets                ticket        ⌄
    All tickets
    My tickets
    Unassigned
  Customers              customer
```

**Settings is not in the nav.** It lives in the user popover, following the house
pattern — a destination used monthly costs the same vertical space as one used hourly.

## Collapse

Three states, not two. Treating it as a binary is the usual mistake.

| State | Width | When |
|---|---|---|
| Expanded | 288px | Default above 1100px |
| Collapsed | 68px | User toggled, or auto below 1100px |
| Drawer | Overlay | Below 780px — the sidebar leaves the flow entirely |

The toggle is a 26px circle **on the sidebar's outer edge**, half-overlapping the
border. Chevron rotates 180°. Under RTL it mirrors, and so does the direction of
collapse.

### The nested item is the hard part

`Tickets` has three children. Collapsed, there is no room to show them inline, and
this is where most implementations quietly break — the children simply become
unreachable.

**A flyout on hover and on focus.** It opens beside the icon, carries the parent's name
as a heading, and lists the children. There is a 140ms delay on close so the pointer can
travel from the icon to the panel without it vanishing — without that delay the flyout
is unusable with a mouse.

Leaf items get a **tooltip** instead. An icon on its own is a guess; the tooltip is what
makes a collapsed sidebar navigable rather than merely narrow.

Both the flyout and the tooltip must open on **focus**, not just hover, or the collapsed
sidebar becomes unusable by keyboard.

### What else changes

| Element | Collapsed |
|---|---|
| Lockup | Tile only; the wordmark fades and its width collapses |
| Primary CTA | Icon only, and it **needs an `aria-label`** — the visible text is gone |
| Section caption `MAIN` | Hidden, height animated to 0 |
| Active indicator | Stays; inset moves from 0 to 2px so it does not touch the edge |
| User block | Avatar only, name in a tooltip |

### Persistence

`localStorage`, per user, not per session. Someone who collapses it means it.

Restored **before first paint**, like the theme — otherwise the sidebar renders expanded
and snaps narrow on every load.

### Animating width — a deliberate exception

`DESIGN-BRIEF.md` rule 19 says never animate `width`, because it forces a layout pass
per frame.

**This is the exception, and it is stated rather than quietly broken.** The rule exists
to prevent per-frame layout on many elements during scroll or list rendering. Here it is
one container, once, on a deliberate user action, over 220ms. The alternative —
transforming a fixed-width panel — would overlay the content instead of letting it
reclaim the space, which is the wrong behaviour for a persistent sidebar.

Any other place that wants to animate `width` needs the same kind of written argument.

## User popover

Opens upward from the user block.

| Element | Tokens | i18n key |
|---|---|---|
| Identity header — name, email | `--type-label-md` / `--type-caption` | — |
| Divider | 1px `--Neutral-200` | — |
| Role row + check | `--state-success-text` check | `common:role.agent` / `.manager` |
| Divider | | |
| Settings | icon + label | `common:nav.settings` |
| Sign out | `--red-600` — the only red item in the navigation | `auth:signOut` |

## Actions

| # | Trigger | Request | Success | Failure |
|---|---|---|---|---|
| 1 | Nav item | — | Route change; active state moves | — |
| 2 | CTA | — | Navigate `/tickets/new` | — |
| 3 | Collapse | — | Sidebar to icon-only; state persists to `localStorage` | — |
| 4 | Sign out | — | Clear token, redirect `/login` | — |
| 5 | Group expand | — | Children show; parent stays expanded while a child is active | — |

## States

| State | Renders |
|---|---|
| Collapsed sidebar | Icons only; labels become tooltips; width to 72 |
| Long email | Truncates with ellipsis; full value in `title` |
| Manager | Same nav — the roles differ in permissions, not in navigation |

## RTL

Sidebar moves to the inline-end. Breadcrumb separators reverse. The active-item bar is
`inset-inline-start`, so it follows automatically. The collapse chevron mirrors; the
brand mark does not.

## Not in the shell

Global search · notification bell · workspace switcher · help widget · theme toggle
(one appearance only — ADR-009).
