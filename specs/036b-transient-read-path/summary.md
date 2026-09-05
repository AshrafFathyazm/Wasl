# 036b — Transient Failures on the Read Path · summary

**Delivered** 2026-09-05 · backend only · 672 tests (457 integration, up from 454)
**Spec:** [spec.md](spec.md) · **Evidence:** [tests.md](tests.md)

---

## 1 · What was built

One MediatR behaviour, registered outermost, translating a SQL Server deadlock victim raised
anywhere beneath it into `503 errors/transient-conflict`.

| File | Role |
|---|---|
| `Persistence/Behaviours/TransientFailureBehaviour.cs` | The behaviour. Unconstrained — commands **and** queries |
| `Persistence/TransientFailure.cs` | `IsDeadlockVictim`, extracted from `WaslDbContext` because a second caller arrived |
| `WaslPipelineBehaviours.cs` · `WaslPipeline.cs` | The handle, and the declared order — now four |
| `Audit/Probe/AuditProbes.cs` | `ReadDeadlockProbeCommand` — writes, waits, then **reads** |
| `Resilience/ReadPathDeadlockTests.cs` | AC-1, AC-2, AC-3, AC-5 |

No migration, no `ProblemTypes` row, no i18n key, no contract change. `036` already built the
vocabulary; this widens where it is reached from.

## 2 · Why not the obvious fix

Wrapping the four read methods on `IApplicationDbContext` is four small edits and it is
**incomplete**: `TicketTimelineQuery` calls EF directly on DbSets — it unions two tables
deliberately absent from that interface, which is why the class exists — and
`SequenceTicketNumberGenerator` uses `SqlQueryRaw`. Two holes today, and `CLAUDE.md` says a
third named query class will need a written reason, so a third hole eventually.

That is `003b`'s rejected per-table grant in another costume: *a list is a list somebody forgets
to extend, and the next feature's addition becomes a `500` that reads as a bug in that feature.*

## 3 · The finding: a control that refused to fail

**The spec's AC-9 predicted that registering the behaviour innermost would turn AC-5 red. It was
run. Nothing went red.**

The claim was that translating inside `AuditBehaviour` would make BR-9's failure row record
`transient-conflict` instead of the fault. It does not — `AuditOutcomeClassifier` maps any
non-denial `DomainException` to `Failed`, which is exactly what the raw engine exception maps
to. The audit row is identical from either position.

That claim had been written into the spec, into two code comments and into a test's remarks
before it was measured. **All four were corrected in place**, with the disproof kept beside them
rather than edited away.

**What survives:** the outermost placement rests on one argument — a behaviour inside
`TransactionBehaviour` has already returned by the time the `COMMIT` runs, so a deadlock resolved
there would go untranslated. **That argument is unproven**: a COMMIT-time deadlock could not be
induced, so no test goes red if the line moves. Stated, the way `010` stated its stable-sort
guard.

This is the second time in two features that a plausible, written-down mechanism turned out to
be wrong when executed. `036`'s was the wrapper type of a deadlock exception; this one is the
audit classification. Both were caught only by running a control that was expected to be a
formality.

## 4 · AC-4 is not met

A deadlock victim on a pure **query** cannot be induced. Under READ COMMITTED a `SELECT`
releases its shared lock immediately, so a read-only session holds nothing another could wait
on — it can be blocked indefinitely, never made a victim. Forcing it would mean adding
`HOLDLOCK` to the query under test, i.e. changing the thing being measured.

What is asserted instead is weaker and true: `PipelineOrderTests.A_query_resolves_validation_only`
now expects `["TransientFailureBehaviour", "ValidationBehaviour"]`, proving the behaviour is in
a query's pipeline and would translate if the engine ever did choose one.

**Recorded as not met**, in the shape `008` AC-3 and `002c` AC-3 use.

## 5 · Deviations from the spec

| Spec said | Built | Why |
|---|---|---|
| AC-4: a query deadlock answers `503` | Not met; registration asserted instead | §4 — the engine will not produce one |
| AC-5 is the placement guard | It is a BR-9 regression guard and nothing more | §3 — measured false |
| AC-9's second control turns AC-5 red | It turns nothing red | §3 |
| Two open questions | Unchanged. Q-1 no, Q-2 not measured | Neither affected the shape |

## 6 · One assertion was weakened, deliberately

`A_query_resolves_validation_only` went from expecting one behaviour to two. The behaviour is
unconstrained **on purpose** — a query must be covered — so its presence there is the feature.
The rest of that test's claim, that a query drags in neither `Transaction` nor `Audit`, is
unchanged and still asserted (AC-7, `003` AC-16).

Called out because a widened expectation is exactly how a guard quietly stops guarding, and this
one was widened by the person who benefits from it passing.

## 7 · Known limitations

- **The placement is unproven** — §3. Moving `TransientFailureBehaviour` out of first position
  breaks nothing that any test can see.
- **A query cannot be a deadlock victim** — §4. Not a gap in the code; a property of the
  isolation level.
- **1222 (lock timeout) is still not translated.** `036`'s ruling, unchanged: a timeout does not
  prove rollback, so advising a retry could double a write that eventually commits.
- **Only 1205.** Other transient SQL Server errors (1204, 1221, 40501) are untranslated. None
  has been observed here and each needs its own argument about whether rollback is guaranteed.
- **`036`'s `SaveChangesAsync` catch is now redundant for anything reaching MediatR** and is kept
  anyway, because the seeders call `SaveChangesAsync` directly and never touch the pipeline.

## 8 · What this closes

`036` `summary.md` §7's first limitation — *"a deadlock on a READ is not translated"* — is
closed for anything running through the MediatR pipeline, which is every HTTP request. The
seeders and `--provision` still translate only at the write, via `036`'s catch.
