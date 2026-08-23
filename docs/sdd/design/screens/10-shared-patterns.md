# Shared patterns

Used across screens. Specified once here so the individual specs stay short and cannot
drift from each other.

## Confirm modal

Three variants, identical structure — taken from the house pattern.

```text
        ( icon )        circular, colour = semantics of the action
   Approve request      title, sentence case
   Are you sure you want to move ticket (TCK-2026-000042) to Resolved?
   [ optional note field ]
   [ Confirm ]  [ Cancel ]
```

| Element | Tokens |
|---|---|
| Overlay | `rgba(13,38,38,.45)` |
| Panel | white, `--radius-lg`, max-width 440, padding 24, gap 16 |
| Icon | 48px circle, `--state-*-bg` fill, `--state-*-text` glyph |
| Title | `--type-title-3` / 600 |
| Question | `--type-label-md` / `--Neutral-800` |
| Confirm | Button, Primary — **or** danger for destructive |
| Cancel | Button, Secondary-Outline, always second |

Rules:

- **The record identifier goes inside the question**, not only in the title. Confirming
  against a specific thing is what stops a mis-click on the wrong row.
- Icon and Confirm colour follow the action: green to resolve, amber to pend, red to
  close or reject.
- Focus trap; `Escape` and backdrop both cancel; focus returns to the trigger on close.
- Confirm shows a spinner and both buttons disable while the request is in flight.

## Drawer

For secondary detail: the ticket timeline, a contract viewer.

| Element | Tokens |
|---|---|
| Panel | inline-end, full height, width 480, white |
| Header | h56, `--surface-inverse` `--navy-900`, white title, close at inline-end |
| Body | padding 24, scrolls |

**The rule: secondary detail opens in a drawer; a decision opens in a modal.** A drawer
keeps the record visible behind it; a modal demands an answer. Getting this backwards is
what makes an interface feel obstructive.

## Toast

| Kind | Tokens | Behaviour |
|---|---|---|
| Success | `--state-success-bg` / `-text` | Auto-dismiss 4s |
| Error | `--state-danger-bg` / `-text` | **Manual dismiss only** |
| Info | `--state-info-bg` / `-text` | Auto-dismiss 4s |

Bottom inline-end, stacked, max three. Errors do not auto-dismiss — an error that
disappears before it is read is an error that was not reported.

A toast never carries the only copy of information the user needs. If it matters after
four seconds, it belongs on the page.

## The four states, every screen

| State | Rule |
|---|---|
| **Loading** | Skeletons matching the real element heights, so nothing shifts when data arrives |
| **Empty** | Distinguish "nothing exists yet" from "nothing matched". Different message, different action. Never the same component |
| **Error** | Message, `traceId`, retry. Never a bare spinner that stops |
| **Forbidden** | Inline beside the control, not a toast. The user needs to see what they cannot do, where they tried to do it |

Loading and refetching are different: first load uses skeletons; a refetch dims the
existing content and shows a spinner in the toolbar. Replacing populated rows with
skeletons on every filter change makes a fast interface feel slow.

## Pagination

```text
Rows per page [10 ⌄]                     ‹ 1 2 3 … 13 ›
```

- Rows per page: 10 / 20 / 50 / 100. Above 100 clamps, never rejects (BR-7.2).
- Active page filled `--navy-900`; others Secondary-Outline.
- Digits stay Latin in both locales.
- Chevrons mirror under RTL; the page order reverses.
- Page beyond the last returns an empty array with a correct total, and the footer
  offers a way back to page 1.

## Badge

| Use | Shape |
|---|---|
| Status | Pill h22, `--state-*-bg`, leading 7px dot, label always present |
| Priority | Pill; outline at Low and Normal, filled at High and Critical |
| Escalated | Icon only, `--red-600`, with a `title` |

**The dot is the status token; the pill is only its container.** In tab bars the dot
appears bare beside a count; in tables it sits inside a pill. One idea, two presentations.

**Never colour alone.** Every badge carries a label — colour fails for colour-blind users
and in a monochrome print.

## Form field

| Part | Spec |
|---|---|
| Label | `--type-label-md` / 500, above the field, gap 7 |
| Required | `*` in `--red-600`, **after** the label |
| Input | `--field-height-md` 47, `--field-fill`, `--field-border`, `--radius-sm` |
| Focus | border `--navy-900`, background white, 3px ring at 10% |
| Error | border `--red-600`, message below in `--type-caption` / `--state-danger-text` |
| Helper | `--type-caption` / `--text-muted`, replaced by the error when there is one |
| Counter | inline-end, appears at 90% of the maximum |

Errors appear **on blur**, not on every keystroke. Validating as someone types tells them
they are wrong before they have finished being right.
