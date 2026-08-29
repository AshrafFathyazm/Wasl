# 009 — Test Evidence

**Implemented and run 2026-08-26.** Every command below was executed and every result pasted
from its output. Nothing here was asserted from memory.

Scope: **the backend, end to end.** AC-12 and AC-13 belong to `004-auth-and-roles`; AC-14 and
AC-15 belong to `024-frontend-create-ticket-form`. Both are listed in Gaps with the owning feature, not
as "later".

---

## Build

```text
$ dotnet build --no-incremental
Build succeeded.
    0 Warning(s)
    0 Error(s)
```

## Tests

```text
$ dotnet test
Passed!  - Failed: 0, Passed: 146, Skipped: 0, Total: 146 - Wasl.Domain.Tests.dll
Passed!  - Failed: 0, Passed:   8, Skipped: 0, Total:   8 - Wasl.Application.Tests.dll
Passed!  - Failed: 0, Passed:  60, Skipped: 0, Total:  60 - Wasl.Api.IntegrationTests.dll
```

**214 tests, 214 passed, 0 skipped.** `009` added **121** — 106 domain and 15 integration:

```text
$ dotnet test tests/Wasl.Domain.Tests --filter FullyQualifiedName~Tickets
Passed!  - Failed: 0, Passed: 106, Total: 106

$ dotnet test tests/Wasl.Api.IntegrationTests --filter CreateTicketTests
Passed!  - Failed: 0, Passed:  15, Total:  15
```

**The 106 is mostly the BR-1 matrix:** 36 cells × 2 assignee states, plus the diagonal, the
terminal-state cases, and the ticket-number and entity tests.

## Migration

```text
$ dotnet ef migrations add AddTicketsAndHistory -p src/Wasl.Infrastructure -s src/Wasl.Api
Build succeeded.
Done.

$ grep -n 'CreateSequence\|CreateTable\|name: "FK_\|name: "UX_' *AddTicketsAndHistory.cs
17:  migrationBuilder.CreateSequence(
21:  migrationBuilder.CreateTable(          -- Tickets
49:      name: "FK_Tickets_Customers",
55:  migrationBuilder.CreateTable(          -- TicketHistory
72:      name: "FK_TicketHistory_Tickets",
96:  name: "UX_Tickets_TicketNumber",
```

**Two foreign keys, not six.** The four into `dbo.SupportUsers` are `004`'s — that table does
not exist, which is the correction recorded at the top of `data-model.md`.

---

## Acceptance criteria

| AC | Verified by | Result |
|---|---|---|
| AC-1 **·C** | `A_valid_create_returns_201_with_a_location_that_resolves` — `201`, `Location`, **and a `GET` on it** | **Pass** |
| AC-2 **·C** | Same test asserts `status: "New"` and `assignedToUserId: null`; `A_new_ticket_starts_new_and_unassigned` in the domain | **Pass** |
| AC-3 **·C** | `ticketNumber` matches `^TCK-\d{4}-\d{6}$`; `TicketNumberTests` covers padding, the widening past 999999, and **three cultures** | **Pass** |
| AC-4 **·C** | `An_unknown_customer_returns_404_as_problem_details` — `002`'s envelope, and the body contains no customer id | **Pass** |
| AC-5 **·C** | `An_unknown_channel_is_rejected` | **Partial** — the status is `400`; the body's shape is `002b`'s. See Gaps |
| AC-6 **·C** | `A_subject_at_the_limit_is_accepted_and_one_over_is_not` — both sides of the boundary | **Pass** |
| AC-7 **·C** | `A_blank_subject_or_description_returns_400`, four cases including whitespace-only | **Pass** |
| AC-8 **·C** | `An_omitted_priority_defaults_to_normal` **and** `An_explicit_low_priority_is_not_overwritten` | **Pass**, and the second half found a real defect — see finding 2 |
| AC-9 **·C** | `A_created_history_row_is_written_with_the_same_instant_as_the_ticket` | **Pass** |
| AC-10 **·C** | `allowedTransitions` asserted as exactly `["Open","Closed"]`; the whole BR-1 matrix in `TicketStatusTransitionsTests` | **Pass** |
| AC-11 **·C** | `Concurrent_creates_receive_different_ticket_numbers` — eight concurrent creates against a **real** sequence | **Pass** |
| AC-12 **·b** · `004` | `A_created_by_in_the_body_is_ignored_and_arabic_round_trips` proves the **verifiable half**: `createdByUserId` is not a field on the command, so a value in the body has nowhere to arrive. The token half needs a token | **Partial by design** |
| AC-13 **·b** · `004` | — | **Not verifiable in `009`.** The endpoint is unauthenticated, so every request is. `002` already ships the `errors/unauthenticated` registry row; `004` adds the middleware |
| AC-14, AC-15 **·FE** · `024-frontend-create-ticket-form` | — | **Out of scope for `009`** — a backend feature. Contract: `contracts/tickets-api.md` (frozen). Guide: `FRONTEND-API-GUIDE.md` |

### Beyond the AC list

| Assertion | Why it is here |
|---|---|
| `The_stamps_are_applied_by_the_context_and_kept_out_of_the_audit_diff` | Both halves of the stamping decision in one test: the four values are set although no handler sets them, **and** they are absent from `Changes` |
| `Reading_an_unknown_ticket_returns_404_as_problem_details` | The read endpoint's own `404`, in the same envelope |
| `Arabic_text_survives_construction_unchanged` (domain) + the Arabic subject and description through the API | `nvarchar` end to end. `varchar` returns `????` and reads as a font bug (ADR-013 row 4) |
| `The_format_is_identical_under_every_culture` | BR-8.13. Under `ar-SA` a default-formatted integer can render in Arabic-Indic digits and a year in a non-Gregorian calendar |
| `An_unassigned_open_ticket_offers_only_close` | The exact case the conditional map exists for |
| `The_matrix_covers_every_status_exactly_once` | A status with no row would throw the first time a ticket reached it, in whichever feature got there first |

---

## What the tests found

Four defects. **Three would have shipped**, and one of them was in a document rather than in code.

### 1. Enums never reached the wire as names

The first integration run returned `400` for **every** request, including the one that should
have been `404`:

```text
Expected response.StatusCode to be HttpStatusCode.Created {value: 201},
but found HttpStatusCode.BadRequest {value: 400}.        × 8
Expected atLimit.StatusCode to be ... Created ... but found ... BadRequest
Expected response.StatusCode to be HttpStatusCode.NotFound {value: 404},
but found HttpStatusCode.BadRequest {value: 400}.
```

`System.Text.Json` binds enums from **numbers** by default. Binding failed before any validator
ran, so nothing downstream was even exercised — and had a request bound, the response would have
serialised `status` as `0`, leaving a client branching on integers whose meaning changes the day
someone reorders an enum.

The contract had said `"channel": "WhatsApp"` in every example since it was frozen. `002` never
hit it because `002` has no enum on the wire. Fixed with one `JsonStringEnumConverter` in
`AddPresentation()`; `research.md` R-9 records why not a per-property attribute.

### 2. A column default that silently overwrote an explicit `Low`

`dotnet ef migrations add` warned:

```text
warn: The 'TicketPriority' property 'Priority' on entity type 'Ticket' is configured with a
      database-generated default, but has no configured sentinel value. The database-generated
      default will always be used for inserts when the property has the value 'Low', since this
      is the CLR default for the 'TicketPriority' type.
```

`data-model.md` specifies `DEFAULT 'Normal'`. With a non-nullable enum whose CLR default is
`Low`, **a caller explicitly choosing `Low` would have been stored as `Normal`** — no error, the
value simply changes on the way in.

AC-8's default belongs in one place and `CreateTicketHandler` already applies it as
`request.Priority ?? Normal`. The column default was the second source of truth and it was the
wrong one. Removed, and `An_explicit_low_priority_is_not_overwritten` is the assertion that keeps
it removed. The same removal was applied to `Status`, where the two values coincide and it was
harmless — a latent copy of a defect that has bitten once is not worth keeping for symmetry with
a document.

### 3. Seven SQL Server containers, and a filtered run that proved nothing

The suite failed with `System.OutOfMemoryException`, and the failures landed on **unrelated
validation assertions** — so it read as a `009` bug:

```text
CreateTicketTests.A_blank_subject_or_description_returns_400(subject: "   ", ...) [FAIL]
  System.OutOfMemoryException : Exception of type 'System.OutOfMemoryException' was thrown.
```

`xUnit` creates an `IClassFixture` **per test class**. Seven classes meant seven containers
starting at once, roughly 2 GB each.

**It was invisible under `--filter`**, because one class is one container — every class passed
alone. That is the lesson, and it is now a rule in `CLAUDE.md`: verification means the whole
suite, and `--filter` is for diagnosis. Fixed with one `ICollectionFixture` shared by every
class; the integration project went from **1m29s to 27s**.

### 4. `data-model.md` described a database that did not exist

Not found by a test — found by reading the file before writing the migration against it. Three
statements were wrong and four foreign keys stood on them: `dbo.SupportUsers` "created by
`001`" (it exists nowhere), `dbo.AuditLog` "created by `001`" (`003` created it), and `008`
having added an index (`008` is not built). The full correction is at the top of
`data-model.md`, and `12-delivery-log.md` carries it as its own row.

**A specification describing state that does not exist makes every decision after it stand on
invented ground** — which is exactly what happened: `CreatedByUserId` was specified `NOT NULL`
with a key into the missing table, colliding with the no-authentication decision on the same
column.

---

## Not observed, and said so

**Docker stopped mid-session.** A re-run produced 55 failures with
`DockerUnavailableException`, which is the fail-fast message `001` wrote for exactly this. Docker
was restarted and the suite re-run green — the numbers at the top of this file are from that run,
not from the failed one. Recorded because a reader comparing timestamps would otherwise find an
unexplained red run.

---

## Gaps, each with a reason

| Gap | Reason |
|---|---|
| **AC-5's envelope is the framework's, not the contract's** | An unparseable enum is rejected by model binding before any validator runs, so the `400` does not carry `errors`. `UseStatusCodePages` is `002b`. The status is asserted; the shape is not, and a test asserting it would be asserting `002b`'s work |
| **AC-12's token half, AC-13** | `004-auth-and-roles`. `009` proves the half that does not need a token: `createdByUserId` is not a field on the command. `004` supplies the value and the `401` |
| **AC-14, AC-15** | `024-frontend-create-ticket-form`. `src/wasl-web/` belongs to the parallel frontend lane |
| **The generated OpenAPI is not compared against the contract** | `REV-009-03` needs Swashbuckle, which is `002b`. The comparison is manual today, and this row says so rather than the review claiming it passed |
| **`Auth.Unauthenticated` audit row** | `BE-009-10`, deferred to `004` — there is no `401` to record. `003` already ships `IAuditWriter.WriteIndependentAsync` for it |
| **The four foreign keys to `SupportUsers`** | `004`, with the table. `plan.md`'s cascade-path analysis is kept there so the trap is not rediscovered |
| **No test asserts the ticket-number sequence's gap behaviour** | A rolled-back create consumes a value; that is documented in `ITicketNumberGenerator` and accepted in `research.md`, not tested. Asserting a gap requires forcing a rollback and reading the next value, which tests the sequence rather than the feature |
| **`IRequestTimestamp`'s frozen-clock limit is untested** | Every scope here is a request, so nothing exercises a long-lived one. The constraint is written at the implementation for whoever adds a hosted service |
| **Deliberately untested** | That EF Core saves, that MediatR dispatches, that SQL Server honours a sequence. Load, volume, and index selectivity — no stated requirement (`docs/sdd/testing/test-strategy.md`) |

---

## Recorded later: a `404` that becomes an enumeration oracle at `004`

Found by the concurrency-and-abuse review on 2026-08-27, not by a test.

`CreateTicketCommandHandler` throws `NotFoundException("Error.Ticket.CustomerNotFound")` when the
`customerId` does not exist (AC-4). The message key carries no id and the response leaks no
customer data, which is why the review did not call it a defect **today**: every endpoint is open,
so there is nothing to enumerate *against*.

**It becomes one the moment `004` lands.** An authenticated user with no right to see a customer
can discover which customer ids exist by posting tickets and reading the status — `404` means no
such customer, `201` means it exists. BR-4.4 forbids exactly this shape for the duplicate rule:
the response names the field and nothing else, because the distinction between "no such thing" and
"a thing you may not see" is the oracle.

**Owner: `004-auth-and-roles`**, and the fix belongs there rather than here — it needs a notion of
who may see which customer, which is what `004` introduces. Two shapes are available to it:

| Option | Cost |
|---|---|
| Return `404` for both "no such customer" and "a customer you cannot see" | The honest one, and the one BR-4.4's reasoning points at. Costs a permission check before the existence check |
| Keep the distinction and accept it | Defensible in an internal tool where every actor is staff — `docs/sdd/15-scope-coverage.md` says every actor in scope is internal. Should be a written decision, not a leftover |

Recorded here rather than fixed, because fixing it now would mean inventing the authorization
model `004` owns.

---

## Post-delivery — `POST /api/tickets` is still not idempotent, 2026-08-29

`CLAUDE.md`'s checklist opens with *"Does a duplicate request create a duplicate row?"*, and this
feature's evidence recorded `POST /api/tickets` as **not idempotent, with no owner**: two clicks
create two tickets, with different numbers and no error.

**`007` closed the customer half of that row and not this one.** It added two filtered unique
indexes to `dbo.Customers`, so a duplicate customer is a `409` even under two simultaneous
requests — and `007` AC-13 is the first test in this project to exercise the checklist row at all.

Nothing about tickets changed. There is no natural key on a ticket: two tickets with the same
subject, customer, category and channel are a legitimate pair, so an index cannot express it. The
guarantee would have to be a client-supplied request key, which no acceptance criterion asks for.

**Still recorded as open and unowned.** The question has now been asked twice and answered the same
way both times; what changed is that the answer is written beside a feature that solved the
analogous problem, so the difference between the two cases is visible rather than implied.
