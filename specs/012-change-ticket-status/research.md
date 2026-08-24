# 012 — Research

Questions that had to be answered before the plan could be trusted, what was checked,
and what each one settled. Mined from the original plan's trade-off table and from what
the move to SQL Server changed. A question that turned out not to matter is recorded as
such, because "we looked and it did not matter" is information too.

---

## R-1 · Where does the transition matrix live, and what type holds it?

**Settled by ADR-004 for the *where*:** a static map in `Wasl.Domain`. Not in the
database (behaviour as data, untestable without a database, invisible in code review),
not in the endpoint (two entry points diverge), not duplicated in React (two copies
always drift). That decision is not reopened here.

**What was left open was the *type*.** The original plan said
`static readonly IReadOnlyDictionary<TicketStatus, TicketStatus[]>`.

**Checked:** `System.Collections.Frozen.FrozenDictionary<TKey,TValue>` and
`FrozenDictionary.ToFrozenDictionary()`, present since .NET 8 and therefore available on
.NET 10 — confirmed to exist, not assumed.

**Settled:** build it once in a static initialiser as a `FrozenDictionary`, expose it as
`IReadOnlyDictionary`. It is read on every ticket read and every transition, written
never, which is exactly the case `FrozenDictionary` exists for. The exposed type stays an
interface so the choice is not part of the contract.

**Rejected:** a `switch` expression returning an array. It reads fine and cannot be
enumerated, and enumerating it is precisely what `TEST-012-01` and
`AllowedTransitions` both need.

**Consequence:** the value arrays must not be handed out by reference. `TicketStatus[]`
is mutable, so `AllowedTransitions` returns a copy or a `ReadOnlySpan`/`ImmutableArray`.
A caller that sorted the array in place would mutate the state machine for the lifetime
of the process, and nothing would report it.

---

## R-2 · What shape does `expectedVersion` take on the wire?

**The change:** ADR-006 originally rode on PostgreSQL's `xmin`, a system column that
needed no declaration. ADR-013 replaced it with a SQL Server `rowversion`, which is a
real `byte[8]` column.

**Checked:** what a `rowversion` looks like when serialised, and what the alternatives
cost.

| Option | Verdict |
|---|---|
| Base64 of the 8 bytes — `"AAAAAAAAB9E="` | **Taken.** 12 characters, JSON-safe, and it is what `007`'s contract already returns as `version`, so the two endpoints agree without a conversation |
| Hex string | Works, longer, and invents a second convention for the same thing |
| The `bigint` the bytes represent | Rejected. JavaScript's `number` cannot hold a 64-bit integer safely, so a large token would round in the browser and the conflict check would compare two wrong values — silently, and only under load |
| An opaque ETag header | Correct HTTP, and it would put the token outside the request body that every other mutating endpoint in this system carries it in (`05-api-conventions.md`) |

**Settled:** base64 in the body, `expectedVersion`, **required**. Absent is `400`, not
"skip the check" — see the contract's reasoning: an optional concurrency token is a
concurrency check that the forgetful client opts out of.

---

## R-3 · Does EF Core actually raise a conflict for a *client-supplied* version?

**The question that matters most in this feature**, and the one whose wrong answer is
invisible.

**Checked:** how EF Core builds the `WHERE` clause for an entity with a `rowversion`
concurrency token, and what it compares against.

**Found:** EF compares against the **original value it tracked when the entity was
loaded** — not against anything in the request. Load the ticket, mutate it, call
`SaveChanges`, and the `UPDATE … WHERE RowVersion = @loaded` always matches, because it
was loaded microseconds earlier. No `DbUpdateConcurrencyException` is raised.

**So the client's token has to be pushed into the change tracker:**

```csharp
db.Entry(ticket).Property(t => t.RowVersion).OriginalValue = decoded;
```

**Why this is the dangerous one:** every visible sign of correctness is present without
it. The column exists, `.IsRowVersion()` is configured, the DTO carries `version`, the
endpoint accepts `expectedVersion`, and a test that sends two *sequential* requests
passes because the second one reloads. The defect only appears when two requests hold the
**same** captured version — which is the real-world case and the one `TEST-012-09` is
written to reproduce.

**Settled:** both layers, as `plan.md` records. The pre-check after load produces the
usable `409`; `OriginalValue` plus `SaveChanges` closes the window between load and
save. `TEST-012-09` captures one version and issues two writes from it.

---

## R-4 · Five `409` causes on one endpoint — five `type` values, or one?

**The tension:** `05-api-conventions.md` lists three `409` `type` values for the whole
system. This endpoint produces five distinct causes.

**Checked:** what a client would have to do with each, which is the only test that
matters for whether they are the same error.

| Cause | The client's fix |
|---|---|
| `invalid-status-transition` | Offer a different transition |
| `same-status-transition` | Nothing — refetch quietly |
| `ticket-closed` | Remove the actions entirely |
| `assignee-required` | Offer **Assign** |
| `concurrency-conflict` | Reload and let the user decide again |

Five different reactions. One `type` with five messages would force the client to branch
on a translated sentence, which BR-8.6/BR-8.7 exist to make impossible.

**Settled:** five `type` values, recorded as `spec.md` Q-3 because it adds two rows to a
blueprint table this feature does not own. `DOC-012-02` adds them, with the product
owner's approval rather than as a quiet commit.

**Rejected:** folding `same-status-transition` into `invalid-status-transition`. It is
the tempting one — the diagonal is not ✅ in the matrix, so it *is* a non-permitted cell.
It was rejected on the user-facing consequence: a double-click would tell the user they
attempted something forbidden. That teaches people to ignore the message, and then the
real rule violation is ignored too.

---

## R-5 · How do 36 cases get written so that they can actually fail?

**The trap the original plan already named:** driving the theory from
`TicketStatusTransitions` proves only that the implementation equals itself.

**Settled:** an xUnit `[Theory]` with `[MemberData]` returning a **hand-written** copy of
the BR-1 table — 6 × 6 = 36 rows, written from `04-business-rules.md` and not from the
map. Because it is a second copy, `REV-012-04` has someone who did not write it read it
cell by cell against the blueprint. A typo there turns a forbidden transition into a
passing test, and the suite goes green while the rule is wrong.

**What the 36 cells expect**, which is the part worth having settled before anyone writes
code:

| Cells | Expected |
|---|---|
| 10 | success — the ✅ cells: `New→Open`, `New→Closed`, `Open→InProgress`, `Open→Closed`, `InProgress→Open`, `InProgress→PendingCustomer`, `InProgress→Resolved`, `PendingCustomer→InProgress`, `Resolved→InProgress`, `Resolved→Closed` |
| 6 | `errors/ticket-closed` — the entire `Closed` row, `Closed → Closed` included |
| 5 | `errors/same-status-transition` — the diagonal, excluding `Closed` |
| 15 | `errors/invalid-status-transition` — everything else |

The theory asserts the **`type`**, not merely that the call threw. A `409` with the wrong
`type` reaches the client as an action the user cannot understand, and the status code
alone cannot reveal it.

**Twenty minutes, and then the implementation has somewhere to fail.** This is why
`TEST-012-01` sits before `BE-012-02` on the critical path rather than after it.

---

## R-6 · BR-1's matrix marks `PendingCustomer → PendingCustomer` as permitted. Is it real?

**Checked:** `04-business-rules.md`'s matrix, row by row, against BR-1.9.

**Found:** five of six rows carry `–` on their own diagonal. The `PendingCustomer` row
carries **✅**. BR-1.9 says a same-status transition returns `409` with no exception
stated.

**Settled as a typo, and escalated rather than coded around.** `spec.md` Q-4 records it
with the working assumption that the diagonal is not permitted, because taking the cell
literally would make `PendingCustomer` the one state re-enterable from itself, which
BR-1.9 forbids in the same document.

**Why it is written down instead of quietly fixed:** it is one cell of the map and one
row of the theory's expectation table, so it costs nothing now and it is expensive later
— if `BE-012-01` and `TEST-012-01` disagree about that cell, the suite is red and the
argument happens with code already written. `04-business-rules.md` is blueprint and this
feature does not edit it.

---

## R-7 · Domain or handler: who writes the history row?

**Checked:** what `Wasl.Domain` is allowed to know. It has zero package references
(ADR-010), so it cannot touch `DbContext`.

**Settled:** `Ticket.ChangeStatus` validates, mutates, and sets `ClosedAtUtc`. The
handler writes the `TicketHistory` row and the behaviour writes the `AuditLog` row. The
domain returns the old and new value so the handler is not re-deriving what changed.

**Rejected:** collecting domain events on the aggregate and dispatching them after save.
It is the better pattern in a larger system and it is one more mechanism than three
pipeline behaviours already provide — and dispatching *after* save would put the history
row outside the transaction, breaking BR-1.8 in the one direction nobody notices.

**The thing this settles that is easy to get wrong:** one accepted transition writes
**two** rows, not one. `TicketHistory.StatusChanged` and `AuditLog.Ticket.StatusChanged`
are not redundant (ADR-008) — the first cascades away with its ticket, the second
outlives it. Writing only the first looks completely correct in every test that reads the
timeline.

---

## R-8 · How do you force a rollback, to prove AC-12 and AC-24?

**The requirement:** prove that no history row and no audit row survive a failed save
(BR-9.3). A test that never fails cannot prove a thing about failure.

**Options weighed:**

| Option | Verdict |
|---|---|
| Hope for a natural failure | Not a test |
| A duplicate key on `TicketHistory` | It has no unique constraint to violate, and adding one to make a test possible is the tail wagging the dog |
| A `DbCommandInterceptor` registered only in the test host, throwing on the `TicketHistory` insert | **Taken.** The failure lands *after* the ticket update and *inside* the transaction, which is precisely the window BR-9.3 is about |
| Disposing the transaction without commit from the test | It would test the test's own plumbing, not the behaviour's |

**Settled:** the interceptor, in the integration fixture, and the assertion is on all
three tables — the ticket's `Status` unchanged, no `TicketHistory` row, no `AuditLog`
row. `TEST-012-07` and `TEST-012-11` share it.

**Needs a real engine.** EF `InMemory` has no transactions worth rolling back and no
`rowversion`, so this whole class of assertion is only meaningful against
`Testcontainers.MsSql`.

---

## R-9 · What did the SQL Server switch actually change for this feature?

Recorded because the answer is "less than it looks, and one thing that matters".

| Concern | Under PostgreSQL (ADR-001) | Here (ADR-013) |
|---|---|---|
| Concurrency token | `xmin`, a system column, no declaration | A `rowversion` column, base64 on the wire, plus the `OriginalValue` mechanic in R-3 — **the one substantive change** |
| `Note`, `Status`, `OldValue`, `NewValue` | `varchar` in the original blueprint | `nvarchar`. A note typed in Arabic into a `varchar` column returns `????`, and it looks like a font problem, so it survives review |
| `ClosedAtUtc` | `timestamptz` | `datetime2(3)` plus the global UTC value converter from `001`. `TimeProvider` is injected, so `TEST-012-02` asserts the exact value rather than a range |
| `AuditLog.Changes` | `jsonb` | `nvarchar(max)` with `CHECK (ISJSON(...) = 1)`. Nothing here queries into it, so nothing is lost |
| Integration tests | Testcontainers PostgreSQL | `Testcontainers.MsSql`, never EF `InMemory` |
| Schema verification | `\d+ tickets` | A `sys.indexes` / `sys.columns` query — but this feature adds no schema, so it verifies nothing |

**No schema change means no migration**, which is why `data-model.md` is a statement
rather than a table of new objects.
