# 008 — Research

Questions that had to be answered before the plan could be written, what was checked,
and what each one settled. Most of them exist because this feature was specified against
PostgreSQL and is being built on SQL Server (ADR-013), and two exist because it is the
first **read** path in the system and the pipeline was designed around commands.

A question that turned out not to matter is recorded as such, because "we looked and it
did not matter" is information too.

---

## R-1 · There is no `ILIKE`. What replaces it, and what breaks quietly?

**The original plan said:** *"Search is a parameterised `ILIKE` over three columns."*

**Checked:** SQL Server's `LIKE`, collation precedence, and the default collation of the
`mcr.microsoft.com/mssql/server:2022-latest` image that `Testcontainers.MsSql` starts.

**Settled:** `LIKE` with an **explicit** collation on the compared expression —
`EF.Functions.Like(EF.Functions.Collate(c.FullName, "Latin1_General_100_CI_AS"), pattern)`.
`ILIKE` is a PostgreSQL operator with no SQL Server equivalent; case-insensitivity on
SQL Server is a property of the collation, not of the operator.

**The part that fails silently, and why AC-16 was added:** the container's default
collation is `SQL_Latin1_General_CP1_CI_AS` — case-**insensitive**. So a plain
`LIKE` with no collation clause passes every test that anyone would think to write,
locally and in CI, while the case-insensitivity is coming from the server rather than
from the query. Deploy the same code to a `CS_AS` server and AC-7 breaks with no failing
test anywhere near the change.

`007` put a case-insensitive collation on the `Email` **column**, but deliberately not on
`FullName`: `docs/sdd/03-domain-model.md` records that a blanket case-insensitive
collation changes comparison semantics for every column, including ones where it was
never wanted. So `Email` would be insensitive by column and `FullName` only by accident
of the server — two different mechanisms for one acceptance criterion. Making it
explicit in the query gives all three columns the same rule for the same reason.

**Rejected:** `WHERE LOWER(FullName) LIKE LOWER(@term)`. It works, and it makes the
predicate non-sargable in a second, independent way, on a column whose index we are
otherwise justifying. It also silently changes behaviour for Turkish-style casing.

**Consequence for the plan:** `BE-008-06`, AC-16, and `TEST-008-10` — which asserts on the
generated SQL rather than on a result, because a behavioural test cannot tell the two
cases apart on a `CI_AS` server. That white-box trade is recorded in `plan.md` rather
than disguised.

---

## R-2 · Escaping the search term: which characters, and how?

**Checked:** SQL Server's `LIKE` pattern metacharacters against PostgreSQL's.

**Settled:** SQL Server treats `%`, `_`, **and `[`** as pattern characters. PostgreSQL's
`LIKE` has only `%` and `_`. AC-8's original list — `%`, `_`, and a quote — was complete
for the database the spec was written against and is **one character short** for the one
being built on. `[` is added to the edge cases; AC-8's number is unchanged because other
features cite it.

A quote needs no escaping at all: the term is a parameter, never concatenated. It is
listed in AC-8 as an injection check, and it stays there for that reason.

**How:** escape in C# before the term reaches EF Core, by bracketing:

| In the term | Sent as |
|---|---|
| `%` | `[%]` |
| `_` | `[_]` |
| `[` | `[[]` |

`]` needs no escape outside a bracket expression.

**Rejected:** `LIKE @p ESCAPE '\'` with a backslash. It reads better, and it requires the
four-argument `EF.Functions.Like(DbFunctions, string, string, string)` overload. Constitution
principle VI says every referenced API is confirmed to exist before it is relied on, and
bracket escaping needs only the two-argument overload that is certainly there. If the
escape overload is confirmed during implementation, switching is a two-line change and
`ai-notes.md` records the check either way.

**Consequence:** `CustomerSearch.cs` — one small class, one caller, escaping and collation
in one place. Not a helper in `Common`: it has exactly one caller, and a second one is not
in prospect (`010`'s ticket search covers different columns).

---

## R-3 · Will `IX_Customers_FullName` actually be used, and should it exist here at all?

**The tension:** the original plan is honest that a leading-wildcard search cannot use an
index. `docs/sdd/03-domain-model.md` repeats the caveat. But the same blueprint lists the
index under `Customers`, and `007` deferred creating it *to this feature*. If the search
cannot use it, why create it?

**Checked:** the two clauses of the list query separately.

**Settled:** the index is justified by the `ORDER BY`, not by the `WHERE`.

| Clause | Seek possible? |
|---|---|
| `FullName LIKE N'%term%'` | No. Leading wildcard |
| `ORDER BY FullName, Id` + `OFFSET`/`FETCH` | Yes — and this is the **default** view, `/customers` with no search term, which is the most-requested page in the feature |

Without the index, every unsearched page sorts the table. That is a named query with a
measurable cost, which is exactly what the no-speculative-indexes rule asks for. The
original honesty stands unchanged — the search predicate still scans — and the index now
has a justification that survives review.

**Consequence:** `data-model.md` states both halves; `REV-008-04` checks a real execution
plan rather than trusting the paragraph.

---

## R-4 · What order does `Skip`/`Take` produce with no `OrderBy`?

**Checked:** what EF Core emits for `Skip`/`Take` on SQL Server when no ordering is
specified. SQL Server's `OFFSET`/`FETCH` is only valid after an `ORDER BY`, so EF Core
supplies `ORDER BY (SELECT 1)`.

**Settled:** it **compiles and runs**, and returns rows in whatever order the plan
happens to produce. That is the failure mode: no exception, no warning, correct-looking
results on a small seeded table, and a row that appears on two pages or on none once the
table is large enough for a parallel or different plan.

`ORDER BY FullName` alone is not enough either. BR-4.6 explicitly permits two customers
to share a name, so `FullName` is not a total order and `OFFSET`/`FETCH` over ties is
undefined. The tiebreaker is `Id`.

**Settled order:** `FullName ASC, Id ASC`.

**Consequence:** AC-15 was added, `TEST-008-09` traverses three same-named customers at
`pageSize=1`, and Q-2 records that nothing in US-002 stated an order — so the choice is a
working assumption, not an invention.

**Not settled by research:** whether alphabetical is what agents want. A directory sorted
by name is the conventional answer and the index supports it; BR-7.1's newest-first rule
is about tickets and does not extend here. Q-2 carries it.

---

## R-5 · What does a malformed `Guid` in the route actually return?

**Checked:** minimal-API route matching and parameter binding, with and without the
`:guid` route constraint. This feature owns the **first** `Guid` route parameter in the
system, so nothing had established the answer.

**Settled:** three behaviours, and AC-3 accepts only one of them.

| Implementation | `GET /api/customers/not-a-guid` |
|---|---|
| `{id:guid}` | **`404`.** The route does not match, so the endpoint is never reached. AC-3 fails, and it fails looking exactly like correct not-found behaviour |
| `{id}` bound to `Guid id` | **`400`** from binding, with **no `ProblemDetails` body**. A client doing `problem.type.endsWith(...)` reads `undefined` and falls through to its generic error branch |
| `{id}` bound to `Guid id`, plus a `BadHttpRequestException` → `errors/validation` mapping in the shared middleware | `400` with the same body shape as every other validation failure |

**Chosen:** the third. The mapping goes in `002-error-contract`'s middleware, not in the
endpoint, so it covers every future `Guid` route parameter without anyone remembering —
structural correctness over remembered discipline (constitution V).

**Rejected:** binding `string id` and calling `Guid.TryParse` in the endpoint. It is
explicit and it works, and it must be repeated in every endpoint that takes an id, which
is the definition of a rule that depends on being remembered. It also degrades the OpenAPI
schema from `format: uuid` to a bare string, which then propagates into the generated
client types.

**Consequence:** `BE-008-02`, `TEST-008-03`, and a row in the contract's behaviour table.

---

## R-6 · Do the command pipeline behaviours apply to a query?

**Checked:** ADR-010's three justifications for MediatR — validation, the audit row
(BR-9.1), the transaction boundary — and NFR-10's architecture test, which requires every
`ICommand` to implement `IAuditableCommand`.

**Settled:**

| Behaviour | Applies to a query? |
|---|---|
| Validation | Yes. `page`, `pageSize`, and `search` are input |
| Audit | **No.** BR-9.1 is about state changes. A customer read is not `Audit.Read` — that action is reading the audit log (BR-9.11) |
| Transaction | **No.** A `GET` inside a transaction holds locks for the duration of a read that changes nothing |

The queries therefore implement the query marker, never `ICommand`. **If one is typed as
`ICommand` by copy-paste, the build fails** with the architecture test's message about a
missing audit action — which reads as an audit bug and is a typing mistake. That is worth
a task rather than a debugging session.

**Consequence:** `BE-008-09`, `TEST-008-12`, the asymmetry table in `plan.md`, and the
plan's statement that this feature establishes the pattern that `010` and everything after
it inherits.

---

## R-7 · `totalCount`: one query or two, and what should AC-11 assert?

**Checked:** `05-api-conventions.md`, which already settles the policy — *"`totalCount` is
a second query; it is included because the UI shows a count."*

**Settled:** two commands per list request, the page and the count. AC-11 says "does not
issue a query per row", and the natural assertion — *one* command — would **fail correct
code**. `TEST-008-08` asserts **exactly 2**.

Recorded because the wrong assertion here is the plausible one, and a test that fails on
correct code gets "fixed" by loosening it until it asserts nothing.

**Rejected:** a windowed `COUNT(*) OVER ()` in the same statement. One round trip instead
of two, and it computes the count for every row of the page. `05-api-conventions.md`
requires an ADR before the count's cost is renegotiated, and this is not that.

---

## R-8 · Arabic search normalisation — deferred, and what that costs concretely

**Checked:** `docs/sdd/11-open-questions.md` Q-7, whose status is *"Deferred, with a known
fix — not open."*

**Settled:** literal case-insensitive substring matching in both languages, and the
limitation is stated in `spec.md` rather than discovered during the Arabic pass.

What the deferral actually costs, stated once so it is not re-litigated:

- `أحمد` / `احمد` / `إحمد` do not match each other. Nor do `ة`/`ه` or `ى`/`ي` at word
  endings. Tashkeel and tatweel are matched literally.
- The consequence chains: an agent who cannot find `أحمد` creates a second record, and
  **for a customer with a phone and no email, BR-4 does not catch that duplicate either**
  — the two rows differ in phone, so neither filtered unique index fires. Prevention and
  guarantee miss the same row. That second half is the part the original artifacts did not
  spell out.
- The fix is written down in Q-7 and is not to be reinvented: a persisted `SearchName`
  column, a normaliser on write, an index on it, the same normaliser on the term; display
  the original. Applied to `Customer.FullName` and `Ticket.Subject`.
- It is a story, not a task: a column, a migration, a backfill, a normaliser with its own
  test matrix, and a second search path.

**Consequence:** `TEST-008-13` pins the limitation with an assertion — searching `احمد`
for a stored `أحمد` returns nothing, deliberately. When the normalisation ships, that
assertion is what has to change, which is how deferred work announces itself instead of
being rediscovered.

---

## R-9 · Where does the clamping logic live?

**Checked:** ADR-010's two-project layout, and whether BR-7.2 is a business rule or a
transport concern.

**Settled:** `PagingParameters` goes in `Wasl.Domain/Common`. BR-7.2 is a numbered
business rule, the constitution puts rules in the domain once, the type is pure C# with
no package reference so `Wasl.Domain`'s zero-dependency property holds, and its boundary
tests then live in `tests/Wasl.Domain.Tests` with no host and no container.

`PagedResult<T>` stays in `Wasl.Api/Common/Paging`. It is the wire envelope from
`05-api-conventions.md`, not a rule.

**Rejected:** both in `Wasl.Api/Common/Paging`. It reads more naturally — paging is a
transport concern and a domain that knows about page sizes is slightly odd — but the
boundary tests then live in `Wasl.Api.IntegrationTests`, the project that owns the SQL
Server container fixture. Pure-logic tests behind a container start is the wrong trade,
and it is the reason the tie broke toward the domain.

**Honest note:** this is the weakest-held decision in the feature. If `010` finds the
domain placement awkward, moving it is a file move and a namespace change, and the tests
move with it.

---

## R-10 · The `Tickets` count column on the list screen

**Checked:** `docs/sdd/design/screens/06-customers-list.md`, which specifies a `Tickets`
count column, and `07-customer-profile.md`, which specifies a status-count rail and a
recent-tickets section.

**Settled:** neither is buildable in this feature. `dbo.Tickets` is created by `009`. The
only ways to render the column now are a fabricated `0` — which is a lie that looks like
data — or a query against a table that does not exist.

Both are scoped to `018-customer-overview`, which is where US-004 lives. The profile route
and layout do not change then: `018` swaps the fetcher from `/api/customers/{id}` to
`/api/customers/{id}/overview` and fills the rail region.

**Consequence:** stated in `spec.md` **Out of Scope**, in `frontend-spec.md` under *"What
the screen files specify that this feature does not build"*, and as a row in the
contract's behaviour table. A column present in the design and absent from the build,
with no note, reads as an oversight every single time it is reviewed.

---

## R-11 · Does anything here need `Testcontainers.MsSql` specifically?

**Checked:** whether the feature's integration tests could run against EF `InMemory`,
since nothing writes.

**Settled:** no. Three of the acceptance criteria are properties of the database engine,
not of the query:

| AC | Why a real engine |
|---|---|
| AC-8 | `LIKE` metacharacter handling is the engine's, and `InMemory` does not implement `EF.Functions.Like` |
| AC-15 | `OFFSET`/`FETCH` ordering behaviour is the engine's |
| AC-16 | `COLLATE` does not exist in `InMemory`; the query would translate to a client-side `Contains` and pass for the wrong reason |

The last one is the interesting one: on `InMemory` the whole search would be evaluated in
memory with .NET string comparison, which is case-**sensitive** by default and would
therefore fail AC-7 — or pass it, if someone "fixed" it with `StringComparison.OrdinalIgnoreCase`,
producing a query that cannot be translated to SQL at all. Either way the test would be
measuring the wrong thing. `Testcontainers.MsSql`, per the constitution.
