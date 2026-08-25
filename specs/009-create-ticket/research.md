# 009 — Research

Questions that had to be answered before the plan could be trusted, what was checked,
and what each one settled. Mined from the trade-offs in the original `plan.md` and from
what the move to SQL Server (ADR-013) and vertical slices (ADR-010) actually changed.

A question that turned out not to matter is recorded as such, because "we looked and it
did not matter" is information too.

---

## R-1 · Where does the ticket number come from?

**The requirement:** AC-3 (unique, human-readable `TCK-{yyyy}-{000000}`) and AC-11 (two
concurrent creations get two different numbers). Both, at once.

| Option | Verdict |
|---|---|
| `Guid` as the human-facing identifier | **Rejected.** `3b9a1f22-77c4-4f0e-9a51-6c2d8e4b1a90` is unusable in a phone call with a customer, which is the only reason a second identifier exists at all. The `Guid` primary key stays; it is just not what anyone says out loud |
| `COUNT(*) + 1` | **Rejected.** A race. Two concurrent creates both read `41` and both write `TCK-2026-000042`; the unique index then turns the second one into a `500` under exactly the load where it matters. This is the failure AC-11 was written to forbid |
| `MAX(TicketNumber) + 1` | **Rejected** for the same reason, plus it makes the number's *format* load-bearing for its *generation* — a parse of the string to get the next value |
| An application-side counter | **Rejected.** Not safe across instances and not safe across restarts. A single instance today is not an argument; it is the assumption that breaks silently on the day a second one starts |
| A database sequence | **Settled** |

**Settled:** `CREATE SEQUENCE dbo.TicketNumberSeq AS bigint START WITH 1 INCREMENT BY 1`,
read with `NEXT VALUE FOR`, formatted by the application at insert time.

`CREATE SEQUENCE` exists on SQL Server, so the mechanism chosen before ADR-013 survives
it unchanged — only the object name and the `AS bigint` clause are engine-specific
syntax. This was worth checking rather than assuming, because sequences are the one
PostgreSQL habit that most often has no SQL Server equivalent, and here it does.

**What the sequence costs, and why both costs are accepted:**

| Cost | Accepted because |
|---|---|
| Gaps in the series — a rolled-back create consumes a number | Sequence values are not returned on rollback. Making the series dense means serialising every create behind a lock, which is what the sequence was chosen to avoid |
| The number is drawn before the row commits | That is *why* AC-11 holds. Two creates get two values without either waiting |

Both are written into [`data-model.md`](data-model.md), because "why is `TCK-2026-000007`
missing?" will be asked and "it is a bug" is the wrong answer.

---


## R-2 · Does the number need an interface to be testable?

The original plan had `ITicketNumberGenerator` in `Wasl.Application` and
`SequenceTicketNumberGenerator` in `Wasl.Infrastructure`. Under ADR-010 neither project
existed, so the question was re-answered rather than re-homed.

> **Reversed 2026-08-26. ADR-010 is rejected and both projects exist, so the interface is
> back** — and this note was right about the thing it was actually protecting. The interface
> exists for the **layer boundary**, not for faking: the handler is in `Wasl.Application`, which
> cannot see EF Core, and a sequence is a SQL Server object. Same reason as
> `IApplicationDbContext`.
>
> **The objection below stands and is honoured:** a faked sequence proves nothing about AC-11.
> The concurrency test runs eight real concurrent creates against a real sequence, never against
> a substitute. That is a rule about the test, and it survived the layout changing under it.

**Checked:** what each test actually needs, against the constitution's rule — no new
abstraction without a second implementation in hand or in prospect.

**Settled:** split the concern instead of abstracting it.

| Concern | Where | Tested by |
|---|---|---|
| Formatting — `TCK-{yyyy}-{000000}` | `TicketNumber.Format(int year, long sequence)` in `Wasl.Domain`. Pure, static, no database | A unit test, including the six-digit pad and the year boundary |
| Drawing the next value | `TicketNumberSequence`, a concrete class in the slice, one caller, no interface | An integration test against a real sequence |

**Rejected: keep the interface so tests can fake the sequence.** A faked sequence proves
nothing about AC-11 — the only reason a sequence exists is that a real one is atomic under
concurrency, and a stub returning `41, 42` demonstrates the stub. The test that matters
(`TEST-009-08`) needs `Testcontainers.MsSql` and cannot be satisfied by a double.

---

## R-3 · What did ADR-013 actually change in this feature?

**Checked:** every type and DDL construct in the original plan against ADR-013's mapping
table.

| Original (PostgreSQL era) | Now | Why it matters here |
|---|---|---|
| `uuid` | `uniqueidentifier` | Keys stay `Guid`, generated client-side |
| `timestamptz` | `datetime2(3)` + the global `DateTimeKind.Utc` converter | Six timestamp columns on `Tickets` alone. Without the converter a `Local` value stores unmarked and the timeline is wrong by an offset nobody sees |
| `varchar(n)` | `nvarchar(n)` | **`Subject` and `Description` are the exposed surface.** Under `varchar` an Arabic subject stores as `????`, and it presents as a font or encoding problem rather than a schema one — which is exactly why it survives review. `TEST-009-12` round-trips Arabic byte-for-byte rather than trusting the column type |
| `boolean` | `bit` | `IsEscalated` |
| `xmin` / `UseXminAsConcurrencyToken` | A `rowversion` column with `.IsRowVersion()` | The token is now a real column, visible in the schema and in the `201` response as `version` |
| `ON DELETE RESTRICT` | `ON DELETE NO ACTION` | Six foreign keys. `RESTRICT` is not SQL Server syntax |
| snake_case tables | `dbo.Tickets`, `dbo.TicketHistory` | PascalCase throughout |
| `psql \d+ tickets` | A `sys.indexes` query | The verification step in `BE-009-03` |
| Testcontainers PostgreSQL | `Testcontainers.MsSql` | The integration fixture from `001` |

**What did not change:** the sequence (R-1), enums stored as strings, and the shape of the
aggregate. The original design survived the provider switch almost intact, which is worth
recording — it means the coupling to the engine really was confined to the four places
ADR-013 named.

**One thing this feature does *not* need, unlike `007`:** a filtered index or a
case-insensitive collation. `UX_Tickets_Number` is unique over a `NOT NULL` column, so
there is nothing to filter, and the value is machine-generated in a fixed case so
collation is irrelevant. Recorded because "why no filter here?" is a fair question after
reading `007`'s data model.

---

## R-4 · Where does the `Created` history row get written?

**Checked:** the two places it could go, against what breaks if it is missing.

**Settled:** inside `Ticket.Create`, the domain factory. `TicketHistory` is exposed as a
read-only collection with no public `Add`, so a ticket without its first history row is
not a state a caller can construct.

**Rejected: append it in the handler.** It works, and it is one new caller away from being
forgotten — a seeder, an import, a second create slice. And the failure is silent: the
ticket is fine, the timeline simply starts at the first status change, and nobody notices
until someone asks who created it and the answer is not there. BR-1.8 is the rule; the
factory is what makes it structural rather than remembered (constitution V).

**Rejected: a domain event handled after `SaveChanges`.** Two writes, two transactions,
and AC-9 says *same transaction*. The event would also have to be dispatched by someone,
which is the same forgetting problem one layer further away.

---

## R-5 · Does this feature need an audit row, and where does it go?

**The trigger:** the original plan predates ADR-008 entirely. It has no audit section, no
audit task, and no audit test. `NFR-10`'s architecture test — every `ICommand` must
implement `IAuditableCommand` — would have failed the build on the first commit of
`CreateTicketCommand`.

**Checked:** BR-9 against every path this endpoint can take.

| Path | Row | Transaction | Rule |
|---|---|---|---|
| `201` | `Ticket.Created`, `Success` | **Same** transaction as the insert, written by the pipeline behaviour | BR-9.1, BR-9.3 |
| `401` | `Auth.Unauthenticated`, `Denied` | **Outside** any transaction | BR-9.2, BR-9.4 |
| `400`, `404` | None | — | See below |
| `403` | Cannot occur | — | BR-6 permits both roles |

The asymmetry is the interesting part and it is deliberate: the success row must
disappear with a rollback, and the denial row must survive one. A single mechanism cannot
do both, which is why BR-9.3 and BR-9.4 are separate rules and `BE-009-09` and
`BE-009-10` are separate tasks with separate tests.

**Left as an open question, not guessed:** whether a `400` or a `404` writes a row.
BR-9.1 is about state changes and BR-9.2 is about auth events; a request rejected at the
boundary is neither, but BR-9.4's "denied or failed" could be read to include it. Working
assumption: no row, because a log of every validation failure is mostly noise and would
bury the rows an incident review needs. It is `spec.md` Q-3, and changing it is a filter
on the behaviour, not a change to this feature.

**Also settled:** `Changes` carries the classification fields and the customer id, and
**not** `Description`. Up to 4000 characters of user-entered free text in a forensic log
is both a leak and unreadable (BR-9.7). The ticket row is the record of the description;
the audit row is the record that a ticket was created. `EntityLabel` is the
`TicketNumber`, so the row means something without a join.

---

## R-6 · Is `allowedTransitions` computed by the server or the client?

**Checked:** ADR-004, and what a client would have to know to compute it.

**Settled:** the server computes it from `TicketStatusTransitions` and returns it on
every ticket read. For `New` that is exactly `["Open", "Closed"]` (AC-10, BR-1 matrix).

**Rejected: the client derives it from `status`.** It would work today, for six states
and one matrix. It is a second copy of the state machine, and the copies drift the first
time BR-1 changes — the client offering a button the server rejects with a `409`. ADR-004
already made this call; it is recorded here because a `["Open","Closed"]` array in a
create response looks like redundant data until you know why it is there.

**Not settled here, deliberately:** whether `allowedTransitions` should account for the
caller's *role* as well as the ticket's status (BR-6 lets a Manager do things an Agent
cannot). It does not matter for `New` on create, and it is `012`'s problem. Noted so `012`
does not have to rediscover the question.

---

## R-7 · Does the layout change from ADR-010 lose anything this feature relied on? — *asked and answered twice*

> **Superseded 2026-08-26. ADR-010 is rejected; four-project Clean stands (ADR-002).** This
> note weighed the move *to* vertical slices and concluded nothing was lost. The move was then
> reversed, so the table below is a record of a road not taken — kept because two of its rows
> turned out to be about something other than layout, and those survived:
>
> | Row | What survived the reversal |
> |---|---|
> | `ITicketRepository` → `DbSet<Ticket>` | **Still removed.** `DbSet<T>` is already a repository, and that is true in either layout. `CLAUDE.md` states it as a standing rule |
> | MediatR **kept** | **Still kept**, and `003` made it load-bearing: validation, the transaction boundary, and the audit row are all pipeline behaviours. This feature is the first production consumer of all three |
> | `ITicketNumberGenerator` removed | **Reversed** — see R-2. The interface is a layer boundary, not ceremony, once `Wasl.Application` exists and cannot see EF Core |
> | One minimal-API endpoint per slice | **Reversed.** `CLAUDE.md` specifies controllers, and `009` ships `TicketsController` with two actions |
> | The diff landing in two folders | **Not achieved, and it was never the point.** The diff spans four projects, which is the cost ADR-002 accepted for a boundary that is visible without explanation |
>
> The closing claim below — "under four projects it was four folders for one slice of
> behaviour" — is accurate and is now the accepted cost rather than an argument against.


**Checked:** every component in the original plan's four-project table against the
two-project layout.

| Was | Now | Lost? |
|---|---|---|
| `TicketsController.Create` | `Features/Tickets/CreateTicket/Endpoint.cs`, one minimal-API endpoint | Nothing. A `TicketsController` would have collected six unrelated slices |
| `ITicketRepository` | `DbSet<Ticket>` directly | Nothing. `DbSet<T>` is already a repository; the interface had one implementation and no second in prospect |
| `Wasl.Application` command + handler + validator | The same three files, in the slice folder | Nothing — they were already one unit; the projects just kept them apart |
| `Wasl.Infrastructure` EF configuration | `Common/Persistence/Configurations` | Nothing. The configuration is genuinely shared across slices, so it lives in `Common`, not in the slice |
| MediatR | **Kept** | It earns its place on exactly three cross-cutting concerns: validation, the audit row, and the transaction boundary. This feature uses all three, and BR-9.3 is *structural* only because the transaction is opened by a behaviour rather than by a handler |

**Nothing was lost, and one thing was gained:** the whole diff for this feature lands in
two folders — `Wasl.Domain/Tickets/` and `Wasl.Api/Features/Tickets/CreateTicket/` — plus
one persistence configuration. Under four projects it was four folders for one slice of
behaviour.

---

## R-8 · Can the integration tests prove AC-11 at all?

**Checked:** what `TEST-009-08` needs to be a real test rather than a ceremony.

**Settled:** two genuinely concurrent `POST`s against `Testcontainers.MsSql`, asserting
two `201`s with different `ticketNumber`s.

**Why EF `InMemory` is not an option anywhere in this feature** — three separate reasons,
each fatal on its own:

| InMemory limitation | AC it silently breaks |
|---|---|
| No sequences | AC-3, AC-11 — there is nothing to draw a number from |
| Does not enforce unique indexes | AC-3 — a duplicate `TicketNumber` would insert cleanly |
| Does not enforce foreign keys | AC-4 — an unknown `customerId` would insert instead of returning `404`, and the test would pass while the endpoint was wrong |

The third is the dangerous one, because the test would be **green**. That is the general
argument `docs/sdd/testing/test-strategy.md` makes, and this feature is the clearest
instance of it in the project.

**Known constraint, not a spec problem:** `001`'s `research.md` R-8 records that Docker
was not running on this machine on 2026-08-23. Every integration test in this feature is
unverifiable until it is started, and the fixture fails fast with a message naming Docker
rather than hanging until a timeout.

---

## R-9 · Do enums reach the wire as names? — *no, and it cost the first request*

**Not checked before implementation, and it should have been.** `CLAUDE.md`'s API contract says
"enums as strings", every example in `contracts/tickets-api.md` shows `"channel": "WhatsApp"`,
and BR-8.7 puts enum values outside localisation — which only means anything if the value on the
wire is the name.

**Found by running it.** `System.Text.Json` binds enums from **numbers** by default. Every
request in the first test run came back `400`, including the one that should have been a `404`,
because binding failed before any validator ran. Had the request bound, the response would have
serialised `status` as `0`.

**Settled:** one `JsonStringEnumConverter`, registered once in `AddPresentation()`.

**Rejected: `[JsonConverter]` per property.** An attribute is a thing the next DTO forgets, and
the resulting contract violation compiles and ships. The failure mode is a client branching on
integers whose meaning changes the day someone reorders an enum member — which `TicketStatus`
explicitly says carries no meaning.

**Why `002` never hit this:** it had no enum on the wire. `009` is the first feature with four.

---

## R-10 · Where do `CreatedAtUtc` and `CreatedByUserId` come from?

**Decided by the product owner, 2026-08-26**, against an implementation that had the handler
stamping both.

**The argument for moving them out of the handler:** the stamps a handler is responsible for are
the stamps one handler will forget — and forgetting fails nothing. No test goes red, no
constraint is violated; a row carries `0001-01-01` until someone sorts by it. The same pattern
would then repeat in `011`, `012`, `016`, and every entity after.

**Settled:** `IAuditableEntity` in `Wasl.Domain/Common/` — an interface, not a base class, so an
entity keeps its private setters and its one inheritance slot — stamped by an override of
`WaslDbContext.SaveChangesAsync`. `Added` sets all four; `Modified` sets only the `Updated*`
pair, because rewriting `CreatedAtUtc` on every edit would silently move a row's creation time.

**The hard part was AC-9**, which requires the ticket and its first history row to carry the
*same* instant. The factory no longer knows the instant, so the handler cannot read
`ticket.CreatedAtUtc` when it builds the history row — the value does not exist until the save.

| Option | Outcome |
|---|---|
| Save twice: stamp the ticket, read the stamp back, write the history | **Proposed and rejected by the product owner.** It works — `003`'s accumulator already merges diffs across saves — but it is a workaround that `011`, `012` and `016` would each repeat, and three repetitions is a pattern. The pattern is "write, read what you wrote, write again", which the interceptor exists to avoid |
| Pass the instant from the handler into the stamping | Makes "the same moment" a thing to be coordinated between two components, and the coordination is what a later feature forgets |
| **`IRequestTimestamp` — one scoped value, read once, returned for the rest of the request** | **Settled.** The DbContext stamps from it and the handler reads it for the history row, so the two are equal **by construction**. One save, no extra round trip, and no ordering to protect with a test |

**"The same moment" is a fact about the request**, so it is modelled as one value scoped to the
request rather than as an agreement between components.

**One consequence, recorded because it is invisible:** a long-lived scope sees a frozen clock.
Every scope here is a request, so nothing is affected — but a hosted service would need a scope
per unit of work. Written at the implementation rather than left to be discovered.

**And one that had to be handled:** the four stamps are applied *before* `base.SaveChangesAsync`
raises `SavingChanges`, so `003`'s diff interceptor sees them. It excludes them by name — they
are infrastructure, not a change the actor made, and including them would put two timestamp
entries in every audit row and an `UpdatedByUserId` entry in every update, burying the field
that actually changed.
