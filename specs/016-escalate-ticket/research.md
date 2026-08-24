# 016 — Research

**Feature:** `016-escalate-ticket` · **Story:** US-009

The questions that actually had to be settled before the plan could name files. Mined from
the trade-offs the design forced, from what the SQL Server switch (ADR-013) changed, and
from what the source story artifact left open — it was an unfilled template, so every
decision below is being recorded for the first time.

Each entry states what was checked, what it settled, and what was rejected with the reason.

---

## R-1 — How is BR-3.6's "at least `High`" expressed so it cannot become an assignment?

**Checked.** Three candidate implementations, and what breaks each:

| Candidate | Verdict |
|---|---|
| `ticket.Priority = TicketPriority.High` | **Wrong.** Silently downgrades a `Critical` ticket. Request succeeds, nothing logged |
| `(TicketPriority)Math.Max((int)ticket.Priority, (int)TicketPriority.High)` | **Wrong tomorrow.** Correct only while the enum's declaration order equals the severity order. Enums persist as strings, so reordering changes no stored value, throws no cast error, and needs no migration |
| `TicketPriorityFloor.RaiseTo(ticket.Priority, TicketPriority.High)` with an explicit rank map | **Chosen** |

**Settles.** BR-3.6 lives in one named pure function in `Wasl.Domain`, holding an explicit
`IReadOnlyDictionary<TicketPriority,int>`. `TEST-016-03` asserts the order is
`Low < Normal < High < Critical`, so a reorder fails a build rather than changing a
business rule invisibly. `TEST-016-01` covers all four starting values from a
**separately written** table — driving the theory from the production rank map would prove
only that the implementation equals itself.

**Rejected.** Storing the rank as the enum's own integer value. It works, and it makes the
enum declaration a business rule that nothing marks as one. The rank map is the place a
reader looks for the ordering; the enum declaration is not.

**Rejected.** A comparison operator overload on a `TicketPriority` wrapper type. It would
make `>=` read naturally, and it puts the rule in an operator, which is the one place a
reviewer never checks.

---

## R-2 — Is escalation a status, a flag, or its own table?

**Checked.** The BR-1 matrix (36 cells), ADR-004, and what each option costs.

**Settles.** A **flag plus metadata on `Tickets`**, as `03-domain-model.md` already
models it. A ticket can be escalated *and* `InProgress`, because "who is working on it" and
"does this need attention now" are orthogonal facts.

**Rejected — a seventh `TicketStatus`.** It forces a choice between two orthogonal facts,
adds a row and a column to the BR-1 matrix that every existing transition test in `012`
would have to absorb, and makes "escalated" mutually exclusive with "being worked on",
which is the opposite of what escalation means.

**Rejected — an `Escalations` child table.** BR-3.9 makes escalation one-way and
single-valued: a ticket has at most one escalation, ever. A child table models a history
that cannot exist, and the `Escalated` history row already records the event with its
actor and timestamp.

---

## R-3 — Which `ProblemDetails` type does BR-3.3 carry?

**Checked.** The registry in `docs/sdd/documentation/api/error-handling.md`. It has
`errors/ticket-closed` (BR-1.5) and nothing covering a `Resolved` ticket.

**Settles.** One **new** type, `errors/ticket-not-escalatable`, for both `Resolved` and
`Closed`, with `errors.status` carrying the untranslated current status.
`DOC-016-01` adds the row to the registry.

**Rejected — reuse `errors/ticket-closed` for both.** A client that hides the comment
composer on `errors/ticket-closed` (BR-5.2) would hide it on a `Resolved` ticket, where
commenting is permitted. One wrong `type` produces a wrong screen, and the screen is wrong
in a way the user reads as the ticket being closed when it is not.

**Rejected — two types, one per status.** Two client branches for one identical outcome,
and the payload already names the status.

**Also settled here:** BR-3.3 is evaluated **before** BR-3.4, so a ticket that is both
`Closed` and escalated returns `ticket-not-escalatable`. The terminal state is the more
fundamental refusal, and telling a manager "already escalated" about a closed ticket sends
them looking for de-escalation, which BR-3.9 says does not exist.

---

## R-4 — Does the client decide whether escalation is offered, or is it told?

**Checked.** Constitution III (*"the server tells the client what is permitted rather than
the client deriving it"*), ADR-004's `allowedTransitions` precedent, and what the client
would need: `role`, `isEscalated`, `status`.

**Settles.** The ticket read shape gains **`canEscalate`**, computed server-side as
`Ticket.IsEscalatable && caller is Manager`. `FE-016-03` verifies by grep that no status or
role literal appears in `features/tickets/` outside the label catalogue.

The rule splits where the knowledge splits:

```text
Ticket.IsEscalatable   status + flag          Wasl.Domain — zero package references, unit-testable
canEscalate            IsEscalatable && Manager   read projection — this is where the claims are
```

**Rejected — the client derives it.** Three cheap facts, and still BR-3 re-implemented in
TypeScript. Two copies of a rule drift, and the drift presents as a menu item that produces
a `403` for something the interface offered — the exact defect `allowedTransitions` exists
to prevent for BR-1.

**Rejected — a `CanEscalate(user)` method on `Ticket`.** It reads better and it drags a
claims principal into the one project that is specified to have no infrastructure at all
(ADR-010).

---

## R-5 — Is `expectedVersion` required, when BR-3.4 already refuses a second escalation?

**Checked.** ADR-006 ("mutating endpoints accept `expectedVersion`"), the sibling endpoints
`PUT /status` and `PUT /assignee`, and the actual concurrency exposure. The handler re-reads
the ticket inside the transaction, so the floor is always computed from fresh data, and a
double-submit is already a `409 already-escalated`. The genuine exposure is narrow.

**Settles.** **Required**, matching the two sibling ticket mutations.

The reason is not the concurrency exposure — it is Constitution V. A client that has to
remember which of three ticket mutations carries a version will forget on one of them, and
the one it forgets is a silent lost update. Uniformity across the three endpoints is worth
more than the one field's worth of convenience.

**Rejected — optional but honoured.** An optional concurrency token is how lost updates
come back: the endpoint that accepts a missing version is the one every client eventually
calls without it.

**Rejected — omit it entirely.** Defensible on the narrow exposure and it makes escalate
the odd one out of three, which is the shape of the mistake above.

Noted: `docs/sdd/design/screens/04-ticket-detail.md` action 4 lists the escalate request
without `expectedVersion`. The contract file is authoritative and the difference is recorded
under **Contract changes** in `plan.md`, rather than being discovered by the frontend at
runtime.

---

## R-6 — Where does the escalation reason live, and how many copies is that?

**Checked.** Three candidate homes and what reads each: `Tickets.EscalationReason` (BR-3.7,
required), the `Escalated` history row's `Note` (nvarchar(500), optional), and
`AuditLog.Changes`.

**Settles.** Two copies, deliberately:

| Home | Read by | Why it cannot come from the other |
|---|---|---|
| `Tickets.EscalationReason` | The rail callout on ticket detail | BR-3.7 requires the field. It is current state |
| `TicketHistory.Note` on the `Escalated` row | The timeline (`013`) | The timeline is a **union** query. Special-casing one row type to join back to `Tickets` makes the union have to know about escalation |

**Rejected — the reason in `AuditLog.Changes`.** A third copy, and the same pattern BR-9.7
rejects for comment bodies: free text duplicated into the forensic table. The audit row
records *that it happened, by whom, when*; `EntityLabel` carries the `TicketNumber`, which
is what an auditor searches by. `Changes` records `IsEscalated: false → true` and, only
when it moved, `Priority: <old> → <new>` (BR-9.8).

**Rejected — the reason only on the history row, read into the callout by a join.** The
callout is on the ticket read path, which would then need the timeline query to render a
rail element.

---

## R-7 — Who writes the audit row for the `403`, given the policy denies at the boundary?

**Checked.** ADR-008's mechanism (`IAuditableCommand` + a MediatR pipeline behaviour),
BR-9.2 (every `401`/`403` writes a row), BR-9.4 (a denial has no business transaction to
join), and BR-6 (role-only checks are ASP.NET Core policies at the boundary).

**Settles.** Two writers, and the asymmetry is deliberate:

| Path | Written by | Transaction |
|---|---|---|
| Success | The MediatR audit behaviour, because `EscalateTicketCommand` implements `IAuditableCommand` | The **same** transaction as the ticket update and both history rows (BR-9.3) |
| `403` from the `CanEscalate` policy | The authorization-failure path in `Common/Auth` (owned by `003`/`004`) | **None** (BR-9.4) |

**This is the finding worth recording.** The policy denies at the boundary, so
`EscalateTicketHandler` never runs and the MediatR pipeline never opens. An audit mechanism
that lives *only* in the pipeline behaviour writes nothing — and it writes nothing for
precisely the endpoint whose entire authorization story is "only a Manager may call this".
BR-9.2 then has an invisible hole in the one place it matters most. `TEST-016-11` asserts
the row exists after a `403` and that no ambient transaction was needed to produce it.

**Rejected — move the role check into the handler so one mechanism covers both.** It would
make the audit uniform and it contradicts BR-6, which specifies role-only checks as
boundary policies precisely because the boundary has enough information to answer them. It
would also put an authorization decision behind a validation pass, changing the documented
`400`-before-`403` ordering.

**Rejected — accept the gap and note it.** The gap is silent, and a forensic log with a
hole in the denial path is worse than no log for the question an auditor actually asks.

---

## R-8 — What did the SQL Server switch (ADR-013) change for this feature?

**Checked.** The four provider-coupled surfaces in ADR-013 against everything this feature
touches.

| ADR-013 row | Effect here |
|---|---|
| 1 — `rowversion` with `.IsRowVersion()`, not `xmin`, not a manual `int` | `expectedVersion` is the **base64** `rowversion`, and the token appears in the request body. Under PostgreSQL `xmin` needed no column at all. The token is incremented by SQL Server, never by application code |
| 2 — filtered unique indexes | Not applicable. This feature adds no index; the `IsEscalated` filtered index belongs with `015`'s query |
| 3 — explicit case-insensitive collation | Not applicable. Nothing here is compared case-insensitively |
| 4 — `nvarchar`, never `varchar` | **`EscalationReason` is `nvarchar(500)`.** A `varchar` column stores an Arabic reason as `????`, which presents in the browser as a font or encoding problem and therefore survives code review. `BE-016-01` reads the type from `sys.columns`; `TEST-016-12` asserts the round trip |

Type mapping consequences: `datetime2(3)` for `EscalatedAtUtc` (SQL Server has no
`timestamptz`, so the global UTC value converter from `001` is what makes it correct);
`bit` for `IsEscalated`; `uniqueidentifier` for `EscalatedByUserId`; `ON DELETE NO ACTION`
on `FK_Tickets_Escalator`, because `RESTRICT` is not SQL Server syntax.

**Settles.** Column verification is a `sys.columns` query, not `\d+`. Integration tests run
against `Testcontainers.MsSql`, never EF `InMemory` — `InMemory` enforces neither
constraints nor concurrency tokens, which is exactly what `TEST-016-09` and `TEST-016-10`
exist to verify.

---

## R-9 — Does this feature need a migration?

**Checked.** `03-domain-model.md`'s `CREATE TABLE dbo.Tickets` and `009-create-ticket`'s
`AddTicketsAndHistory`. All four escalation columns, the `Priority` default,
`UpdatedAtUtc`, `RowVersion`, `TicketHistory`, and `IX_TicketHistory_Ticket_Time` are
already there.

**Settles.** **No migration.** Stated as a decision in `data-model.md` rather than left as
a blank section, and verified by `BE-016-01` against a clean database rather than assumed
(`spec.md` A-7).

**Rejected — a `CHECK` constraint tying the three escalation fields to `IsEscalated = 1`.**
It would make BR-3.7 a database guarantee the way `CK_Customers_Contact` makes BR-4.1 one.
Rejected because there is exactly one writer — `Ticket.Escalate`, private setters, the only
path that can set the flag — so there is no second writer to guard against, and the
constraint would need a migration on a table `009` owns. The BR-4.1 case is different: a
customer row can plausibly arrive from a manual `INSERT` during support work. If a second
writer to `IsEscalated` ever appears, this is the constraint to add.

**Rejected — a filtered index on `IsEscalated = 1` now, since the columns are here.** No
speculative indexes. It serves `015`'s `escalated=true` filter and arrives with the query
that needs it and can be measured against it.

---

## R-10 — What does the history look like, and how does BR-3.8's conditional row not become unconditional?

**Checked.** `TicketHistory`'s shape (`EventType`, `OldValue`, `NewValue`, `Note`) and the
three ways an implementation gets BR-3.8 wrong.

**Settles.** `Ticket.Escalate` returns an `EscalationResult` carrying `PriorityChanged`,
`OldPriority`, and `NewPriority`. The handler writes the `PriorityChanged` row **only if
`PriorityChanged` is true** — the decision is made by the domain, which is the only place
that knows whether the floor moved anything, and the handler cannot re-derive it wrongly.

The `Escalated` row carries `OldValue = NULL`, `NewValue = NULL`, `Note` = the trimmed
reason. There is no from/to because BR-3.9 makes escalation one-way: the event type *is*
the fact.

**The failure this guards against.** An unconditional `PriorityChanged` write is the third
face of the R-1 defect: on a `Critical` ticket it records a change that did not happen, and
that row is what a reviewer reads to decide whether the floor was implemented correctly. A
false history row is worse than a missing one, because it is evidence. `TEST-016-04`
asserts exactly one history row for `Critical` and exactly two for `Normal`.

**Rejected — the handler comparing `oldPriority != ticket.Priority` itself.** It works and
it means two places know how to detect the change. The domain already knows; returning the
answer is cheaper than recomputing it.

**Rejected — one combined `Escalated` row carrying the priority change in `OldValue` /
`NewValue`.** BR-3.8 specifies two rows, and the timeline renders event types with
different copy. Overloading one row means the timeline has to parse it.
