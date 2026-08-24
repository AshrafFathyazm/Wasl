# 016 — Data Model

**Migration:** **none.** This feature adds no table, no column, no index, and no
constraint.

Recording that explicitly, rather than leaving the section blank, is what makes it a
decision rather than an oversight. Full schema reference:
[`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md).

---

## What already exists, and which feature created it

Escalation is a **flag plus metadata on `Tickets`**, not a table (ADR-004, US-009 notes).
Every column it needs was created with the table it belongs to.

| Object | Created by | Definition |
|---|---|---|
| `dbo.Tickets.IsEscalated` | `009-create-ticket` (`AddTicketsAndHistory`) | `bit NOT NULL CONSTRAINT DF_Tickets_Escalated DEFAULT 0` |
| `dbo.Tickets.EscalatedAtUtc` | `009` | `datetime2(3) NULL` |
| `dbo.Tickets.EscalatedByUserId` | `009` | `uniqueidentifier NULL CONSTRAINT FK_Tickets_Escalator REFERENCES dbo.SupportUsers (Id) ON DELETE NO ACTION` |
| `dbo.Tickets.EscalationReason` | `009` | `nvarchar(500) NULL` |
| `dbo.Tickets.Priority` | `009` | `nvarchar(20) NOT NULL CONSTRAINT DF_Tickets_Priority DEFAULT 'Normal'` — enum stored as a string |
| `dbo.Tickets.UpdatedAtUtc` | `009` | `datetime2(3) NOT NULL` — stamped on escalation (`spec.md` Q-5) |
| `dbo.Tickets.RowVersion` | `009` | `rowversion NOT NULL`, mapped `.IsRowVersion()` (ADR-006 as amended by ADR-013) |
| `dbo.TicketHistory` | `009` | Receives the `Escalated` row and, conditionally, the `PriorityChanged` row |
| `IX_TicketHistory_Ticket_Time` on `(TicketId, PerformedAtUtc)` | `009` | Already serves the timeline read of both new rows |
| `dbo.AuditLog` | `003-audit-trail` | Receives the `Ticket.Escalated` row and the `Auth.Forbidden` row |

The columns ship with the table on purpose. A migration that adds four columns to prove
one story is a second migration for no benefit, and the escalation columns are part of what
a ticket *is*.

## Verified, not assumed — `BE-016-01`

`spec.md` A-7 assumes `009` created those four columns with those types. The assumption is
checked rather than trusted, because the one that matters fails silently:

```sql
SELECT  c.name,
        t.name AS type_name,
        c.max_length,
        c.is_nullable
FROM    sys.columns c
JOIN    sys.types   t ON t.user_type_id = c.user_type_id
WHERE   c.object_id = OBJECT_ID('dbo.Tickets')
  AND   c.name IN ('IsEscalated','EscalatedAtUtc','EscalatedByUserId','EscalationReason');
```

Expected: `bit`, `datetime2` (scale 3), `uniqueidentifier`, and **`nvarchar` with
`max_length` 1000** (500 characters × 2 bytes).

`EscalationReason` is the row to read. If it came back as `varchar`, an Arabic escalation
reason stores as `????` — and that presents as a font or encoding problem in the browser,
so it survives code review and reaches a demo (ADR-013 row 4). `TEST-016-12` asserts an
Arabic reason round-trips byte-identical, which is the behavioural half of the same check.

## Not added here

| Deferred | To | Why |
|---|---|---|
| A filtered index on `IsEscalated = 1` | `015-ticket-filters-and-search` | It serves the `escalated=true` filter. No speculative indexes — the index arrives with the query that needs it, and `015` is where that query is written and measured |
| A `CHECK` constraint tying `EscalationReason IS NOT NULL` to `IsEscalated = 1` | Nowhere — considered and rejected below | |
| A `CHECK` constraint on `Priority` restricting it to the four enum values | Nowhere — out of scope for this feature | The enum-to-string conversion is configured once in `001`; adding a check for one column and not the other five enum columns would be inconsistent. Worth an issue, not a change here |
| An `Escalations` table | Nowhere | BR-3.9 makes escalation one-way and single-valued: one ticket has at most one escalation, ever. A child table would model a history that cannot exist, and the `Escalated` history row already records the event |

### The check constraint that was considered and rejected

`CHECK (IsEscalated = 0 OR (EscalatedAtUtc IS NOT NULL AND EscalatedByUserId IS NOT NULL
AND EscalationReason IS NOT NULL))` would make BR-3.7 a database guarantee, in the way
`CK_Customers_Contact` makes BR-4.1 one.

It is **not** added, for one reason worth stating rather than leaving as an omission: the
four fields are set together by a single private-setter domain method
(`Ticket.Escalate`), which is the only path that can set `IsEscalated`. There is no second
writer to guard against, and the constraint would need a migration on a table `009` owns.

The trade-off is real, and it is the opposite of the BR-4.1 case: `CK_Customers_Contact`
guards against rows arriving before `007` and against manual `INSERT`s during support
work, both of which are plausible for a customer. A half-escalated ticket can only be
produced by editing `Ticket.Escalate` itself, which is a code change with a test attached.
If a second writer ever appears, this is the constraint to add, and this paragraph is why
it was not there already.

## Domain shape

`Wasl.Domain/Tickets/` — extended here, not created.

| Type | Responsibility |
|---|---|
| `TicketPriority` | `Low, Normal, High, Critical`. **The declaration order is the severity order, and that is load-bearing** — see below |
| `TicketPriorityFloor` | `RaiseTo(current, floor)`. The whole of BR-3.6, in one pure function with an explicit rank map |
| `Ticket.Escalate(reason, byUserId, TimeProvider)` | The only path that sets `IsEscalated`. Enforces BR-3.3 then BR-3.4, applies the floor, sets the four BR-3.7 fields, stamps `UpdatedAtUtc`, returns `EscalationResult` |
| `Ticket.IsEscalatable` | Computed: not `Resolved`, not `Closed`, not already escalated. **Status and flag only — no role.** The role joins it in the read projection, because `Wasl.Domain` has zero package references and no concept of a claims principal |
| `EscalationResult` | `PriorityChanged`, `OldPriority`, `NewPriority`. This is what tells the handler whether a `PriorityChanged` history row is owed |
| `TicketNotEscalatableException`, `TicketAlreadyEscalatedException` | Distinct types so the shared middleware maps distinct `type` values |

### Why the rank map, and why it is a persistence concern

Enums are stored **as strings** (`nvarchar(20)`), configured once in `001` so a database
dump stays readable and reordering an enum cannot reinterpret existing rows.

That protection is exactly what makes the floor fragile. Reordering `TicketPriority` —
alphabetising it, or inserting `Urgent` between `Normal` and `High` — changes **no stored
value**, throws **no cast error**, and needs **no migration**. An implementation of BR-3.6
written as `(TicketPriority)Math.Max((int)current, (int)High)` is correct before the
reorder and silently wrong after it, and there is nothing in the schema or the data to
notice.

So the rank lives in an explicit `IReadOnlyDictionary<TicketPriority, int>` inside
`TicketPriorityFloor`, and `TEST-016-03` asserts the order is `Low < Normal < High <
Critical`. A reorder then fails a build instead of quietly changing a business rule.

## Rows written by a successful escalation

One transaction, four writes (BR-9.3):

| Table | Row |
|---|---|
| `dbo.Tickets` | `IsEscalated = 1`, `EscalatedAtUtc`, `EscalatedByUserId`, `EscalationReason`, `Priority` (only if the floor moved it), `UpdatedAtUtc`. `RowVersion` is incremented **by SQL Server**, never by application code |
| `dbo.TicketHistory` | `EventType = 'Escalated'`, `OldValue = NULL`, `NewValue = NULL`, `Note` = the trimmed reason |
| `dbo.TicketHistory` | `EventType = 'PriorityChanged'`, `OldValue` / `NewValue` = the canonical enum strings — **only when the priority actually changed** |
| `dbo.AuditLog` | `Action = 'Ticket.Escalated'`, `EntityType = 'Ticket'`, `EntityId`, `EntityLabel` = the `TicketNumber`, `ActorEmail` / `ActorRole` snapshotted (BR-9.6), `Changes` = `IsEscalated` and — only when it moved — `Priority`. **Not the reason text** (`spec.md` Q-3) |

The reason is deliberately stored twice: on `Tickets.EscalationReason` for the current-state
rail callout, and on the `Escalated` history row's `Note` for the timeline. `TicketHistory`
is append-only (BR-5.6) and the timeline is a union query (`013`); pulling the reason from
the ticket for one row type would make that union have to know about escalation.

A rolled-back transaction leaves **none** of the four rows and no change to the ticket —
`TEST-016-10`. That is provable only against a real engine, which is why
`Testcontainers.MsSql` is used and EF `InMemory` is not: it enforces neither constraints
nor concurrency tokens, which is exactly what these tests exist to verify (ADR-013).

## Concurrency

`RowVersion` already exists on `Tickets` from `009`, mapped `.IsRowVersion()`. The escalate
request carries `expectedVersion`; EF issues the update with the loaded `rowversion` in the
`WHERE` clause, and a mismatch surfaces as `DbUpdateConcurrencyException`, mapped by the
shared middleware to `409 errors/concurrency-conflict`.

The token is maintained by the database, never incremented by application code (ADR-006 as
amended by ADR-013). `TEST-016-09` performs two writes against one version and asserts one
`200` and one `409`, plus **exactly one** `Escalated` history row — which is the only proof
that the floor was applied once rather than twice.
