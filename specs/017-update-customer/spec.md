# US-003 — Specification

**Phase:** 5 · **Story:** US-003 · **Feature:** `017-update-customer` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Understanding

A support agent needs to correct a customer's details, because contact details go stale
and a CRM that cannot correct them accumulates records nobody can reach.

Mechanically this is the create path in reverse, with one addition that makes it the most
interesting write in the system: **it is the first endpoint that consumes the concurrency
token.** Two agents opening the same customer is normal in a shared queue, and without a
version check the second save silently overwrites the first — the agent who typed the
correct phone number watches it disappear and has no way to know it happened. ADR-006
chose optimistic concurrency for exactly this, and until this feature it has been a column
nobody reads.

So the endpoint carries three obligations that create did not have:

1. **The version.** The request carries `expectedVersion`, the base64 `rowversion` the
   client read. A mismatch is `409 errors/concurrency-conflict`, and the client refetches
   and shows the user what changed rather than retrying blindly.
2. **The duplicate rule, re-run, with self excluded.** Changing an email to one another
   active customer already holds is `409 errors/duplicate-customer` (BR-4.4). Submitting
   the customer's *own* current email is not a conflict with itself — the naive
   implementation of BR-4.4 makes every save of an unchanged email fail.
3. **The invariant, re-checked.** BR-4.1 held at creation. An update can break it by
   clearing the only contact method, so it is enforced again on the way through.

The audit connection is worth stating rather than leaving implicit. US-003 puts
field-level customer history out of scope, and ADR-008 cites precisely that gap as a
reason the audit log has to exist separately from `TicketHistory`: *"A phone number can be
changed with no record of who did it."* The `Customer.Updated` audit row from `003` is
what answers that question. There is no customer history table, deliberately, and the
audit log is not a substitute the way a workaround is a substitute — it is the designed
answer, and `019-audit-log-access` is where it becomes readable.

## In Scope

- `PUT /api/customers/{id}` updating `fullName`, `email`, `phone`, `companyName`, `notes`
- `expectedVersion` on the request; `409 errors/concurrency-conflict` on a mismatch
- The duplicate rule re-applied on update, with the row being updated excluded from it
- The contact invariant re-enforced (BR-4.1)
- Normalisation of email and phone on update, identical to create (BR-4.2, BR-4.3)
- One `Customer.Updated` audit row per successful update, recording only what changed
- An edit screen at `/customers/:id/edit` with a **conflict path**: an explanatory
  message and a reload action

## Out of Scope

| Excluded | Reason |
|---|---|
| Field-level customer change history | Out of scope in US-003 by name. The `Customer.Updated` audit row records who changed what and when; a per-field history table rendered as a customer timeline is a separate feature nobody has asked for (ADR-008) |
| `PATCH` / partial update | `PUT` replaces the mutable field set. A generic patch would need its own merge semantics, and the field set here is five fields on one screen — see AC-12 and R-4 |
| Deactivation (`IsActive`) | The column exists and this endpoint cannot write it. Deactivation has no story, and no reactivation path is designed |
| Merging duplicate customers | No requirement. A rule preventing new duplicates does not imply a tool for old ones (same position as `007`) |
| Changing the customer's tickets | Nothing here touches `Tickets` |
| Optimistic-concurrency UI beyond reload | No field-by-field merge, no three-way diff. The user reloads and re-enters. ADR-006's "show the user what changed" is satisfied by showing them the current record, not by building a merge tool |
| An `If-Match` / `ETag` transport for the version | `docs/sdd/05-api-conventions.md` fixes the version in the body as `expectedVersion`. See R-2 |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | `GET /api/customers/{id}` from `008` returns `version`, so the client has something to send. `007`'s `201` already returns it for the same reason | Without it there is no version to echo and this endpoint cannot be called at all. This is a hard dependency, not a soft one |
| A-2 | Contention is genuinely low — two agents editing the same customer in the same minute is uncommon | If it is common, optimistic concurrency produces a stream of `409`s and the answer is a UI change (live refresh), not a locking change. ADR-006 already weighed and rejected pessimistic locking |
| A-3 | There is no inactive customer in the system, because no code path can produce one | The duplicate check follows BR-4.4 and compares among **active** customers, so an inactive customer could be updated into an email an active one holds. Unreachable today; recorded rather than defended |
| A-4 | An agent editing a customer wants the whole record on screen, so the client always sends all five fields | If a caller sends a subset, AC-12 means the omitted fields are cleared. That is stated in the contract in the loudest place available |
| A-5 | Both roles may update a customer (BR-6), so this endpoint has no `403` path | If update becomes Manager-only, a `403` path and its out-of-transaction audit row (BR-9.4) are added — the mechanism from `004` already exists |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should the `409 concurrency-conflict` body carry the current version, or the current resource, so the client can avoid a second round trip? | **No.** It carries `ProblemDetails` and nothing else. A body carrying the fresh state invites the client to merge silently, which is the behaviour ADR-006 rejected by name, and `ProblemDetails` has no defined place for a resource. The client refetches through `GET /api/customers/{id}` — one extra request on an uncommon path |
| Q-2 | Should the audit row's `Changes` include the old and new email and phone? | **Yes**, per BR-9.8. ADR-008 already accepts that `AuditLog` becomes a store of personal data because of exactly this, and answers it with access control (`019`) rather than by weakening the diff. Recorded so it is a decision and not an oversight |
| Q-3 | Should an update that changes nothing return `200` or `304`? | **`200`.** `304` is a conditional-GET semantic and would mean the client has to treat a no-op save as a distinct branch. The audit row is still written, with an empty `Changes` (AC-19) |
| Q-4 | Should the edit screen be a route or a modal on the profile? | **A route**, `/customers/:id/edit`. A form with a conflict state and a reload action needs a URL to reload to, and a modal that has to survive a refetch of the record behind it is the harder version of the same screen (`10-shared-patterns.md`: a decision opens in a modal, a form does not) |

## Acceptance Criteria

`AC-1` – `AC-6` are the criteria from `docs/sdd/user-stories/US-003-update-customer.md`,
unchanged and in their original order, because other artifacts cite them by number.
`AC-7` onward are the criteria that were implicit in them.

| # | Criterion |
|---|---|
| AC-1 | `PUT /api/customers/{id}` with a valid body and the current `expectedVersion` updates `fullName`, `email`, `phone`, `companyName`, and `notes` and returns `200` with the updated resource, including a **new** `version` |
| AC-2 | Changing `email` to one an existing **active** customer already holds returns `409` with `type: errors/duplicate-customer` naming `email` (BR-4.4) |
| AC-3 | An update that would leave neither `email` nor `phone` returns `400` naming **both** fields (BR-4.1) |
| AC-4 | A stale `expectedVersion` returns `409` with `type: errors/concurrency-conflict` (ADR-006) |
| AC-5 | A well-formed `id` that does not exist returns `404`; a malformed `id` in the route returns `400` |
| AC-6 | On a `409 errors/concurrency-conflict` the UI shows an explanatory message and a **reload** action, and does **not** retry or resubmit automatically |
| AC-7 | Submitting the customer's own current email, or its own current phone, is **not** a conflict with itself: the duplicate check excludes the row being updated (BR-4.4, BR-4.5) |
| AC-8 | Changing `phone` to one an existing active customer already holds returns `409` naming `phone` (BR-4.5) |
| AC-9 | On update, `email` is trimmed and lowercased and `phone` is normalised to E.164 before comparison and storage, exactly as on create (BR-4.2, BR-4.3) |
| AC-10 | A phone that cannot be normalised returns `400` naming `phone`, never `409` (BR-4.3) |
| AC-11 | A missing or whitespace-only `fullName` returns `400` naming `fullName` |
| AC-12 | An omitted or `null` optional field is **cleared**, not preserved: `PUT` replaces the mutable field set. Sending `{ fullName, email }` alone clears `phone`, `companyName`, and `notes` — subject to AC-3 |
| AC-13 | A missing `expectedVersion` returns `400` naming `expectedVersion`, not `409` and not a silent last-write-wins |
| AC-14 | An `expectedVersion` that is not valid base64, or is the wrong length, returns `400` naming `expectedVersion` — never `409` and never `500` |
| AC-15 | Two updates sent with the same `expectedVersion` produce one `200` and one `409 errors/concurrency-conflict` |
| AC-16 | `UpdatedAtUtc` is taken from the injected `TimeProvider` on every successful update and is returned in the response |
| AC-17 | A successful update writes exactly one audit row, action `Customer.Updated`, in the same transaction as the change, whose `Changes` lists only the fields that actually changed (BR-9.1, BR-9.3, BR-9.8) |
| AC-18 | A `400`, a `404`, or either `409` leaves the row unchanged and writes **no** `Customer.Updated` row (BR-9.3) |
| AC-19 | An update that changes nothing returns `200` and still writes an audit row, with no entries in `Changes` (BR-9.8) |
| AC-20 | A request without a valid token returns `401`, and that denial writes an audit row **outside** any transaction (BR-9.2, BR-9.4) |
| AC-21 | Both `Agent` and `Manager` may update a customer; this endpoint has no `403` path (BR-6) |
| AC-22 | The `409 errors/concurrency-conflict` body carries no customer data; the client refetches through `GET /api/customers/{id}` |
| AC-23 | After a successful save the client holds the **new** `version`, so a second save from the same screen succeeds without a reload |
| AC-24 | The edit screen has been viewed in Arabic: labels, the conflict message, and the reload action render right-to-left, while the email and phone inputs stay left-to-right |

## Edge Cases

From `docs/sdd/testing/edge-cases.md` — **Input:** empty string, whitespace-only, exactly
at the maximum length, one over, unicode and RTL characters in a name, leading and
trailing whitespace, mixed-case email, phone with formatting characters, unparseable
phone, `null` versus omitted, unknown field in the body, malformed JSON.
**Identity:** well-formed `Guid` that does not exist, malformed `Guid` in the route.
**Concurrency:** two writes with the same `expectedVersion`.
**Permissions:** no token, expired token, tampered token.
**Audit:** a mutation whose transaction rolls back, an update that changes nothing, an
Arabic request producing an English audit row.
**Frontend:** concurrency conflict returned, API slow, submit clicked twice.

Specific to this story:

| Case | Expected |
|---|---|
| The submitted email equals the customer's own stored email, character for character | `200`. The duplicate query excludes `Id`, so the row cannot collide with itself (AC-7) |
| The submitted email differs only in case or whitespace from its own stored value | `200`, and `Changes` is empty — BR-4.2 normalises both sides to the same value, so nothing changed (AC-9, AC-19) |
| The submitted email matches an **inactive** customer's email | `200`. The rule is between active customers (BR-4.4). Unreachable today, per A-3 |
| `expectedVersion` is valid base64 of the wrong length | `400` naming `expectedVersion`. It is malformed input, not a conflict (AC-14) |
| `expectedVersion` belongs to a *different* customer | `409 concurrency-conflict`. It is a well-formed token that does not match this row; the server does not and should not know where the client got it |
| Both the version is stale **and** the new email duplicates another customer | `409 concurrency-conflict` wins, because the version is checked before the write is attempted. The client reloads and discovers the duplicate on the next attempt |
| Two agents change *different* fields of the same customer concurrently | The second gets `409`. Field-level merge is out of scope, and ADR-006 chose the detectable failure over the silent one |
| The customer is updated, then the same screen saves again with the version from the **first** load | `409`. This is the bug AC-23 exists to prevent, and it is invisible in single-user testing |
| `notes` of exactly 2000 characters | Accepted; 2001 returns `400` |
| An Arabic `fullName` replaced by an English one | Stored verbatim, returned verbatim, and both values appear in the audit `Changes` in English-neutral form — the row itself is not translated (BR-9.10) |
| A `PUT` with an empty JSON body `{}` | `400` naming `fullName` and `expectedVersion`. Not a no-op, and not a clear-everything |

## Rules Referenced

BR-4.1 – BR-4.8 · BR-6 (update is permitted for both roles) · BR-8.6, BR-8.7, BR-8.10,
BR-8.11 · BR-9.1, BR-9.2, BR-9.3, BR-9.4, BR-9.7, BR-9.8, BR-9.10 · ADR-006 (as amended
by ADR-013) · ADR-008 · ADR-010 · ADR-011 · ADR-013 · NFR-6, NFR-10
