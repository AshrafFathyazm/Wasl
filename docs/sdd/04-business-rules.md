# Business Rules

Every rule here is stated so that it can be turned directly into a unit test. Story
specs reference rule IDs rather than restating them.

---

## BR-1 Ticket status state machine

### Permitted transitions

| From ↓ / To → | New | Open | InProgress | PendingCustomer | Resolved | Closed |
|---|---|---|---|---|---|---|
| **New** | – | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Open** | ❌ | – | ✅ | ❌ | ❌ | ✅ |
| **InProgress** | ❌ | ✅ | – | ✅ | ✅ | ❌ |
| **PendingCustomer** | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Resolved** | ❌ | ❌ | ✅ | ❌ | – | ✅ |
| **Closed** | ❌ | ❌ | ❌ | ❌ | ❌ | – |

Read as: a transition is permitted only where the table shows ✅. Everything else is
rejected with `409 Conflict`.

### Rules

| ID | Rule |
|---|---|
| BR-1.1 | A new ticket is created with status `New`. |
| BR-1.2 | `New → Closed` and `Open → Closed` are permitted for spam, duplicates, and mistakes, and require a `note` explaining why. |
| BR-1.3 | A ticket cannot enter `InProgress` unless it has an assignee. |
| BR-1.4 | `PendingCustomer → Resolved` is not permitted directly; the agent must return the ticket to `InProgress` first, so that resolution is always a deliberate act by a working agent. |
| BR-1.5 | `Closed` is terminal. A closed ticket cannot be reopened, reassigned, escalated, or commented on. |
| BR-1.6 | `Resolved → InProgress` is permitted and represents reopening before closure. |
| BR-1.7 | Setting status to `Closed` sets `ClosedAtUtc`. |
| BR-1.8 | Every accepted transition writes a `TicketHistory` row of type `StatusChanged` with the old and new value, in the same transaction. |
| BR-1.9 | Transition to the same status is a no-op and returns `409`, not `200` — it usually indicates a double-submit or a stale UI. |

The state machine is implemented once, in `Wasl.Domain`, as a static permitted-transition
map. Controllers and React never re-implement it; the frontend reads a
`allowedTransitions` array returned with the ticket.

---

## BR-2 Assignment

| ID | Rule |
|---|---|
| BR-2.1 | Only a `Manager` may assign a ticket to another user. |
| BR-2.2 | An `Agent` may assign an **unassigned** ticket to themselves, and may not assign it to anyone else. |
| BR-2.3 | An `Agent` may not reassign a ticket that is already assigned to someone else. |
| BR-2.4 | A ticket may only be assigned to an active `SupportUser`. |
| BR-2.5 | A ticket in `Closed` cannot be assigned or unassigned. |
| BR-2.6 | Assigning writes a `TicketHistory` row of type `Assigned`; clearing the assignee writes `Unassigned`. |
| BR-2.7 | Assigning a ticket in `New` does **not** automatically move it to `Open`. Triage and ownership are separate acts, and coupling them hides one of them from the history. |

---

## BR-3 Escalation

| ID | Rule |
|---|---|
| BR-3.1 | Escalation is an explicit manual action. There is no time-based or SLA-driven escalation in the MVP. |
| BR-3.2 | Only a `Manager` may escalate. |
| BR-3.3 | A ticket in `Resolved` or `Closed` cannot be escalated. |
| BR-3.4 | An already-escalated ticket cannot be escalated again; the request returns `409`. |
| BR-3.5 | Escalation requires a non-empty `reason` of at most 500 characters. |
| BR-3.6 | Escalation raises priority to at least `High`. If the current priority is already `High` or `Critical`, it is left unchanged. |
| BR-3.7 | Escalation sets `IsEscalated`, `EscalatedAtUtc`, `EscalatedByUserId`, and `EscalationReason`. |
| BR-3.8 | Escalation writes a `TicketHistory` row of type `Escalated`, plus a separate `PriorityChanged` row if the priority actually changed. |
| BR-3.9 | De-escalation is out of scope. An escalated ticket stays escalated for its lifetime. |

---

## BR-4 Customer duplicate rule

| ID | Rule |
|---|---|
| BR-4.1 | A customer requires a `FullName` and at least one of `Email` or `PhoneE164`. |
| BR-4.2 | `Email` is normalised by trimming and lowercasing before comparison and storage. |
| BR-4.3 | `PhoneE164` is normalised to E.164 (leading `+`, digits only) before comparison and storage. Input that cannot be normalised is a `400`, not a duplicate. |
| BR-4.4 | Two active customers may not share the same normalised `Email`. |
| BR-4.5 | Two active customers may not share the same normalised `PhoneE164`. |
| BR-4.6 | Name is **not** part of the duplicate rule. Two different people can legitimately share a name, and blocking that creates a worse failure than allowing it. |
| BR-4.7 | A duplicate returns `409 Conflict` and names the conflicting field, but does **not** return the existing customer's other details. |
| BR-4.8 | The rule is enforced both by a unique database index and by an application-level check. The index is the guarantee; the check produces the friendly message. |

---

## BR-5 Comments and history

| ID | Rule |
|---|---|
| BR-5.1 | A comment requires a non-whitespace body of at most 4000 characters. |
| BR-5.2 | Comments cannot be added to a `Closed` ticket. |
| BR-5.3 | Comments are append-only: no edit, no delete in the MVP. |
| BR-5.4 | An internal comment (`IsInternal = true`) is visible to all support users but is marked distinctly in the UI, so that a future customer-facing view can exclude it without a data migration. |
| BR-5.5 | Adding a comment writes a `TicketHistory` row of type `CommentAdded`. The history row records that a comment happened, not its content. |
| BR-5.6 | `TicketHistory` is append-only and is never updated or deleted by application code. |
| BR-5.7 | The ticket timeline is the union of comments and history rows, ordered by timestamp ascending. |

---

## BR-6 Authorization matrix

| Action | Agent | Manager |
|---|---|---|
| Create customer | ✅ | ✅ |
| View customer | ✅ | ✅ |
| Update customer | ✅ | ✅ |
| Create ticket | ✅ | ✅ |
| List / view all tickets | ✅ | ✅ |
| Assign ticket to self (when unassigned) | ✅ | ✅ |
| Assign / reassign ticket to another user | ❌ | ✅ |
| Change status of a ticket assigned to self | ✅ | ✅ |
| Change status of a ticket assigned to someone else | ❌ | ✅ |
| Change status of an unassigned ticket | ✅ | ✅ |
| Add comment | ✅ | ✅ |
| Escalate | ❌ | ✅ |
| Change priority directly | ❌ | ✅ |
| Read the audit log | ❌ | ✅ (and the read is itself audited — BR-9.11) |

Role-only checks (`Escalate`, `Reassign`) are enforced as ASP.NET Core authorization
policies at the API boundary. Data-dependent checks ("is this user the assignee?")
are enforced in the application layer, because the boundary does not have the data.

A denied action returns `403 Forbidden`. A request for a resource the user may not
even know exists is not applicable here — all support users may see all tickets.

---

## BR-7 Listing and filtering

| ID | Rule |
|---|---|
| BR-7.1 | Ticket list default sort is `CreatedAtUtc` descending. |
| BR-7.2 | Default page size is 20; maximum accepted page size is 100. A larger request is clamped to 100, not rejected. |
| BR-7.3 | Filters are combined with AND: status, priority, category, channel, assignee, customer, escalated. |
| BR-7.4 | Multiple values for the same filter are combined with OR (`status=Open&status=InProgress`). |
| BR-7.5 | A free-text `search` term matches ticket number, subject, and customer name, case-insensitively. |
| BR-7.6 | An empty result is `200` with an empty array, never `404`. |

---

## BR-8 Localization

| ID | Rule |
|---|---|
| BR-8.1 | Supported locales are `en` and `ar`. `en` is the default and the fallback. |
| BR-8.2 | A region-specific request such as `ar-EG` or `ar-SA` resolves to `ar`. Culture fallback does this; no per-region catalogue exists. |
| BR-8.3 | An unsupported locale such as `fr` falls back to `en` and returns `200`. Requesting a language the system does not speak is not a client error (FR-5.8). |
| BR-8.4 | The active locale for a request is resolved in this order: explicit `?culture=` parameter, then the authenticated user's `PreferredLanguage`, then the `Accept-Language` header, then `en`. |
| BR-8.5 | A stored preference outranks `Accept-Language` because it is a deliberate choice, whereas the header is the browser's guess. The query parameter outranks both and exists for testing and for sharing a link in a specific language. |
| BR-8.6 | Server-authored strings are localized by the server: `ProblemDetails.title`, `ProblemDetails.detail`, and every validation message. |
| BR-8.7 | Machine-readable parts of a response are **never** localized: `ProblemDetails.type`, the keys of the `errors` dictionary, enum values, `TicketNumber`, and any identifier. |
| BR-8.8 | Client-authored strings — labels, buttons, headings, empty states, enum display names — are localized by the client. |
| BR-8.9 | Log messages are always English, regardless of the request locale. Logs are read by engineers, not by users, and a log that changes language with traffic cannot be searched. |
| BR-8.10 | Content entered by a user is stored and returned verbatim and is never translated (FR-5.7). |
| BR-8.11 | A translation key present in one catalogue must be present in the other. Enforced by an automated parity test, not by discipline. |
| BR-8.12 | A missing translation falls back to the English string, never to the raw key. The parity test is what stops this reaching a user. |
| BR-8.13 | Arabic uses the Gregorian calendar and Latin digits for identifiers and timestamps. Arabic-Indic digits are not used for `TicketNumber`, because it is quoted aloud and pasted into other systems. |
| BR-8.14 | Arabic pluralization uses all six CLDR categories (`zero`, `one`, `two`, `few`, `many`, `other`). An English two-form plural applied to Arabic is grammatically wrong for most counts. |

---

## BR-9 Audit log

`AuditLog` is the forensic record. It is not `TicketHistory`, and the distinction is
in `decisions/ADR-008-audit-log.md`.

| ID | Rule |
|---|---|
| BR-9.1 | Every operation that changes state writes exactly one audit row. |
| BR-9.2 | Every authentication and authorization event writes an audit row: successful sign-in, failed sign-in, and any `401` or `403`. |
| BR-9.3 | For a successful mutation, the audit row is written in the **same transaction** as the change. If the transaction rolls back, the audit row goes with it — a log recording things that did not happen is worse than no log. |
| BR-9.4 | For a denied or failed action there is no business transaction to join, so the row is written independently. This asymmetry is deliberate and is tested. |
| BR-9.5 | `AuditLog` is append-only. The application's database role is granted `INSERT` and `SELECT` only; `UPDATE` and `DELETE` are revoked. |
| BR-9.6 | The actor's email and role are **snapshotted** onto the row, never resolved by joining to `SupportUsers`. The role recorded is the role held at the time of the action. |
| BR-9.7 | Redaction is mandatory. An audit row never contains a password, a password hash, a token, a signing key, or a full comment body. A comment records that a comment was added, consistent with BR-5.5. |
| BR-9.8 | `Changes` records the fields that actually changed, before and after. A field whose value did not change is not recorded. |
| BR-9.9 | `TraceId` on the audit row matches the `traceId` in the `ProblemDetails` response and the correlation id in the request log, so one identifier links all three. |
| BR-9.10 | Audit content is always English, regardless of the request locale (BR-8.9). |
| BR-9.11 | Only a `Manager` may read the audit log. Reading it is itself audited as `Audit.Read`. |
| BR-9.12 | Audit rows have no foreign keys. A row must be able to record a deletion and continue to exist afterwards. |
| BR-9.13 | Nothing in the application deletes an audit row. Retention, if any, is an operational job outside the application — and the retention period is an open question, not an assumption (`11-open-questions.md` Q-9). |

### Action naming

`Entity.Verb`, in past tense where the verb is an outcome:

```text
Customer.Created        Ticket.Created           Auth.LoginSucceeded
Customer.Updated        Ticket.StatusChanged     Auth.LoginFailed
Customer.Deactivated    Ticket.Assigned          Auth.Forbidden
                        Ticket.Unassigned        Auth.Unauthenticated
                        Ticket.Escalated         User.LanguageChanged
                        Ticket.CommentAdded      Audit.Read
```

A consistent prefix is what makes `WHERE action LIKE 'Auth.%'` a useful query. An
ad-hoc naming scheme makes the table searchable only by someone who already knows what
is in it.
