# Frontend API Guide — Escalate Ticket (US-009)

Everything the frontend lane needs to build the escalate action on `/tickets/:id`
**without waiting for the backend**. Derived from
[`contracts/ticket-escalate-api.md`](contracts/ticket-escalate-api.md), which is frozen.

> Start now. Do not wait for `BE-016-05`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the response
  to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title` is
  translated, `type` is not
- Timestamps arrive UTC with a `Z`. Format for display client-side, in the active locale

## The one endpoint

`POST /api/tickets/{id}/escalate`

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once the endpoint is real (ADR-011 §6), and the
swap is a deliberate task (`FE-016-07`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-016-07.

export type TicketPriority = 'Low' | 'Normal' | 'High' | 'Critical';
export type TicketStatus =
  | 'New' | 'Open' | 'InProgress' | 'PendingCustomer' | 'Resolved' | 'Closed';

export interface EscalateTicketRequest {
  reason: string;              // 1..500 after trim
  expectedVersion: string;     // base64 rowversion from the loaded ticket — REQUIRED
}

export interface UserSummary {
  id: string;
  displayName: string;
}

/** The escalation-relevant slice of the ticket read shape. The rest is owned by 010. */
export interface TicketEscalationFields {
  priority: TicketPriority;        // AFTER the floor. Read it; never compute it.
  isEscalated: boolean;
  escalatedAtUtc: string | null;   // ISO 8601, Z
  escalatedBy: UserSummary | null;
  escalationReason: string | null; // user content — render with dir="auto"
  canEscalate: boolean;            // the server's answer. Render the action from this.
  version: string;                 // NEW rowversion after the call; the old one is stale
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId: string;
  errors?: Record<string, string[]>;   // 400 and the not-escalatable 409 only
}
```

### Request

```http
POST {{baseUrl}}/api/tickets/3a7f9c10-1111-4222-8333-444455556666/escalate
Authorization: Bearer <JWT>
Accept-Language: ar
Content-Type: application/json

{ "reason": "العميل حساب استراتيجي وينتظر منذ أربعة أيام.", "expectedVersion": "AAAAAAAAB9E=" }
```

`expectedVersion` is **required** — same as `PUT /status` and `PUT /assignee`. Take it from
the `version` on the ticket you loaded. The response carries a **new** `version`; replace
the cached one or the next mutation gets a `409`.

### Responses, and what the UI does with each

| Code | `type` | What the UI does |
|---|---|---|
| `200` | — | Replace the cached ticket with the whole response body, invalidate the ticket and timeline queries, show the success toast, render `EscalatedCallout` on the rail. **Read `priority` from the response** — see the floor note below |
| `400` | `errors/validation` | Attach `errors.reason` to the reason field. Keep the dialog open with the text the user typed still in it |
| `400` | `errors/malformed-request` | A client bug. Log it; show the generic error message |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in; this is not a dialog error |
| `403` | `errors/forbidden` | **Inline beside the control**, never a toast. Should be unreachable if `canEscalate` was respected — if you see it, the cached ticket is stale, so refetch |
| `404` | `errors/not-found` | The ticket is gone. Full-page empty state, back to the list |
| `409` | `errors/ticket-not-escalatable` | Inline. `errors.status` carries the untranslated current status — use it to pick a translated sentence. Close the dialog, refetch (the action should now be hidden) |
| `409` | `errors/already-escalated` | Inline. Refetch — the callout should already have been there. Somebody else escalated it while the dialog was open |
| `409` | `errors/concurrency-conflict` | Banner above the summary strip: someone else changed this ticket, with **Reload**. **Never auto-retry** (ADR-006) |

```ts
if (res.status === 409) {
  if (problem.type.endsWith('/already-escalated'))     { refetchTicket(); showInline('tickets:escalate.errors.already'); }
  if (problem.type.endsWith('/ticket-not-escalatable')) { refetchTicket(); showInline('tickets:escalate.errors.notEscalatable',
                                                                                     { status: problem.errors?.status?.[0] }); }
  if (problem.type.endsWith('/concurrency-conflict'))   { showConflictBanner(); }   // no retry
}
```

### The floor — the one thing not to reimplement

**Escalation raises priority to a floor of `High`. It does not set it to `High`.**

| Before | After |
|---|---|
| `Low` | `High` |
| `Normal` | `High` |
| `High` | `High` |
| `Critical` | **`Critical`** |

Do **not** optimistically set `priority: 'High'` and reconcile. That is a second
implementation of BR-3.6, and on a `Critical` ticket it shows the user a downgrade that
never happened — which they may act on before the real response lands. Read `priority`
from the response body.

## Client-side rules — mirror, never authority

Every rule below is also enforced server-side; the client is not the authority (ADR-003,
Constitution III).

```ts
const escalateSchema = z.object({
  reason: z.string().trim().min(1, 'tickets:escalate.errors.required')
                    .max(500, 'errors.maxLength'),       // i18n keys, not sentences
  expectedVersion: z.string().min(1),
});
```

Four things the client deliberately does **not** do:

| Not done client-side | Why |
|---|---|
| Compute the new priority | BR-3.6 is the rule this feature exists to get right. Two implementations of it is how they diverge, and the divergence is a silent downgrade |
| Decide whether escalation is permitted | Read `canEscalate`. Computing `role === 'Manager' && !isEscalated && !['Resolved','Closed'].includes(status)` re-implements BR-3, and the copies drift into a menu item that produces a `403` |
| Offer de-escalation | There is no endpoint. BR-3.9 |
| Trim-and-measure differently from the server | The server trims **then** measures. Do the same, or a 500-character-plus-space reason is rejected client-side and accepted server-side |

## States — all of them are required

| State | Behaviour | AC |
|---|---|---|
| Action hidden | `canEscalate === false` → the Escalate menu item is **not rendered** | AC-15 |
| Idle | Dialog open, empty reason, **Confirm disabled** | AC-16 |
| Validating | Message on blur; counter appears at 450 characters; Confirm disabled at 0 and above 500 | AC-5, AC-16 |
| Submitting | Confirm shows a spinner, both buttons disabled, so a double-click sends one request | AC-16 |
| Error | Inline beside the control for `403` and `409`; field-level for `400`. Dialog stays open with the typed reason intact | AC-16 |
| Conflict | Banner above the strip with **Reload**, no auto-retry | AC-12, AC-16 |
| Success | Dialog closes, toast, rail callout appears with who / when / why | AC-1, AC-16 |
| Escalated (steady) | Callout on the rail, badge in the list, Escalate action absent | AC-9, AC-16 |

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`). There is
no **empty** state here — a dialog with one field has no collection to be empty. Recorded
so the omission is visibly a decision.

## Localization

| Item | Rule |
|---|---|
| Menu item, dialog title and question, reason label, helper, counter, Confirm, Cancel, toast, callout | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| The messages inside `errors` and the `title` on a failure | Already translated on arrival. Render them; do not re-translate or map them |
| `errors.status` on the not-escalatable `409` | An **enum value**, not a sentence. Use it to look up a translated status label — never display it raw to a user |
| `priority`, `status` | Enum values on the wire. Translate the **label** only, so a history row written in English stays readable in Arabic (BR-8.7) |
| `escalationReason` | User content. Render verbatim with `dir="auto"` — an Arabic reason in an English interface is normal, and without it the trailing full stop lands on the wrong side and reads as a typo (ADR-007 §8) |
| `ticketNumber` | Latin digits in both locales (BR-8.13) |
| Layout | CSS logical properties. `margin-inline-start`, never `margin-left`. The rail moves to the inline-end under RTL |
| The escalate glyph | Contains a vertical arrow and **must not mirror**. Vertical meaning has no direction (`04-ticket-detail.md`, RTL) |

Screen spec, element by element, with tokens and icons:
[`docs/sdd/design/screens/04-ticket-detail.md`](../../docs/sdd/design/screens/04-ticket-detail.md).
Confirm-modal structure and the toast rules:
[`10-shared-patterns.md`](../../docs/sdd/design/screens/10-shared-patterns.md).

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/ticket-escalate-api.md`](contracts/ticket-escalate-api.md) — `REV-016-03`. A
difference is a defect in one of the two, and both are corrected, never one silently.

If the contract moves while you are building, it arrives as a **Contract changes** entry in
[`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by the
frontend failing to compile is the failure this process exists to prevent.
