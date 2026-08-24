# Frontend API Guide — Change Ticket Status (US-008)

Everything the frontend lane needs to build the take-action menu on `/tickets/:id`
**without waiting for the backend**. Derived from
[`contracts/ticket-status-api.md`](contracts/ticket-status-api.md), which is frozen.

> Start now. Do not wait for `BE-012-08`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the
  response to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title`
  is translated, `type` is not. This endpoint has **five** distinct `409` causes and the
  right reaction differs for each, so `res.status === 409` is not enough information
- Timestamps arrive UTC with a `Z`. Format for display client-side, in the active locale
- Enum values arrive as strings and are **not** translated. `InProgress` is an id; its
  label lives in your catalogue

## The one endpoint

`PUT /api/tickets/{id}/status`

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once the endpoint is real (ADR-011 decision
6), and the swap is a deliberate task (`FE-012-06`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-012-06.

export type TicketStatus =
  | 'New' | 'Open' | 'InProgress' | 'PendingCustomer' | 'Resolved' | 'Closed';

export interface ChangeTicketStatusRequest {
  status: TicketStatus;
  note?: string | null;         // required when closing from New or Open (BR-1.2)
  expectedVersion: string;      // base64 rowversion — REQUIRED, not optional
}

// Shape owned by 010-ticket-list-and-detail. `allowedTransitions` is added by 012.
export interface TicketDetailResponse {
  id: string;
  ticketNumber: string;         // Latin digits in every locale
  subject: string;
  status: TicketStatus;
  priority: 'Low' | 'Normal' | 'High' | 'Critical';
  category: 'Billing' | 'Technical' | 'Account' | 'General';
  channel: 'Email' | 'WhatsApp' | 'LiveChat' | 'Sms' | 'WebForm';
  customer: { id: string; fullName: string };
  assignedToUserId: string | null;
  isEscalated: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
  closedAtUtc: string | null;   // set when status became Closed (BR-1.7)
  version: string;              // the NEW token after a write — keep it
  allowedTransitions: TicketStatus[];   // [] on a Closed ticket
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId: string;
  errors?: Record<string, string[]>;    // 400 only
  currentStatus?: TicketStatus;         // on every 409 from this endpoint
  allowedTransitions?: TicketStatus[];  // on every 409 except concurrency-conflict
}
```

### Request

```http
PUT {{baseUrl}}/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab/status
Authorization: Bearer <JWT>
Accept-Language: ar
Content-Type: application/json

{ "status": "Closed", "note": "Duplicate of TCK-2026-000041.", "expectedVersion": "AAAAAAAAB9E=" }
```

`expectedVersion` is the `version` from the ticket **as the user saw it** — the value in
the TanStack Query cache that backed the render, not one refetched at submit time.
Refetching it first would defeat the entire mechanism: the write would then always agree
with the server and the user would never be told that someone else changed the ticket.
That is the single easiest way to make this feature look like it works while doing
nothing.

### Responses, and what the UI does with each

| Code | `type` | What the UI does |
|---|---|---|
| `200` | — | Toast, then replace the cached ticket with the response body. **Render the returned `allowedTransitions`** — it is already recomputed for the new status. Store the new `version` |
| `400` | `errors/validation` | Attach each `errors[field]` message to that field. `note` is the only field a user can fix here; `expectedVersion` or `status` in `errors` means a client defect, so surface it as an unexpected error rather than a form message |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in; this is not an action error |
| `403` | `errors/forbidden` | Inline message **next to the control**, not a toast — the user needs to see what they cannot do, where they tried to do it (`04-ticket-detail.md`) |
| `404` | `errors/not-found` | The ticket is gone. Full-page empty state, back to the list |
| `409` | `errors/ticket-closed` | Remove the actions entirely and hide the comment composer. Do not disable them — a disabled menu invites a second click |
| `409` | `errors/same-status-transition` | Refetch the ticket and **show nothing**. The user double-clicked or the page was stale; they did nothing wrong, and an error message here reads as an accusation |
| `409` | `errors/invalid-status-transition` | Show `detail`, then replace the actions from `problem.allowedTransitions` — no refetch needed, the rejection already carried the correct set |
| `409` | `errors/assignee-required` | Show `detail` and offer **Assign**, not another transition. The fix is an owner, not a different status |
| `409` | `errors/concurrency-conflict` | Banner above the summary strip: someone else changed this, with a `Reload`. **Never auto-retry** |

```ts
if (res.status === 409) {
  switch (true) {
    case problem.type.endsWith('/concurrency-conflict'):
      showConflictBanner();                       // reload, never retry (ADR-006)
      break;
    case problem.type.endsWith('/same-status-transition'):
      await queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      break;                                      // no message: nothing went wrong
    case problem.type.endsWith('/ticket-closed'):
      await queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      break;                                      // actions disappear with the refetch
    default:
      setActionError(problem.detail);
      setAllowedTransitions(problem.allowedTransitions ?? []);
  }
}
```

## Rules the client mirrors but is never the authority for

Every rule below is enforced server-side. The client mirrors some of them so the user is
told sooner, and it is never the authority (constitution III, ADR-003).

| Mirrored | How | Why it is still the server's rule |
|---|---|---|
| Which transitions are offered | Render `allowedTransitions` verbatim | The array comes from the domain map. **There is no client-side matrix and no `switch` on status** (AC-20) |
| The note requirement | Require a non-empty note in the close dialog when the current status is `New` or `Open` | The server returns `400` naming `note` regardless (AC-5) |
| Note length | `max(500)` in Zod | `TicketHistory.Note` is `nvarchar(500)`; the server rejects 501 |
| The `InProgress` precondition | It simply is not in `allowedTransitions` on an unassigned ticket | BR-1.3 is enforced in the domain; the filtering is what stops the UI inviting a `409` (AC-19) |

Four things the client deliberately does **not** do:

| Not done client-side | Why |
|---|---|
| Deriving the next `allowedTransitions` after a successful transition | The `200` body already carries it, recomputed (AC-23). Deriving it means a second copy of BR-1, and two copies always drift |
| Retrying on `409 errors/concurrency-conflict` | Retrying a status change without asking is guessing at intent (ADR-006). The user may not still want it |
| Refetching `version` immediately before the write | It would make the conflict undetectable — see above |
| Translating `status`, `currentStatus`, or `allowedTransitions` values | They are identifiers (BR-8.7). Only their labels are translated, from `tickets:status.*` |

## States — all seven are required

| State | Behaviour | AC |
|---|---|---|
| Loading | Skeleton for the summary strip and the action control | — |
| Idle | Action control rendered from `allowedTransitions` | AC-20 |
| Empty | `allowedTransitions` is `[]` → the control is **not rendered at all**. This is the normal state of a `Closed` ticket, not an error | AC-20 |
| Submitting | The chosen action shows progress and the control is disabled, so a double-click sends one request | AC-13 |
| Error | `detail` shown, actions replaced from the rejection | AC-21 |
| Forbidden | Inline, next to the control | AC-14 |
| Conflict | Banner with `Reload`, never an auto-retry | AC-17 |

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`).

## Localization

| Item | Rule |
|---|---|
| Status labels, action labels, dialog copy, conflict copy | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| `detail` and `title` from the server | Already translated on arrival. Render them; do not re-translate or map them |
| Enum values | Never translated. `tickets:status.inProgress` is the label; `InProgress` is the value |
| `ticketNumber` | Latin digits under `ar` (BR-8.13) |
| `dir` | Set on the document root. The note textarea and every element rendering user content carries `dir="auto"` |
| Layout | CSS logical properties. `margin-inline-start`, never `margin-left` |

Screen spec, element by element, with tokens and icons:
[`docs/sdd/design/screens/04-ticket-detail.md`](../../docs/sdd/design/screens/04-ticket-detail.md).
Feature-specific build detail: [`frontend-spec.md`](frontend-spec.md).

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/ticket-status-api.md`](contracts/ticket-status-api.md) — `REV-012-03`. A
difference is a defect in one of the two, and both are corrected, never one silently.

If the contract moves while you are building, it arrives as a **Contract changes** entry
in [`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by
the frontend failing to compile is the failure this process exists to prevent.
