# `007-create-customer` — AI notes

`tasks.md` names an agent and a skill per task. **No agent was dispatched.** Every task was
implemented inline.

## Accepted outputs, and whether they were run

| Claim | How it was checked | Result |
|---|---|---|
| The filtered indexes exist and are filtered | Queried `sys.indexes` on the live database | Both, with `([Email] IS NOT NULL AND [IsActive]=(1))` |
| An unfiltered unique index would break phone-only customers | Built the wrong index on a throwaway table and inserted two NULLs | `SqlException` 2601 — the reason, proved on the engine |
| Two simultaneous creates give one `201` and one `409` | `Task.WhenAll` over two identical requests | One of each, one row, and the `409` identical to the pre-check's |
| The email is normalised on write | Read the column back, not the response | `samira@example.com` from `"  SAMIRA@Example.COM  "` |
| A create and a read return the same resource | Compared the two bodies **byte for byte** | Failed first — see below |
| `Customer` timestamps are stamped | The first `201` | `0001-01-01T00:00:00` — never stamped, by anything, since `001` |
| A local phone number is refused | Live `POST` with `0501234567` | `400`, naming `phone`, telling the user to add a country code |

## Where the model was wrong

| Assumed | Actual | Caught by |
|---|---|---|
| `Customer` is stamped like `Ticket` — it is written into the factory's own doc comment | It is **not** an `IAuditableEntity`, has no actor columns, and the stamping loop matches by interface. Nothing had stamped a customer since `001` | The first `201` returning the CLR default as a fact |
| Truncating stamps is a detail | It is the difference between a `POST` and a `GET` agreeing about a resource. Every create in the product had the mismatch | AC-14 asserting byte-identity |
| BR-4.1 should be measured against the **normalised** values | Then a malformed phone with no email fails twice, and the form shows *"provide a contact method"* beside a phone the user just typed. BR-4.1 is about having supplied **nothing** | Running it |
| A ten-character slice of a `Guid` is a unique discriminator | **`Guid.CreateVersion7()` leads with a timestamp.** Two customers created in one instant collided | A duplicate `409` in a test about sharing a name |
| Removing `.HasFilter(...)` and generating a migration is a clean negative control | The extra migration broke the test fixture; 32 tests failed in ~1 ms each, which is a fixture failure and not a measurement | The uniform 1 ms durations |

## The one worth reading

**The lesson from `008` recurred one feature later, in the same week, written by the same process.**

`008`'s `tests.md` says plainly: *a time-ordered id is a poor source of a unique prefix*. `007`'s
first test helper used `Guid.CreateVersion7().ToString("N")[..10]` as an email local-part and hit
the identical failure.

Writing a lesson into a delivered feature's evidence file does not carry it forward, because that
file is not read while writing the next feature. Both of `007`'s durable findings — this one and
the create/read timestamp mismatch — were therefore put into `CLAUDE.md`, which is read at the
start of every session. **That is the actual conclusion: the evidence file records where a thing
was found; only `CLAUDE.md` changes what happens next.**

## What is not claimed

- AC-16 and AC-17 — the form and its double-submit guard. Frontend lane.
- The duplicate rule against an inactive customer: stated as a limitation, structural via the
  filter, and no test claims otherwise.
- Country-aware phone normalisation: **refused by ruling**, not deferred by omission.
- `POST /api/tickets` remains not idempotent. `007` closed the customer half of `CLAUDE.md`'s
  duplicate-request row; the ticket half has no natural key and is recorded as still open in
  `009`'s `tests.md`.
