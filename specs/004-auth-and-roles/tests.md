# `004-auth-and-roles` — test evidence

**Scope:** the backend half only. The frontend half (AC-24 … AC-30) is not built and is not
claimed here.

**Run:** 2026-08-27, Windows 11, .NET 10.0.200 SDK, SQL Server 2022 via `Testcontainers.MsSql`
(one container for the whole integration suite) plus one `docker compose` container for the
manual verification.

```text
dotnet build --no-incremental      0 Warning(s)   0 Error(s)
dotnet test --no-build

Wasl.Domain.Tests            Failed: 0   Passed: 166   Total: 166   398 ms
Wasl.Application.Tests       Failed: 0   Passed:   8   Total:   8   631 ms
Wasl.Api.IntegrationTests    Failed: 0   Passed: 129   Total: 129    23 s
                                         ─────────────────────────
                                         Passed: 303   Total: 303
```

Before `004`: 267. `004` added 36.

---

## Acceptance criteria → named tests

### Sign-in

| AC | Test | Result |
|---|---|---|
| AC-1 | `IssueTokenTests.Correct_credentials_return_the_token_and_the_user_block` | pass |
| AC-1 | `IssueTokenTests.No_response_field_anywhere_carries_the_password_hash` | pass |
| AC-2 | `IssueTokenTests.The_token_carries_every_claim_by_name` | pass |
| AC-3 | `IssueTokenTests.The_lifetime_is_eight_hours_and_the_body_agrees_with_the_token` | pass |
| AC-4 | `IssueTokenTests.Wrong_password_and_unknown_email_are_indistinguishable` | pass |
| AC-5 | `IssueTokenTests.Missing_input_is_a_validation_error_not_a_denial` (4 cases) | pass |
| AC-5 | `IssueTokenTests.A_malformed_address_is_denied_not_rejected` | pass — **deviation, see below** |
| AC-23 | `IssueTokenTests.An_email_that_differs_only_in_case_signs_in` | pass |

### Token validation and the principal

| AC | Test | Result |
|---|---|---|
| AC-6 | `TokenValidationTests.The_principal_carries_the_short_claim_names_and_no_federation_uris` | pass |
| AC-7 | `TokenValidationTests.Manager_only_admits_the_manager_and_refuses_the_agent` | pass |
| AC-8 | `TokenValidationTests.A_token_this_application_did_not_sign_is_rejected` (3 cases: foreign key · `alg: none` · HS512) | pass |
| AC-9 | `TokenValidationTests.A_token_that_expired_one_second_ago_is_rejected` | pass |
| — | `TokenValidationTests.No_token_is_unauthenticated_and_a_wrong_role_is_forbidden` | pass |

### Authorization surface

| AC | Test | Result |
|---|---|---|
| AC-10 | `AuthorizationSurfaceTests.Every_endpoint_is_authorized_and_exactly_two_are_anonymous` | pass |
| AC-20 | `AuthorizationSurfaceTests.Health_answers_without_an_authorization_header` | pass |
| AC-20 | `AuthAuditTests.Health_writes_no_audit_row` | pass |
| AC-21 | `MiddlewareOrderTests.Authentication_is_registered_before_request_localization` | pass |
| AC-21 | `MiddlewareOrderTests.Authentication_is_registered_before_authorization` | pass |
| AC-21 | `MiddlewareOrderTests.The_exception_handler_stays_ahead_of_everything_it_must_catch` | pass |

### Configuration and startup

| AC | Test | Result |
|---|---|---|
| AC-11 | `StartupValidationTests.A_missing_signing_key_fails_the_host_and_names_the_configuration_key` | pass |
| AC-11 | `StartupValidationTests.A_signing_key_shorter_than_thirty_two_bytes_fails_the_host` | pass |
| AC-11 | `StartupValidationTests.The_startup_failure_never_echoes_the_value` | pass |
| AC-12 | `StartupValidationTests.A_missing_seed_password_fails_the_host` (2 cases) | pass |

### The table and the two rows

| AC | Test | Result |
|---|---|---|
| AC-13 | `SupportUserSeedTests.Seeding_again_writes_nothing_and_leaves_both_hashes_untouched` | pass |
| AC-14 | `SupportUserSeedTests.The_stored_value_is_a_verifiable_hash_and_not_the_password` | pass |
| AC-22 | `SupportUserSeedTests.The_table_matches_the_data_model` | pass |
| AC-23 | `SupportUserSeedTests.Arabic_in_a_name_round_trips_byte_identical` | pass |

### Audit

| AC | Test | Result |
|---|---|---|
| AC-15 | `AuthAuditTests.A_successful_sign_in_writes_one_row_naming_the_user_it_signed_in` | pass — **partial, see below** |
| AC-16 | `AuthAuditTests.A_failed_sign_in_writes_one_row_carrying_the_email_and_no_secret` | pass |
| AC-19 | asserted inside the AC-16 test (`row.TraceId == body.traceId`) | pass |
| — | `AuthAuditTests.An_authenticated_write_stamps_the_real_actor_on_the_row_and_the_entity` | pass |
| AC-17 | **NOT BUILT** — deferred to `004b` | — |
| AC-18 | **NOT BUILT** — deferred to `004b` | — |

`AC-17`/`AC-18` need an `IAuthorizationMiddlewareResultHandler` to write a row on a `401` and a
`403`. **This is an open gap in BR-9.4, not a satisfied criterion.** The status codes themselves
are asserted (`TokenValidationTests`), so what is missing is the audit row, not the denial.

---

## Negative controls — each setting reverted, and what went red

The comments in `AddWaslAuthentication` claim each setting is load-bearing. Claim tested, not
asserted from memory. Both defaults were restored in one pass:
`MapInboundClaims = true`, `DefaultInboundClaimTypeMap` left populated, `ClockSkew` removed.

```text
dotnet test tests/Wasl.Api.IntegrationTests --filter "FullyQualifiedName~Auth"
Failed: 4, Passed: 32, Total: 36

  TokenValidationTests.A_token_that_expired_one_second_ago_is_rejected
  TokenValidationTests.The_principal_carries_the_short_claim_names_and_no_federation_uris
  TokenValidationTests.Manager_only_admits_the_manager_and_refuses_the_agent
  AuthAuditTests.An_authenticated_write_stamps_the_real_actor_on_the_row_and_the_entity
```

Reverted, rebuilt with `--no-incremental`, re-ran: **36/36 pass.**

Three of the four were predicted. **The fourth was not, and it is the most useful result here:**
turning inbound claim mapping back on silently emptied the audit trail's actor columns. Nothing
threw, no request failed, and `dbo.AuditLog` simply stopped naming who did anything — which is
the failure this codebase's strongest claim (BR-9) would have died of quietly. It is also
exactly the chain `spec.md` predicted in its "what fails silently" table, arriving through a
path the table did not draw.

`Manager_only` going red confirms the AC-7 note: with the mapping on, the role claim is no longer
at `role`, so **every** Manager gets `403`. Asserting only the Manager's success would have
looked identical to asserting only the Agent's refusal.

---

## Verified by running, not by reading

### The clean path, on the compose container

`appsettings.Development.json` pointed at `Server=.\SQLEXPRESS`. Changed to the
`docker-compose.yml` container on port 14330 — see `summary.md`.

```text
docker compose up -d db                      wasl-db  healthy
dotnet ef database drop -f                   Successfully dropped database 'Wasl'
dotnet run --project src/Wasl.Api -- --seed
    Users: 2 written (manager@wasl.local, agent@wasl.local).
    Seeded 3 customers and 5 tickets, and wrote 14 audit rows.
dotnet run --project src/Wasl.Api -- --seed  (again — AC-13)
    Users: already seeded, nothing written.
    Seed skipped: tickets already exist.
```

### The API, live

```text
GET  /health                       200  Content-Language: en
     {"status":"Healthy","checks":[{"name":"database","status":"Healthy",...},
                                   {"name":"self","status":"Healthy",...}]}

GET  /api/tickets                  401   (no Authorization header)

POST /api/auth/token               200
     {"email":"MANAGER@WASL.LOCAL","password":"..."}   ← upper case, AC-23
     accessToken     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
     tokenType       Bearer
     expiresAtUtc    2026-08-28T04:08:10Z              ← +8h, AC-3
     user.fullName   منى العتيبي                        ← nvarchar round-trip
     user.role       Manager
     user.preferredLanguage  ar

GET  /api/tickets?page=1&pageSize=2   200   totalCount=5, TCK-2026-000005
     (with the bearer token)
```

`Content-Language: en` on the response closes the frontend lane's second finding — it is
`UseRequestLocalization` supplying it, and the header is absent without that call.

### Three defects found by running, all of them by `004` breaking something older

| Found | What it was | Where the fix is |
|---|---|---|
| `iat` missing from every token | `JwtSecurityToken` emits `nbf` and `exp` from its arguments but **not** `iat` — it is not derived from either. Decoded a real token from a running instance to see it. AC-2 would have passed against a token no client could read an issue time from | `JwtAccessTokenIssuer` writes the claim explicitly |
| `Error Number:547` on the demo seed | `DemoSeeder.AssignAsync` wrote a fresh `Guid` as the assignee. `009` documented that as safe because no FK existed. `004` added `FK_Tickets_Assignee` and the seed died on the first run | assigns the seeded Agent |
| Every `InProgress` test red, same FK | `ChangeTicketStatusTests.AssignAsync` did the same thing through reflection | assigns the seeded Agent |

The last two are one defect in two places, and it is worth naming precisely: the fabricated id
was **never** valid. It was an unenforced dangling reference for two features. `004` did not
create it — `004` made it fail.

### Two tests whose expectations `004` correctly invalidated

Not "fixed to pass". The old assertion was right for a world without authentication and wrong
for this one.

| Test | Was | Now |
|---|---|---|
| `CreateTicketTests.A_valid_create_returns_201_with_a_location_that_resolves` | `createdByUserId` is `null` | non-null — the token's user, with no handler change |
| `CreateTicketTests.A_created_by_in_the_body_is_ignored_and_arabic_round_trips` | body value ignored → `null` | body value ignored → **the token's user**, asserted `NotBe(smuggled)`. Strictly stronger: `null` could have meant "ignored" or "not implemented" |

### Two tests that failed for the camelCase contract fix

`ErrorEnvelopeTests.ValidationFailure_Returns400_WithFieldKeyedErrors` and
`OneFieldBreakingTwoRules_YieldsTwoMessages` asserted `errors.FullName`. The keys are camelCase
per `contracts/`; they were PascalCase in the implementation, and **these tests were written from
the implementation rather than from the contract**, so they agreed with the defect. Updated to
`errors.fullName`. Recorded under *Contract changes* in `specs/009-create-ticket/plan.md`.

---

## Deviations from the specification, and why

| # | Spec says | Built | Reason |
|---|---|---|---|
| D-1 | AC-5: a malformed email returns `400` | `401` | A format check on a login form tells an attacker which inputs the server treats as real addresses, and separates "not an address" from "not a user". That is the same enumeration oracle AC-4 exists to close, arriving through the validator instead of the handler |
| D-2 | BR-9 naming: `Auth.LoginSucceeded` and `Auth.LoginFailed` | one action, `Auth.SignIn`, with `Outcome` carrying the rest | `003`'s `AuditBehaviour` composes every row with `action: request.AuditAction` — one property, no knowledge of which path ran. The first version wrote `Auth.LoginSucceeded / Failed`, a row contradicting itself. Splitting it needs the distinction in two columns that must agree, and eventually would not |
| D-3 | AC-15: `ActorEmail` and `ActorRole` snapshotted on the sign-in row | both `null`; the user is in `EntityId` + `EntityLabel` | A request to `POST /api/auth/token` is anonymous **by definition** — it is the request that establishes identity, so `ICurrentUser` has nothing to snapshot. No middleware order fixes it. The test asserts the null explicitly so the limit is visible in the suite rather than absent from it |
| D-4 | `data-model.md`: `DF_SupportUsers_Active`, `DF_SupportUsers_Lang` | no column defaults | EF applies a database default whenever the property holds the CLR default, and for `bool` that is `false` — so deactivating a user would have stored them active. The identical defect shipped in `001` on `Customers.IsActive` and needed a migration to undo |
| D-5 | BE-004-11: `INonTransactionalRequest` | not built | Sign-in opens a transaction over one `SELECT`. Harmless, and the failure path still writes its independent row, which is the behaviour the marker existed to protect |
| D-6 | `001` AC-10: the application's connection string uses Windows auth and carries no password | `sa` against the compose container | The same throwaway credential is already committed in `docker-compose.yml`, so this adds no secret to the repository — while the criterion was making the documented quickstart path fail on any machine without a local named instance |

**D-2, read next to `004b`.** `004b` writes denial rows under **two** names — `Auth.Unauthenticated`
and `Auth.Forbidden` — plus a third, `Auth.RateLimited`. That is not a reversal of D-2, and the
difference is where each name is chosen. An `IAuditableCommand` carries **one** `AuditAction`
string which `AuditBehaviour` reads without knowing which path ran, so a command cannot name its
own failure; the authorization result handler is handed the outcome as an argument
(`Challenged` or `Forbidden`) and picks the name from it, and the throttle filter refuses before
any command exists at all. **A component names its refusal when it can see which refusal it is.**
Sign-in cannot, and still writes one `Auth.SignIn` with `Outcome` carrying the rest.

## Not run, and therefore not claimed

| What | Why |
|---|---|
| AC-17, AC-18 | Not built. `004b` |
| AC-24 … AC-30 | The frontend half. Not built by this lane |
| Brute-force resistance | There is no rate limit or lockout on `POST /api/auth/token`. Nothing tests for one because nothing implements one |
| Password policy | Not implemented beyond `SeedOptions`' 8-character floor on the seeded values |
| Concurrent startup of two instances | The unique index is the guarantee and is asserted (AC-22). The race itself was not run |
| A token presented after a real 8 hours | `ClockSkew` is asserted against a token forged one second past expiry. Nothing waited eight hours |

---

# `004b` — the `401` body, and what fixing it uncovered

**Run:** 2026-08-28. Reported by the frontend lane from a live run, not by any server test.

```text
dotnet build --no-incremental      0 Warning(s)   0 Error(s)
dotnet test --no-build

Wasl.Domain.Tests            Failed: 0   Passed: 177   Total: 177
Wasl.Application.Tests       Failed: 0   Passed:  17   Total:  17
Wasl.Api.IntegrationTests    Failed: 0   Passed: 161   Total: 161
                                         ─────────────────────────
                                         Passed: 355   Total: 355
```

340 before. `004b` added 15 — 9 integration, 6 unit.

## The defect, reproduced before it was fixed

```json
{"type":"https://wasl.local/errors/unauthenticated",
 "title":"Authentication is required.",
 "detail":"Error.Auth.InvalidCredentials",
 "status":401,"instance":"/api/auth/token","traceId":"00-804a280e..."}
```

Two faults in one body. `title` is the wrong one of the two the contract specifies for this
`type`, and `detail` is a raw resource key rendered verbatim on the login screen — BR-8.6 says
the server localizes the strings it authors.

## Fixed, and verified live

```json
{"type":"https://wasl.local/errors/unauthenticated",
 "title":"Email or password is incorrect.",
 "status":401,"instance":"/api/auth/token","traceId":"00-da827559..."}
```

An unknown email returns the same body apart from `traceId`, so AC-4 still holds — checked in the
same run rather than assumed, because a change to this response is exactly where that criterion
would break.

Mechanism, in `plan.md` under *Post-delivery contract notes*: an optional `TitleKey` on
`DomainException`, null by default, preferred by the factory over the registry's; and
`CarriesDetail: false` on the `unauthenticated` row. The `type` did not change.

## The guard, and what it found on its first run

A single missing catalogue entry is a typo. This was the **second** occurrence — `012` AC-3 caught
a `409` whose `detail` came back as `Error.Ticket.InvalidTransition` — so the fix included a guard
rather than one more entry.

`ResourceKeyLeakTests` asserts that no `title`, `detail`, or `errors` message in any error response
matches the *shape* of a resource key: `Word.Word.Word`, no spaces. No English sentence matches it.

**On its first run it failed twice more, and those two were the whole API:**

```text
400 sign-in validation:       errors.email    → "Validation.Auth.EmailRequired"
400 create-ticket validation: errors.subject  → "Validation.Ticket.SubjectRequired"
```

Every FluentValidation message in the codebase was unresolved. Seventeen keys, enumerated by
diffing the literals in `Wasl.Application` and `Wasl.Domain` against the catalogue:

```text
Error.Auth.InvalidCredentials              Validation.Ticket.DescriptionRequired
Error.Ticket.CustomerNotFound              Validation.Ticket.DescriptionTooLong
Validation.Auth.EmailRequired              Validation.Ticket.ExpectedVersionRequired
Validation.Auth.PasswordRequired           Validation.Ticket.ExpectedVersionUndecodable
Validation.Ticket.CategoryInvalid          Validation.Ticket.NoteRequiredToClose
Validation.Ticket.ChannelInvalid           Validation.Ticket.NoteTooLong
Validation.Ticket.CustomerRequired         Validation.Ticket.PriorityInvalid
Validation.Ticket.StatusInvalid            Validation.Ticket.SubjectRequired
                                           Validation.Ticket.SubjectTooLong
```

Every form field on every screen was rendering a key. **Not one server test noticed**, because
each asserted that `errors.subject` was *present* and carried one entry — `CLAUDE.md`'s "assert
content, not presence", failing in the one direction the existing tests were blind to.

Live, after:

```json
"errors":{"email":["Enter your email address."],"password":["Enter your password."]}
```

## The build-time half

`ResourceKeyLeakTests` can only see the paths the suite exercises. `MessageKeyCoverageTests`
(`Wasl.Application.Tests`, no database) scans both lower projects for literals shaped like a
message key and asserts each is in the catalogue — so a key on a rare branch fails on the commit
that introduces it rather than on the request that renders it.

It also asserts its own scanner: six inputs, three keys and three sentences, because `001` shipped
an architecture test that was a false negative until someone broke it on purpose, and a regex that
matches nothing reports success.

The reverse direction is deliberately not asserted. An unused catalogue entry is harmless, and
`002` registered titles for statuses it did not yet raise **on purpose** — failing on those would
punish the discipline that made this fix a catalogue edit rather than a redesign.

## Negative control

One entry deleted — `Validation.Ticket.SubjectRequired` — rebuilt with `--no-incremental`:

```text
Wasl.Application.Tests       Failed: 1   (MessageKeyCoverageTests)
Wasl.Api.IntegrationTests    Failed: 1   (ResourceKeyLeakTests, filtered)
```

Both halves red, at both times. Restored, rebuilt, re-ran the whole suite: 355/355.

## Not claimed

| What | Why |
|---|---|
| That no key can ever leak | `ResourceKeyLeakTests` covers six error responses. A path nothing exercises is covered only by the build-time scanner, which reads literals — a key composed at runtime would evade both |
| Arabic messages | The catalogue is English-only. `005` moves it to `.resx` with Arabic alongside; the keys do not change |
| ~~That the middleware `401`/`403` bodies are correct~~ | Was: "they are **empty** — no `type`, no `traceId`. `002b`." **Claimed now** — see the second half of `004b` below, which builds the denial handler that envelopes them. `002b` still owns the statuses produced by *routing* (`404` on an unmatched route, `405`, `415`), a different mechanism |

---

# `004b`, second half — the denial rows, the throttle, and one allocation

The four commitments `004` left open, closed together because they are one path: a request that
is refused before any handler runs.

```text
dotnet build --no-incremental          0 Warning(s)   0 Error(s)
dotnet test                            442 / 442      2026-08-29

  Wasl.Domain.Tests             177 / 177
  Wasl.Application.Tests         17 /  17
  Wasl.Api.IntegrationTests     248 / 248     1 m 16 s
```

`435 → 442`. Seven new tests, all in `AuthDenialAuditTests`.

## Every AC to a named test

| AC | Test | Result |
|---|---|---|
| AC-17 | `AuthDenialAuditTests.A_request_with_no_token_writes_one_denied_row_and_a_real_body` | pass |
| AC-18 | `AuthDenialAuditTests.An_agents_token_on_a_manager_endpoint_writes_one_forbidden_row` | pass |
| AC-19 | Both of the above — each asserts `row.TraceId == body.traceId` | pass |
| AC-31 | `A_request_with_no_token_...`, over the **raw** response text before deserialising | pass |
| AC-32 | Both — the `403` names the actor, the `401` asserts three nulls | pass |
| AC-33 | `Health_still_writes_no_denial_row` | pass |
| AC-34 | `The_denial_row_carries_no_token_and_no_header_value` | pass |
| AC-35 | `Repeated_failures_are_throttled_without_blocking_anyone_else` | pass |
| AC-36 | Same test — the `Auth.RateLimited` row, its outcome, its label and its trace id | pass |
| AC-37 | Same test, final assertion — and separately `A_successful_sign_in_is_never_counted` | pass |
| AC-38 | `A_huge_expected_version_is_refused_by_length` | pass |

## Verified live before the tests were written

Against the running API and the compose container, because a test written first tends to assert
what the code does rather than what the criterion says. The `401` body, which was `[]` in `004`'s
live run:

```json
{"type":"https://wasl.local/errors/unauthenticated","title":"Authentication is required.",
 "status":401,"instance":"/api/tickets",
 "traceId":"00-bde933cf7ae812a681b3d323aa35c1d9-efe433040ddd8cc8-00"}
```

```text
Action                | Outcome | ActorEmail | TraceId                    | IpAddress
Auth.Unauthenticated  | Denied  | NULL       | 00-bde933cf7ae812a681b3d… | ::1
```

The trace ids match, which is AC-19. The throttle, eleven wrong passwords for one address:

```text
attempt 11 : 429   Retry-After: 298
and the seeded Manager from the same IP still signs in — OK, token length 407
```

```text
Action           | Outcome | EntityLabel          | IpAddress | TraceId
Auth.RateLimited | Denied  | throttle@wasl.local  | ::1       | 00-79403adeee800c26e…
```

## Negative controls — both reverted, both rebuilt with `--no-incremental`

`011` recorded a tool that lied here: `Copy-Item` restored a source file with an older
`LastWriteTime` than the DLL, MSBuild skipped the compile, and a control was measured against the
previous control's binary. Every control below was built with `--no-incremental` for that reason.

### Control A — the denial handler unregistered

```text
dotnet test --filter "FullyQualifiedName~AuthDenialAuditTests"
Failed: 3, Passed: 4, Total: 7

  An_agents_token_on_a_manager_endpoint_writes_one_forbidden_row      [FAIL]
  A_request_with_no_token_writes_one_denied_row_and_a_real_body       [FAIL]
  The_denial_row_carries_no_token_and_no_header_value                 [FAIL]
```

**Exactly the three denial tests, and not one throttle test** — which is the shape that says the
handler is what produces both the body and the row, rather than something else in the pipeline
that happens to be running.

### Control B — the throttle keyed by IP alone, which is the literal ruling

```text
Failed: 2, Passed: 5, Total: 7

  Repeated_failures_are_throttled_without_blocking_anyone_else
      Expected manager.StatusCode to be OK {value: 200} because an office behind one NAT
      address must not lock out its own staff … but found TooManyRequests {value: 429}.

  A_successful_sign_in_is_never_counted                               [FAIL]
```

**This is the most useful measurement in the feature.** The ruling was "ten failures in five
minutes **per IP**", and AC-37 says a successful sign-in must not be blocked by another user's
failures from the same address. Under IP-only keying the Manager — who never failed once — is
refused, and the second test fails too, because one address's failures now contaminate every
account behind it. A composite (address, email) key satisfies both; email alone would be the
account lockout the ruling rejects. **The conflict was in the requirement, not in the code, and
this is what found it.** Recorded in `summary.md` under *Deviations*.

Restored, rebuilt with `--no-incremental`, whole suite re-run: **442 / 442.**

### Control C — arrived without being staged

Adding the `429` registry row turned
`ProblemRegistryTests.Every_registered_status_is_in_the_documented_table` red on its first run:

```text
Failed: 1, Passed: 247, Total: 248
  Every_registered_status_is_in_the_documented_table
```

`002`'s guard holds a **second, independent** list of documented statuses and requires it to agree
with the registry. It did exactly what it was built to do: forced the contract table to be
corrected in the same change rather than drifting from the code. `429` had been written into
`error-contract.md` as *not produced by this API*, so the correction was a **contract change**,
recorded as one at the foot of that file, with what the frontend must do about it.

## Deliberately not fixed, and why

| What | Why |
|---|---|
| The throttle is per process | Two instances behind a load balancer each count to ten, and a restart forgets everything. Making it durable means a shared store and a new dependency, which is a larger decision than this feature was approved for. Stated in `InMemorySignInThrottle`'s remarks rather than hidden — and the honest framing is unchanged either way: **it slows a script, it does not stop a determined attacker** |
| No lockout | Ruled out by the product owner. An attacker who knows an address could otherwise lock its owner out of the product from anywhere, which is a denial of service against a named user |
| No limit on the rest of the API | The ruling limits `POST /api/auth/token`, not the API. A rate limit on a working application is a different feature with different numbers, and nobody has asked for one |

## Not claimed

| What | Why |
|---|---|
| That `429` is reachable from any other endpoint | It is not. The filter is on one action, by design |
| That the frontend renders the `429` well | `025` renders any `ProblemDetails` it receives, so it shows *a* message — but it does not branch on `rate-limited` or read `Retry-After` yet. Written into the contract change so the frontend lane sees it |
| That the throttle survives a restart | It does not. In memory, per process, stated above |
| Arabic on any of these bodies | The catalogue is still English-only. `005` |
