# 021 — Data Model

**Migration:** `AddInteractions`

This feature **does** change the schema: one new table, `dbo.Interactions`, plus two new
domain enums. `docs/sdd/03-domain-model.md` — which calls itself the single source of
truth for entities — contains no `Interaction` entity at all
(`research.md` R-2), while `docs/sdd/02-architecture.md` lists
`Wasl.Domain/Communications/Interaction.cs`. The table is defined here and the domain
model document is amended by `DOC-021-01`, so the two stop disagreeing.

SQL Server types only, per ADR-013. `nvarchar` for every column a human writes into —
`varchar` returns `????` for Arabic, and AC-10 is the test that would catch it.

---

## Added here

### `dbo.Interactions`

```sql
CREATE TABLE dbo.Interactions (
    Id                 uniqueidentifier NOT NULL PRIMARY KEY,
    TicketId           uniqueidentifier NOT NULL
        CONSTRAINT FK_Interactions_Tickets  REFERENCES dbo.Tickets (Id)       ON DELETE NO ACTION,
    Direction          nvarchar(20)     NOT NULL,
    Channel            nvarchar(20)     NOT NULL,
    RecipientAddress   nvarchar(320)    NOT NULL,
    Body               nvarchar(4000)   NOT NULL,
    ProviderName       nvarchar(50)     NOT NULL,
    ProviderMessageId  nvarchar(100)    NULL,
    DeliveryStatus     nvarchar(20)     NOT NULL,
    FailureCode        nvarchar(50)     NULL,
    SentByUserId       uniqueidentifier NOT NULL
        CONSTRAINT FK_Interactions_Sender   REFERENCES dbo.SupportUsers (Id)  ON DELETE NO ACTION,
    CreatedAtUtc       datetime2(3)     NOT NULL,
    CONSTRAINT CK_Interactions_Direction
        CHECK (Direction = N'Outbound'),
    CONSTRAINT CK_Interactions_Outcome
        CHECK ((DeliveryStatus = N'Accepted' AND ProviderMessageId IS NOT NULL AND FailureCode IS NULL)
            OR (DeliveryStatus = N'Failed'   AND ProviderMessageId IS NULL     AND FailureCode IS NOT NULL))
);

CREATE INDEX IX_Interactions_Ticket_Time ON dbo.Interactions (TicketId, CreatedAtUtc);
```

### Column by column

| Column | Type | Null | Why it is this |
|---|---|---|---|
| `Id` | `uniqueidentifier` | no | Client-generated before `SaveChanges`, per `001` R-5 |
| `TicketId` | `uniqueidentifier` | no | Every interaction in scope belongs to a ticket (A-4). A customer-level interaction with no ticket is `018`'s problem, not a nullable column here |
| `Direction` | `nvarchar(20)` | no | Enum as string. Only `Outbound` is reachable, and `CK_Interactions_Direction` is what says so out loud (AC-9, `spec.md` Tension 2) |
| `Channel` | `nvarchar(20)` | no | `CommunicationChannel` as string, same values as `Tickets.Channel` |
| `RecipientAddress` | `nvarchar(320)` | no | **Snapshot** of the customer's email or E.164 phone at send time (A-5). Not a join — the same reasoning as BR-9.6: the record must stay true after `017` edits the customer. `320` matches `Customers.Email`; a phone is far shorter and shares the column |
| `Body` | `nvarchar(4000)` | no | Matches `TicketComments.Body`. User-authored, stored verbatim, never translated (BR-8.10) |
| `ProviderName` | `nvarchar(50)` | no | `Mock` today. This is the column that makes the seam legible in a data dump the day a second provider exists: old rows still say who sent them |
| `ProviderMessageId` | `nvarchar(100)` | yes | What the provider returned. Null exactly when delivery failed — enforced by `CK_Interactions_Outcome`, not by a comment |
| `DeliveryStatus` | `nvarchar(20)` | no | `Accepted` or `Failed`. Both reachable — the failure path is configuration-driven (`research.md` R-6) |
| `FailureCode` | `nvarchar(50)` | yes | A **machine-readable code**, never a sentence — so BR-8.7 covers it and the client owns the translation (AC-22). `nvarchar` rather than `varchar` only for consistency with every other string column here |
| `SentByUserId` | `uniqueidentifier` | no | Who composed it. FK to `SupportUsers`, `ON DELETE NO ACTION` per ADR-013 |
| `CreatedAtUtc` | `datetime2(3)` | no | From the injected `TimeProvider`, never `DateTime.UtcNow`. The global UTC converter from `001` applies |

### Constraints, and what each one stops

| Constraint | Stops |
|---|---|
| `CK_Interactions_Direction` | A future half-built inbound path writing rows nobody specified. Landing US-013 drops this one line; until then, "zero inbound rows" is a fact rather than a question (AC-9) |
| `CK_Interactions_Outcome` | The two states that make no sense: an accepted send with no provider id, and a failed send with one. Without it, a handler bug produces a row that reads as delivered. This is the invariant the domain factory also enforces — two layers, one rule, per constitution III |
| `FK_Interactions_Tickets` … `NO ACTION` | An interaction being deleted because a ticket row was deleted. See the note below |
| `NOT NULL` on `RecipientAddress` | The empty-recipient row a naive handler writes when the customer has no address for the channel. The `409` in AC-12 is the friendly version; this is the guarantee |

**`ON DELETE NO ACTION` and not `CASCADE`, unlike `TicketComments`.** The precedent in
`03-domain-model.md` cascades comments with their ticket, and this table deliberately
does not follow it: an interaction records something that **left the system toward a
customer**, which is closer to `AuditLog`'s reasoning (BR-9.12) than to a comment's.
Nothing in the application deletes a ticket, so the constraint is a guard against a
manual delete, and the effect is that such a delete fails loudly instead of erasing the
record of what was sent. The divergence is stated here so a reviewer comparing the two
tables finds a reason rather than an inconsistency.

### Index

| Index | Justified by |
|---|---|
| `IX_Interactions_Ticket_Time` on `(TicketId, CreatedAtUtc)` | `TicketInteractionsQuery` — the only query that reads this table (`GET /api/tickets/{ticketId}/interactions`, AC-19). Same shape and same reason as `IX_TicketComments_Ticket_Time` |

Not filtered, so `filter_definition` is expected to be `NULL` here — worth stating,
because `001` and `007` both verify the opposite for their filtered indexes and the
verification query is the same one. What **is** verified non-null is
`sys.check_constraints.definition` for both check constraints (AC-9).

## Not added here

| Not added | Why |
|---|---|
| `RowVersion` | Nothing updates this row. A concurrency token on an append-only row can only ever be compared with itself — the same reason `TicketHistory` and `AuditLog` do not carry one. ADR-006 as amended by ADR-013, and `research.md` R-12 |
| `DENY UPDATE, DELETE` on the application role | `DeliveryStatus` is precisely the field a real provider's asynchronous callback would later update, so a grant taken away now would have to be given back. Append-only here is a property of the code path, stated rather than enforced (Q-E). Contrast BR-9.5, where `AuditLog` genuinely must never change |
| `CustomerId` | Reachable by one join through `Tickets`. Denormalising it invites the two columns to disagree, and nothing in scope queries interactions by customer — `018` does, and it can join |
| `TraceId` | The audit row already links the request to this row through `EntityId` (BR-9.9). A second copy of the same identifier is a second thing to keep in step |
| A `channel` filter, and any index for one | `research.md` R-13. BR-7.3 is about the ticket list, which `015` owns. No speculative indexes |
| Any change to `Tickets`, `TicketComments`, `Customers`, or `AuditLog` | None is needed. `Ticket.Channel` and `TicketComment.Channel` already exist and are not touched, which is the FR-3 promise this feature keeps |

## Domain shape

`src/Wasl.Domain/Communications/` — the folder `02-architecture.md` already names.

| Type | Responsibility |
|---|---|
| `Interaction` | Private setters. One factory, `Interaction.Outbound(...)`, which enforces: non-whitespace body ≤ 4000, non-empty recipient ≤ 320, and the accepted/failed pairing that `CK_Interactions_Outcome` mirrors. An instance cannot exist in a state the table would reject |
| `InteractionDirection` | `Inbound` / `Outbound`. `Inbound` exists as a value and is unreachable by construction — the factory is `Outbound`-only, and the check constraint is the second lock |
| `InteractionDeliveryStatus` | `Accepted` / `Failed`. Reused by `SendResult` so the two outcomes have one vocabulary, not two (`research.md` R-5) |
| `CommunicationChannel` | **Already exists** (A-1) — `009-create-ticket` needs it for `Ticket.Channel`. Not created here, not changed here |

Enums persist as strings, per `03-domain-model.md`, so a dump is readable and reordering
the enum cannot silently corrupt rows. Enum **values** are never translated (BR-8.7).

`Interaction` has no dependency on `ICommunicationProvider`, and the interface does not
live in `Wasl.Domain` — nothing in the domain calls a provider (`research.md` R-7). The
architecture test from `001` still passes unchanged, and that is the check that proves it.

## Verification

Not by reading the migration — by asking the engine:

```sql
-- AC-9 and CK_Interactions_Outcome: both definitions must come back NON-NULL
SELECT name, definition
FROM   sys.check_constraints
WHERE  parent_object_id = OBJECT_ID('dbo.Interactions');

-- Types: every text column must be nvarchar, never varchar (ADR-013)
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
FROM   INFORMATION_SCHEMA.COLUMNS
WHERE  TABLE_NAME = 'Interactions';

-- Delete behaviour: both foreign keys must be NO_ACTION
SELECT name, delete_referential_action_desc
FROM   sys.foreign_keys
WHERE  parent_object_id = OBJECT_ID('dbo.Interactions');

-- The one index, and no others
SELECT name, is_unique, filter_definition
FROM   sys.indexes
WHERE  object_id = OBJECT_ID('dbo.Interactions');
```

`TEST-021-09` runs the first three of these; `BE-021-04` runs all four once by hand
after the migration is applied to a clean database. A check constraint whose
`definition` comes back `NULL` did not get created, and the inbound half of the module
is then unguarded while looking guarded.
