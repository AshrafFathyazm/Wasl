# 009 — AI Usage and Audit

**Status: implemented and run 2026-08-26.**

Be specific. "AI helped with the code and I reviewed it" is worthless. Name the file, the
suggestion, and what was wrong with it.

**No subagent was dispatched.** Everything was written in the main session, so "what the agent
returned" is "what I wrote" — which makes the verification column the only part that carries
weight.

---

## What AI was used for

Reading the migrated `US-005` artifacts against what `001`, `002` and `003` actually shipped;
reconciling four contradictions; and writing the feature. The reconciliation was the larger half
and the more useful one.

## Context provided

Read in full, not recalled: `contracts/tickets-api.md` (frozen), `data-model.md`, `plan.md`,
`research.md`, `tasks.md`, `docs/sdd/03-domain-model.md`, `docs/sdd/01-product-spec.md` (FR-2,
FR-3), `docs/sdd/04-business-rules.md` (BR-1, BR-8.13), `docs/sdd/16-three-day-plan.md`,
`docs/sdd/08-board.md`, `CLAUDE.md`, and the delivered source of `001`–`003`.

## Four contradictions found before writing code

Each went to the product owner rather than being resolved by whoever was typing. Full reasoning
in `spec.md`'s split note.

| Found | Decision |
|---|---|
| The frozen contract promises `Authorization: Bearer`, `createdByUserId` from the token, and a `401` — and `004` comes **after** this feature and after `012` in the plan | **Ship without authentication.** `createdByUserId` stays in the response as `null` and nullable in the DTO: removing a field and adding it back is a breaking change for a client, a null it handles from day one is not. Contract unchanged; AC-12/AC-13 owned by `004` |
| AC-10 returns `allowedTransitions`, but the BR-1 map belongs to `012` in the plan | **Map and all 36 tests move to `009`.** A rules table half of which is verified is not a rules table, and the API returns from it — an unverified cell reaches the screen as a button |
| The contract promises the `201`'s `Location` resolves; `GET /api/tickets/{id}` belongs to `010`, which lands after `012` | **The read endpoint moves to `009`.** A `201` whose `Location` returns `404` is a broken API, and it would have stayed broken through the demo |
| `data-model.md` said `dbo.SupportUsers` was created by `001`. It exists nowhere in source | **Four foreign keys deferred to `004`**, which creates the table. `CreatedByUserId` was additionally `NOT NULL` with a key into the missing table — colliding with the authentication decision on the same column |

## Accepted as-is

- The frozen contract's response shape, field for field, including `customer` as a summary rather
  than the whole entity and `version` as base64 `rowversion`
- BR-1's matrix, transcribed from `CLAUDE.md` into the test's expectation table **by hand rather
  than derived from the implementation** — a test that computes its expectation the way the code
  does asserts only that the code is self-consistent
- `research.md` R-1's rejection of `MAX(TicketNumber) + 1` and its choice of a sequence, including
  the accepted cost of gaps
- `data-model.md`'s physical types, once its three false statements were corrected
- `spec.md` Q-3's answer that a `400`/`404` writes no audit row — `003` implemented exactly that,
  because `ValidationBehaviour` sits outside the audit path

## Modified

| What | Change | Reason |
|---|---|---|
| `CommunicationChannel` — as I first wrote it | `Email · Phone · WhatsApp · Portal` → **`Email · WhatsApp · LiveChat · Sms · WebForm`** | **My error, not the blueprint's.** The five correct values are stated in six places, including `03-domain-model.md` line 372. I wrote the enum from the contract's example payload — which shows only `"channel": "WhatsApp"` — and invented the rest. `Portal` was the worst of them: `15-scope-coverage.md` excludes a customer portal outright, so the enum asserted a capability the scope document had ruled out |
| `research.md` R-2, which removed `ITicketNumberGenerator` | Interface reinstated | It was removed as ceremony under ADR-010's two projects. Under ADR-002 the handler is in `Wasl.Application`, which cannot see EF Core, and a sequence is a SQL Server object — the same reason `IApplicationDbContext` exists. **The note's real argument survived and is honoured:** a faked sequence proves nothing about AC-11, so the concurrency test uses a real one |
| `plan.md` — the history row appended inside `Ticket.Create` | Written by the handler | The right instinct, and it does not survive the stamping decision: the factory no longer knows the instant. Both now read one scoped `IRequestTimestamp` |
| `research.md` R-7 | Marked superseded, with a table of which rows survived the reversal | Two of its conclusions were about something other than layout — no repository, keep MediatR — and those are still correct |
| `data-model.md` `DEFAULT 'Normal'` on `Priority` | No column default | EF warned it would overwrite an explicit `Low`. See `tests.md` finding 2 |

## Rejected

| Suggested | Why |
|---|---|
| A forgeable header or a stub claim, to fill `createdByUserId` | ADR-005 rejected exactly that, and `003`'s `ICurrentUser` returning nulls is the **correct** answer for a system with no authentication — not a gap to paper over. Every audit row would otherwise name a user the server never authenticated |
| Seeding a "system" user so the `SupportUsers` key would work | Same objection, arriving through the schema |
| Hard-coding `["Open","Closed"]` for `New` and letting `012` replace it | BR-1 would then live in two places, and the "temporary" copy has no test that fails when it is forgotten |
| Shipping the map with only the `New` row tested | 35 unverified cells behind an API the screen renders buttons from. `003` caught this class of defect twice |
| **Saving twice** — stamp the ticket, read the stamp back, write the history row | Mine, and the product owner rejected it. It works, because `003`'s accumulator merges diffs across saves — and it is a workaround `011`, `012` and `016` would each repeat. Three repetitions is a pattern, and the pattern is "write, read what you wrote, write again" |
| Registering the pipeline behaviours inside `AddApplication()` | Requested, and impossible: two of the three live in `Wasl.Infrastructure`, which `Wasl.Application` sits below. It also does not compile. `003` R-15 already observed per-layer registration inverting the order |
| A `[JsonConverter]` attribute per enum property | An attribute is a thing the next DTO forgets, and the resulting contract violation compiles. One converter, registered once |

## Hallucinations caught

**One, and it was mine rather than a tool's.** `CommunicationChannel`'s members — see *Modified*.
Two of four values were invented, one of them contradicting a scope document, and the enum
compiled and would have reached a migration. Caught by the product owner reading it against the
source.

**What made it possible:** I read the contract's example (`"channel": "WhatsApp"`) and treated a
sample value as the value set. The enum was stated explicitly one line of `03-domain-model.md`
away. Nothing about the failure was subtle; it was a file I did not open.

**What it would have cost:** `design/icons/` keys one asset per channel by name and the frontend
lane builds its icon map from the enum in the frozen contract — so `LiveChat`, `Sms` and
`WebForm` would have had no icons and `Phone` and `Portal` would have had no channels. The i18n
keys in `frontend-spec.md` already carried the **correct** names, which is a second place the
mistake was visible.

## Verification

Every claim in `tests.md` is pasted output. **214 tests, 214 passed, 0 skipped, 0 warnings** —
`009` added 121.

| Claim | How it was checked |
|---|---|
| Four indexes and two foreign keys in the migration | `grep` over the generated file, and the schema read back from `sys.*` |
| Enums travel as strings | Observed failing first: every request `400` before the converter |
| An explicit `Low` survives | A test that would have passed with the column default in place only because the value happened to differ |
| The BR-1 matrix | 36 cells × 2 assignee states, expectation transcribed by hand |
| AC-11 concurrency | Eight real concurrent creates against a real sequence, never a substitute |
| The stamps are applied and excluded from the diff | Both halves in one test, because they are one decision |
| `dbo.SupportUsers` does not exist | `grep` over `src/` and over the `InitialCreate` migration. The only hits were binary matches inside `bin/` |

**Not verified, and named in `tests.md`:** AC-5's envelope shape (`002b`), the OpenAPI comparison
(`002b`), the sequence's gap behaviour, and `IRequestTimestamp`'s frozen-clock limit.

**Docker stopped mid-session** and a re-run produced 55 `DockerUnavailableException` failures.
Docker was restarted and the suite re-run green; the recorded numbers are from that run. Written
down because an unexplained red run in a transcript is worse than an explained one.

## Human decisions and trade-offs

Six, all the product owner's, all recorded with the option that was turned down:

1. **Ship `009` without authentication** rather than pulling `004` forward — a `004` estimated at
   30 minutes is closer to 90, and an hour taken from Session 1 comes out of the state machine
2. **Move the BR-1 map and its 36 tests into `009`** rather than testing one row and leaving 35
   cells to `012`
3. **Move `GET /api/tickets/{id}` into `009`** rather than shipping a `Location` that returns
   `404` until `010`
4. **`024-frontend-create-ticket-form`** as the frontend owner, not `023` — a feature screen in the
   foundation folder would make it grow with every screen and lose its definition of done
5. **Stamp in `SaveChangesAsync`, not in handlers**, and reject the two-save workaround in favour
   of one scoped `IRequestTimestamp`
6. **Each layer registers itself** — with `AddWaslPipeline()` in `Wasl.Api` as the one documented
   exception, because the behaviours do not live in one layer
