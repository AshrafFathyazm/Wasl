# `013-ticket-timeline-and-comments` — AI notes

`tasks.md` names an agent and a skill per task. **No agent was dispatched.** Every task was
implemented inline; this file records that rather than leaving the table to imply otherwise.

## Accepted outputs, and whether they were run

Nothing was accepted on reading.

| Claim | How it was checked | Result |
|---|---|---|
| `003`'s comment-body redaction fires | Wrote a comment with a distinctive body, searched **every column** of the audit row, then queried the live database | `Hits: 0`, and `Changes` shows `"field":"Body","before":"[redacted]"` |
| The tie-break is load-bearing | Deleted it, ran the suite | 1 test red — the one `010` never managed |
| The cursor matches the sort | Removed a key from the sort, then from the cursor, separately | 2 red, then 1 red |
| A comment and its history row share an instant | Read the live timeline | Both `12:19:53.821Z` |
| Arabic in a body round-trips | A manual check said **no**; re-checked with a UTF-8 client | The manual check was wrong. See below |
| The union translates | It did not, first time | `500` — `Unable to cast object of type 'System.String' to type 'System.Int32'` |
| `TicketHistoryEventType.CommentAdded` already exists | Read `009`'s enum before writing a migration | True — the only new object is one table |
| No message key ships unresolved | Added the three keys in the same commit, and let `MessageKeyCoverageTests` check | Green. The rule `004b` wrote, working on the next feature |

## Where the model was wrong

| Assumed | Actual | Caught by |
|---|---|---|
| Ordering by `Id` and comparing the id as text are the same order | **SQL Server orders `uniqueidentifier` by its own byte order**, not lexically. The `ORDER BY` and the `WHERE` disagreed and a comment appeared on two consecutive pages | AC-12's test asserting no entry appears twice. A test counting four entries per page would have passed |
| A tie-break on the id alone satisfies A-4 | A-4 says **type then id**. The code was deterministic and under-specified against its own spec, and the test was hard-coding an arbitrary winner | The merge-order test going red after the previous fix changed which side won — a failure that pointed at the spec rather than at the code |
| A `Concat` of two projections with converted enums translates | A `UNION ALL` aligns by column position and needs one type per position; the branch with no real column supplied a null EF typed from the CLR enum | The first request, with an exception that mentions no union |
| An Arabic body was being stored as `?????` | The client mangled it before it left the machine. PowerShell 5.1 encodes a string body as ASCII unless a charset is named | The **same output** rendering the author's Arabic name correctly in the response |

## The two results worth more than a pass

**1 · The repeatability test did not catch the missing tie-break.** With `ThenByDescending`
deleted, `Entries_sharing_an_instant_order_identically_on_every_request` still passed — SQL Server
returned the same order twice on a small dataset, which is precisely what `010` discovered after
three attempts.

So the division of labour between the two tests is not what it looks like:

- The test asserting a **specific order** is what catches a missing tie-break.
- The test asserting **repeatability** earns its place only by proving a tie **exists**, which is
  what stops the order test passing on data that never tied.

Writing only the repeatability test would have produced `010`'s outcome — a guard nothing
demonstrates — while looking like the more rigorous of the two.

**2 · The Arabic scare.** A brand-new `nvarchar` column returning `?????` is the exact signature of
ADR-013's most-expensive defect, so the instinct was to suspect the schema. The evidence against
that was already on screen: the author's Arabic name rendered correctly in the response, from the
same console, in the same request. One tool, two directions, one of them working — which is what
`CLAUDE.md`'s "verify a measurement with something below it" is for.

Sixth entry for the list of tools that have produced a well-formed report about nothing here.

## What is not claimed

**AC-14 has an argument and no test.** The actor name is resolved by a `JOIN` in both branches and
no code path can loop, so the criterion is almost certainly met — and nothing asserts it. Proving
it needs a `DbCommandInterceptor` counting round trips per request, which no test in this suite
does for any feature. It is recorded in `tests.md` under *Not claimed* rather than ticked, because
a criterion satisfied by inspection is not a criterion that was verified.
