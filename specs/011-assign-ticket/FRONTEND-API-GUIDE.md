# Frontend API Guide — Assign Ticket (US-007)

Everything the frontend lane needs to build the assign flow on `/tickets/:id` **without
waiting for the backend**. Derived from
[`contracts/ticket-assignee-api.md`](contracts/ticket-assignee-api.md), which is frozen.

> Start now. Do not wait for `BE-011-05`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the response
  to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title`
  is translated, `type` is not
- `version` is opaque base64. Store it, send it back, never parse or compare it

## The two endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/support-users` | The picker's options |
| `PUT` | `/api/tickets/{id}/assignee` | Assign, reassign, or unassign |

Both are owned by the route (`TicketDetailPage`), per ADR-011 §4. The picker does not
fetch when it opens; the support-users query is issued at route level alongside the
ticket.

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once the endpoints are real (ADR-011 §6), and
the swap is a deliberate task (`FE-011-05`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-011-05.
export interface SupportUserResponse {
  id: string;
  fullName: string;                     // may be Arabic — dir="auto"
  role: 'Agent' | 'Manager';            // enum value, never translated
}

export interface AssignAssigneeRequest {
  assigneeId: string | null;            // null = unassign
  expectedVersion: string;              // base64 rowversion, required
}

// The ticket read shape is owned by 010. These are the fields this endpoint guarantees.
export interface TicketAssignmentResult {
  id: string;
  ticketNumber: string;                 // Latin digits in every locale
  status: TicketStatus;                 // UNCHANGED by this call
  assignee: SupportUserResponse | null;
  allowedTransitions: TicketStatus[];   // recomputed — see below
  updatedAtUtc: string;                 // ISO 8601, Z
  version: string;                      // the NEW rowversion — replace the one you held
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId: string;
  errors?: Record<string, string[]>;    // present only on 400
}
```

### Request

```http
PUT {{baseUrl}}/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab/assignee
Authorization: Bearer <JWT>
Accept-Language: ar
Content-Type: application/json

{ "assigneeId": "3f9a1b52-77c4-4c1e-9b2a-8d0e5c7a1234", "expectedVersion": "AAAAAAAAB9E=" }
```

Unassign is the same call with `"assigneeId": null`. There is no `DELETE`.

### Responses, and what the UI does with each

| Code | `type` | What the UI does |
|---|---|---|
| `200` | — | Update the summary strip from the response, **replace the stored `version`**, re-render the take-action menu from the returned `allowedTransitions`, toast, and invalidate the ticket and timeline queries |
| `400` | `errors/validation` | Attach `errors.assigneeId` to the picker and refetch `support-users` — the most likely cause is that the user was deactivated after the list was loaded |
| `400` | `errors/malformed-request` | A client bug. Show the generic error and log the `traceId`; do not retry |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in; this is not a picker error |
| `403` | `errors/forbidden` | Inline message **next to the control**, not a toast. The user needs to see what they cannot do, where they tried to do it. Close nothing and lose nothing they typed |
| `404` | `errors/not-found` | The **ticket** is gone. Full-page not-found state, back to the list |
| `404` | `errors/assignee-not-found` | The **user** is gone. Keep the page, refetch `support-users`, message on the picker |
| `409` | `errors/ticket-closed` | The ticket was closed by someone else. Refetch the ticket; the assign action then disappears with the rest of the actions |
| `409` | `errors/assignee-unchanged` | Refetch the ticket and show the current assignee. Usually a double-submit or a stale menu |
| `409` | `errors/concurrency-conflict` | Banner above the strip: someone else changed this. Offer `Reload`. **Never auto-retry** |

```ts
const KNOWN = {
  forbidden:      'errors/forbidden',
  assigneeGone:   'errors/assignee-not-found',
  ticketClosed:   'errors/ticket-closed',
  unchanged:      'errors/assignee-unchanged',
  conflict:       'errors/concurrency-conflict',
} as const;

// Branch on the suffix of `type`. Never on `title`, and never on `detail`.
const kind = Object.entries(KNOWN).find(([, t]) => problem.type.endsWith(t))?.[0];
```

The two `404`s are the reason `type` matters more than `status` here: one kills the page
and the other refreshes a dropdown.

## Three things that fail silently

| Trap | What it looks like | The rule |
|---|---|---|
| Rendering the current assignee by finding `ticket.assignee.id` in the `support-users` list | The name is blank for any ticket whose assignee has since been deactivated, and it reads as missing data rather than as a deactivated user | Render the assignee **from the ticket response**. The picker list is options to choose from, not a directory to look names up in |
| Keeping the old `allowedTransitions` after a successful assign | "Start work" stays unavailable on a ticket that can now be started, because BR-1.3 made `InProgress` conditional on having an assignee | Re-render the action menu from the array in **this** response. `status` did not change; the menu did |
| Keeping the old `version` after a successful assign | The next action on the ticket returns `409` and looks like someone else edited it | Replace `version` from every `200`, on every mutation |

## Client-side rules — mirror, never authority

The picker is enabled and disabled by mirroring BR-2 so the user is told sooner. Every
rule below is enforced server-side, and the client is not the authority (constitution
III).

```ts
// Mirror of BR-2.1 - BR-2.3. The server decides; this only shapes the control.
function mayAssign(role: Role, meId: string, currentAssigneeId: string | null, targetId: string | null) {
  if (role === 'Manager') return true;                     // BR-2.1
  if (currentAssigneeId !== null && currentAssigneeId !== meId) return false; // BR-2.3
  return targetId === meId || targetId === null;           // BR-2.2, and self-unassign
}
```

Three things the client deliberately does **not** do:

| Not done client-side | Why |
|---|---|
| Deciding the `Closed` case | BR-2.5 is a ticket invariant enforced in the domain. The client hides the action for a closed ticket for usability, and still handles `409 errors/ticket-closed` |
| Filtering inactive users out of the list | The server already returns only active users. Filtering again would hide a server bug instead of surfacing it |
| Suppressing the request when the mirror says "no" | The mirror can be stale. The request is sent, and a `403` is rendered — which is also what proves the mirror wrong |

A `403` is **not** a bug in the mirror to be hidden. It is the case ADR-003 and the
constitution both describe: the client may improve the experience and may never be the
authority.

## States — all of them are required

| State | Behaviour |
|---|---|
| Loading | Skeleton in the strip's assignee row while the ticket loads; the picker's trigger is disabled while `support-users` is pending |
| Empty | `support-users` returns `[]` — an empty state inside the picker, not an empty dropdown |
| Error | `support-users` failed — the picker is disabled with a retry, and the rest of the screen still works |
| Forbidden | Inline `403` message beside the control |
| Conflict | Each `409` `type` has its own message and its own recovery, per the table above |
| Success | Strip, menu, and `version` updated; toast; an `Assigned` row appears in the activity section |

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`).

## Localization

| Item | Rule |
|---|---|
| Picker label, "Unassigned" option, confirmation, mirrored "not permitted" text | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| Server messages (`403`, `400`, `409` titles) | Already translated on arrival. Render them; do not re-translate or map them |
| `role` | An enum value. Translate the **label**, send and compare the value |
| `dir` | Set on the document root. Every element rendering a user's `fullName` carries `dir="auto"` (ADR-007 §8) |
| Layout | CSS logical properties. `margin-inline-start`, never `margin-left` |
| Ordering | Sort the picker with `Intl.Collator(activeLocale)`. The server's order comes from a database collation that does not follow `Accept-Language` |

Screen spec, element by element, with tokens and icons:
[`docs/sdd/design/screens/04-ticket-detail.md`](../../docs/sdd/design/screens/04-ticket-detail.md).
This feature's binding of it: [`frontend-spec.md`](frontend-spec.md).

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/ticket-assignee-api.md`](contracts/ticket-assignee-api.md) (`REV-011-03`). A
difference is a defect in one of the two, and both are corrected — never one silently.

If the contract moves while you are building, it arrives as a **Contract changes** entry
in [`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by
the frontend failing to compile is the failure this process exists to prevent.
