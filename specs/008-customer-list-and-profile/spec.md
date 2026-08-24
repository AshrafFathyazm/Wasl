# US-002 — Specification

**Phase:** 1 · **Story:** US-002 · **Feature:** `008-customer-list-and-profile` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Understanding

Before raising a ticket, an agent needs to find the customer and confirm it is the
right one. Search is the preventive half of the duplicate rule from US-001: most
duplicates are created by someone who could not find the record that already existed.

This is the first **read** path in the system. It establishes the paging envelope, the
`404` shape, the malformed-identifier behaviour, and the rule that a query does not
travel the command half of the pipeline. Everything from `010-ticket-list-and-detail`
onwards inherits those four.

## In Scope

Retrieve one customer by id; paginated list with a free-text search across name,
email, and phone; profile screen; loading, error, not-found, and empty states.

## Out of Scope

| Excluded | Reason |
|---|---|
| Tickets on the profile | US-004 (`018`). The `dbo.Tickets` table does not exist until `009`, so the rail, the counts, and the `Tickets` column on the list have no data source in this phase — see the note below |
| Editing | US-003 (`017`) |
| Fuzzy or phonetic matching | No requirement; exact substring matching is sufficient at this scale, and fuzzy matching without ranking is worse than none |
| Result ranking | No requirement |
| Column configuration, export | No requirement |
| Arabic search normalisation | Q-7, deferred with the fix written down. Stated as a limitation below, not omitted |
| `includeInactive` on the list | Deferred to `017`, which is where deactivation arrives. An untested parameter inside a frozen contract is worse than an absent one |

**The `Tickets` count column and the profile's status rail are specified in the screen
files but are not built here.** `docs/sdd/design/screens/06-customers-list.md` and
`07-customer-profile.md` both cover US-002 **and** US-004. Building the column now would
mean either a fabricated zero or a query against a table that does not exist. It is
dropped from this feature's frontend spec explicitly, so a reviewer comparing screen to
build sees a decision rather than a missing column.

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | Case-insensitive substring matching is enough | At tens of thousands of rows this needs full-text search; noted as a scaling limit. The SQL Server form of that limit is in `research.md` R-3 |
| A-2 | Every support user may see every customer | If visibility is scoped by team, this becomes a filtered query and BR-6 grows a row |
| A-3 | Alphabetical by name is the useful default order for a directory | If agents actually want newest-first, the change is one `OrderBy` and the same index no longer serves it — see Q-2 |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should inactive customers appear in search? | No. The list filters `IsActive = 1`. Deactivation does not exist until `017`, so no row can currently be excluded — and the filter still ships now, because adding it later would silently change results for anyone who had built a habit on them. The `includeInactive` parameter is **not** in the frozen contract |
| Q-2 | What is the default order of the list? | `FullName ASC`, then `Id ASC` as a tiebreaker. Nothing in US-002 states an order, and paging without a total order is the defect in AC-15 |
| Q-3 | Does the profile show an inactive customer? | Yes. `GET /api/customers/{id}` returns the record regardless of `IsActive`; a ticket may reference it and a `404` would break that link. Revisit in `017` |

## Known limitation carried in deliberately — Arabic search (Q-7)

`docs/sdd/11-open-questions.md` Q-7 is **deferred with a known fix**, and it lands on
AC-7 in this feature. Recorded here so it is a stated limitation rather than a bug found
during the Arabic pass:

- `أحمد`, `احمد`, and `إحمد` are the same name with different hamza forms. `ة`/`ه` and
  `ى`/`ي` are interchanged at word endings, and tashkeel may or may not be typed. A
  literal substring search matches **none** of these against each other.
- The consequence is concrete: an agent searching `احمد` for a record stored as `أحمد`
  will not find it and will create the duplicate BR-4 exists to prevent. **For a
  customer with a phone number and no email, BR-4 will not catch that duplicate
  either** — the two records differ in phone, so neither filtered unique index fires.
  The prevention and the guarantee both miss the same row.
- The fix is written down and not to be reinvented: a persisted `SearchName` column
  holding the normalised form (`أإآٱ`→`ا`, `ة`→`ه`, `ى`→`ي`, tashkeel and tatweel
  stripped), a normaliser applied on write, an index on it, and the same normaliser
  applied to the search term. Search the normalised column, display the original.
- That is a story, not a task, and it is not needed to demonstrate the flow. It is
  therefore not in this feature, and AC-7 means **literal** case-insensitive substring
  matching in both languages.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `GET /api/customers/{id}` returns name, contact details, company, notes, timestamps, and `version` |
| AC-2 | An unknown id returns `404` with the standard error contract |
| AC-3 | A malformed id returns `400`, not `500` — and the `400` body is `ProblemDetails` with `type: errors/validation`, not an empty body |
| AC-4 | `GET /api/customers` returns the standard paginated envelope |
| AC-5 | Default page is 1 and default page size 20; a page size above 100 is clamped to 100 (BR-7.2) |
| AC-6 | `page=0` or negative is clamped to 1 |
| AC-7 | `search` matches name, email, and phone, case-insensitively, as a substring |
| AC-8 | A search term containing `%`, `_`, `[`, or a quote is treated as literal text |
| AC-9 | No results returns `200` with an empty array and a `totalCount` of zero (BR-7.6) |
| AC-10 | A page beyond the last returns `200` with an empty array and the correct `totalCount` |
| AC-11 | The list query does not issue a query per row |
| AC-12 | The profile screen distinguishes loading, error, and not-found |
| AC-13 | The list screen shows an empty state, not a bare table header |
| AC-14 | An unauthenticated request returns `401` |
| AC-15 | The list order is total: two customers sharing a `FullName` never appear on two pages or on none, across every page of a full traversal |
| AC-16 | The search's case-insensitivity is explicit in the query, not inherited from the server's default collation |

AC-1 through AC-14 keep their original numbers; other features cite them. AC-15 and
AC-16 were **added in this migration** — both are decisions the SQL Server switch forced
into the open, and both name a failure that is invisible without a criterion. See
`research.md` R-1 and R-4.

## Edge Cases

From `testing/edge-cases.md`: unknown id, malformed id, no results, page beyond the
last, `page=0`, `pageSize` above the maximum and at zero, search containing pattern
characters, API unreachable, API slow.

Specific to this feature:

| Case | Expected |
|---|---|
| `GET /api/customers/not-a-guid` | `400` `errors/validation` naming `id`. **Not** `404`, which is what a `{id:guid}` route constraint would produce, and not the empty-bodied `400` that unconstrained minimal-API binding produces on its own (`research.md` R-5) |
| Search term `100%` | Matches the literal text `100%`. The `%` is escaped before it reaches `LIKE` |
| Search term `[a-z]` | Matches the literal text. `[` is a `LIKE` metacharacter **on SQL Server** and is not one on PostgreSQL — it is the character AC-8's original list was missing (`research.md` R-2) |
| Search term of only spaces | Trimmed to empty, which is treated as no search at all, not as a match-nothing filter |
| Two customers named `أحمد محمد`, page size 1 | Both are reachable across pages 1 and 2, in a stable order (AC-15) |
| Search `احمد` for a record stored `أحمد` | **No match.** Stated limitation, Q-7 |
| `pageSize=0` | Clamped to the default of 20, not to 1 and not rejected |
| An Arabic `fullName` read back | Byte-identical to what was written. `nvarchar`, not `varchar` (ADR-013) |
| A read request | Writes **no** audit row. BR-9.1 covers state changes; a read of a customer is not `Audit.Read`, which belongs to reading the audit log itself (BR-9.11) |

## Rules Referenced

BR-7.2, BR-7.5 (the customer-search analogue), BR-7.6, BR-6 (view customer is permitted
for both roles, so this feature has **no** `403` path), BR-8.7 (nothing machine-readable
is translated), BR-9.2 (the `401` audit row), BR-9.11 (why a customer read is not
`Audit.Read`).
