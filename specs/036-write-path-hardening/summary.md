# 036 — Write-Path Hardening · summary

**Delivered** 2026-09-05 · backend only · 669 tests (454 integration, up from 438)
**Spec:** [spec.md](spec.md) · **Evidence:** [tests.md](tests.md)

---

## 1 · What was built

All five sections of the spec, plus the documentation correction.

| § | Change | Where |
|---|---|---|
| 3.1 | A raced tag attach answers `409 errors/tag-unchanged`, not `500` | `WaslDbContext.TranslateDuplicate` |
| 3.2 | A rowversion mismatch EF detects answers `409 errors/concurrency-conflict`, not `500` | `WaslDbContext.SaveChangesAsync` |
| 3.3 | A deadlock victim answers `503 errors/transient-conflict` with `Retry-After` | same, plus `TransientConflictException` |
| 3.4 | A general write limit, `429 errors/rate-limited` with `Retry-After` | `Common/RateLimiting/WriteRateLimiting.cs` |
| 3.5 | `Idempotency-Key` on `POST /api/tickets` | `Common/Idempotency/`, `dbo.IdempotencyKeys` |
| 2.1 | `CLAUDE.md`'s false "`ICommunicationProvider` is built" row corrected | `CLAUDE.md` |

## 2 · The three open questions, and how they were ruled

Approved 2026-09-05 with "الأفضل" on each — i.e. take the working assumption the spec had
already written down and defended. All three were taken as written.

| Q | Ruling | Consequence |
|---|---|---|
| Q-3 | **Route A** — detect 1205, answer a documented status. No server-side retry | `TransactionBehaviour` untouched. The client retries; the server tells it that it may |
| Q-4 | **Writes only, per authenticated user**, address as fallback | Reads stay unlimited. `POST /api/auth/token` exempt, keeping `004b`'s pair throttle |
| Q-5 | **`POST /api/tickets` only**, per user, 24-hour retention, same-key/different-body is `409` | Comments still cannot be retried safely. Stated, not hidden |

Q-1, Q-2 and Q-6 kept their spec answers: the raced attach stays `409`; `DELETE …/tags/{id}`
stays `409` on an absent tag (`034`'s ruling, not reversed here); `PUT /api/me/language` is
under the limit as a write.

## 3 · Four things that were wrong until they were run

Full output in [tests.md](tests.md) §3. The short version, because each is a lesson rather
than a bug:

**The limiter failed 174 unrelated tests.** A fixed 60/minute is right for a person and wrong
for the integration suite, which is a legitimate client that drives every write in the product
in one minute. The failures landed on assertions about language and assignees, so it read as
those features breaking. **The limit is configuration now** (`RateLimit:WritesPerWindow`,
default 60) — raised in the test host, and lowered to 5 by the limiter's own tests through a
second host. The alternative was weakening a production protection to fit a test host.

**Every keyed create returned `500`.** `HashOf` serialized all bound action arguments,
including the action's `CancellationToken`, which System.Text.Json walks to an `IntPtr`.
Excluded by type rather than by the parameter name, because that name is a convention.

**The deadlock translation did not fire, and the code read as though it did.** EF Core's
`SqlServerExecutionStrategy` catches a transient failure and rethrows it wrapped in an
`InvalidOperationException` — so a deadlock never arrives as a `DbUpdateException`. The catch
matched nothing. It matches the **inner chain** now: the wrapper is EF's and can change, error
1205 is SQL Server's and cannot. **Only an induced deadlock could have found this**; no amount
of reading would have.

**A stale binary produced a fabricated result.** One run reported a lock timeout and no
deadlock; the build had failed on a DLL held by a leftover `testhost`, so the run used the
previous assembly. `CLAUDE.md` warns about this and it happened twice in this session — the
first time from a `Wasl.Api` process left running since 2026-09-03.

## 4 · Two pre-existing defects surfaced and fixed

Neither was caused by `036`, and leaving them would have meant hiding them.

- **`TagReadTests` compared SQL collation order with `StringComparer.Ordinal`** while its own
  comment said "under the database collation". `dbo.Tags.Name` is case-insensitive, so SQL
  sorts `race` before `Refund` and .NET ordinal does not. The two agreed only while every tag
  in the database shared a case; `036`'s lowercase test tags broke the coincidence. **The
  `ORDER BY` was never wrong — the comparer was.**
- **The documented status table had drifted from the guard that checks it.** Adding `503`
  turned `ProblemRegistryTests` red, as designed; fixing it revealed `405`, `415` and `429`
  were in the test's list and absent from `docs/sdd/05-api-conventions.md`. The "second,
  independent statement" had quietly become one statement plus a copy. All four rows are in
  the table now.

## 5 · Deviations from the spec

| Spec said | Built | Why |
|---|---|---|
| §3.4 fixed limit | Configurable, default 60 | §3 above. Measured, not preferred |
| §3.3 catch a `DbUpdateException` | Match the inner exception chain | EF wraps transient failures; the spec's assumption was untested |
| AC-9, AC-10 | **Not built** | They are route B's, and Q-3 chose route A. Marked N/A rather than deleted |
| AC-7 | Not re-asserted | `003` already covers it and `036` did not touch that path. A duplicate assertion would imply verification this feature did not do |

## 6 · Contract changes

Both go here rather than being edited away.

**`docs/sdd/05-api-conventions.md` §Idempotency.** It says double-submitted tickets are
accepted because deduplicating them *"would require guessing intent."* That reasoning stands
and is not reversed: `036` does not deduplicate. An `Idempotency-Key` guesses nothing — the
client states that two deliveries are one intent. The endpoint is unchanged for any caller that
sends no header (AC-19).

**The status table gained four rows** — `405`, `415`, `429`, `503`. Three were already produced
by the API and missing from the table (§4).

## 7 · Known limitations, stated

- ~~**A deadlock on a READ is not translated.**~~ **CLOSED the same day by
  [`036b`](../036b-transient-read-path/summary.md).** `036` translates at `SaveChangesAsync`, so
  a victim chosen while executing a `SELECT` surfaced as an unmapped exception — measured
  directly, because the first version of the deadlock test hit exactly this. `036b` adds an
  outermost MediatR behaviour that covers every path through the pipeline, which is every HTTP
  request. **Still open for the seeders**, which call `SaveChangesAsync` directly and never
  touch MediatR.
- **The rate limiter is in-process**, like `004b`'s throttle. Two instances behind a load
  balancer each permit the full budget, and a restart forgets every window. Same honest framing:
  *it stops a loop, it does not stop a distributed client.*
- **A crash between reserving a key and recording its response** leaves a reservation with no
  response. The next delivery of that key is answered `503` (still in flight) until the row
  expires after 24 hours.
- **`Location` is stored absolute**, pinning the scheme and host of the first request. A replay
  reaching a differently-named host inside the retention window returns the original host's URL.
  Accepted over a replay that differs in shape from the response it claims to be.
- **`POST /api/tickets/{id}/comments` still cannot be retried safely.** Q-5 scoped the key to
  one endpoint. `CLAUDE.md`'s checklist row now says so explicitly rather than implying the
  whole class is closed.
- **1222 (lock request timeout) is deliberately not translated.** A timeout does not prove the
  work was rolled back, so advising a retry could double a write that eventually commits.
- **The rate limit's numbers are calibrated against nothing measured.** Sixty is an order of
  magnitude above what a screen produces, reasoned rather than observed — which is why it is
  configuration.

## 8 · What this leaves open

- `POST /…/comments` idempotency — the lower-value half of Q-5.
- Deadlock translation on the read path (§7).
- A durable, shared rate-limit store — the same decision `004b` deferred for its throttle.
- `021` `ICommunicationProvider` is **still unbuilt**. `036` corrected the claim that it existed;
  building it is `021`'s.

## 9 · Files

**New** — `IRetryAfterHint`, `TransientConflictException`, `IdempotencyConflictException`,
`IIdempotencyStore` + `IdempotencyLimits`, `IdempotencyRecord`,
`IdempotencyRecordConfiguration`, `IdempotencyStore`, `IdempotencyFilter` + `IdempotentAttribute`,
`WriteRateLimiting`, migration `AddIdempotencyKeys`, and four test classes under
`tests/…/Resilience/`.

**Changed** — `DomainException` (a cause-carrying constructor), `DomainErrorCodes`,
`ConcurrencyConflictException`, `RateLimitedException`, `ProblemTypes`, `GlobalExceptionHandler`,
`WaslDbContext`, `TagConfiguration`, both `.resx` catalogues (5 keys each, `en` + `ar`),
`DependencyInjection` (both), `Program.cs`, `TicketsController`, `WaslApiFactory`,
`ProblemRegistryTests`, `TagReadTests`, `CLAUDE.md`, `docs/sdd/05-api-conventions.md`.
