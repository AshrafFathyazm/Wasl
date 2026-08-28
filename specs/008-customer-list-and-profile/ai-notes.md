# `008-customer-list-and-profile` — AI notes

`tasks.md` names an agent and a skill per task. **No agent was dispatched.** Every task was
implemented inline.

## Accepted outputs, and whether they were run

| Claim | How it was checked | Result |
|---|---|---|
| The query counter measures the right thing | Added the exact N+1 the `Tickets` count column would cause | *twelve rows cost 14 round trips and one row cost 3* |
| It cannot pass while unattached | Removed the seam from `AddInfrastructure` | All three query-count tests failed **loudly**, naming what to check |
| `Contains` needs a hand-rolled `LIKE` escaper | Measured: `search=%` against three customers, then read the command log | **False.** The provider escapes the term and declares its own `ESCAPE` clause |
| All four searched columns are case-insensitive | Read `COLLATION_NAME` from `INFORMATION_SCHEMA` on the live database | Four rows, all `SQL_Latin1_General_CP1_CI_AS` — after the migration |
| The list returns only the contract's fields | Asserted over the **raw response text** | Six fields; `notes`, `isActive` and `rowVersion` absent |
| The frontend's provisional type matches the contract | Read `api-types.provisional.ts` before writing the DTO | Field for field. The contract-first flow worked |
| A read writes no audit row | Counted rows scoped by action prefix, before and after | Unchanged |

## Where the model was wrong

| Assumed | Actual | Caught by |
|---|---|---|
| `Contains` leaves `LIKE` metacharacters unescaped — from this feature's own `research.md` R-2 | EF Core builds the pattern **and** escapes the term. A hand-rolled escaper would have **double-escaped**, making any name containing `\` or `[` unfindable | The compiler first — `Wasl.Application` cannot see EF Core, so `EF.Functions.Like` does not exist there. Then a measurement |
| A seven-character prefix of a `Guid` is unique | `Guid.CreateVersion7()` leads with a **timestamp**, so two markers minted milliseconds apart share their leading hex digits. The prefix matched the other row the same test had seeded | `found 2` instead of 1 |
| `008` establishes the paging envelope and the `404` shape, per its own opening paragraph | `010` and `012` established all four things it claims to establish. `008` is the seventh read path | Reading `010`'s delivered code before writing a clamp |

## The finding worth keeping

**The architecture test prevented a defect it was not written for.**

`LayerDependencyTests` exists to keep EF Core out of `Wasl.Application` — a boundary argument about
dependency direction. What it actually did here was refuse to compile a hand-written `LIKE`
escaper, which forced the question *"does the provider already do this?"* to be asked at all. The
answer was yes, and the escaper would have been a silent correctness bug in the opposite direction
from the one AC-8 was guarding against.

A constraint justified on one ground paying out on another is worth recording, because the usual
argument for these tests is architectural tidiness and this was not that.

## What is not claimed

- **AC-3 is unmet, not ticked.** A malformed id returns `404`; the contract says `400`. Q-A ruled
  for consistency across the API and `002b` owns the fix. The test asserts today's behaviour and
  names the contract it violates, so it goes red at the line that explains why.
- Search at volume: the largest result set in any test is twelve rows.
- Arabic orthographic search: `احمد` does not match `أحمد`. Stated as a limitation with the fix
  written down, and no test claims otherwise.
