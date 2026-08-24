# 019 — Research

Questions that actually had to be settled before this feature could be planned. Mined
from US-015's own notes, from the trade-offs the plan had to make, and from what changed
when ADR-013 replaced PostgreSQL with SQL Server.

Each entry: what was asked, what was checked, what it settled, what was rejected.

---

## R-1 · Cursor or offset pagination, and on which key?

**Asked because** `05-api-conventions.md` specifies `page`/`pageSize` with `totalCount`
for every list endpoint, and `AC-12` requires the opposite.

**Checked:** US-015's own note; ADR-008's `bigint` rationale; the behaviour of offset
paging over an append-only table.

**Settled:** cursor (keyset) pagination on `Id`, ordered `Id DESC`.

Offset paging assumes the row set is stable between requests. `AuditLog` is appended to
continuously — and by this very endpoint. Rows arrive at the top, everything shifts down,
and `page=2` re-serves what `page=1` already showed while something else is skipped
entirely. Nobody notices, because the rows look plausible either way. ADR-008 chose a
`bigint` identity key partly for this, so the mechanism was already paid for.

**The second half of the question mattered more.** `AC-1` says "sorted by
`occurredAtUtc` descending". `OccurredAtUtc` is `datetime2(3)`, so two rows written in the
same millisecond tie, and an unstable sort under keyset pagination drops or duplicates
rows at the page boundary — the exact defect cursor pagination was chosen to avoid.
`Id` is `IDENTITY` and stamped in the same insert, so `Id DESC` is newest-first **and**
total. Ordering on `Id DESC` satisfies AC-1's intent and is the only form that satisfies
AC-12 correctly.

**Rejected:** `ORDER BY OccurredAtUtc DESC, Id DESC` with a composite cursor. It is
correct, and it is more surface — two cursor components to encode, parse, validate and
get wrong — for a distinction (millisecond-level ordering) nobody can observe.

**Rejected:** an opaque base64 cursor. It hides nothing — the value is an audit row id
that the response already contains in plain text — and it makes a `400` on a malformed
cursor undebuggable.

---

## R-2 · How is a **query** audited, when the pipeline was built for commands?

**Asked because** BR-9.11 makes the read an audited event, and `003-audit-trail` built
the mechanism around `IAuditableCommand` with an architecture test (NFR-10) asserting
every `ICommand` implements it. A read is not a command.

**Checked:** ADR-008's "explicit writes, not an interceptor" section; ADR-010's statement
that MediatR exists in this system for exactly three pipeline concerns.

**Settled:** split the marker. `IAuditableRequest` carries the action name;
`IAuditableCommand : IAuditableRequest` is what the architecture test keeps checking; the
audit behaviour is registered for `IAuditableRequest`. The transaction behaviour stays
keyed on `ICommand`, so this read opens no transaction and its row is written
independently — the same asymmetry BR-9.4 already describes for denials.

**And the ordering, which is the part that bites:** the row is written **after** the
handler returns and the page has been materialised.

- Written before, the new row falls inside the id range the query then reads, so **every
  response contains its own audit row**. A client that refetches sees the list grow by
  one each time, indistinguishable from real activity. `AC-14` exists to pin this.
- Written after, a read that throws leaves no row. BR-9.2 requires rows for auth events,
  not for faults, so that is inside the rules — recorded as an accepted gap rather than
  discovered later.

**Rejected:** writing the row by hand in the handler. It would be the only hand-written
audit row in the system, and ADR-008's entire mitigation for "someone forgets one" is
that no handler writes its own.

**Rejected:** modelling the read as a command to reuse `IAuditableCommand` unchanged. It
would open a transaction for a read and would blur what the architecture test means —
"command" would stop meaning "changes state".

---

## R-3 · Does `outcome=Denied` actually use `IX_AuditLog_NotSuccess`?

**Asked because** `AC-4` names the index in the criterion, and the index's whole purpose
is the post-incident query. This is the most likely place in the feature for something to
pass while doing nothing.

**Checked:** the index definition in `03-domain-model.md` —
`(OccurredAtUtc DESC) WHERE Outcome <> 'Success'` — against how SQL Server matches
filtered indexes.

**Settled:** it is **not** safe to assume. Two reasons:

1. A filtered index is matched only when the optimizer can prove the query predicate
   implies the index filter. `Outcome = 'Denied'` does imply `Outcome <> 'Success'`
   logically, but implication across an inequality filter is not reliably derived.
2. `Outcome` is neither a key nor an included column, so the residual predicate needs a
   lookup per row. Faced with that, the optimizer frequently prefers a scan.

**What was decided, in order:**

| Step | Action | Cost if unnecessary |
|---|---|---|
| 1 | The handler adds a redundant `AND Outcome <> 'Success'` whenever the requested outcome set excludes `Success` — giving the optimizer the literal it needs | None; it is implied by the filter the caller asked for |
| 2 | Verify with a **real execution plan**, not a row count | One integration test that captures plan XML |
| 3 | Only if the plan still ignores it: migration `AlterAuditLogNotSuccessIndexIncludeOutcome` → `(Id DESC) INCLUDE (Outcome) WHERE Outcome <> 'Success'` | A migration against an object `003` owns, recorded as a deviation |

**The silent failure named:** an AC that asserts *rows* passes whether or not the index it
names is touched. The rows are correct in both worlds. So the assertion for AC-4 is the
plan, and the row assertion is separate.

**Rejected:** pre-emptively amending `003`'s index. An index changed on speculation is
the same mistake as an index added on speculation, and the measurement is one test away.

**Rejected:** `outcome=NotSuccess` as a magic filter value. It would make the index
trivially matchable and would put a value in the API that does not exist in the enum —
a contract that lies about the data.

---

## R-4 · Keep `totalCount`?

**Asked because** `05-api-conventions.md` includes `totalCount` in every envelope "because
the UI shows a count", and this envelope drops it.

**Checked:** what the count would cost and what it would be worth. `COUNT(*)` over
`AuditLog` with a residual `LIKE` predicate is a full scan; with a growing table it gets
slower forever; and the answer is already out of date by the time it renders, because a
row was appended by this very request.

**Settled:** no `totalCount`, no `totalPages`, no `page`. `hasMore` is derived by reading
`pageSize + 1` rows and returning `pageSize` — one extra row instead of a second query.

**Consequence accepted, and it lands on the frontend:** the shared pagination pattern in
`10-shared-patterns.md` assumes numbered pages and a total, so **it does not apply to this
screen**. Newer/Older with a cursor stack instead. That is stated in `frontend-spec.md`
rather than left for the FE lane to discover when the design does not fit.

**Rejected:** an approximate count from `sys.dm_db_partition_stats`. Fast, and a number
that disagrees with the rows on screen is worse than no number.

---

## R-5 · `bigint` on the wire

**Asked because** `AuditLog.Id` is the only `bigint` key in the schema (ADR-008) and the
cursor is built from it.

**Checked:** JavaScript's `Number.MAX_SAFE_INTEGER` (2^53 − 1) against `bigint`'s range,
and what `JSON.parse` does past it — rounds, silently, with no error.

**Settled:** `id` and `nextCursor` are **strings** in the contract. `cursor` is accepted
as a string and parsed to `long` server-side, with a `400` on anything non-numeric.

Demo data will never reach 2^53. The reason to do it now is that the failure mode is
"pagination occasionally skips a row" appearing months later, with nothing in the diff to
point at.

**Rejected:** `BigInt` on the client. It does not survive `JSON.parse` without a reviver,
and the client has no arithmetic to do — it echoes the value back as a cursor.

---

## R-6 · What does the read promise about `changes`, now that it is `nvarchar(max)`?

**Asked because** ADR-013 replaced `jsonb` with `nvarchar(max)` plus
`CHECK (ISJSON(Changes) = 1)`. `jsonb` would have guaranteed a parsed document and
allowed querying inside it; the check guarantees only that the text is valid JSON.

**Checked:** what `ISJSON` does and does not enforce, and what BR-9.8 says `Changes`
contains.

**Settled:** the endpoint returns `changes` as parsed JSON and **does not validate its
shape**. The contract documents the shape `003` writes —
`{ "Field": { "from": …, "to": … } }` — as the shape the client renders specially, and
requires the client to fall back to raw text for anything else.

The reader is not the authority on a column the writer owns. Validating on read would
reject rows an earlier version of the writer produced, which means losing them from the
log — the one thing an audit log may not do.

**Also settled:** no searching inside `changes`. There is no JSON index, so it would be a
`LIKE '%…%'` full scan over the widest column in the database, and nothing in FR-6.7 asks
for it. It is in `spec.md`'s out-of-scope list with that reason.

---

## R-7 · Where does the `403`'s audit row come from, and is it in a transaction?

**Asked because** BR-9.11's denial and BR-9.4's "written independently" meet here, and
this endpoint is the one place where getting it wrong is most visible: an audit log that
does not record who was refused access to the audit log.

**Checked:** BR-9.2 (every `401` and `403` writes a row), BR-9.4 (no business transaction
to join), ADR-008's "same transaction, with one exception".

**Settled:** the `ManagerOnly` policy rejects at the boundary, so the handler never runs
and no `Audit.Read` row is written for a denied attempt. The `Auth.Forbidden` row comes
from the authorization-failure path `004-auth-and-roles` installs for every `403`, written
outside any transaction.

This feature **asserts** that row (`AC-13`, `TEST-019-05`); it does not build the writer.
If `004` wired the row for some paths and not others, the `403` here is silent — which is
precisely why it is a test and not a note.

**Also settled:** a `401` writes `Auth.Unauthenticated`, not `Auth.Forbidden`, and the
token check runs first. Conflating them would make `WHERE Action = 'Auth.Forbidden'` mean
"or possibly just an expired token", which destroys the query's meaning.

---

## R-8 · Prefix matching on `Action` — escaping, and case

**Asked because** `AC-3` requires `action=Auth.` to return every authentication event, and
a naive `LIKE` on user input has two problems.

**Checked:** `LIKE` metacharacter behaviour, and the collation on `Action`.

**Settled, escaping:** `%`, `_` and `[` in the supplied prefix are escaped with an
explicit `ESCAPE` clause. Without it, `action=%` returns the **entire table**, and it
presents as "the filter didn't apply" rather than as an injection — so it survives review.
A unit test on the pure prefix-builder covers it, because an integration test asserting a
row count passes either way.

**Settled, case:** `Action` is `nvarchar(80)` with the server default collation, which is
case-insensitive in a normal SQL Server installation, so `auth.` matches `Auth.*`. That is
forgiving and desirable — **but it is a property of the server's collation, not of this
code.** On a case-sensitive server the filter becomes case-sensitive with no error. It is
recorded here and in the contract rather than assumed, and no explicit collation is added
to the column: that would be a schema change to an object `003` owns, for a filter, when
`Email` is the only column ADR-013 gives an explicit collation to and for a reason
(uniqueness, not searching).

**Settled, index:** none. `LIKE 'Auth.%'` is left-anchored and would seek on
`(Action, Id DESC)` if that index existed. It does not, deliberately — no speculative
indexes — so the predicate is residual on a backwards clustered scan. `data-model.md`
names the volume at which that stops being acceptable and the index that fixes it.

---

## R-9 · How is any of this verified against SQL Server?

**Asked because** the original artifact predates ADR-013, and PostgreSQL habits do not
transfer: `\d+` does not exist, and `Testcontainers.PostgreSql` is the wrong package.

**Checked:** ADR-013's testing decision, `testing/test-strategy.md`'s rejection of EF
`InMemory`.

**Settled:**

| Need | How |
|---|---|
| A database for integration tests | `Testcontainers.MsSql` (Developer edition image; the EULA is accepted via an environment variable in the test setup — `setup.md` records it). **Never** `Testcontainers.PostgreSql` |
| Confirm an index exists with its filter | `SELECT name, is_unique, has_filter, filter_definition FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.AuditLog')`. **Not** `\d+` |
| Confirm the append-only permission | `SELECT permission_name, state_desc FROM sys.database_permissions` for the application principal — `DENY` on `UPDATE` and `DELETE`. `DENY`, not `REVOKE`: `DENY` outranks a grant inherited from role membership (ADR-013) |
| Confirm an index is actually **used** | Capture the execution plan for the query issued by the handler and assert the index name appears in it |
| Constraint behaviour of any kind | A real engine. EF `InMemory` enforces no constraint, no filtered index and no check, which is precisely what these tests exist to observe |

---

## R-10 · There is no screen spec. What is the screen specified from?

**Asked because** every other feature's `frontend-spec.md` points at a file in
`docs/sdd/design/screens/`. For the audit log there is none — the directory holds eleven
screens and this is not one of them — and US-015 excludes a UI outright.

**Checked:** `design/screens/` (no audit screen), `10-shared-patterns.md`,
`component-inventory.md` (the `Table` primitive and its column rules),
`layout-patterns.md` (the list-page composition), `02-app-shell.md` (navigation).

**Settled:** the screen is composed from the shared patterns and the `Table` primitive
and is **authored in `frontend-spec.md`, not inherited**. That is stated at the top of
that file. Claiming to match a design nobody has seen is the one thing not to do here:
the reviewer's next question is "match what?", and there is no answer.

Three specific findings from the patterns:

| Pattern | Applies? |
|---|---|
| The four states, every screen | Yes, and **Forbidden** is the fourth — inline beside the control, not a toast |
| Pagination (`Rows per page` + numbered pages) | **No.** It assumes numbered pages and a total, and R-4 removed both. Newer/Older with a cursor stack instead, and this divergence is flagged rather than quietly reshaped |
| List page composition (title → tabs → toolbar → table → footer) | Partly. No status tab bar: `outcome` has three values and belongs in the filter bar, not promoted to tabs |

**Also settled:** the entry point. `02-app-shell.md` states *"Manager — same nav; the roles
differ in permissions, not in navigation"*, so a Manager-only nav item is a change to the
shell. The audit log goes in the user popover beside `Settings`, which is that file's own
answer for a destination used monthly rather than hourly. Recorded as `Q-019-2` because it
needs a design owner's confirmation, not because it is arbitrary.

---

## R-11 · Does reading the log make the log unreadable?

**Asked because** every read appends a row. It is worth asking whether the feature
degrades the thing it exposes.

**Checked:** the write rate a UI produces. A 30-second poll on one open tab writes 2,880
rows a day. Four managers with the tab open overnight write more audit rows than the
business does.

**Settled:** the screen does not poll, does not refetch on window focus, uses a long
`staleTime`, and offers an explicit **Refresh**. Filter changes still refetch — that is a
deliberate user action, and one row per deliberate action is exactly what the rule intends.

This is the only screen in the product where fetching has a side effect, so it is stated
as a rule in `frontend-spec.md` with the reason attached. A default
`refetchOnWindowFocus: true` would be invisible in review and would fill the table.

**Not settled — escalated instead:** whether `Audit.Read` rows should be excluded from the
default view so the log does not fill with reads of itself. Excluding them would hide
BR-9.11's evidence, which is the opposite of the point. Left visible, with `action` as a
filter so a Manager can exclude them for one query. If the noise becomes real, the answer
is retention (Q-9), not filtering the record.
