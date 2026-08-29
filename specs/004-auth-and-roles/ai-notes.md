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

---

# `004b`, second half — AI notes, 2026-08-29

No agent was dispatched. Written directly, because the work is four small components on one
path and the expensive part was deciding what the throttle is keyed by — which is a judgement
about a contradiction between two approved statements, not a code-generation task.

## Accepted after being run

| What | How it was verified |
|---|---|
| `AuthDenialResultHandler` delegating to `new AuthorizationMiddlewareResultHandler()` for the success path | Live: `/health` → `200`, an authenticated `GET /api/tickets` → `200`, both observed after the handler was registered. Then the whole suite — an over-eager handler would have broken every authenticated test at once, which is the cheapest possible signal |
| Resolving `IAuditWriter`, `ICurrentUser`, `IRequestContext` from `context.RequestServices` inside the method | The handler is a **singleton** and all three are scoped. Injecting them into the constructor is a captive dependency: it would resolve once, at startup, and every row afterwards would carry the first request's actor and trace id. Nothing throws — this is the same silent-actor failure `004`'s negative control found through `MapInboundClaims`. Verified by two consecutive `401`s carrying **different** trace ids: `00-1be438bc5a8ef10a5f2058dedf3ed671-…` then `00-30a15b26fb48a81e4302f6154b3bb84b-…`. A captive `IRequestContext` would have repeated the first |
| The throttle filter reading the email from `context.ActionArguments` | Re-reading the request stream would consume it before model binding, and would also let the filter and the handler disagree about which address the attempt was for |
| `Cascade(CascadeMode.Stop)` on the `expectedVersion` chain | FluentValidation runs every rule in a chain by default, so without it `MaximumLength` would report the problem and `BeBase64` would still allocate the buffer the rule exists to avoid. The ordering is the fix, not the message |

## Rejected

| Suggested | Why not |
|---|---|
| ASP.NET Core's built-in rate limiter | It partitions **before** the endpoint runs, so it cannot know whether the credentials were right — and the ruling counts only *failures*. Counting every attempt throttles someone typing their password correctly ten times in five minutes, which is a working day on a shared machine |
| Checking the throttle inside `IssueTokenCommandHandler` | An `IAuditableCommand` carries one action string, so the refusal could only ever be recorded as `Auth.SignIn / Denied` and AC-36 asks for `Auth.RateLimited`. It would also open a transaction for a request that is about to be refused, and consult the credentials before the throttle — which makes "throttled" say something about whether the password was right |
| Building the `429` body in the filter | `002` AC-2: one producer of `ProblemDetails`. The filter throws `RateLimitedException` and `GlobalExceptionHandler` builds the body and sets `Retry-After` |
| A fixed window instead of sliding | Same three lines once the timestamps are kept, and a fixed window lets twenty attempts through across a boundary — the number the ruling was choosing against |
| Quoting the length limit in the `expectedVersion` message | A caller who sent ten megabytes is not a caller who reads limits, and naming one tells an attacker where the cheap-refusal boundary sits. Same sentence as the undecodable case, deliberately |

## What the tools got right, and what needed watching

- **PowerShell 5.1 encodes a string request body as ASCII.** Recorded in `013` as the sixth lying
  tool, and it did not bite here only because every value in these probes is ASCII. Still the
  reason the Arabic assertions live in the test suite rather than in a manual probe.
- **`--no-incremental` on every negative control**, per `011`: `Copy-Item` restores a file with an
  older `LastWriteTime` than the DLL, MSBuild skips the compile, and the control measures the
  previous control's binary.
- **The `$_` variable in a PowerShell `catch` shadows the loop variable**, so the probe printed
  `attempt The remote server returned an error…` instead of `attempt 11`. Cosmetic, and the
  status code and `Retry-After` in the same line were correct — noted because a mangled label on
  a correct measurement is one step from a correct label on the wrong measurement, which
  `CLAUDE.md` records as the worse failure.
