# `011-assign-ticket` — AI notes

`tasks.md` names an agent and a skill per task. **No agent was dispatched.** Every task was
implemented inline; this file records that rather than leaving the table's assignments to imply
otherwise.

## Accepted outputs, and whether they were run

Nothing was accepted on reading.

| Claim | How it was checked | Result |
|---|---|---|
| A handler denial is audited; a policy denial is not | Moved the check into `[Authorize(Policy = ManagerOnly)]`, removed `EnsurePermitted`, ran the suite | `found 0: {empty}` — the row ceases to exist. Two unpredicted side findings, below |
| The version check must precede the permission decision | Swapped the two, ran the suite | Exactly one test red, and it is the one written for it |
| `TicketHistoryEventType` already contains `Assigned` and `Unassigned` | Read `009`'s enum before writing a migration | True — no migration, no enum change |
| `PerformedByUserId` is stamped | AC-9 asserted the actor | **NULL.** A defect predating this feature by two releases |
| `assignee` can be added without breaking a contract | Ran `009`'s and `010`'s existing tests unchanged | 340/340 — no client-visible field changed shape |
| The picker publishes nothing sensitive | Asserted over the **raw** response text, not the parsed shape | No hash, no email, no `preferredLanguage` |
| BR-2 works end to end | Signed in as the seeded Agent against the compose container and read `dbo.AuditLog` in SQL | `Denied` row, `TraceId` byte-identical to the `403` body's |

## Where the model was wrong

| Assumed | Actual | Caught by |
|---|---|---|
| `data-model.md` described the existing schema | Four of its rows were wrong — the FK and the index were created by `004` not `009`, the index has a different name, `SupportUsers` was created by `004` not `001`, `IsActive` has no default, and `Auth.Forbidden` is written by nothing | Reading `004`'s migration before trusting the file. `009` taught this exact lesson and the file was checked because of it |
| `plan.md`'s `TicketAssignmentPolicy` in `Wasl.Domain` was the design to build | Its stated premise — *"ADR-010 removed the `Wasl.Application` test project"* — is false. ADR-010 was **rejected** and that project exists | Reading the plan's own reasoning rather than its conclusion. The plan quoted the correct objection and then overruled it on a premise that no longer holds |
| A second DTO was needed for the contract's nested `assignee` | An added field satisfies the contract, breaks nothing, and avoids a second mapper | Asking what the ruling actually required rather than what the contract's example literally showed |
| Reverting a file with `Copy-Item` is enough to re-measure | `Copy-Item` preserves the source's `LastWriteTime`, so the restored file looked older than the DLL and MSBuild skipped it. Build reported `0 Errors` | Comparing the DLL's timestamp against the source's, after a result that made no sense |

## The build lied, and this is the important entry

Negative control 2 was measured against negative control 1's binary. Five tests were red — the
same five — and the write-up would have been *"swapping the check order breaks five tests."*
Specific, plausible, backed by a green build and a real test run, and completely wrong.

The tell was that the five failures did not match the change: swapping two checks cannot make an
Agent's self-assignment return `403` with an **empty body**, because an empty-bodied `403` is
middleware, not a handler. That mismatch was the only signal; nothing in the tooling reported a
problem.

`CLAUDE.md` lists four tools that have produced well-formed reports about nothing here — a grep, a
regex, a preview toggle, a measurement block. **This is the fifth, and the first where the tool was
the build itself.** Every control was re-measured with `--no-incremental`.

## What the negative control found that the plan did not

The plan and the spec both predicted the audit row would vanish. Neither predicted:

- **The policy's `403` has an empty body.** No `type`, no `traceId`, nothing a client can branch
  on. `002b` owns enveloping middleware-produced statuses, so BR-2 in a policy would have produced
  a refusal the frontend could not distinguish from any other `403`.
- **A policy cannot express the contract's step ordering at all.** Authorization middleware
  necessarily runs before any handler, so `409`-before-`403` becomes unreachable by construction —
  not a bug to fix but a property of where the check lives.

Both strengthen the same conclusion by routes the spec did not draw, which is the argument for
running a counterfactual rather than adding assertions written from the same mental model as the
code.
