# 005 — Plan

**Phase:** 0 · **Role:** Architecture · **Agent:** `feature-dev:code-architect` ·
**Skill:** `speckit-plan`

## Backend design

Every file this feature creates or changes is named. A plan that does not name its files
is a description.

```text
src/Wasl.Api/
  Program.cs                                        MODIFIED — the pipeline order (R-5)
  appsettings.json                                  MODIFIED — Localization section
  AssemblyInfo.cs                                   CREATED  — NeutralResourcesLanguage("en")
  Common/
    Localization/
      SharedResource.cs                             marker type. No members, ever
      SharedResource.resx                           NEUTRAL = English catalogue (R-3)
      SharedResource.ar.resx                        Arabic catalogue
      LocalizationClaims.cs                         const PreferredLanguage = "preferred_language"
      SupportedLocales.cs                           reads Localization:* from configuration
      PreferredLanguageCultureProvider.cs           : RequestCultureProvider
      LocalizationRegistration.cs                   AddWaslLocalization / UseWaslLocalization
    Errors/
      <002's ProblemDetails mapper>                 MODIFIED — titles via IStringLocalizer
```

`002-error-contract` is not specified yet, so its mapper is named by role rather than by
file. Recorded here as a **cross-feature change** so it is a known edit rather than a
surprise during implementation — see **Contract changes**.

### Where each decision is enforced

| Decision | Enforced by | Not by |
|---|---|---|
| Localization sits between authentication and authorization (ADR-007 decision 4, R-5) | AC-1's behavioural test **and** AC-2's source guard over `Program.cs` | A comment in `Program.cs` |
| The provider list is BR-8.4's, and only BR-8.4's | `Clear()` then three `Add`s, asserted by type name (AC-3) | `Insert(1, …)`, which leaves the cookie provider in place (R-6) |
| `Content-Language` on every response | `ApplyCurrentCultureToResponseHeaders = true`, asserted on seven status codes (AC-11) | The option being set, which is a different claim from the header being present |
| Resource lookup resolves | `ResourcesPath` left **unset**, resources beside the marker type, `ResourceNotFound == false` asserted (AC-16) | The file being in the right folder, which is what the trap looks like (R-2) |
| A missing Arabic key renders English | The English catalogue **is** the neutral catalogue, plus `[assembly: NeutralResourcesLanguage("en")]` (AC-15) | An `.en.resx` that `ar` never falls back to (R-3) |
| A third locale needs no code | `SupportedLocales` reads configuration; AC-19 adds `fr` in a test host | A hard-coded array with a comment saying to add to it |
| Arabic still formats as Arabic | AC-17 asserts `GetCultureInfo("ar").Name == "ar"` | Nobody having set `InvariantGlobalization` yet (R-8) |
| Logs stay English | AC-18, with a capturing logger provider | The mapper's author remembering (R-14) |

### `Program.cs` order — the whole feature in five lines

```csharp
builder.Services.AddLocalization();          // no ResourcesPath. See research.md R-2
builder.Services.AddWaslLocalization(builder.Configuration);
// ── app ──
app.UseAuthentication();        // populates HttpContext.User
app.UseWaslLocalization();      // ← the claim provider needs the line above
app.UseAuthorization();         // ← 401 and 403 are emitted HERE, so they get a locale
```

The middle line is the feature. ADR-007 calls its misplacement the single most likely
defect in this piece of work, and `research.md` R-5 narrows the constraint: "after
authentication" is not enough, because placing it after `UseAuthorization()` also
satisfies that wording and silently un-localizes every `401` and `403`.

`001/plan.md` already reserved this ordering note for whoever added the second
middleware. This is that feature.

### `PreferredLanguageCultureProvider`

Derives from `RequestCultureProvider` (verified present in
`Microsoft.AspNetCore.Localization`). Roughly:

- If `HttpContext.User?.Identity?.IsAuthenticated` is not `true`, return `null` — fall
  through. An unauthenticated request is normal, not an error
- Read the first claim named `LocalizationClaims.PreferredLanguage`; blank or whitespace
  is treated as absent
- Return `new ProviderCultureResult(value)`. **Do not validate the value here** — the
  middleware's `SupportedCultures` filter and parent-culture fallback already handle
  `ar-EG`, `AR`, and `de` correctly, and a second validator would be a second place for
  BR-8.2 to be implemented differently (constitution III)
- `Task.FromResult`, no async work, no I/O, no database. `TEST-005-06` asserts zero
  database commands on the resolution path

### Configuration

```json
"Localization": {
  "DefaultCulture": "en",
  "SupportedCultures": [ "en", "ar" ]
}
```

In `appsettings.json`, not in code, because NFR-9 claims a third locale is a resource file
and a registered culture — and AC-19 is what turns that claim into a test.

`FallBackToParentCultures` and `FallBackToParentUICultures` are left at their framework
default of `true` (verified, `research.md` R-7). They are the mechanism behind BR-8.2, so
AC-8 exists to fail if someone turns them off while tightening something else.

## Frontend design

**Scope note, and it needs a human:** `001/spec.md` assigned "the React application,
tokens, primitives" to `006`. This plan takes the **scaffold** here and leaves tokens and
primitives in `006` (`spec.md` Q-B, `research.md` R-10). `006` has a one-day hard stop
(ADR-009) and should spend it on design, not on `npm create vite` — and every primitive it
writes should be written in an app where a hard-coded string already fails the build.

```text
src/wasl-web/
  package.json                                CREATED — react, react-dom, i18next,
                                                react-i18next, vite, vitest, eslint,
                                                stylelint, @testing-library/react
  vite.config.ts                              CREATED
  tsconfig.json                               CREATED — strict, strictNullChecks, no any
  eslint.config.js                            CREATED — the four bans (AC-22..AC-25)
  .stylelintrc.json                           CREATED — physical-property ban (AC-24)
  index.html                                  CREATED — lang/dir are set at runtime
  src/
    main.tsx                                  CREATED — imports lib/i18n BEFORE render
    App.tsx                                   CREATED — a shell, deliberately empty of copy
    lib/
      i18n/
        index.ts                              i18next init: resources, fallbackLng,
                                                returnEmptyString:false, NO compatibilityJSON
        LocaleProvider.tsx                    sets <html lang> and <html dir> (AC-20)
        useLocale.ts                          { locale, dir, setLocale } — 014 calls setLocale
        formatters.ts                         the ONLY place an Intl formatter is built
        cldr.ts                               the six category names, one array, one source
      api/
        client.ts                             Accept-Language out, Content-Language in (AC-31)
    locales/
      en/common.json                          app-shell copy
      ar/common.json                          the same keys, Arabic
    components/
      UserText.tsx                            dir="auto" (AC-30, spec.md Q-C)
```

Catalogue path follows `documentation/development/localization.md`
(`src/wasl-web/src/locales/{en,ar}/*.json`) rather than inventing one.

### Component kinds, per ADR-011 §4

| File | Kind | Fetches? |
|---|---|---|
| `App.tsx` | Route / page shell | No — there is no route yet |
| `UserText.tsx` | **Primitive** — domain-agnostic, no knowledge of what it renders | No |
| `LocaleProvider.tsx` | **None of the three.** An app-shell provider, in `lib/`, not `components/` | No |

`LocaleProvider` is recorded as not fitting the taxonomy rather than being forced into it.
ADR-011 §4's three kinds describe *rendering* components; a provider that writes two
attributes on `<html>` is infrastructure, and pretending otherwise would make the
taxonomy meaningless the first time it was applied.

### `formatters.ts` — one file, and lint keeps it that way

```ts
// The only place in the application where an Intl formatter is constructed.
// ar-u-ca-gregory-nu-latn: Gregorian calendar, LATIN digits. ADR-007 §7, BR-8.13.
const INTL_LOCALE = { en: 'en', ar: 'ar-u-ca-gregory-nu-latn' } as const;
```

AC-25's lint rule bans `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString`, and
`Intl.*` everywhere else, with an override for this one file. Without the ban, the first
person in a hurry writes `date.toLocaleDateString('ar')` and gets Arabic-Indic digits and,
depending on the runtime, a non-Gregorian calendar — and it looks correct to anyone who
does not read Arabic.

**Identifiers never go through a formatter.** `TicketNumber` is a string and renders as
one (AC-27). The failure this prevents is someone "formatting" it for consistency.

### The catalogue this feature ships

`locales/{en,ar}/common.json`, app-shell copy only: application name, generic
loading/error/empty state text, retry and cancel. Roughly a dozen keys.

**No plural key is shipped.** Every plural this product needs belongs to a screen that
does not exist yet, and a catalogue entry with no caller is speculative. AC-21 proves the
six-category *configuration* using a resource bundle defined inside the test — which tests
the mechanism without shipping copy nobody renders.

## Data changes

**None.** See [`data-model.md`](data-model.md): no table, no column, no migration.
`SupportUsers.PreferredLanguage` is `014`'s, and the reason is written down there.

## Contract changes

[`contracts/localization-contract.md`](contracts/localization-contract.md) is new and
frozen. It is a **shape** contract: it adds no route, and every feature after this one
inherits it.

Two changes it imposes on contracts that already exist:

| Contract | Change | Breaking? |
|---|---|---|
| `002`'s `ProblemDetails` shape | `title` and `detail` become locale-dependent; `type`, `errors` keys, and `traceId` do not. The **shape** is unchanged | No. A client branching on `type` is unaffected — which is the entire argument in constitution IV |
| Every response in `docs/sdd/openapi/` | `Content-Language` is now a documented response header on every operation | No. Additive |

`007/contracts/customers-api.md` already anticipated this: its verification table says
*"Arabic `type` and `errors` keys byte-identical to English — covered by
`005-localization-core`, re-asserted here."* AC-13 is that coverage.

**One cross-feature edit to declare rather than discover:** `002`'s `ProblemDetails`
mapper gains an `IStringLocalizer<SharedResource>` and its hard-coded English titles
become the seven keys in the contract. If `002` has already shipped when this starts, that
is a modification to its files, and it belongs in `002`'s summary as well as here.

## Test strategy

| Level | What | Why there |
|---|---|---|
| Integration, **no container** (`Wasl.Api.IntegrationTests`, classes with no database fixture) | Resource key parity (AC-14), `ResourceNotFound` (AC-16), globalization mode (AC-17), the `Program.cs` source guard (AC-2), provider-list composition (AC-3) | These are the build-failing controls. Docker is not running on this machine (`001/research.md` R-8), and a control that cannot run where the build runs is not a control (`spec.md` Q-E) |
| Integration, **WebApplicationFactory** | All resolution-order cases, `Content-Language` on seven codes, `401`/`403` localization, the `en`-vs-`ar` byte diff, English logs, zero database commands, the third-culture-by-configuration case | Every one is a property of the composed pipeline. A unit test of the provider would pass with the middleware in the wrong place, which is the defect being hunted |
| Frontend (Vitest) | Plural categories, formatters, catalogue parity, `LocaleProvider` attributes, missing-key fallback, `UserText` | Pure functions and one DOM assertion each |
| Lint fixtures | Four deliberately bad files, ESLint and Stylelint expected to exit non-zero with a named rule id | A lint rule nobody has watched fail may be misconfigured, and a misconfigured rule is worse than none because it is believed (`research.md` R-13) |
| **Deliberately not tested** | That ASP.NET Core parses `Accept-Language` quality values; that `ResourceManager` reads XML; that `Intl.PluralRules` implements CLDR | Testing the framework. What *is* tested is our configuration of it, which is where the defects are |
| **Deliberately not tested** | That the Arabic copy is good Arabic | No automated test can. `spec.md` A-4 records it as a delivery risk, and `014`'s Arabic walk is where a human reads it |
| **Deliberately not tested** | RTL visual correctness | There is no screen. It is `014`'s deliverable, and `specs/README.md` calls it a deliverable rather than a check because no assertion catches a container sized to English text |

Test-only probe endpoints (`GET /test/problem/{status}`) are registered by the integration
test host and **never by `Program.cs`**, so `005` still ships no route. AC-11 needs a
`409` and a `500` to exist, and no real endpoint returns either yet.

## Dependencies

| On | For | Hard? |
|---|---|---|
| `001-solution-skeleton` | The solution, the API project, the test projects, CI | Yes |
| `002-error-contract` | The `ProblemDetails` mapper whose titles become localized | Yes for AC-13 and AC-12. Everything else can be built and tested without it |
| `004-auth-and-roles` | `UseAuthentication()` in the pipeline, and the token that carries the claim | **Soft.** AC-1 and AC-5 mint their own token in the test, so the ordering is proven here rather than in `014` (`spec.md` A-1, Q-A) |
| `006-design-system` | Nothing. `006` depends on **this** — its primitives are written in an app where a literal string fails the build | — |

**Who depends on this:** every feature from `006` onward. `014` is the story that makes it
visible.

## Risks and trade-offs

### Considered and rejected: build the frontend half in `014`, with the switcher

The tidy version: `005` does the server, `014` does the whole client side at once, next to
the control that changes the language. One feature, one Arabic walk.

Rejected because it is the retrofit ADR-007 decision 1 exists to prevent. `006` through
`013` would build every screen in this product before `t()`, `dir`, and the lint rules
existed, and `014` would then convert seven screens' worth of literal strings, physical
CSS properties, and concatenated counts — a day of mechanical work in which omissions
hide, in the last phase before delivery, with no slack behind it.

The cost of the choice made instead is honest and worth stating: this feature ships
frontend infrastructure with **no screen to demonstrate it on**, so its evidence is tests
and lint output rather than something a reviewer can look at.

### Considered and rejected: a custom `ContentLanguageMiddleware`

Writing the header ourselves is about eight lines with `Response.OnStarting`, and it makes
the behaviour explicit in a file with a name that says what it does.

Rejected because `RequestLocalizationOptions.ApplyCurrentCultureToResponseHeaders` was
**verified to exist in .NET 10** and does exactly this (`research.md` R-4). Hand-rolling it
would mean owning the ordering question — before or after the localization middleware? —
that the framework already answers, for no gain. Kept as the documented fallback if AC-12
ever shows the built-in option missing the `401` path.

### Considered and rejected: validate the claim value inside the provider

Reject anything that is not exactly `en` or `ar`, in the provider, close to where it is
read.

Rejected because the middleware's `SupportedCultures` filter and parent-culture fallback
already produce the right answer for `ar-EG`, `AR`, `de`, and `""` — and a second
implementation is a second place for BR-8.2 to drift. It is the same argument the
constitution makes about business rules living once. The edge cases in `spec.md` are the
evidence that the framework's behaviour was checked rather than assumed.

### Considered and rejected: one `.resx` pair per vertical slice

It would make ADR-007's "resources next to the code that raises the messages" literal.

Rejected in `research.md` R-1: the duplicate-customer message is raised by a validator, a
handler, **and** `002`'s mapper, so it has no single owning slice — and a parity test over
a shifting set of file pairs is a test that eventually gets disabled. One pair in
`Common/Localization/` next to the middleware that resolves the culture.

### Accepted risk: the source-level `Program.cs` guard is crude

AC-2 reads a `.cs` file as text and compares line indices. It will annoy someone who
reformats `Program.cs`, and it proves nothing about the runtime.

Accepted, and written down as crude, because the alternative was reflection over
`ApplicationBuilder` internals — which breaks on a framework patch and teaches people to
delete tests (`research.md` R-11). AC-1 is the real control; AC-2 is the tripwire that
names ADR-007 decision 4 in its failure message so the next person does not have to
rediscover why the order matters.

### Accepted risk: `jsx-no-literals` is the lint rule most likely to be turned off

It fires on punctuation, on `&nbsp;`, and on any string a developer considers "not copy".
An over-strict rule with a noisy signal gets disabled in a hurry, and then AC-22 is a
comment in a config file.

Contained by shipping the allow-list with it, and by `TEST-005-11` asserting the rule
fires on the fixture — so if it is ever weakened to the point of not firing, a test goes
red rather than nothing happening.

### Accepted risk: the language claim has no producer yet

`004` may not emit it (`spec.md` Q-A). The provider is built, tested with a
test-minted token, and then depends on `004` or `014` to supply the real thing. If neither
does, every request falls through to `Accept-Language` and **nothing fails** — which is
the exact silent failure this feature is about.

`DOC-005-04` therefore raises the claim as a written requirement against `004`'s spec
rather than assuming it. That is the difference between a dependency and a hope.
