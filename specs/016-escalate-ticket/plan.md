# 016 — Technical Plan · Escalate Ticket

**Phase:** 5 · **Story:** US-009 · **Feature:** `016-escalate-ticket` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Design Summary

One slice, one endpoint, and one domain method. `Ticket.Escalate(reason, byUserId,
timeProvider)` is the only way `IsEscalated` becomes true: it checks the BR-3.3 and BR-3.4
preconditions, applies the BR-3.6 **floor** through a named domain function, sets the four
BR-3.7 fields, and reports back whether the priority actually moved so the handler knows
whether a `PriorityChanged` history row is owed. The Manager-only check is an ASP.NET Core
authorization policy at the endpoint, per BR-6's split between role-only and
data-dependent rules. No schema change.

The floor is a **named, separately tested function** rather than an inline expression,
because an inline `Math.Max` on an enum cast is correct only for as long as nobody
reorders the enum, and nothing announces that reordering (`spec.md`, "The one thing that
fails silently").

## Backend

Two projects, one slice. ADR-010.

| Where | Component | Responsibility |
|---|---|---|
| `Wasl.Domain/Tickets/` | `TicketPriority` | The four values. Declared `Low, Normal, High, Critical` — **the declaration order is the severity order and that is load-bearing** |
| `Wasl.Domain/Tickets/` | `TicketPriorityFloor.RaiseTo(current, floor)` | Returns the higher of the two by an explicit rank map, not by an enum cast. The whole of BR-3.6 lives here, in one pure function with no dependencies |
| `Wasl.Domain/Tickets/` | `Ticket.Escalate(reason, byUserId, TimeProvider)` | Enforces BR-3.3 then BR-3.4, applies the floor, sets the four BR-3.7 fields, stamps `UpdatedAtUtc`. Returns an `EscalationResult` carrying `PriorityChanged`, `OldPriority`, `NewPriority` |
| `Wasl.Domain/Tickets/` | `Ticket.IsEscalatable` | Computed: `Status is not (Resolved or Closed) && !IsEscalated`. **Status and flag only — no role.** The domain has zero package references and must not learn about JWT claims |
| `Wasl.Domain/Tickets/` | `TicketNotEscalatableException` (BR-3.3), `TicketAlreadyEscalatedException` (BR-3.4) | Distinct types, so the shared middleware maps distinct `type` values and the client can branch |
| **The slice** — `Wasl.Api/Features/Tickets/EscalateTicket/` | `Endpoint` | One minimal-API endpoint. `RequireAuthorization("CanEscalate")`, binds, sends the command, returns `200` with the ticket |
| | `Command` + `Handler` | Loads the ticket for update, calls `Ticket.Escalate`, writes the `Escalated` history row and — conditionally — the `PriorityChanged` row, maps to `Response` |
| | `Validator` | FluentValidation: `reason` present, non-whitespace, ≤500 after trim; `expectedVersion` present |
| | `Response` | The DTO. Never the entity |
| `Wasl.Api/Common/Auth/` | `CanEscalate` policy | `RequireRole("Manager")`. Registered once; BR-6 calls this class of rule role-only because the boundary has enough information to answer it |
| `Wasl.Api/Common/Errors/` | Two mappings added | `TicketNotEscalatableException` → `409 errors/ticket-not-escalatable`; `TicketAlreadyEscalatedException` → `409 errors/already-escalated` |
| `Wasl.Api/Features/Tickets/GetTicket/Response.cs` | Five fields added | `isEscalated`, `escalatedAtUtc`, `escalatedBy`, `escalationReason`, `canEscalate`. Changed, not created — see **Contract changes** |

### Why `canEscalate` is computed in the projection and `IsEscalatable` in the domain

Constitution III: *"the server tells the client what is permitted rather than the client
deriving it."* The alternative — the client computing `role === 'Manager' && !isEscalated
&& !['Resolved','Closed'].includes(status)` — is a business rule re-implemented in
TypeScript, which is the exact defect `allowedTransitions` exists to prevent for BR-1
(ADR-004). The two copies drift, and the drift presents as a button that produces a `403`
or a `409` for something the interface invited the user to do.

But the role cannot live in the domain: `Wasl.Domain` has zero package references and no
concept of a claims principal. So the rule splits at exactly the point where the knowledge
splits:

```text
Ticket.IsEscalatable   status + flag        domain, unit-testable, no HTTP
canEscalate            IsEscalatable && caller is Manager      read projection, has the claims
```

Naming the split is the point. An `IsEscalatable` that quietly took a role parameter would
drag authorization into the one project that is supposed to have no infrastructure at all.

### Why the floor is a function and not an expression

Three implementations of BR-3.6 all read plausibly and two are wrong:

```csharp
ticket.Priority = TicketPriority.High;                                    // downgrades Critical
ticket.Priority = (TicketPriority)Math.Max((int)ticket.Priority, (int)High); // correct until the enum is reordered
ticket.Priority = TicketPriorityFloor.RaiseTo(ticket.Priority, High);      // this one
```

`TicketPriorityFloor` holds an explicit `IReadOnlyDictionary<TicketPriority,int>` rank map
and a unit test asserting the order. Enums persist as **strings** (`nvarchar(20)`), so
reordering the enum changes no stored value, throws no cast error, and breaks no
migration — the floor just silently starts meaning something else. The rank map turns that
into a failing test.

### Order of refusals

Fixed here so no test has to guess, and so the client can rely on it:

```text
400 malformed body / validation          (before anything is loaded)
403 role policy                          (boundary — runs before the ticket is looked up)
404 ticket not found
409 errors/ticket-not-escalatable        BR-3.3   ← evaluated before BR-3.4 (spec Q-2)
409 errors/already-escalated             BR-3.4
409 errors/concurrency-conflict          stale expectedVersion, raised by SaveChanges
```

`403` before `404` is a consequence of the policy being at the boundary, and it is the
correct trade: it means an Agent cannot use this endpoint to probe which ticket ids exist.
BR-6 notes that all support users may see all tickets, so nothing is being hidden — but the
ordering must be documented, because an integration test written the other way round fails
for the right reason and looks like a bug in the endpoint.

### Audit — added in this migration

The original artifact predates ADR-008 entirely, so nothing in it carried the audit
obligation. Two rows, and the asymmetry between them is the part that is implemented
wrongly by accident:

| Path | Action | Transaction | Written by |
|---|---|---|---|
| Success | `Ticket.Escalated` | **Same transaction** as the ticket update and both history rows (BR-9.3) | The MediatR audit behaviour, because `EscalateTicketCommand` implements `IAuditableCommand` |
| `403` from the policy | `Auth.Forbidden` | **Outside any transaction** (BR-9.4) | The authorization-failure path in `Common/Auth`, owned by `003`/`004` |

**The `403` row is the one with a hole in it.** The policy denies the request at the
boundary, so `EscalateTicketHandler` never runs and the MediatR pipeline never opens. Any
audit mechanism that lives only in the pipeline behaviour writes nothing — and it writes
nothing for precisely the endpoint whose entire authorization story is "only a Manager may
call this". BR-9.2 then has an invisible hole in the place it matters most.
`BE-016-07` asserts the row exists; `TEST-016-11` asserts it is there after a `403` and that
no ambient transaction was needed to produce it.

`Changes` on the success row records `IsEscalated: false → true` and, **only when it
changed**, `Priority: Normal → High` (BR-9.8). The reason text is not copied in
(`spec.md` Q-3); `EntityLabel` carries the `TicketNumber`, which is what an auditor
searches by. `ActorEmail` and `ActorRole` are snapshotted, never joined (BR-9.6), so a
manager later demoted to agent does not retroactively appear to have lacked the
permission they had.

### Migration note — what this plan repaired

The source artifact was an unfilled template, so there was no prior design to preserve;
what has been repaired is the *set of decisions the template predates*:

- **ADR-010.** The slice is `Wasl.Api/Features/Tickets/EscalateTicket/`. There is no
  `Wasl.Application` and no `Wasl.Infrastructure`; there is no `TicketsController` and no
  `ITicketRepository`. `DbSet<Ticket>` is the repository. The copied `tests.md` template's
  `dotnet test tests/Wasl.Application.Tests` line was removed and `summary.md`'s
  Domain / Application / Infrastructure / API layer table became Domain / Slice / Common /
  Endpoint for the same reason — a template that instructs the implementer to run a test
  project that does not exist produces a false record in the evidence file.
- **ADR-013.** SQL Server throughout: `uniqueidentifier`, `datetime2(3)`, `nvarchar`,
  `bit`, `rowversion` with `.IsRowVersion()`, `ON DELETE NO ACTION`,
  `Testcontainers.MsSql`. Index and column verification is a `sys.columns` /
  `sys.indexes` query, not `\d+`.
- **ADR-008.** `BE-016-06`, `BE-016-07`, `TEST-016-10`, and `TEST-016-11` are new. Without
  `IAuditableCommand` on the command, NFR-10's architecture test fails the build.

## Data Changes

**None.** Full reasoning in [`data-model.md`](data-model.md).

`009-create-ticket`'s `AddTicketsAndHistory` migration created `IsEscalated bit NOT NULL
DEFAULT 0`, `EscalatedAtUtc datetime2(3) NULL`, `EscalatedByUserId uniqueidentifier NULL`
with `FK_Tickets_Escalator ... ON DELETE NO ACTION`, and `EscalationReason nvarchar(500)
NULL`, because the columns are created with the table they belong to. `TicketHistory`
already carries `EventType`, `OldValue`, `NewValue`, and `Note`, and
`IX_TicketHistory_Ticket_Time` already serves the timeline read.

Recording "no schema change" explicitly, rather than leaving the section blank, is what
makes it a decision rather than an oversight. `BE-016-01` verifies the four columns exist
with those exact types against a clean database — a `nvarchar` that arrived as `varchar`
stores Arabic reasons as `????` and looks like a font bug (ADR-013 row 4).

**Not added here:** a filtered index on `IsEscalated = 1`. It serves the `escalated=true`
filter in `015`, and it arrives with the query that needs it.

## API Contract

Frozen: [`contracts/ticket-escalate-api.md`](contracts/ticket-escalate-api.md).

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `POST` | `/api/tickets/{id}/escalate` | `{ reason, expectedVersion }` | `200` + the updated ticket | `400` validation · `401` · `403` not a Manager · `404` unknown ticket · `409` `ticket-not-escalatable` / `already-escalated` / `concurrency-conflict` |

The ticket read shape gains:

```json
"isEscalated": true,
"escalatedAtUtc": "2026-08-23T12:04:00Z",
"escalatedBy": { "id": "…", "displayName": "Sara Al-Otaibi" },
"escalationReason": "Customer is a strategic account and has been waiting four days.",
"canEscalate": false
```

`POST` rather than `PUT`, and a sub-resource rather than a field on the ticket, for the
reason `05-api-conventions.md` gives for `/status` and `/assignee`: escalation is a
distinct business action with its own rule, its own authorization, and its own history
entry. A generic `PATCH /api/tickets/{id}` accepting `isEscalated: true` would make BR-3
unenforceable, because the server could not tell which change was intended as which
action — and BR-3.9's one-way property would be expressible as `isEscalated: false`.

Three distinct `409` types rather than one, because the client does three different things:
`ticket-not-escalatable` removes the action and refetches; `already-escalated` refetches
and shows the callout that should already have been there; `concurrency-conflict` offers a
reload and **never** auto-retries (ADR-006).

## Frontend

| Route | Component | Kind (ADR-011 §4) | Purpose |
|---|---|---|---|
| `/tickets/:id` | `TicketDetailPage` | Route / page | Owns the ticket query and the escalate mutation. The only thing here that fetches |
| — | `EscalateDialog` | Feature component | The reason field, the counter, Confirm / Cancel. Receives handlers as props |
| — | `EscalatedCallout` | Feature component | The rail callout: who, when, why |
| — | `Modal`, `Textarea`, `Button`, `Badge` | Primitive | No domain knowledge |

- The Escalate menu item renders **only when `canEscalate` is true**. There is no
  client-side copy of BR-3.
- The mutation sends the `version` from the loaded ticket, and on success invalidates the
  ticket and timeline queries. Optimistic update is deliberately not used: the response
  carries the authoritative priority, and guessing the floor client-side would be a second
  implementation of the rule this feature exists to get right.
- `403`, `404`, and all three `409`s render **inline beside the control** (ADR-011 §5,
  `10-shared-patterns.md`). A forbidden action shown as a toast disappears before the user
  has connected it to what they clicked.

Full detail: [`frontend-spec.md`](frontend-spec.md). API surface:
[`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | `tickets:escalate.*` — the menu item, dialog title and question, reason label and helper, the counter, Confirm and Cancel, the success toast; `tickets:escalated.by` for the rail callout; one message per failure `type` |
| New server messages | `Error.TicketNotEscalatable`, `Error.AlreadyEscalated`, `Validation.Reason.Required`, `Validation.Reason.TooLong` — added to both `.resx` catalogues |
| Interpolation, not concatenation | `Error.TicketNotEscalatable` names the current status inside a translated sentence with a named placeholder. Arabic word order differs from English, so a sentence assembled from fragments lands in the wrong order. Same reasoning as `012`'s invalid-transition message |
| Enum values | `High`, `Critical`, `Resolved` go on the wire untranslated (BR-8.7). Only their **labels** are translated, client-side, so a history row written in English stays readable after a language switch |
| User content | `escalationReason` is user-written and may be Arabic in an English interface. The callout, the timeline row, and the dialog's reason field all carry `dir="auto"` — without it the trailing full stop of an Arabic sentence lands on the wrong side and reads as a typo (ADR-007 §8) |
| Not translated | `ProblemDetails.type`, the keys of `errors` (`reason`, `expectedVersion` — they are request field names), `TicketNumber`, `traceId`. The audit row stays English regardless of request locale (BR-9.10) |
| Direction-sensitive layout | The rail moves to the inline-end under RTL. The escalate glyph contains a vertical arrow and **must not mirror** — vertical meaning has no direction (`04-ticket-detail.md`, RTL section) |

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit (`Wasl.Domain.Tests`) | `TicketPriorityFloor.RaiseTo` across all four current values × the `High` floor | The single rule this feature exists to get right. Pure function, no database, cheap to cover exhaustively |
| Unit | The rank order `Low < Normal < High < Critical` asserted explicitly | Makes A-3 a test instead of an assumption. Reordering the enum then fails a build rather than changing a business rule invisibly |
| Unit | `Ticket.Escalate` from `Resolved`, from `Closed`, and from already-escalated | Domain preconditions (BR-3.3, BR-3.4). No HTTP needed to prove them |
| Unit | `Ticket.Escalate` sets all four BR-3.7 fields from an injected `TimeProvider` | `EscalatedAtUtc` must be assertable; `DateTime.UtcNow` inline is untestable |
| Unit | `EscalationResult.PriorityChanged` is false from `High` and from `Critical`, true from `Low` and `Normal` | This flag is what decides whether the `PriorityChanged` history row is written |
| Unit | `Ticket.IsEscalatable` for all six statuses × escalated / not | Pure logic; feeds `canEscalate` |
| Integration (`Wasl.Api.IntegrationTests`) | `200`; `403` Agent; `404`; `409` × 3 with the correct `type`; `400` × 4 reason variants | The contract is HTTP-shaped, and the authorization needs real tokens for both roles |
| Integration | **Exactly one** history row for a `Critical` ticket; **two** for a `Normal` one, with `OldValue`/`NewValue` correct | BR-3.8's conditional row. The `Critical` case is the assertion that catches an unconditional write |
| Integration | One `Ticket.Escalated` audit row; none after a forced rollback, along with no history row and an unchanged ticket | BR-9.1, BR-9.3. Only a real transaction against a real database can prove it |
| Integration | An `Auth.Forbidden` row after the `403`, written with no ambient transaction | BR-9.2, BR-9.4. The asymmetry is impossible to see by reading the code |
| Integration | Stale `expectedVersion` → `409 errors/concurrency-conflict` | Needs a real `rowversion` |
| Integration | Two concurrent escalations → one `200`, and exactly one `Escalated` history row | The only proof the floor is applied once |
| Integration | An Arabic reason round-trips byte-identical | ADR-013 row 4. `varchar` returns `????` and survives review as a font problem |
| Integration | `ar` request: sentences translated, `type` and `errors` keys byte-identical | BR-8.7 |
| Frontend (Vitest + RTL) | Escalate renders only when `canEscalate` is true; Confirm disabled at 0 and at 501 characters; `403` and each `409` rendered inline | Prevents BR-3 being re-implemented client-side, which is the whole reason `canEscalate` exists |
| Manual | The Arabic pass on `/tickets/:id`, recorded in `tests.md` | RTL defects are visual. No assertion catches a callout sized to English text or a mirrored arrow |

**Deliberately not tested:** the entity-to-DTO mapping, which has no behaviour; the
`Modal` primitive's focus trap, which belongs to `006`; the `escalated=true` filter, which
belongs to `015`.

The unit theory data for the floor is a **separately written** table of the four
values, not driven from `TicketPriorityFloor`'s own rank map. A test that reads the
implementation proves only that the implementation equals itself — the same reasoning
`012` applies to the BR-1 matrix.

## Dependencies

| Needs | For |
|---|---|
| `001-solution-skeleton` | Solution, `DbContext`, conventions, integration harness |
| `002-error-contract` | The shared middleware that maps the two new exception types |
| `003-audit-trail` | `IAuditableCommand`, the audit behaviour, and the out-of-transaction denial path |
| `004-auth-and-roles` | Role claims and the policy mechanism that makes `CanEscalate` one line |
| `005-localization-core` | `IStringLocalizer`, the `.resx` catalogues, the parity test |
| `006-design-system` | `Modal`, `Textarea`, `Button`, `Badge`, and the `--state-danger-*` tokens |
| `009-create-ticket` | The `Tickets` and `TicketHistory` tables, and the escalation columns |
| `010-ticket-list-and-detail` | `TicketDetailPage` and the ticket read projection this feature extends |
| `012-change-ticket-status` | `Ticket`'s status precondition vocabulary, and the take-action menu the Escalate item joins |
| `015-ticket-filters-and-search` | **AC-9's filter clause only.** `015` is cut before `016`; if it is dropped, AC-9 is partially unmet and that is recorded, not quietly closed (`spec.md` Q-6) |

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| A named `TicketPriorityFloor.RaiseTo` with an explicit rank map | `Math.Max` on the enum cast, inline in `Ticket.Escalate` | Correct today and silently wrong after any enum reorder. Enums persist as strings, so nothing throws and no migration is needed — the rule just changes meaning. This is the defect the feature exists to prevent |
| A named function | `ticket.Priority = TicketPriority.High` | Downgrades a `Critical` ticket. The most urgent ticket becomes less visible because someone escalated it, with no error anywhere |
| Escalation as a flag plus metadata | A seventh `TicketStatus` value | Forces a choice between "escalated" and "InProgress", which are orthogonal facts, and adds a row and a column to the BR-1 matrix that every existing transition test would have to absorb (ADR-004, US-009 notes) |
| `canEscalate` returned by the server | The client derives it from `status`, `isEscalated`, and the role | Three cheap facts, and still a business rule re-implemented in TypeScript. The copies drift, and the drift shows up as a menu item that produces a `403` (Constitution III; the same reasoning as `allowedTransitions`) |
| `IsEscalatable` in the domain, the role in the projection | One `CanEscalate(user)` method in the domain | Puts claims into a project with zero package references. The split is where the knowledge actually splits |
| `expectedVersion` required | Optional, or omitted because BR-3.4 already catches a double-submit | A client that must remember which of three ticket mutations carries a version will forget on one, and that one is a silent lost update (Constitution V). Cost: one field the client already holds |
| One new `type`, `errors/ticket-not-escalatable`, for both `Resolved` and `Closed` | Reuse `errors/ticket-closed` for `Closed` | A client that hides the comment composer on `errors/ticket-closed` (BR-5.2) would hide it on a `Resolved` ticket, where commenting is permitted. One wrong `type` produces a wrong screen |
| One new type for both | Two types, one per status | Two client branches for one identical outcome, and the payload already names the status |
| BR-3.3 checked before BR-3.4 | The reverse | "Already escalated" on a `Closed` ticket invites the user to look for de-escalation, which does not exist (BR-3.9) |
| The reason on the `Escalated` history row's `Note` | Read it from `Tickets.EscalationReason` when rendering the timeline | The timeline is a union query (`013`). Special-casing one row type to join back to the ticket makes the union the thing that has to know about escalation |
| The reason **not** in the audit row's `Changes` | Copy it in for the forensic record | It would then live in three places, and it is the same "free text duplicated into the audit table" pattern BR-9.7 rejects for comment bodies. The audit row is *that it happened, by whom, when*; `TicketNumber` is the key an auditor searches by |
| No de-escalation | Add it now while the code is open | BR-3.9 puts it out of scope, and it is not a symmetric addition: it needs a second event type, a policy, and a decision about whether priority comes back down. Recorded as a limitation |
| No optimistic UI update | Apply the floor client-side and reconcile | The floor computed client-side is a second implementation of BR-3.6 — the one rule this feature is about |

## Files to Create or Change

```text
src/Wasl.Domain/Tickets/TicketPriority.cs                              changed — rank order documented as load-bearing
src/Wasl.Domain/Tickets/TicketPriorityFloor.cs                         new — BR-3.6, the whole of it
src/Wasl.Domain/Tickets/Ticket.cs                                      changed — Escalate(), IsEscalatable
src/Wasl.Domain/Tickets/EscalationResult.cs                            new — PriorityChanged, OldPriority, NewPriority
src/Wasl.Domain/Tickets/TicketNotEscalatableException.cs               new — BR-3.3
src/Wasl.Domain/Tickets/TicketAlreadyEscalatedException.cs             new — BR-3.4

src/Wasl.Api/Features/Tickets/EscalateTicket/Endpoint.cs               new — the whole slice, one folder
src/Wasl.Api/Features/Tickets/EscalateTicket/Command.cs
src/Wasl.Api/Features/Tickets/EscalateTicket/Handler.cs
src/Wasl.Api/Features/Tickets/EscalateTicket/Validator.cs
src/Wasl.Api/Features/Tickets/EscalateTicket/Response.cs

src/Wasl.Api/Features/Tickets/GetTicket/Response.cs                    changed — five escalation fields + canEscalate
src/Wasl.Api/Common/Auth/AuthorizationPolicies.cs                      changed — the CanEscalate policy
src/Wasl.Api/Common/Errors/ExceptionMappings.cs                        changed — two new type mappings
src/Wasl.Api/Common/Localization/Resources.en.resx                     changed — four new keys
src/Wasl.Api/Common/Localization/Resources.ar.resx                     changed — the same four

src/wasl-web/src/features/tickets/TicketDetailPage.tsx                 changed — the mutation and the callout
src/wasl-web/src/features/tickets/EscalateDialog.tsx                   new
src/wasl-web/src/features/tickets/EscalatedCallout.tsx                 new
src/wasl-web/src/features/tickets/api.ts                              changed — escalateTicket
src/wasl-web/src/features/tickets/schema.ts                            changed — the escalate Zod schema
src/wasl-web/src/locales/en/tickets.json                               changed
src/wasl-web/src/locales/ar/tickets.json                               changed

tests/Wasl.Domain.Tests/Tickets/TicketPriorityFloorTests.cs            new
tests/Wasl.Domain.Tests/Tickets/TicketEscalationTests.cs               new
tests/Wasl.Api.IntegrationTests/Tickets/EscalateTicketTests.cs         new
tests/Wasl.Api.IntegrationTests/Tickets/EscalateAuthorizationTests.cs  new
tests/Wasl.Api.IntegrationTests/Tickets/EscalateAuditTests.cs          new
src/wasl-web/src/features/tickets/EscalateDialog.test.tsx              new
```

No `src/Wasl.Application/**` and no `src/Wasl.Infrastructure/**` — those projects do not
exist (ADR-010). No migration file: there is no schema change
([`data-model.md`](data-model.md)).

## Contract changes

First contract for this endpoint:
[`contracts/ticket-escalate-api.md`](contracts/ticket-escalate-api.md), frozen
2026-08-23. Two changes it makes to things that already existed, both recorded here rather
than discovered by a compile error:

| # | Change | Effect on other features |
|---|---|---|
| 1 | The **ticket read shape gains five fields**: `isEscalated`, `escalatedAtUtc`, `escalatedBy`, `escalationReason`, `canEscalate` | Additive and non-breaking for `010`, `012`, `013`. `010`'s list projection needs `isEscalated` for AC-9's badge; `015` needs it for the filter. The precedent is `012` adding `allowedTransitions` to the same shape |
| 2 | A **new `ProblemDetails` type**, `errors/ticket-not-escalatable`, joins the registry in `docs/sdd/documentation/api/error-handling.md` | `DOC-016-01` adds the row. A `type` that exists in an endpoint and not in the registry is how a client ends up with an unhandled branch |

The screen spec's action table (`docs/sdd/design/screens/04-ticket-detail.md`, action 4)
lists the escalate request without `expectedVersion`. **The contract file is
authoritative**: `expectedVersion` is required (`spec.md` Q-4). Named here so the
difference is a recorded decision rather than something the frontend discovers at runtime.

The frontend lane reads [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) and may start as
soon as that file exists. It does not wait for `BE-016-05`.
