# `004-auth-and-roles` — AI notes

`tasks.md` names an agent and a skill per task. **No agent was dispatched for `004`.** Every
task was implemented inline, and this file records that rather than leaving the table's
assignments to imply otherwise. The reason is the timebox: the product owner set a hard two-hour
stop, and dispatching, reviewing and integrating a subagent's output costs more than it saves on
work this size.

## Accepted outputs, and whether they were run

Nothing was accepted on reading. Every claim below was verified by running.

| Claim | How it was checked | Result |
|---|---|---|
| `MapInboundClaims = false` is load-bearing | Reverted the setting, ran the auth suite | 3 tests red, one of them unpredicted — the audit trail's actor columns went null silently |
| `ClockSkew = TimeSpan.Zero` is load-bearing | Same pass | red |
| `ValidAlgorithms = [HS256]` rejects `alg: none` | Hand-assembled an unsigned token (no library will produce one) | `401` |
| `Jwt:SigningKey` validation fails the host | `dotnet ef migrations add` failed with the message before any test was written | proven by accident |
| The seeder is idempotent | Dropped the database, ran `--seed` twice, read both outputs | 2 written, then 0 |
| `iat` is present in the token | Decoded a real token from a running instance | **absent** — fixed, see below |
| The FK on `AssignedToUserId` is enforced | The demo seed died on `Error Number:547` | fixed in two places |
| `Content-Language` is sent | `Invoke-WebRequest` against the running app | `Content-Language: en` |

## Where the model was wrong, and what caught it

**Three of these were assumptions written as comments before being tested.** They are listed
because the pattern matters more than the individual defects: each was plausible, none produced a
compiler error, and all three were caught by running something rather than by reading it again.

| Assumed | Actual | Caught by |
|---|---|---|
| `JwtSecurityToken(notBefore:, expires:)` emits `iat` | It emits `nbf` and `exp` only. `iat` is not derived from either | Decoding a token from the live app while writing the README's curl example |
| A fabricated assignee `Guid` was harmless because `009` said so | It was an unenforced dangling reference for two features. `004`'s FK made it fail | `dotnet run -- --seed` |
| The failure path would write `Auth.LoginFailed` | `AuditBehaviour` composes every row with one `AuditAction` string. The row said `Auth.LoginSucceeded / Failed` | the AC-16 test finding no rows |

The last one is the most instructive: the comment in `IssueTokenCommand` **explained** why the
action name did not need to know the outcome, and the explanation was coherent and wrong. A
confident comment is not evidence.

## What the negative control found that the plan did not

`spec.md`'s "what fails silently" table predicted that inbound claim mapping would break
`FindFirst("sub")` and that a `RoleClaimType` mismatch would `403` every Manager. Both happened.

It did **not** predict that the same setting empties `dbo.AuditLog`'s actor columns — because the
chain runs through `ICurrentUser` → `IAuditableEntity` stamping → `AuditBehaviour`, three features
away from the setting. Every request still succeeded. Nothing threw. The strongest claim this
codebase makes would have quietly stopped being true.

That is the argument for negative controls over more assertions: the test that went red was
`An_authenticated_write_stamps_the_real_actor_on_the_row_and_the_entity`, which was written for a
different reason entirely.

## Two tests that were agreeing with a defect

`002`'s `ErrorEnvelopeTests` asserted `errors.TryGetProperty("FullName")`. The frozen contract
says camelCase. Those assertions were written from the implementation rather than from
`contracts/`, so **two passing server tests were confirming the wrong casing** while the frontend
could not read a single error key.

Found by the frontend lane running the real API, not by any server test, and not by re-reading
the code. Recorded under *Contract changes* in `specs/009-create-ticket/plan.md`.
