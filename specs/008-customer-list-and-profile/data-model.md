# 008 — Data Model

**Migration:** `AddCustomerFullNameIndex`

One index. No new table, no new column, no constraint change.

Full schema reference: [`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md).

---

## What already exists

| Created by | Object |
|---|---|
| `001-solution-skeleton` | `dbo.Customers` — every column, its types, `CK_Customers_Contact`, and `RowVersion` |
| `001-solution-skeleton` | The UTC value converter, the `datetime2(3)` convention, `nvarchar` for human text, enums as strings |
| `007-create-customer` | `UX_Customers_Email` and `UX_Customers_Phone` — filtered unique, plus the case-insensitive collation on `Email` |

The columns this feature reads, for reference — nothing here changes:

| Column | Type | Null | Read by |
|---|---|---|---|
| `Id` | `uniqueidentifier` | no | Both endpoints; the list's order tiebreaker |
| `FullName` | `nvarchar(200)` | no | Both; searched and ordered by |
| `Email` | `nvarchar(320)` `COLLATE Latin1_General_100_CI_AS` | yes | Both; searched |
| `PhoneE164` | `nvarchar(20)` | yes | Both; searched |
| `CompanyName` | `nvarchar(200)` | yes | Both |
| `Notes` | `nvarchar(2000)` | yes | Detail only — deliberately not in the list projection |
| `IsActive` | `bit` | no | The list filters `IsActive = 1`; the detail endpoint does not filter |
| `CreatedAtUtc` | `datetime2(3)` | no | Both |
| `UpdatedAtUtc` | `datetime2(3)` | no | Detail only |
| `RowVersion` | `rowversion` | no | Detail only, returned as base64 `version` |

`nvarchar`, not `varchar`, on every one of the human-written columns. That is not a
detail this feature gets to re-decide, but it is the feature where it becomes visible:
this is the first code that **reads Arabic back out**, and a `varchar` column returns
`????`, which looks like a font or browser problem and gets triaged as a frontend bug
(ADR-013 row 4). `TEST-008-13` asserts a byte-identical round trip for exactly that
reason.

---

## Added here

| Object | Definition | Named query it serves |
|---|---|---|
| `IX_Customers_FullName` | `CREATE INDEX IX_Customers_FullName ON dbo.Customers (FullName);` | The default customer list page: `... WHERE IsActive = 1 ORDER BY FullName, Id OFFSET @n ROWS FETCH NEXT @m ROWS ONLY` |

Non-unique, non-filtered, single-column. `BE-008-04`'s verification asserts
`is_unique = 0` and `filter_definition IS NULL` — the opposite of what `007` asserts for
its two indexes, and worth checking in the same breath, because a copy-pasted migration
from `007` produces a *filtered unique* index here and that would reject the second
customer who shares a name (BR-4.6 explicitly allows it).

```sql
SELECT  i.name, i.is_unique, i.filter_definition
FROM    sys.indexes i
WHERE   i.object_id = OBJECT_ID('dbo.Customers');
```

### Why it is created here and not in `007`

`007`'s [`data-model.md`](../007-create-customer/data-model.md) deferred it explicitly:

> | Deferred | To | Why |
> | `IX_Customers_FullName` | `008-customer-list-and-profile` | It serves the search. No speculative indexes |

This is that feature. `docs/sdd/03-domain-model.md` has always listed the index under
`Customers`; what was open was **which migration creates it**, and the no-speculative-
indexes rule answers that: the migration that ships the query.

### What the index actually does, and what it does not

The query-to-index map in `docs/sdd/03-domain-model.md` carries an honest caveat that is
worth restating in full rather than softening:

> | Customer search by name | US-002 | `ix_customers_full_name` (substring search will not use it — see the note in that story's plan) |

Both halves are true at once:

| Clause | Uses the index? | Why |
|---|---|---|
| `WHERE FullName LIKE N'%term%' COLLATE …` | **No** | A leading wildcard cannot seek. It is an index scan at best, and the plan will usually prefer a clustered scan |
| `ORDER BY FullName, Id` with `OFFSET`/`FETCH` | **Yes** | This is the default view — `/customers` with no search — and it is the request that happens most |

So the index is justified by the ordering, not by the matching. That distinction is the
whole reason it belongs in this migration and not in `007`: without the list query there
is no `ORDER BY` and the index is speculative. `REV-008-04` checks an actual execution
plan rather than trusting this paragraph.

A composite `(FullName, Id)` was considered and rejected: `Id` is the clustered key, so
it is already present in every non-clustered index's leaf, and naming it a second time
buys nothing.

### What is deliberately not added

| Not added | Why |
|---|---|
| An index on `Email` or `PhoneE164` for search | `UX_Customers_Email` and `UX_Customers_Phone` already exist and are equally useless for a leading-wildcard match. A third index would be too |
| A full-text catalogue on `FullName` | It would make the substring search seekable and it is premature at this data volume. It also has to be created in every test container, which is a real cost paid on every test run |
| A persisted `SearchName` column and its index | This is Q-7's intended fix. It is a story, not a task — see `spec.md`, **Known limitation** |
| An index on `IsActive` | A `bit` column with one value in it has no selectivity. `007`'s filtered indexes already carry `IsActive = 1` in their predicates for the uniqueness rule, which is a different need |
| `Notes` or `CompanyName` indexes | Nothing filters or orders by them. `CompanyName` is searched, and a leading-wildcard match would not use an index on it either |

## No domain change

`Wasl.Domain/Customers/Customer.cs` is untouched. This feature reads; it does not add an
invariant, a factory, or a value object.

One type **is** added to the domain: `Wasl.Domain/Common/PagingParameters` — BR-7.2's
clamping. The reasoning, and the rejected alternative, are in
[`plan.md`](plan.md#why-pagingparameters-lives-in-wasldomain).

## Concurrency

Nothing in this feature writes, so no concurrency token is consumed. `version` is
**returned** by the detail endpoint so that `017-update-customer` does not have to change
the read shape later (ADR-006 as amended by ADR-013). The list omits it — a token on a
row nothing mutates is an invitation to hold a stale one.

## Reads, transactions, and the audit table

| Concern | This feature |
|---|---|
| Transaction | **None.** The transaction pipeline behaviour applies to commands; a `GET` wrapped in one holds locks for the duration of a read that changes nothing |
| `AuditLog` | **No row on success.** BR-9.1 governs state changes; reading a customer is not `Audit.Read`, which is reading the audit log itself (BR-9.11) |
| `AuditLog` | **One row on `401`**, written outside any transaction (BR-9.2, BR-9.4). Real as of `004b`, 2026-08-29 — it was a statement of intent when this file was written |

`TEST-008-12` asserts the row count is unchanged across a `200` and a `404`. It is a
negative assertion about a table this feature never touches, which is precisely the kind
that stops being true silently when the pipeline grows.
