# US-002 — Specification

**Phase:** 1 · **Story:** US-002 · **Feature:** `008-customer-list-and-profile` · **Status:** reconciled against delivered code 2026-08-28, **awaiting review**

---

## Reconciliation — what changed under this spec since it was written

Authored 2026-08-23, before `004`, `009`, `010`, `011`, `012` and `013`. It is the most accurate
of the four folders reconciled so far — no false statements about the schema — but it was written
as **the first read path in the system**, and it is now the seventh. Six of its premises have
moved.

### Now settled by delivery, and each one shrinks this feature

| # | The spec assumed | Now | Effect here |
|---|---|---|---|
| 1 | This feature "establishes the paging envelope, the `404` shape, the malformed-identifier behaviour, and the rule that a query does not travel the command half of the pipeline. Everything from `010` onwards inherits those four" | **All four were established by `010` and `012`.** The envelope is frozen and shipped, `errors/not-found` is in the registry, and a query implementing neither `ICommand` nor `IAuditableCommand` skips the transaction and audit behaviours — asserted by `003` AC-16 and `PipelineOrderTests` | `008` now **inherits** all four instead of defining them. AC-4, AC-5, AC-6, AC-9 and AC-10 are re-assertions of behaviour `010` already proves, on a second resource — worth keeping, because the clamping is per-endpoint code |
| 2 | `dbo.Tickets` does not exist, so the `Tickets` count column and the profile's status rail "have no data source in this phase" | **`dbo.Tickets` exists since `009`.** The stated reason for excluding them is gone | The exclusion **stands, and its reason changes**: it is no longer impossible, it is a **decision** — and it is precisely the N+1 that AC-11 forbids. See *The count column* below |
| 3 | `401` behaviour is a criterion (AC-14) | **`004` shipped `RequireAuthenticatedUser` as the fallback policy**, so an endpoint is closed before anyone writes `[Authorize]` | AC-14 becomes trivially true and is still asserted, because `AuthorizationSurfaceTests` reads endpoint **metadata** and a fallback policy is not metadata (`004` AC-10) |
| 4 | BR-9.2's `401` audit row is in *Rules referenced* | **Nothing writes an audit row on a `401`.** `004` AC-17/AC-18 are deferred to `004b` — a gap in BR-9.4 | `008` cannot satisfy that reference and does not claim to. Removed from the rules list with the reason |
| 5 | A read "writes **no** audit row" needed stating | Structural since `003`: the audit behaviour is constrained to `IAuditableCommand<TResponse>`, so a query cannot reach it | Still asserted — it is one line and it is the kind of guarantee that quietly stops being true |
| 6 | `Customer.IsActive` carries a database default | **Removed 2026-08-27** by the sideways review: `HasDefaultValue(true)` on a non-nullable `bool` meant EF applied it whenever the property held the CLR default, so deactivating a customer would have stored them **active** | Q-1's filter is unaffected — it reads the column. But **no row can currently be inactive**: `Customer` has no factory until `007`. See Q-D |

### Two things this spec asks for that the delivered API does not do

Neither is a mistake in the spec. Both need a ruling.

| # | The spec says | Delivered behaviour | Where it goes |
|---|---|---|---|
| 7 | **AC-3: a malformed id returns `400`**, explicitly "not `404`, which is what a `{id:guid}` route constraint would produce" | **`404`.** Every ticket route uses `{id:guid}`, the constraint fails the match before any action runs, and nothing `002` built sees the request. `011` met the identical conflict, asserted the observed `404`, and recorded it under *Contract changes* with `002b` as the owner | **Q-A** |
| 8 | **AC-16: the search's case-insensitivity is explicit in the query, not inherited from the server's default collation** | `001` gave **`Email`** an explicit `SQL_Latin1_General_CP1_CI_AS` collation and left **`FullName`**, `PhoneE164` and `CompanyName` inheriting the database default. So two thirds of AC-7's search surface is case-insensitive **by luck of the server** | **Q-B**, and it is a real defect rather than a preference |

---

## The count column, and why its exclusion is now a decision

`docs/sdd/design/screens/06-customers-list.md` shows a `Tickets` column; `07-customer-profile.md`
shows a status rail. Both cover US-002 **and** US-004 (`018`).

The original reason for dropping them — no table to count — is gone. The reason now is AC-11:

**A count per customer is the N+1 this feature's own criterion forbids.** Twenty rows on a page
means twenty `SELECT COUNT(*)`, and it is the single most likely way this endpoint acquires the
defect AC-11 was written about. Doing it correctly means a grouped join in the same query, which
is `018`'s design work and not a column to bolt on.

So it stays out, and the note in the frontend spec changes from *"no data source"* to *"one query,
or none"*. A reviewer comparing screen to build sees a decision either way; this is the version
that is true.

---

## In Scope

Retrieve one customer by id; paginated list with a free-text search across name,
email, and phone; profile screen; loading, error, not-found, and empty states.

**And the reason this feature is next**, in the product owner's words: `024`'s create-ticket form
has a **finished customer picker running on hard-coded data**, because `GET /api/customers` does
not exist. `008` removes a stub — it makes a built screen work on real data, which is the cheapest
remaining unit of visible progress.

## Out of Scope

| Excluded | Reason |
|---|---|
| Tickets on the profile, and the `Tickets` count column | `018`. **Reason updated** — see *The count column* above. No longer "the table does not exist"; now "a count per row is the N+1 AC-11 forbids" |
| Editing | `017` |
| Fuzzy or phonetic matching | No requirement; exact substring matching is sufficient at this scale, and fuzzy matching without ranking is worse than none |
| Result ranking | No requirement |
| Column configuration, export | No requirement |
| Arabic search normalisation | Q-7, deferred with the fix written down. A stated limitation below, not an omission |
| `includeInactive` on the list | `017`, where deactivation arrives. An untested parameter inside a frozen contract is worse than an absent one |
| An audit row on the `401` | `004b`. BR-9.2's reference is removed from this feature's rules with the reason, rather than left implying coverage |
| **Normalising `email` on write** | `007`. The frozen contract describes `email` as the "normalised form (lowercased, trimmed) — BR-4.2", and **nothing normalises it yet** — `Customer` has no factory until `007`, and the demo data is inserted as SQL. `008` returns what is stored. Recorded as Q-E rather than silently returning a value the contract mis-describes |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | Case-insensitive substring matching is enough | At tens of thousands of rows this needs full-text search; noted as a scaling limit, with the SQL Server form in `research.md` R-3 |
| A-2 | Every support user may see every customer | If visibility is scoped by team, this becomes a filtered query and BR-6 grows a row |
| A-3 | Alphabetical by name is the useful default order for a directory | If agents want newest-first, the change is one `OrderBy` and the same index no longer serves it — Q-2 |
| **A-4** | **The frozen contract and the frontend's hand-written types already agree** | Checked, not assumed: `src/wasl-web/src/lib/api-types.provisional.ts`'s `CustomerListItem` carries `id · fullName · email · phone · companyName · createdAtUtc`, which is `contracts/customers-read-api.md` field for field. The contract-first flow worked, so **`008` must not change the list shape** — the frontend has already built against it |
| **A-5** | **A read of a customer needs no `ICurrentUser`** | It does not: BR-6 permits both roles and there is no `403` path in this feature. The endpoint carries `[Authorize]` and nothing more, so unlike `011` there is no data-dependent check and therefore no denial to audit |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should inactive customers appear in search? | No. The list filters `IsActive = 1`. The filter ships now even though nothing can be inactive yet, because adding it later would silently change results for anyone who had built a habit on them |
| Q-2 | Default order of the list? | `FullName ASC`, then `Id ASC`. Nothing in US-002 states an order, and paging without a total order is AC-15's defect |
| Q-3 | Does the profile show an inactive customer? | Yes. `GET /api/customers/{id}` returns the record regardless of `IsActive`; a ticket may reference it and a `404` would break that link. Revisit in `017` |
| **Q-A** | **AC-3 wants `400` for a malformed id. Every delivered route returns `404`, because `{id:guid}` fails the route match before any action runs.** Do we drop the constraint on `/api/customers/{id}` to satisfy AC-3? | **No — assert the observed `404` and leave the fix to `002b`, exactly as `011` did.** Dropping the constraint here buys AC-3 and costs something worse: two resources in one API answering the same malformed input differently, so a client cannot write one handler. `002b` owns enveloping the statuses the framework short-circuits, and it fixes every route at once. **A ruling is needed because it means shipping a feature whose own AC-3 is knowingly unmet** — recorded as a deviation, with the test asserting today's behaviour and naming the contract it violates |
| **Q-B** | **AC-16: `FullName`, `PhoneE164` and `CompanyName` have no explicit collation — they inherit the database default. Two thirds of the search surface is case-insensitive by luck.** Fix by migration or in the query? | **A migration, giving all three the same explicit CI collation `Email` already has.** In-query `COLLATE` would work and would be invisible to the index, turning every search into a scan — and it would have to be repeated in `017` and `015`, which search the same columns. **This is a real defect, not a tidiness point:** on a `_CS_AS` server — the default in several installers — searching `ahmed` would silently miss `Ahmed`, and nothing in the code would look wrong. It is also the one thing in this feature that touches a table three other features already write to, so the ruling matters |
| **Q-C** | **AC-11 forbids a query per row, and nothing in this codebase can assert that.** Build the `DbCommandInterceptor` here? | **Yes, here.** `specs/README.md` records it: four features have such a criterion — `013` AC-14 (open, argued not asserted), `010`'s same-query projection (asserted only by reading LINQ), this AC-11, and `020`'s per-widget aggregate. Built once in the test host it closes AC-11 on delivery and retires two open ones in the same commit. **It is a fifth thing `008` carries, and whether that is worth it is your scheduling call, not a technical one** |
| **Q-D** | **Q-1's `IsActive = 1` filter cannot be exercised: no row can be inactive, because `Customer` has no factory until `007`** | **Provoke one in the test, the way `011` did for the inactive support user** — reflection on the property, confined to one helper, with the reason in its remarks. The alternative is an untested filter in a shipped query, which is how a filter gets removed by someone who cannot find a test for it |
| **Q-E** | The contract calls `email` the "normalised form (lowercased, trimmed)". **Nothing normalises it** — `007` owns the factory that would | **Return what is stored, and record it.** `008` is a read path; inventing normalisation on read would mean the stored value and the returned value differ, and BR-4's duplicate rule is enforced by an index on the **stored** column. `007` makes the contract's sentence true |
| Q-7 | Arabic hamza/ta-marbuta normalisation | Deferred with the fix written down — see *Known limitation* below. AC-7 means **literal** case-insensitive substring matching in both languages |

## Known limitation carried in deliberately — Arabic search (Q-7)

`docs/sdd/11-open-questions.md` Q-7 is **deferred with a known fix**, and it lands on AC-7.
Recorded so it is a stated limitation rather than a bug found during the Arabic pass:

- `أحمد`, `احمد` and `إحمد` are the same name with different hamza forms. `ة`/`ه` and `ى`/`ي` are
  interchanged at word endings, and tashkeel may or may not be typed. A literal substring search
  matches **none** of these against each other.
- The consequence is concrete: an agent searching `احمد` for a record stored as `أحمد` will not
  find it and will create the duplicate BR-4 exists to prevent. **For a customer with a phone
  number and no email, BR-4 will not catch that duplicate either** — the two records differ in
  phone, so neither filtered unique index fires. The prevention and the guarantee miss the same
  row.
- The fix is written down and not to be reinvented: a persisted `SearchName` column holding the
  normalised form (`أإآٱ`→`ا`, `ة`→`ه`, `ى`→`ي`, tashkeel and tatweel stripped), a normaliser
  applied on write, an index on it, and the same normaliser applied to the search term. Search the
  normalised column, display the original.
- That is a story, not a task. **And Q-B is its neighbour rather than its duplicate:** Q-B is about
  Latin case, which the fix is a migration; this is about Arabic orthography, which needs a column.

## Acceptance Criteria

AC-1 through AC-14 keep their original numbers; other features cite them. AC-15 and AC-16 were
added in the spec-kit migration. **AC-17 is added by this reconciliation.**

| # | Criterion |
|---|---|
| AC-1 | `GET /api/customers/{id}` returns name, contact details, company, notes, timestamps, and `version` |
| AC-2 | An unknown id returns `404` with the standard error contract |
| AC-3 | A malformed id returns `400`, not `500` — `ProblemDetails` with `type: errors/validation`, not an empty body — **see Q-A: this is knowingly unmet, and the test asserts the observed `404`** |
| AC-4 | `GET /api/customers` returns the standard paginated envelope |
| AC-5 | Default page 1, default page size 20; above 100 clamps to 100 (BR-7.2) |
| AC-6 | `page=0` or negative clamps to 1 |
| AC-7 | `search` matches name, email, and phone, case-insensitively, as a substring |
| AC-8 | A search term containing `%`, `_`, `[`, or a quote is treated as literal text |
| AC-9 | No results returns `200` with an empty array and a `totalCount` of zero (BR-7.6) |
| AC-10 | A page beyond the last returns `200` with an empty array and the correct `totalCount` |
| AC-11 | The list query does not issue a query per row |
| AC-12 | The profile screen distinguishes loading, error, and not-found |
| AC-13 | The list screen shows an empty state, not a bare table header |
| AC-14 | An unauthenticated request returns `401` |
| AC-15 | The list order is total: two customers sharing a `FullName` never appear on two pages or on none, across a full traversal |
| AC-16 | The search's case-insensitivity is explicit in the schema, not inherited from the server's default collation — **and asserted by reading `COLLATION_NAME` back from `INFORMATION_SCHEMA` for all three searched columns**, not from the configuration that set it |
| **AC-17** | **The list returns exactly the field set the frozen contract names, and no more.** Asserted over the raw response text: no `notes`, no `isActive`, no `rowVersion`, no `updatedAtUtc` on a **list** row. A list is the widest-read endpoint in the product and every extra field is a field a client starts depending on — `004` made the same assertion about the support-user picker for the same reason, and found nothing only because the projection was written narrow from the start |

## Edge Cases

From `testing/edge-cases.md`: unknown id, malformed id, no results, page beyond the last, `page=0`,
`pageSize` above the maximum and at zero, search containing pattern characters, API unreachable,
API slow.

Specific to this feature:

| Case | Expected |
|---|---|
| `GET /api/customers/not-a-guid` | **`404`, per Q-A** — the contract says `400` and `002b` owns the difference. The test asserts the observed behaviour and names the contract it violates, so it goes red the day `002b` lands |
| Search term `100%` | Matches the literal text `100%`. The `%` is escaped before it reaches `LIKE` |
| Search term `[a-z]` | Matches the literal text. `[` is a `LIKE` metacharacter **on SQL Server** and is not one on PostgreSQL — the character AC-8's original list was missing (`research.md` R-2) |
| Search term of only spaces | Trimmed to empty, treated as no search at all, not as a match-nothing filter |
| Two customers named `أحمد محمد`, page size 1 | Both reachable across pages 1 and 2, in a stable order (AC-15) |
| Search `احمد` for a record stored `أحمد` | **No match.** Stated limitation, Q-7 |
| `pageSize=0` | Clamped to the default of 20, not to 1 and not rejected |
| An Arabic `fullName` read back | Byte-identical. `nvarchar`, not `varchar` (ADR-013) — and asserted through a **UTF-8 client**, because `013` proved a manual PowerShell check reports `?????` for reasons of its own |
| A read request | Writes **no** audit row. Structural since `003`: the audit behaviour is constrained to `IAuditableCommand<TResponse>` |
| **An inactive customer, on the list and on the profile** | Absent from the list (Q-1), present on the profile (Q-3). Requires provoking one — Q-D |
| **A customer with a phone and no email** | Appears, with `email: null`. It is also the row BR-4's duplicate rule cannot protect, which is why Q-7's limitation matters |

## Rules Referenced

BR-7.2, BR-7.5 (the customer-search analogue), BR-7.6, BR-6 (view customer is permitted for both
roles, so this feature has **no** `403` path), BR-8.7 (nothing machine-readable is translated),
BR-9.11 (why a customer read is not `Audit.Read`), ADR-013 (SQL Server collation and `nvarchar`).

**BR-9.2 removed.** It was cited for the `401` audit row, and nothing writes one — `004` AC-17 and
AC-18 are open in `004b`. Citing a rule this feature cannot satisfy would imply coverage.
