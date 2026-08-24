# 011 — Research

Questions that had to be settled before the plan could be trusted, what was checked, and
what each one settled. Most were mined from the original story artifact's trade-off table;
three exist only because ADR-010 and ADR-013 landed after it was written.

A question that turned out not to matter is recorded as such, because "we looked and it
did not matter" is information too.

---

## R-1 · Where does the BR-2 permission rule live, now that there is no `Wasl.Application`?

**The original answer, and why it stopped being available.** The story artifact put
`TicketAssignmentPolicy` in `Wasl.Application`, with unit tests in
`Wasl.Application.Tests`. ADR-010 removed both projects. Under it there are exactly two
test projects: `Wasl.Domain.Tests` (no database) and `Wasl.Api.IntegrationTests` (a real
SQL Server container).

**Options weighed:**

| Option | Cost |
|---|---|
| Inside the `AssignTicket` slice in `Wasl.Api` | The rule has eight meaningful input combinations (two roles × three assignee states × self-or-other). Reachable only from the integration project, that is eight container round-trips instead of eight microsecond unit tests — and exhaustive coverage stops being affordable, which is precisely how a branch gets missed |
| In `Wasl.Domain` as a pure policy type | The domain gains a type that takes a role as a parameter. Needs a defence, because ADR-010 lists the domain's contents and "permission rule" is not on that list |
| Inside `Ticket` itself | The entity would accept the caller's identity on every call |
| As an ASP.NET Core authorization policy at the boundary | Not possible — see R-7 |

**Settled: `Wasl.Domain/Tickets/TicketAssignmentPolicy.cs`, a pure function.**

Three reasons, in order of weight:

1. The constitution says business rules live in `Wasl.Domain`, once. BR-2 is a business
   rule, not an infrastructure concern.
2. It is the only placement that is unit-testable without a container, which is what the
   original plan valued when it separated the policy from the handler in the first place.
3. It has no dependencies at all — a role enum and two `Guid`s in, a decision out — so it
   does not threaten the one load-bearing claim of ADR-010, that `Wasl.Domain` has zero
   package references.

**The original objection is preserved, not overruled.** The story artifact rejected the
domain on the grounds that *"the domain would need to know about the caller's identity
and role, which is not a ticket concern"*. That is right about the **entity**, and
`Ticket` still knows nothing about the caller. A static function that *receives* a role is
not the entity knowing about the caller.

---

## R-2 · Sub-resource `PUT`, or `PATCH` on the ticket?

**Checked:** `docs/sdd/05-api-conventions.md`, which already answers it for the whole
API, and what a generic patch would do to the two features either side of this one.

**Settled: `PUT /api/tickets/{id}/assignee`.** The conventions document states the reason
in one line — *"each is a distinct business action with its own rules and its own history
entry; a generic patch would make the state machine unenforceable"* — and this feature is
the concrete case.

**Rejected: `PATCH /api/tickets/{id}` with an `assignedToUserId` field.**

| What breaks | Detail |
|---|---|
| The state machine | A patch that can carry `status` and `assignedToUserId` in one body has to decide which rule set applies, in which order, and what happens when one half is legal and the other is not. BR-1 and BR-2 have different roles, different failure codes, and different history rows |
| The history | One request, one business event, one `TicketHistory` row. A patch of two fields is either two rows from one request, or one row that lies about what happened |
| The audit action | BR-9's naming table has `Ticket.Assigned` and `Ticket.StatusChanged` as separate actions. A patch would need `Ticket.Updated`, which makes `WHERE action = 'Ticket.Assigned'` unanswerable |
| The permission model | BR-6 grants an Agent status changes on their own ticket and denies them reassignment. One endpoint cannot carry both answers |

**Rejected: `DELETE /api/tickets/{id}/assignee` for unassign.** Same field, same rules,
same history sequence. Two endpoints would restate all of BR-2, and the second copy is
the one that goes stale. `null` is a target like any other — which also makes BR-2.3
apply to it for free (`spec.md`, Edge cases).

---

## R-3 · What status and `type` for an inactive target, an unknown target, and a no-op?

**Checked:** the registry in `docs/sdd/documentation/api/error-handling.md`, and what the
client actually has to do differently in each case.

**Settled, and it resolves `spec.md` Q-2:**

| Case | Status | `type` | New? |
|---|---|---|---|
| Target is inactive (AC-6) | `400` | `errors/validation`, keyed `assigneeId` | No |
| Target does not exist (AC-7) | `404` | `errors/assignee-not-found` | **Yes** |
| Already assigned to that user (AC-11) | `409` | `errors/assignee-unchanged` | **Yes** |
| Ticket is `Closed` (AC-8) | `409` | `errors/ticket-closed` | No — already in the registry |

**Why inactive needed no new type.** A `400` carries an `errors` dictionary, and its keys
are machine-readable by contract. `errors.assigneeId` already tells the client exactly
which control to attach the message to and which list to refresh. A dedicated
`errors/assignee-inactive` would add a second signal for the same recovery, and a `type`
earns its place only when the client's recovery differs.

**Why the two new types were unavoidable.** A `404` carries no `errors` dictionary, and
this endpoint can produce two of them — the ticket and the target user — whose recoveries
are opposite: one kills the page, the other refreshes a dropdown. The only alternative
signal available is the translated `detail`, and a client parsing a translated sentence is
the exact failure BR-8.7 exists to prevent. The no-op `409` is the same argument: its
recovery is "refetch and show the current assignee", while reusing
`errors/concurrency-conflict` would tell the user someone else changed the ticket, which
is false and which they cannot disprove.

**Consequence:** two rows are added to the shared registry, recorded under **Contract
changes** in `plan.md` and applied to the documentation by `DOC-011-01`. A `type` that
exists in a response and not in the registry is how a client ends up with a `default:`
branch that swallows a real error.

---

## R-4 · What goes in `TicketHistory.OldValue` / `NewValue` for an assignment?

**Checked:** `docs/sdd/03-domain-model.md` (the column is `nvarchar(200)`, "previous
value, as text", and the history table has a real foreign key to `SupportUsers`), against
ADR-008's opposite choice for `AuditLog`.

**Settled: the `Guid` as text, `NULL` where there is no assignee.**

`AuditLog` snapshots its actor's email and role because it has **no** foreign keys and
must be readable after the thing it describes is gone. `TicketHistory` is the opposite: it
has foreign keys, it cascades with its ticket, and no support user is ever hard-deleted
(`IsActive` handles departures). The join therefore always resolves, and a snapshotted
name would only be a second copy that goes stale when someone is renamed.

**Rejected: storing `FullName`.** It reads better in a database dump and it is wrong the
first time a name changes.

**The cost, recorded so `013` does not discover it:** rendering an `Assigned` row as a
sentence needs a join to `SupportUsers` for both ids. That is one join in the timeline
query, and the timeline is already a union with `TicketComments`.

---

## R-5 · One command produces two audit actions. Does `IAuditableCommand` allow that?

**The problem.** BR-9's naming table lists `Ticket.Assigned` and `Ticket.Unassigned` as
distinct actions, and there is one command. The obvious implementation — a constant on
the type, or an attribute — cannot express two.

**Options weighed:**

| Option | Cost |
|---|---|
| Two commands, `AssignTicketCommand` and `UnassignTicketCommand` | Both need all of BR-2, the same version check, the same closed-ticket rule. The duplicate is the copy that goes stale, and it is a permission rule |
| One command, one action `Ticket.AssignmentChanged` | Diverges from BR-9's naming table and makes `WHERE action = 'Ticket.Unassigned'` — "who dropped tickets" — unanswerable, which is a question an audit log exists to answer |
| One command, action computed from the payload | `IAuditableCommand` must expose the action as a **property**, not a constant or an attribute |

**Settled: one command, action computed from its own payload.**

```csharp
public string AuditAction => AssigneeId is null ? "Ticket.Unassigned" : "Ticket.Assigned";
```

**What this settles for `003-audit-trail`:** the interface member is an instance property.
If `003` shipped it as a constant, an attribute, or a static abstract, this feature is the
one that finds out — and the fix is in `003`, not here. Flagged as a dependency in
`plan.md` rather than discovered during implementation.

The pipeline behaviour reads the property after the handler has run, so the row's action
always matches what actually happened.

---

## R-6 · Does the version check run before or after the permission decision?

**The question, which the original artifact did not ask.** Both checks can fail on one
request. Whichever runs first is the answer the client gets.

**Checked:** ADR-006's reasoning about what a `409` is *for*, and what a client can do
with each answer.

**Settled: the version check runs first (step 4 before step 5 in the contract's
precedence table).**

The permission decision reads the *current* assignee. With a stale `expectedVersion`, the
client and the server are looking at different assignees, so the `403` is computed from
data the client has never seen and may be wrong — an Agent's self-assignment that is
denied because "someone else owns this" when the ticket was in fact unassigned a second
ago. A `403` is also terminal in the UI: the guidance for it is "explain and do not
retry". A `409` sends the client back for the truth, and it can then discover it is
allowed after all.

EF's own token check at `SaveChanges` stays as well. The early compare fixes the
*ordering*; the `WHERE`-clause check catches the race between load and save. Two checks,
two different jobs.

**The consequence for the tests, and it is the trap in this feature:** an integration test
that asserts `403` while sending a stale version now gets `409`. If it asserts only "not
`200`" it passes for the wrong reason and the authorization proof is worthless. Every
authorization test asserts the exact status **and** the `type`, and `TEST-011-10` asserts
the precedence itself.

---

## R-7 · Can any part of BR-2 be an ASP.NET Core authorization policy?

**Checked:** BR-6's own instruction that *"role-only checks are enforced as ASP.NET Core
authorization policies at the API boundary"*, and where in the pipeline a policy actually
runs.

**Found:** only one part, and it is the trivial one.

| Part of the rule | Can it be a policy? |
|---|---|
| The caller is authenticated and holds a support role | **Yes** — `.RequireAuthorization()` on the endpoint |
| Assigning to someone other than yourself requires `Manager` | **No.** It compares the token's `sub` with the request body's `assigneeId`, and an authorization policy runs before model binding. A resource-based `IAuthorizationService` call inside the handler is the same code in a different wrapper, with a second concept to learn |
| The ticket is already assigned to someone else | **No.** The boundary has no database access, by design |

**Settled:** the endpoint carries `.RequireAuthorization()` and no role policy, and the
rest is decided in the handler from data it loads.

**The mistake this section exists to prevent:** adding `.RequireAuthorization("Manager")`
to this endpoint. It reads as a faithful implementation of BR-2.1 and it silently breaks
AC-2 — an Agent self-assigning an unassigned ticket is the most common use of the
endpoint. `016-escalate-ticket` is the endpoint where that policy belongs, and the
difference between the two is worth stating once here rather than rediscovering it in a
review.

---

## R-8 · Paged envelope or plain array for `GET /api/support-users`?

**Checked:** BR-7.2's pagination rules, and how many rows this endpoint can actually
return. `SupportUsers` is seeded (ADR-005), there is no user-management UI in the release,
and the seed is two accounts.

**Settled: a plain JSON array.**

A paged envelope would imply a page control, and a page control over two rows is a
component that can never be exercised and never tested honestly. `BR-7.6`'s rule still
applies — an empty pool is `200` with `[]`, never `404` — and the client renders it as an
empty state.

**The cost, recorded rather than designed around:** if user management ever ships, this
endpoint becomes paged and that is a breaking change for the client. It is `spec.md` A-4,
and it is a cheaper change than a paging control nobody uses for a release.

**Also settled: no `email` in the response.** The picker needs a name and a role. A list
endpoint that hands every internal email address to every authenticated caller is a
disclosure with no requirement behind it.

---

## R-9 · How is the picker ordered, and does the database do it correctly?

**The concern.** A support pool with both Arabic and English names has no obvious order,
and `ORDER BY FullName` in SQL Server sorts under the **column's collation**, which is
fixed at schema time and does not follow `Accept-Language`.

**Found:** the ordering is correct in one locale and looks arbitrary in the other, in both
directions. Nothing errors, nothing logs, and it reads as an unsorted list.

**Settled:** the server returns `FullName` ascending as a stable default so the response
is deterministic and testable; the client sorts with `Intl.Collator(activeLocale)` for
display. This is not the client re-implementing a business rule — ordering for a human
reader is a presentation concern, and the client is the only party that knows the active
locale.

**Rejected: `COLLATE` per request.** It would mean building the `ORDER BY` from user input
and maintaining a locale-to-collation map for two locales that the client can already
handle in one line.

---

## R-10 · What did the SQL Server switch actually change for this feature?

**Checked:** the original artifact against ADR-013, row by row.

| Original | Now | Note |
|---|---|---|
| `xmin` / `UseXminAsConcurrencyToken` | `Tickets.RowVersion`, `rowversion`, `.IsRowVersion()` | The token is a real column and appears in every DTO as `expectedVersion` — which this feature is the first to consume |
| `ix_tickets_assignee` | `IX_Tickets_Assignee` on `dbo.Tickets` | Naming only, but snake_case names in a SQL Server migration are the visible trace of an unmigrated document |
| `ON DELETE RESTRICT` | `ON DELETE NO ACTION` | `RESTRICT` is not SQL Server syntax. Same behaviour, and here it is also what makes the schema creatable: three foreign keys from `Tickets` to `SupportUsers` with a cascade among them are multiple cascade paths, which SQL Server rejects outright |
| `psql \d+ tickets` to check the index | `sys.indexes` / `sys.foreign_keys` queries | `data-model.md` carries both |
| Testcontainers PostgreSQL | `Testcontainers.MsSql` | And EF `InMemory` is still not a substitute — it enforces neither the foreign key nor the concurrency token, which are two of the three things this feature relies on |
| `varchar` anywhere a name is stored | `nvarchar` | `SupportUsers.FullName` is `nvarchar(200)`. `varchar` returns `????` for Arabic and looks like a font problem, so it survives review — which is why `TEST-011-14` asserts a byte-identical round-trip instead of trusting the mapping |

**Nothing in this feature's logic changed.** The switch touched the names, the token, and
the verification queries. That is worth stating: a provider change that reached the
business rules would have been a redesign, and ADR-013 predicted a migration.
