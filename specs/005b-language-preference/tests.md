# `005b-language-preference` — test evidence

**Scope:** the backend half only. The switcher screen is the frontend lane's, as a separate row —
which was the split that let this start.

**Run:** 2026-08-30, Windows 11, .NET 10.0.200 SDK, SQL Server 2022 via `Testcontainers.MsSql`.

```text
dotnet build --no-incremental      0 Warning(s)   0 Error(s)
dotnet test --no-build

Wasl.Domain.Tests            Failed: 0   Passed: 177   Total: 177     397 ms
Wasl.Application.Tests       Failed: 0   Passed:  26   Total:  26     744 ms
Wasl.Api.IntegrationTests    Failed: 0   Passed: 330   Total: 330    1 m 4 s
                                         ─────────────────────────
                                         Passed: 533   Total: 533
```

Before `005b`: 521. Twelve new, **all green on the first run.**

---

## Acceptance criteria → named tests

| AC | Test | Result |
|---|---|---|
| AC-1 | `ChangeMyLanguageTests.The_stored_preference_changes_and_reaches_the_next_token` | pass |
| AC-2 | Same test — a fresh sign-in, and `preferred_language` decoded from the new token | pass |
| AC-3 | `An_unsupported_or_regional_language_is_refused` (`ar-SA`, `en-GB`, `AR`, `fr`, empty, whitespace) | pass |
| AC-4 | `An_anonymous_request_is_unauthenticated` | pass |
| AC-5 | `A_language_change_writes_one_audit_row_naming_the_actor` | pass |
| AC-6 | `The_response_names_the_locale_of_this_request_not_the_new_one` | pass |
| AC-7 | `The_command_carries_no_user_identifier` | pass |
| AC-8 | `OpenApiContractTests` — the `NotBuiltYet` entry deleted, and the comparison green | pass |
| AC-9 | `Setting_the_same_language_twice_is_not_a_conflict` | pass |

---

## AC-2 is the one that had to be end to end

The column and the claim being **in step** is the entire reason the preference is stored. A test
that only read the row back would pass on a build where `JwtAccessTokenIssuer` had stopped reading
the column — and the user would switch language to no effect, forever, with every test green.

So the test changes the preference, signs in again, and **decodes the new token**.

`004`'s own record has three instances of this exact class — an entity written only from outside
the real path is an entity nothing has verified — and `CLAUDE.md` keeps the table.

---

## AC-6 exists so a behaviour is not filed as a defect

```text
PUT /api/me/language  {"language":"ar"}   →  204,  Content-Language: en
```

The culture was resolved from the claim that was current when the request arrived, long before
the handler ran. **A client reading this header to confirm the switch will conclude it failed.**

The frozen contract calls it *"the single most confusing thing about this endpoint"* and says
plainly that it is behaviour rather than a defect. It is now asserted, with the reason inside the
test, and repeated in `MeController`'s own remarks — because the next person to meet it will be
reading the controller, not the contract.

---

## The negative control closed a loop `002c` opened

`002c` built a contract comparison and a `NotBuiltYet` list, plus a test that fails when an entry
names an endpoint that **is** built. `005b` had to delete its own entry, and the comparison was
red until it did.

Then the control: the route was changed from `api/me` to `api/mine` and rebuilt with
`--no-incremental`.

```text
Failed: 2, Passed: 3

  Every_built_endpoint_appears_in_a_frozen_contract
      … but found at least one item {"PUT /api/mine/language"}

  Every_contracted_endpoint_is_built_or_named_as_pending
      … but found at least one item {"PUT /api/me/language"}
```

**Both directions fired at once**, which is what a two-way comparison is for: the built path is
described by nothing, and the frozen contract describes nothing built. Reverted, rebuilt, whole
suite: **533 / 533.**

---

## Deliberately not conflict, not concurrency

| Decision | Why |
|---|---|
| Same language twice is `204`, not `409` | `012` answers a same-status transition with `409`, and that rule does **not** generalise. A preference is not a state machine and nobody is racing anybody for their own setting |
| No `expectedVersion` | Every other `PUT` here takes one and each guards a shared resource two people can edit. This writes one scalar to the caller's own row, where a lost update means the user's own last click won. Requiring a version would be consistency for its own sake |
| An unknown or inactive subject is `401`, not `404` | The frozen contract, and BR-4.4's reasoning: a `404` tells a caller holding a valid token that the account it names has been removed |

---

## Not claimed

| What | Why |
|---|---|
| **That a user sees the new language without signing in again** | **They do not, and this is the most important limitation of the feature.** The token is signed and immutable, so it carries the old `preferred_language` until the next sign-in. Changing that means re-issuing credentials from a write endpoint, or reading the preference from the database on every request instead of from a claim — both larger decisions than this endpoint, and neither taken. Written in `MeController`'s remarks, in the spec's Q-B, and here |
| The switcher screen | The frontend lane's, as a separate row. This is the split |
| `GET /api/locales` | Still deferred, still in `002c`'s `NotBuiltYet` with its reason: two locales, both known at build time |
| That the Arabic strings are correct | Two more added to the sixty-five nobody who reads Arabic has reviewed. Q-8 |
| That `014` can now start | Its manual Arabic pass needs the **switcher**, not this endpoint. This unblocks the frontend lane, which unblocks `014` |
