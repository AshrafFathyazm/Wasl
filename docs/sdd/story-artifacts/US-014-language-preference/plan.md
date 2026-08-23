# US-014 — Technical Plan

**Phase:** 2 · **Role:** Architecture · **Status:** Complete

## Design Summary

One column, one endpoint, one claim, one switcher — plus the layout work that makes
Arabic readable. The infrastructure already exists from the skeleton; this story wires
a user's choice into it and then goes screen by screen fixing direction.

## Backend

| Layer | Component | Responsibility |
|---|---|---|
| Domain | `SupportUser.PreferredLanguage` | `en` or `ar`; a small value object rejecting anything else |
| Domain | `SupportedLanguages` | The canonical list, in one place, consumed by validation and by startup configuration |
| Application | `SetLanguageCommand` / `Handler` | Validates and persists |
| Application | `Resources/SharedResource.{en,ar}.resx` | Server-authored strings |
| Infrastructure | `SupportUserConfiguration` | The new column |
| API | `MeController.SetLanguage` | `PUT /api/me/language` |
| API | `ClaimsRequestCultureProvider` | Reads the `preferred_language` claim |
| API | `ContentLanguageMiddleware` | Stamps `Content-Language` from `CultureInfo.CurrentUICulture` |
| API | `Program.cs` | `UseRequestLocalization()` registered **after** `UseAuthentication()` |
| API | `AuthTokenService` | Adds `preferred_language` to the JWT |

The middleware ordering is the one thing in this story that fails silently. Placed
before authentication, the claims provider finds no user, returns null, and the system
quietly falls back to `Accept-Language` forever. It is called out here, in
ADR-007, and it gets its own test (TEST-014-05) precisely because nothing else would
catch it.

## Data Changes

Migration: `AddSupportUserPreferredLanguage`

| Column | Type | Constraint |
|---|---|---|
| `PreferredLanguage` | `varchar(5)` | not null, default `'en'` |

No index. It is read by primary key as part of the user row and is never a filter.

The default backfills existing rows, so the migration needs no data step.

## API Contract

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `PUT` | `/api/me/language` | `{ "language": "ar" }` | `204` | `400` unsupported, `401` |

Every existing endpoint gains `Content-Language` on its response. No other contract
changes: `type`, `errors` keys, and enum values are unchanged by design (BR-8.7),
which is what makes this story safe to add after the others.

The token is not reissued on change. The client applies the new language immediately
from its own state, and the claim catches up at the next token issue. Forcing a
reissue would mean a refresh-token flow that ADR-005 explicitly does not build.

## Frontend

| Component | Purpose |
|---|---|
| `i18n.ts` | `react-i18next` init, `fallbackLng: 'en'`, both catalogues |
| `locales/{en,ar}/*.json` | One namespace per feature |
| `LanguageSwitcher` | In the app shell and on the login screen |
| `useLocale()` | Reads the active locale, sets `lang` and `dir` on `<html>`, persists |
| `formatters.ts` | `Intl.DateTimeFormat` and `Intl.NumberFormat`, locale-aware |
| `apiClient` interceptor | Sets `Accept-Language` on every request |

**Persistence:** `localStorage` for the signed-out case, the server for the signed-in
case. On sign-in, the server value wins and overwrites local — the deliberate choice
outranks the device.

**Direction:** set once on `<html>`. Every component uses logical properties
(`margin-inline-start`, `padding-inline`, `text-align: start`, `inset-inline-start`).
A lint rule bans the physical equivalents.

**Formatting:** `ar-u-ca-gregory-nu-latn` for dates and identifiers, per ADR-007.

**Plurals:** i18next suffix keys, all six Arabic categories. Concatenating a number
onto a translated noun is banned and caught by lint.

## Localization Impact

This story is the localization work. See the sections above rather than a summary here.

The one thing worth stating separately: this story adds strings of its own — the
switcher label and the language names. Language names are written in their own
language (`English`, `العربية`) in both catalogues, not translated, so that someone who
cannot read the current interface can still find their language.

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | `PreferredLanguage` value object accepts `en`/`ar` and rejects the rest | Pure logic |
| Unit | Catalogue key parity, both directions, run as a test so CI enforces it | AC-20; the control that makes BR-8.11 real |
| Integration | `PUT /api/me/language`: `204`, `400`, `401` | HTTP contract |
| Integration | Resolution order: query beats claim beats header beats default | AC-13, AC-8; the highest-risk logic |
| Integration | `ar-EG` → `ar`; `fr` → `en` with `200` | AC-11, AC-12 |
| Integration | An Arabic validation error has translated messages and identical `type` and keys | AC-14 — the test that protects the contract |
| Integration | `Content-Language` present and correct on responses | AC-10 |
| Integration | Log output stays English while the response is Arabic | AC-23 |
| Frontend | Switching sets `dir` and `lang`; switching back leaves nothing behind | AC-2, AC-3 |
| Frontend | Arabic plural output at 0, 1, 2, 3, 11, 100 | AC-19 |
| Frontend | Latin digits in a ticket number under `ar` | AC-17 |
| Frontend | `dir="auto"` present on user-content elements | AC-18 |
| Lint | No hard-coded user-facing string; no physical CSS direction properties | AC-22 |
| Manual | Every screen walked in Arabic | AC-2; bidirectional layout defects are visual and no assertion catches them |

The manual pass is listed as a deliverable, not as an afterthought. Right-to-left
defects are almost entirely things a person sees and a test does not.

## Dependencies

Localization infrastructure in the walking skeleton. Every Release 1 story's screens
must exist before the Arabic pass over them is meaningful, so the RTL review runs last.

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Preference as a JWT claim | Query the user row per request | A database read on every request for a value that changes rarely |
| No token reissue on change | Reissue immediately | Needs a refresh-token flow ADR-005 does not build; the client applies the change locally anyway |
| Server preference overrides `localStorage` on sign-in | Device value wins | The stored choice is deliberate and follows the person; the device value is a leftover |
| Key-parity as a test | A pre-commit hook | A hook can be skipped; CI cannot |
| Logical CSS properties | Mirrored stylesheet or auto-flipping | Doubles maintenance and flips things that must not flip |
| Latin digits under `ar` | Arabic-Indic digits | Breaks copy, paste, search, and reading a ticket number aloud (ADR-007) |
| Gregorian under `ar` | Hijri | Support timelines and audit trails are Gregorian; two calendars invite errors |
| Manual RTL pass | Automated visual regression | Correct for a long-lived product; disproportionate for two locales and seven screens, and it would need a baseline that does not exist yet |
| Neutral `ar` | `ar-EG` or `ar-SA` | Culture fallback covers regions at no cost (BR-8.2) |

## Files to Create or Change

```text
src/Wasl.Domain/SupportUsers/PreferredLanguage.cs
src/Wasl.Domain/SupportUsers/SupportedLanguages.cs
src/Wasl.Domain/SupportUsers/SupportUser.cs
src/Wasl.Application/Me/SetLanguage/SetLanguageCommand.cs
src/Wasl.Application/Me/SetLanguage/SetLanguageHandler.cs
src/Wasl.Application/Me/SetLanguage/SetLanguageValidator.cs
src/Wasl.Application/Resources/SharedResource.cs
src/Wasl.Application/Resources/SharedResource.en.resx
src/Wasl.Application/Resources/SharedResource.ar.resx
src/Wasl.Infrastructure/Persistence/Configurations/SupportUserConfiguration.cs
src/Wasl.Infrastructure/Migrations/*_AddSupportUserPreferredLanguage.cs
src/Wasl.Api/Controllers/MeController.cs
src/Wasl.Api/Localization/ClaimsRequestCultureProvider.cs
src/Wasl.Api/Localization/ContentLanguageMiddleware.cs
src/Wasl.Api/Auth/AuthTokenService.cs
src/Wasl.Api/Program.cs
src/wasl-web/src/i18n/i18n.ts
src/wasl-web/src/i18n/useLocale.ts
src/wasl-web/src/i18n/formatters.ts
src/wasl-web/src/locales/en/*.json
src/wasl-web/src/locales/ar/*.json
src/wasl-web/src/components/LanguageSwitcher.tsx
src/wasl-web/src/api/client.ts
src/wasl-web/.eslintrc.cjs
tests/Wasl.Domain.Tests/SupportUsers/PreferredLanguageTests.cs
tests/Wasl.Application.Tests/Resources/ResourceKeyParityTests.cs
tests/Wasl.Api.IntegrationTests/Localization/CultureResolutionTests.cs
tests/Wasl.Api.IntegrationTests/Localization/LocalizedErrorTests.cs
tests/Wasl.Api.IntegrationTests/Me/SetLanguageTests.cs
src/wasl-web/src/i18n/parity.test.ts
src/wasl-web/src/i18n/plurals.test.ts
```
