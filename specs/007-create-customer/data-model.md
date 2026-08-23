# 007 — Data Model

**Migration:** `AddCustomerDuplicateIndexes`

The `Customers` table already exists — `001-solution-skeleton` created its columns, its
types, and `CK_Customers_Contact`. This feature adds only what **is** the duplicate rule.

Full schema reference: [`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md).

---

## Added here

| Object | Definition | Rule |
|---|---|---|
| `UX_Customers_Email` | `CREATE UNIQUE INDEX UX_Customers_Email ON dbo.Customers (Email) WHERE Email IS NOT NULL AND IsActive = 1` | BR-4.4 |
| `UX_Customers_Phone` | `CREATE UNIQUE INDEX UX_Customers_Phone ON dbo.Customers (PhoneE164) WHERE PhoneE164 IS NOT NULL AND IsActive = 1` | BR-4.5 |
| Collation on `Email` | `ALTER COLUMN Email nvarchar(320) COLLATE Latin1_General_100_CI_AS NULL` | BR-4.2, ADR-013 row 3 |

The `WHERE` clause is the whole point of both indexes, and it is the part that silently
goes missing in a migration. `BE-007-03` verifies `filter_definition` comes back
**non-null**, because an unfiltered unique index rejects the second customer who simply
has no email — which presents as a duplicate-detection bug and is a migration defect.

## Not added here

| Deferred | To | Why |
|---|---|---|
| `IX_Customers_FullName` | `008-customer-list-and-profile` | It serves the search. No speculative indexes |
| Anything on `Notes` or `CompanyName` | — | Nothing queries them |

## Domain shape

`Wasl.Domain/Customers/` — the shell from `001` becomes a real aggregate here.

| Type | Responsibility |
|---|---|
| `Customer` | Private setters, a `Create` factory that enforces BR-4.1, and nothing an outside caller can use to reach an invalid state |
| `EmailAddress` | Parse-or-fail value object. Trims, lowercases, validates syntax (BR-4.2) |
| `PhoneNumber` | Parse-or-fail value object. Normalises to E.164; unparseable input fails as invalid, **not** as a duplicate (BR-4.3) |

Both value objects are `record struct`-shaped parse-don't-validate types: an instance
cannot exist in an invalid state, so no handler has to remember to check. This is why
AC-4 through AC-7 are unit-testable with no database.

## Concurrency

`RowVersion` already exists on the table from `001`. This feature does not read or
return it as behaviour — but the `201` response **does** include `version`, so
`017-update-customer` does not have to change the read shape later. ADR-006 as amended
by ADR-013.

## Why the duplicate rule needs both a check and an index

BR-4.8 requires both, and they are not redundant:

| Layer | Gives you | Alone it fails when |
|---|---|---|
| Application pre-check | The friendly `409` naming the field | Two concurrent requests both pass the check, then both insert |
| Filtered unique index | The guarantee | It produces a `DbUpdateException`, not a message a user can act on |

`BE-007-04` translates the second into the first, so the race produces the same `409` a
sequential duplicate would. `TEST-007-08` is the test that proves the race, and it needs
a real engine — EF `InMemory` does not enforce unique indexes at all.
