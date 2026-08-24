# 021 — Frontend Spec

**Screen:** Ticket detail — **Messages** panel · **Route:** `/tickets/:id` ·
**Story:** US-012 · **Who can reach it:** any authenticated support user. **Who can
send:** a Manager on any ticket; an Agent on a ticket assigned to themselves or
unassigned (spec Q-A)

The screen itself is
[`docs/sdd/design/screens/04-ticket-detail.md`](../../docs/sdd/design/screens/04-ticket-detail.md),
which `010` built. This feature adds one panel to it and does not restructure the screen.
That screen spec gains a Messages section — `DOC-021-04`.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

---

## Why there is UI at all

This feature exists because a named module that resolves to one enum column reads as
missing (`spec.md`, Understanding). A seam with no visible surface would have the same
problem one layer up: correct, tested, and invisible. The panel is the smallest thing
that makes the module something a reviewer can *use*, and its states are where the
interesting behaviour lives — a `Failed` delivery is not an error page, it is a row.

## Components

| Component | Kind (ADR-011 §4) | Fetches? |
|---|---|---|
| `TicketDetailPage` (existing, `010`) | Route / page | **Yes** — owns `useInteractions`, `useSendableChannels`, `useSendMessage` |
| `TicketMessagesPanel` | Feature component | No — data and handlers as props |
| `SendMessageForm` | Feature component | No |
| `InteractionList` | Feature component | No |
| `DeliveryStatusBadge` | Feature component over the `Badge` primitive | No |
| `Select`, `Input`, `Button`, `Badge`, `Toast` | Primitive (`006`) | No |

Fetching only at the route level (ADR-011 §4). All three requests are known when the
route renders, so the panel never introduces a waterfall by mounting and then fetching.

**No ninth primitive.** `DeliveryStatusBadge` maps two enum values onto the existing
`Badge`, the same way the ticket status badge does. A new primitive needs a written
reason (ADR-009) and "the badge has different words in it" is not one.

## Placement

```text
┌ Ticket detail ────────────────────────────────────────────────┐
│ Header · number · subject · status · priority                 │
├───────────────────────┬───────────────────────────────────────┤
│ Sidebar               │ Tabs:  Timeline │ Messages            │
│ Status · Customer     │ ─────────────────────────────────      │
│ Assignee · Channel    │  ┌ InteractionList ───────────────┐   │
│                       │  │ channel · recipient · status   │   │
│                       │  │ body                           │   │
│                       │  └────────────────────────────────┘   │
│                       │  ┌ SendMessageForm ───────────────┐   │
│                       │  │ [channel ▾] [body        ] [→] │   │
│                       │  └────────────────────────────────┘   │
└───────────────────────┴───────────────────────────────────────┘
```

A **tab beside Timeline**, not merged into it. The timeline is comments plus history
(BR-5.7) and merging a third source changes `013`'s contract and its pagination boundary
(spec Q-C). Two tabs also make the distinction visible: Timeline is what the team wrote,
Messages is what the customer was sent.

## Fields

| Field | Control | Required | Client rule | Mirrors |
|---|---|---|---|---|
| `channel` | `Select` | yes | Options come **from `GET /api/communications/channels`**, never a constant | AC-4, AC-22 |
| `body` | `Input` multiline | yes | 1–4000, not whitespace-only | AC-1 |

Two fields, and one of them is not free input. There is no recipient field: the address
comes from the ticket's customer (spec A-5). The panel **displays** the resolved
recipient beside the channel select, read-only, so the agent can see where it is going
before sending — that is not a form field, it is confirmation.

## States

| State | What the user sees | AC |
|---|---|---|
| **Loading** | Skeleton rows in the list; the composer disabled until the channel list has arrived — a `Select` with no options is a dead control | — |
| **Empty** | "No messages have been sent on this ticket." The composer is still there and enabled | AC-20 |
| **Validating** | Field-level message on blur, before any request | AC-22 |
| **Submitting** | Submit disabled and showing progress. A double-click sends one request — this endpoint is not idempotent, and two rows is the visible consequence | AC-22 |
| **Success — Accepted** | Optimistic-free: invalidate and refetch, `Toast` success, composer cleared. The new row shows an `Accepted` badge | AC-1 |
| **Success — Failed** | **Still a `201`.** `Toast` in a warning tone, not an error tone; the row appears with a `Failed` badge and the translated sentence for its `failureCode`. The composer keeps the body so it can be retried on another channel | AC-7, AC-22 |
| **Forbidden** | An Agent viewing someone else's assigned ticket sees the composer **absent**, with one line saying why. Not a disabled control with no explanation | AC-13 |
| **Conflict — closed ticket** | The composer is absent; one line says the ticket is closed. `Closed` is terminal, so there is no action to offer | AC-11 |
| **Conflict — no address** | Inline on the `channel` control: the server's message. Not a banner — the remedy is to pick another channel, and the message belongs on the control that changes it | AC-12 |
| **Error — unexpected** | The route-level `ErrorBoundary` from ADR-011 §5. A `500` is not a form state | — |
| **Channel list empty** | No providers are registered: the composer is replaced by one line saying sending is unavailable. The module is visibly disabled rather than showing an empty dropdown | Edge case |

Ten states for two fields. That is the point: the interesting behaviour of this feature is
entirely in what comes back, and eight of the ten are things a reviewer will try.
Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`).

### The state that is easiest to get wrong

`deliveryStatus: "Failed"` arrives with HTTP `201`. A client that branches only on the
status code renders it as a success and the user believes the message was delivered.
That is a **silent** failure in the most literal sense — the customer never receives
anything and nobody is told. `AC-22` and a Vitest case cover it, and it is called out
in `FRONTEND-API-GUIDE.md` in the same words.

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint.

| Key | `en` | Note |
|---|---|---|
| `communications.panel.title` | Messages | Tab label |
| `communications.panel.empty` | No messages have been sent on this ticket | Empty state |
| `communications.panel.unavailable` | Sending messages is unavailable | No providers registered |
| `communications.compose.channel` | Channel | Label for the `Select` |
| `communications.compose.recipient` | To | Read-only, beside the select |
| `communications.compose.body` | Message | |
| `communications.compose.submit` | Send message | |
| `communications.compose.submitting` | Sending… | |
| `communications.compose.closed` | This ticket is closed, so no message can be sent | Conflict state |
| `communications.compose.forbidden` | Only the assignee or a Manager can send a message on this ticket | Forbidden state |
| `communications.channel.Email` | Email | **Display label for an enum value.** The value stays `Email` on the wire (BR-8.7) |
| `communications.channel.WhatsApp` | WhatsApp | |
| `communications.channel.Sms` | SMS | Note the display casing differs from the enum value — which is why a label is not the value |
| `communications.status.Accepted` | Accepted | Badge label |
| `communications.status.Failed` | Not sent | Badge label. "Failed" reads as a system fault; "Not sent" is what the agent needs to know |
| `communications.failure.MockConfiguredFailure` | The channel is configured to reject messages in this environment | Mapped from `failureCode` |
| `communications.failure.unknown` | The provider did not accept this message | **Fallback for an unrecognised code.** A real provider will emit codes this catalogue does not have, and the raw code must never reach a user (AC-22) |
| `communications.sentBy` | Sent by {{name}} | Interpolated, never concatenated |
| `communications.count` | {{count}} message | Plural forms, all six CLDR categories in `ar` (BR-8.14) |

Every key exists in `ar`, enforced by the parity test (BR-8.11) — not by discipline.

**Server-authored messages are not in this table.** The `400`, `403`, `409` messages
arrive already translated (BR-8.6) and are rendered as received. Re-translating them
client-side would put the same sentence in two catalogues and let them drift.

**Enum values are never translated** (BR-8.7): `channel`, `direction`, `deliveryStatus`,
and `failureCode` travel and are compared as identifiers. The table above holds their
labels, and the mapping is client-side.

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6). The panel adds nothing |
| Layout | CSS logical properties throughout: `margin-inline-start`, `padding-inline`, `text-align: start`. Never `left` / `right` |
| Message body | `dir="auto"` on every rendered body **and** on the composer. An Arabic reply typed into an English interface is normal, and without it the punctuation lands on the wrong side and reads as a typo (ADR-007 §8) |
| `recipientAddress` | **Does not mirror.** `+966501234567` and `ali@example.com` read left-to-right in both locales, and an isolated `+` at the wrong end of a phone number looks like a data error |
| `providerMessageId` | Does not mirror. An identifier, shown in a monospace face if shown at all |
| Timestamps | Formatted per locale, Gregorian calendar, Latin digits (BR-8.13) |
| The send icon | **Mirrors.** It implies direction, so it points the way the language reads (ADR-007) |
| Badge and status dot | Do not mirror. A dot has no direction |
| Tab order | Follows visual order in both directions, which is what logical properties give for free and what absolute positioning takes away |

`FE-021-06` walks this panel in Arabic and records what it found in `tests.md`. RTL
defects are visual — no assertion catches a composer whose Arabic label wraps to two
lines and pushes the send button out of the row.

## Accessibility

| Requirement | Verified by |
|---|---|
| `Select` and the composer reachable by keyboard, with a visible focus ring | `FE-021-06` |
| Both controls have a programmatic label; the placeholder is not standing in for one | `FE-021-06` |
| The resolved recipient is associated with the channel select via `aria-describedby`, so it is announced when the channel changes | `FE-021-06` |
| Server error messages associated via `aria-describedby` and announced on appearance | `FE-021-06` |
| Submit's disabled state is conveyed, not only styled | `FE-021-06` |
| A new row appearing in the list is announced — `aria-live="polite"` on the list, so a `Failed` result is not silent to a screen reader | `FE-021-06` |
| The status badge's meaning is text, not colour alone | `FE-021-06` |

## Preview before build — not optional

`FE-021-00` renders this panel with real tokens, real copy, plausible body lengths, all
ten states, and both languages **before** anything is wired
(ADR-009, `docs/sdd/design/preview-first-workflow.md`).

The specific thing the preview is expected to catch: the Arabic for "Send message" and
for "This ticket is closed, so no message can be sent" are both longer than the English,
and the composer is a single row inside a tab panel inside a two-column screen. Finding
that the row breaks at 18px costs minutes here and hours after the panel has tests,
translation keys, and three queries wired to it.

## Not on this screen

| Excluded | Where |
|---|---|
| Inbound messages | Nowhere — no inbound path exists (`spec.md` Tension 2, `DEFERRED.md` US-013) |
| Interactions merged into the Timeline tab | `013` owns BR-5.7 (spec Q-C) |
| Interaction history on the customer profile | `018-customer-overview` |
| A retry button on a failed message | No requirement. The agent re-sends by composing again, which is one row per attempt and therefore an honest history. A retry that reuses the row would overwrite the record of the first attempt |
| Delivery progress beyond `Accepted` / `Failed` | Needs provider callbacks — out of scope (`plan.md`, the outbox) |
| Message templates or canned replies | No requirement |
| Attachments | Out of scope project-wide |
| A channel filter on the list | `research.md` R-13 |
| Editing or deleting a sent message | Nothing sent can be unsent. The row is append-only (`data-model.md`) |
