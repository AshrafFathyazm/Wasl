# 017 — Research

Questions that had to be settled before the plan could be written, what was checked, and
what each one settled. A question that turned out not to matter is recorded as such,
because "we looked and it did not matter" is information too.

Several of these exist only because ADR-013 moved the database. The original US-003
artifacts predate it, so the concurrency mechanism they assumed does not exist.

---

## R-1 · What is the concurrency token now, and how does a client carry it?

**The problem:** ADR-006 was written against PostgreSQL, where `xmin` is a system column
and the token needs no schema at all — `UseXminAsConcurrencyToken()` and nothing else.
ADR-013 replaced PostgreSQL with SQL Server, which has no `xmin`.

**Checked:** ADR-013's type-mapping table, `03-domain-model.md`'s physical shape, and what
`.IsRowVersion()` actually changes in EF Core's behaviour.

**Settled:** a real `rowversion` column named `RowVersion`, mapped `.IsRowVersion()`,
exposed on the wire as its base64 form.

| Consequence | Detail |
|---|---|
| It appears in the schema | Already created by `001`. `017` adds nothing |
| It appears in every DTO | As `version` out and `expectedVersion` in, per `05-api-conventions.md` |
| It is 8 bytes | Base64 is 12 characters. A client that validates a length is coupling itself to that, which is why the contract calls it **opaque** |
| It increments on **any** `UPDATE` | Including one that changes no user-visible field. A no-op save still moves the token, which is why AC-23 exists |

**What was almost missed:** configuring the column as a plain `byte[]` property compiles,
saves, round-trips, and never conflicts — EF just overwrites it. That is last-write-wins
wearing a concurrency token's name, and no test that does not deliberately race two writes
will catch it. `BE-017-11` therefore asserts the column type from `sys.types` rather than
trusting the model, and `TEST-017-04` races two writes.

**Rejected:** a manual `Version int`. ADR-006 already rejected it — every new entity and
every raw `UPDATE` must remember to increment it, and the one that forgets is a silent
lost update. Re-litigating it here would be re-deciding a decided thing.

---

## R-2 · `expectedVersion` in the body, or `If-Match` with an `ETag`?

**Checked:** `docs/sdd/05-api-conventions.md` §Concurrency, and what each transport costs
across the four mutating endpoints that will need it (`011`, `012`, `016`, `017`).

`If-Match` is the HTTP-correct answer. It is what the header exists for, it composes with
caching, and a reviewer who knows HTTP will look for it.

**Settled: the body, as `expectedVersion`.** Three reasons, in order of weight:

1. **`05-api-conventions.md` already fixed it**, with a worked example. Changing it is an
   amendment to a blueprint document, not a decision inside a feature plan.
2. **One mechanism beats a correct one plus a legacy one.** `012-change-ticket-status`
   sends `{ status, expectedVersion }`; if `017` used `If-Match`, every client would have
   to know which endpoint wants which, and the answer would be "whichever was written
   first".
3. **The version travels with the payload the user is submitting.** A form serialises to
   one object. Splitting one of its values into a header is a place for it to be dropped
   by a fetch wrapper, an interceptor, or a proxy — and dropping it produces a `400`
   (AC-13), which is at least loud.

**Rejected, and worth naming:** accepting *both*. Two transports for one concept means the
server has a precedence rule nobody remembers, and a client that sets both to different
values gets undefined behaviour.

---

## R-3 · What happens when the duplicate rule meets the row it is checking?

**The question:** BR-4.4 says two active customers may not share a normalised email. On
update, the row being saved *is* an active customer with that email.

**Checked:** `007`'s `ActiveCustomerDuplicateQuery`, and both halves of BR-4.8 separately.

**Settled:** the application check gains `AND Id <> @excludeCustomerId`. The indexes are
untouched.

The asymmetry is the finding:

| Half of BR-4.8 | Needs the exclusion? | Why |
|---|---|---|
| Application pre-check | **Yes** | Without it the row matches itself and *every* save returns `409`. The feature is completely broken, immediately, which is the good kind of bug |
| Filtered unique index | **No** | SQL Server does not consider a row a duplicate of itself during an `UPDATE`. Nothing to fix |

**What this rules out:** the plausible alternative of skipping the duplicate check when the
email is "unchanged". It requires computing "unchanged" against the *normalised* value, and
getting that comparison wrong gives either a phantom conflict (comparing raw input to
stored) or a missed one. The exclusion is one `WHERE` clause with no comparison to get
wrong.

---

## R-4 · `PUT` or `PATCH`, and what does an omitted field mean?

**Checked:** `05-api-conventions.md`'s endpoint inventory (it lists `PUT` for this
endpoint), and what `PATCH` would actually require in C#.

**Settled: `PUT`, replacing the mutable field set. An omitted or `null` optional field is
cleared.**

`PATCH` needs a way to distinguish *absent* from *set to null* — either
`JsonPatchDocument`, or a nullable wrapper per field (`Optional<string?>`), or a
`fieldsToUpdate` list. All three are machinery, and for five fields on one screen the
machinery is larger than the thing it serves.

**The cost, stated plainly because it is the one silent failure on this endpoint:** a
client that sends only the field the user edited clears the other four, gets `200`, and
nothing reports it. The contact invariant catches it only if both contact methods went
(AC-3); losing `companyName` and `notes` is invisible.

**How that cost is contained**, three ways, because one was not enough:

1. AC-12 states it as an acceptance criterion with a test (`TEST-017-09`)
2. The contract carries it as a block quote, and `FRONTEND-API-GUIDE.md` shows the wrong
   code next to the right code
3. The screen is prefilled from `GET`, so `{ ...form, expectedVersion }` — sending
   everything — is also the *simplest* client code to write. The correct path is the lazy
   path

**Not settled here, deliberately:** whether a future bulk-edit or import needs `PATCH`.
There is no such story.

---

## R-5 · Does the `409` need to carry the current state?

**The temptation:** the client is about to refetch anyway. Returning the current resource
in the conflict response saves a round trip and gives the UI the "here is what changed"
material ADR-006 asks for.

**Checked:** RFC 7807, and ADR-006's reasoning about retries.

**Settled: no. `ProblemDetails` and nothing else.**

- RFC 7807 has no field for a resource. It would go in an extension member — a
  non-standard shape that every client has to learn, on one response, on one endpoint.
- ADR-006 rejected automatic retry because *"retrying a status change without asking the
  user is guessing at intent."* A conflict body carrying the fresh state is an invitation
  to write exactly that: merge the two, retry, tell nobody. The absence of the data is a
  structural discouragement, which is the same class of decision as writing the audit row
  in a behaviour rather than in each handler.
- The cost is one `GET` on an uncommon path, and `spec.md` A-2 records that contention is
  expected to be low.

**Consequence for the frontend:** the reload action is a real refetch (`FE-017-04`), and
`AC-22` asserts the body carries no customer data.

---

## R-6 · Which `409` wins when the version is stale *and* the email duplicates?

**Checked:** the order in which the two checks actually execute.

**Settled: the concurrency conflict, and not by choice** — it falls out of the mechanism.
The duplicate pre-check runs first in the handler, but the *authoritative* duplicate answer
is the unique index, and the `UPDATE` carrying the version in its `WHERE` clause never
reaches it: zero rows affected, `DbUpdateConcurrencyException`, `409`.

The pre-check could report the duplicate first, which would be *wrong*: the email the
client is being told about was read from a row state that no longer exists. Telling the
user "that email is taken" when the real situation is "this record moved" sends them to fix
the wrong thing.

**So the ordering is asserted rather than left to chance** (`spec.md` Edge cases): version
first, then the duplicate on the next attempt after a reload.

---

## R-7 · Where does the audit change set come from?

**Checked:** BR-9.8 (`Changes` records the fields that actually changed, before and after)
against the two places the diff could be computed.

**Settled: the domain returns it from `Customer.Update(...)`.**

| Option | Fails because |
|---|---|
| The handler diffs the command against the loaded entity | It compares **raw** input to **normalised** storage. `" Ali@Example.COM "` looks like a change to `ali@example.com`, so every save records a phantom edit |
| An EF `SaveChangesInterceptor` reading `ChangeTracker` | ADR-008 rejected interceptors for auditing outright: they see column touches, not business intent. It would also happen to work here, which is what makes it tempting |
| The domain, comparing value objects | Both sides are already canonical, because the value objects normalised them on the way in |

**The bug this avoids adds rows rather than losing them**, which is why it survives: an
audit table full of edits that did not happen still looks like a working audit table. AC-19
is the criterion that catches it — a save that changes nothing must produce an empty
`Changes`.

---

## R-8 · Does anything need to stop the client keeping a stale version after a save?

**Checked:** TanStack Query's behaviour for `invalidateQueries` versus `setQueryData` after
a mutation.

**Settled:** `setQueryData(['customer', id], response)` in `onSuccess`. The `200` response
already carries the new `version`, so the cache can be written directly and there is no
window in which the form holds the previous one.

`invalidateQueries` alone triggers a refetch, and between the mutation resolving and the
refetch landing, the form's held version is the old one. A user who saves twice quickly —
or a test that does — gets a `409` nobody caused.

**Why this is in `research.md` and not only in the plan:** it is invisible in single-user
manual testing, because a person rarely saves the same form twice without reloading. It is
the defect most likely to reach a reviewer, so it has an acceptance criterion (AC-23) and
two tests (`TEST-017-03` server-side, `TEST-017-17` client-side).

---

## R-9 · Is a customer field-history table needed after all?

**Checked:** US-003's out-of-scope list, ADR-008's opening table, and what a reviewer is
likely to ask.

**Settled: no, and the reason is worth saying out loud rather than pointing at the
exclusion.**

ADR-008's first row is *"Customer creation, edits, deactivation — US-003 explicitly put
field-level customer history out of scope. A phone number can be changed with no record of
who did it."* That sentence is the justification for the audit log existing at all. So the
answer to "who changed this phone number" is a `Customer.Updated` row with a `Changes`
diff, and it is a designed answer rather than a workaround.

What that costs, honestly:

| Gap | Consequence |
|---|---|
| No customer timeline in the UI | Nobody can see a customer's edit history on the profile until `019-audit-log-access` exists, and then only a Manager can, and only through the audit screen |
| No per-field query | "Show me every phone-number change" is a `LIKE` over a JSON column, not an indexed query. `AuditLog.Changes` is `nvarchar(max)` because SQL Server has no `jsonb` (ADR-013) — read whole, never queried by key |

Both are recorded in the checklist as accepted gaps. Building a `CustomerHistory` table
would be the redundancy ADR-008 accepted for tickets — where a *product* timeline required
it — without the requirement that justified it.

---

## R-10 · Anything in the house platform worth copying for optimistic concurrency?

**Checked:** `azm-formbuilder` for a `rowversion` / `IsRowVersion` pattern and for how it
surfaces conflicts.

**Found:** nothing to adopt. The house platform references
`Microsoft.EntityFrameworkCore.SqlServer` (which is why ADR-013 chose SQL Server), but the
concurrency handling there is not a pattern this feature can lift — and inventing a
similarity would be worse than recording the absence.

**What was taken from it anyway:** the provider, the `nvarchar` default, and `Moq` — all
already decided in `001`'s research. The pattern here is `007`'s, not the house platform's.
