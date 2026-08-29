# `005-localization-core` — summary

**Delivered 2026-08-29. Server half only, by ruling (Q-J).** 472 tests, 0 warnings.

## What was built

| # | What | Where |
|---|---|---|
| 1 | `SharedResource.resx` + `SharedResource.ar.resx` — 63 keys each, the neutral catalogue being English | `src/Wasl.Api/Common/Localization/` |
| 2 | `LocalizedProblemMessageSource` replacing `002`'s English dictionary. `StaticProblemMessageSource` deleted | same folder |
| 3 | `PreferredLanguageCultureProvider` — reads `004`'s existing `preferred_language` claim | same folder |
| 4 | `AddWaslLocalization(configuration)` — the three-provider list with the cookie provider **removed**, supported cultures from configuration | same folder |
| 5 | `UseRequestLocalization()` moved **between** `UseAuthentication()` and `UseAuthorization()` | `Program.cs` |
| 6 | `factory.CreateEnglishManagerClient()` — pins `?culture=en` for tests that assert English | test project |

## The one thing worth reading

**The frontend lane reported one defect. Measuring found three, and they have three different
owners.**

The report was "every server message is English in both languages". True. But `Content-Language`
was *correct* on success responses and *absent* on errors in the same run, which is not what a
single missing-catalogue defect looks like:

| # | Failure | Owner | Status |
|---|---|---|---|
| 1 | No Arabic exists — the catalogue was an English C# dictionary | `005` | **fixed** |
| 2 | A `401`/`403` never reaches the localization middleware: `UseAuthorization()` ran first, and `004b`'s denial handler produces those bodies *inside* it | `005` | **fixed**, and measured both ways |
| 3 | Any response produced by *throwing* loses `Content-Language`: `ExceptionHandlerMiddleware` clears the response before calling any handler | **`002`** | **raised, not fixed** — Q-G's ruling was to come back before touching a cause outside `005` |

Number 3 is AC-11, and it is recorded **unmet** in `tests.md` rather than reworded into something
that passes.

## What the measurements changed

**`004` already issues the language claim, and the spec said it did not.** That line was reasoned
from ADR-005 listing three claims; decoding a real token shows `"preferred_language":"ar"` on the
seeded Manager, plus a `SupportUser.PreferredLanguage` column and `ActorClaimTypes.PreferredLanguage`
that `004` shipped. **A document was believed over a measurement** — the habit this repository's
testing rules exist to break. `005` had already added a duplicate claim-name constant beside the
provider before noticing; it was deleted.

The consequence was immediate and useful: the seeded Manager prefers Arabic, so registering the
provider turned every authenticated error response Arabic and about a dozen tests red. Those tests
had been asserting English without ever asking for it.

**A negative control found a hole in this feature's own headline test.** AC-16's test describes
itself as "the only assertion that can tell a missing translation from a broken lookup" — and it
stayed green while a deliberately wrong `ResourcesPath` broke every lookup in the API, because it
builds its own container. `002`'s `ResourceKeyLeakTests` is what went red. A second test now
resolves through the application's own services. **The docstring was overclaiming, and only
breaking it on purpose said so.**

## Deviations

| # | Spec says | Built | Reason |
|---|---|---|---|
| D-1 | The feature spans both lanes | server only | Q-J, ruled. `023` already shipped the client half; the switcher and `PUT /api/me/language` are **`005b`**, a named board row. *A feature that crosses the lane boundary makes both lanes wait for each other* |
| D-2 | `IStringLocalizer` over `.resx` "in `src/Wasl.Api/Common/Localization/`" with a `ResourcesPath` | same folder, **no `ResourcesPath` at all** | With one, the factory composes `{RootNamespace}.{ResourcesPath}.{TypeName minus root}` — so a marker in `Wasl.Api.Common.Localization` looks for `Resources/Common/Localization/SharedResource.resx`, a path nobody would guess from either end. Side by side, the manifest name a `.resx` compiles to *is* the marker's full name. Control 2 measured what the alternative costs |
| D-3 | `LocalizationClaims.cs` holding the claim name | deleted; uses `004`'s `ActorClaimTypes.PreferredLanguage` | It was a duplicate of a constant that already existed. Two constants for one wire value is a bug that only bites when one changes |
| D-4 | AC-2's source-level guard on middleware order | not written | `004`'s `MiddlewareOrderTests` covers the `UseAuthentication` half; the new `UseAuthorization` half is covered by control 1's behaviour but not by a source guard. **Recorded as a gap in `tests.md`, not claimed** |
| D-5 | AC-19's third-culture test | not written | The list *is* read from configuration, so the mechanism exists. Nothing proves it, so NFR-9's claim is implemented and unproven — recorded, not claimed |

## Placement cleanup, done in the same change

Requested mid-feature and applied on a green suite so the two changes stayed separable:

| Moved | From | To |
|---|---|---|
| `JwtAccessTokenIssuer.cs` | `Wasl.Api/Common/Auth/` | `Wasl.Infrastructure/Auth/` |
| `JwtOptions.cs` | `Wasl.Api/Common/Auth/` | `Wasl.Infrastructure/Auth/` |
| `DemoSeeder` · `SeedOptions` · `SupportUserSeeder` | `Wasl.Api/Seed/` | `Wasl.Infrastructure/Persistence/Seed/` |
| `JwtRegisteredClaimNames` → **`WaslJwtClaimNames`** | inside the issuer's file | `Wasl.Application/Common/Abstractions/` |

Two departures from the letter of the request, both reported:

- **`Infrastructure/Auth/`, not `Infrastructure/Authentication/`.** That folder already held
  `IdentityPasswordHasher` and `InMemorySignInThrottle` — the same responsibility. A second folder
  beside it would split one concern in two, which is the opposite of the principle the cleanup was
  asked for.
- **`WaslJwtClaimNames` went to `Wasl.Application`, not beside the issuer.** Its own docstring says
  "one list, so the issuer and the reader cannot disagree" — and the reader (`ActorClaimTypes`, the
  bearer setup) is in `Wasl.Api` while the issuer is now in `Wasl.Infrastructure`. Application is
  the only project both see.

The rename matters on its own: the old name shadowed
`System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames`, whose namespace was imported in the same
file. Every reference bound silently to the local type. **A shadowing name is not a compile error;
it is a reader error.**

`IAccessTokenIssuer` stays in `Application/Common/Abstractions`, and `AddInfrastructure` now
registers its implementation — `Wasl.Api` no longer names any token implementation, keeping only
the half that is genuinely an HTTP concern: the bearer handler that *validates*. Verified live:
the API issues a working token from the moved issuer, an authenticated `GET` returns `200`, and
`--seed` runs from its new home.

## Known limitations

- **AC-11 is unmet.** Exception-path responses carry no `Content-Language`. Cause identified,
  owner is `002`, fix not applied by ruling.
- **The Arabic copy has not been read by anyone who reads Arabic.** Sixty-three strings written
  by this agent. A-4 called it a delivery risk and it remains one; `014`'s manual pass is where
  it gets reviewed.
- **AC-2 and AC-19 are gaps**, both recorded above and in `tests.md`.
- **Nothing lets a user change their language.** The column and claim exist; the endpoint and the
  switcher are `005b`.
- **A `429`'s `Retry-After` is untested across locales.** AC-12b was written and the throttle is
  per-process, so exercising it inside the shared-container suite would spend the window other
  tests need. The body's `title` is covered by the catalogue tests; the header carries a number,
  which BR-8.7 puts outside translation anyway.
