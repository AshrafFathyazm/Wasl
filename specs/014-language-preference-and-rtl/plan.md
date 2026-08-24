# US-014 — Technical Plan

**Phase:** 4 · **Story:** US-014 · **Feature:** `014-language-preference-and-rtl` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Design Summary

One column, one endpoint, one claim, one switcher — plus the layout work that makes
Arabic readable. The infrastructure already exists from `005-localization-core`; this
story wires a user's choice into it and then goes screen by screen fixing direction.

## What `005` already built, and what this feature adds

Stating the boundary matters, because half of this feature's acceptance criteria are
re-assertions rather than new construction, and a task list that does not distinguish
them will build the same thing twice.

| Component | Owner | This feature's obligation |
|---|---|---|
| Registered cultures `en` / `ar`, `RequestLocalizationOptions` | `005` | Consume |
| `.resx` catalogues and `IStringLocalizer` wiring | `005` | Add this story's keys; fill Arabic for every Release 1 message |
| `ProblemDetails` localization (BR-8.6 / BR-8.7) | `005` | Re-assert in Arabic (AC-14, AC-15) |
| `ContentLanguageMiddleware` | `005` | Re-assert across several endpoints (AC-10) |
| Key-parity test harness | `005` | Every key added here passes it (AC-20) |
| `ClaimsRequestCultureProvider`, and its position after `UseAuthentication()` | `005` | **Supply the claim value, and test the ordering — see below** |
| `PreferredLanguage` column, the endpoint, the switcher, the RTL pass | **This feature** | Build |

The ordering trap deserves the emphasis it gets in ADR-007 decision 4, but the honest
version is sharper than "call it out and test it": **`005` could not have tested it.**
With no stored preference anywhere in the system, a provider registered before
`UseAuthentication()` finds no user, returns null, falls through to `Accept-Language` —
and a provider registered after does exactly the same thing, because there is nothing
to find. The two configurations are indistinguishable until a preference exists. It
becomes observable for the first time here, which is why `TEST-014-05` lives in this
feature.

## Backend

Two projects, vertical slices, minimal APIs (ADR-010). There is no `Wasl.Application`
and no `Wasl.Infrastructure`.

| Project | Component | Responsibility |
|---|---|---|
| `Wasl.Domain` | `SupportUser.PreferredLanguage` | `en` or `ar`; a small value object rejecting anything else |
| `Wasl.Domain` | `SupportedLanguages` | The canonical list, in one place, consumed by validation and by startup configuration |
| `Wasl.Api` | `Features/Me/SetLanguage/Endpoint.cs` | `PUT /api/me/language`, one minimal-API endpoint for the slice |
| `Wasl.Api` | `Features/Me/SetLanguage/SetLanguageCommand.cs` | The command, implementing `IAuditableCommand` |
| `Wasl.Api` | `Features/Me/SetLanguage/SetLanguageHandler.cs` | Persists; nothing else |
| `Wasl.Api` | `Features/Me/SetLanguage/SetLanguageValidator.cs` | FluentValidation at the boundary |
| `Wasl.Api` | `Common/Localization/ClaimsRequestCultureProvider.cs` | From `005`. Reads the `preferred_language` claim |
| `Wasl.Api` | `Common/Localization/ContentLanguageMiddleware.cs` | From `005`. Stamps `Content-Language` from `CultureInfo.CurrentUICulture` |
| `Wasl.Api` | `Common/Localization/Resources/SharedResource.{en,ar}.resx` | Server-authored strings |
| `Wasl.Api` | `Common/Persistence/Configurations/SupportUserConfiguration.cs` | The column mapping |
| `Wasl.Api` | `Common/Auth/TokenIssuer.cs` | Adds `preferred_language` to the JWT |
| `Wasl.Api` | `Program.cs` | `UseRequestLocalization()` registered **after** `UseAuthentication()` |

No repository. `DbSet<SupportUser>` is one already, and the handler loads a single row
by the id in the token — there is no query here non-trivial enough to earn a named query
object.

The middleware ordering is the one thing in this story that fails silently. Placed
before authentication, the claims provider finds no user, returns null, and the system
quietly falls back to `Accept-Language` forever. It is called out here, in ADR-007, and
it gets its own test (`TEST-014-05`) precisely because nothing else would catch it.

### Audit

`SetLanguageCommand` implements `IAuditableCommand` with action `User.LanguageChanged` —
the name is already in BR-9's naming table, so nothing is invented. The audit-writing
pipeline behaviour from `003-audit-trail` writes the row inside the same transaction as
the update (BR-9.3), which is what makes the row absent when the transaction rolls back.

Three details specific to this command:

- `Changes` carries `PreferredLanguage: en → ar` and nothing else. There is nothing
  sensitive to redact here (BR-9.7), which is worth stating rather than assuming.
- A request that sets the language to the value already stored changes no field, so
  **no row is written** (BR-9.8). Otherwise the log fills with rows recording that
  nothing happened, which is exactly the noise that makes an audit log unusable.
- The `401` path writes its own row, `Auth.Unauthenticated`, **outside any
  transaction** (BR-9.2, BR-9.4) — there is no business transaction to join. That
  asymmetry is deliberate and it is tested from both sides.

## Data Changes

Full detail in [`data-model.md`](data-model.md). In summary:

**Migration:** `AddSupportUserPreferredLanguage`

| Column | Type | Constraint |
|---|---|---|
| `PreferredLanguage` | `nvarchar(5)` | not null, default `'en'` (`DF_SupportUsers_Lang`) |

No index. It is read by primary key as part of the user row and is never a filter —
consistent with `03-domain-model.md`'s index inventory, which names this column
explicitly as the one that has none.

The default backfills existing rows, so the migration needs no data step.

`nvarchar(5)`, not `varchar(5)`, per ADR-013 row 4. A BCP-47 tag is ASCII, so `varchar`
would not corrupt it — this is the one column in the schema where the rule is about
uniformity rather than about Arabic. Keeping it `nvarchar` means every string parameter
EF Core sends matches the column type, and it means no future reader has to work out
why one column is the exception.

**`dbo.SupportUsers` already exists** — `004-auth-and-roles` created it, because sign-in
cannot work without it. Whether it also shipped this column is checked against
`sys.columns` before the migration is written, not assumed: see `data-model.md`.

## API Contract

Frozen in [`contracts/me-language-api.md`](contracts/me-language-api.md).

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `PUT` | `/api/me/language` | `{ "language": "ar" }` | `204` | `400` unsupported, `401` |

Every existing endpoint gains `Content-Language` on its response. No other contract
changes: `type`, `errors` keys, and enum values are unchanged by design (BR-8.7), which
is what makes this story safe to add after the others.

No `expectedVersion`. `SupportUsers` carries a `rowversion` and
`05-api-conventions.md` requires the token on endpoints that mutate a ticket or a
customer — this mutates neither, and the only writer of a person's own language
preference is that person. A `409` here would be a concurrency conflict between a user
and themselves. Stated because a reader who knows the convention will otherwise assume
it was forgotten.

The token is not reissued on change. The client applies the new language immediately
from its own state, and the claim catches up at the next token issue. Forcing a reissue
would mean a refresh-token flow that ADR-005 explicitly does not build.

**What the original plan did not follow through on:** because the claim outranks
`Accept-Language` (BR-8.5), a stale claim means every *server-authored* sentence keeps
arriving in the old language for the rest of the session, while the client's own labels
switch instantly. The client therefore sends `?culture=<locale>` — the top of BR-8.4's
order — until the next token issue. See `spec.md` Q-7 and AC-24.

## Frontend

React 18 + TS, TanStack Query, React Hook Form + Zod, `react-i18next`. No global store;
the active locale lives in i18next (ADR-011 decision 1). Screen detail is in
[`frontend-spec.md`](frontend-spec.md); the element-level spec is
`docs/sdd/design/screens/09-settings-localization.md`.

| Component | Purpose |
|---|---|
| `i18n.ts` | `react-i18next` init, `fallbackLng: 'en'`, both catalogues |
| `locales/{en,ar}/*.json` | One namespace per feature |
| `LanguageSwitcher` | On the login screen, and inside the Settings → Localization screen |
| `useLocale()` | Reads the active locale, sets `lang` and `dir` on `<html>`, persists |
| `formatters.ts` | `Intl.DateTimeFormat` and `Intl.NumberFormat`, locale-aware |
| `apiClient` interceptor | Sets `Accept-Language` on every request, and `?culture=` after an in-session switch |

**Persistence:** `localStorage` for the signed-out case, the server for the signed-in
case. On sign-in, the server value wins and overwrites local — the deliberate choice
outranks the device.

**Direction:** set once on `<html>`. Every component uses logical properties
(`margin-inline-start`, `padding-inline`, `text-align: start`, `inset-inline-start`).
A lint rule bans the physical equivalents.

**Formatting:** `ar-u-ca-gregory-nu-latn` for dates and identifiers, per ADR-007.
`Intl.NumberFormat('ar')` on its own returns Arabic-Indic digits, so the explicit
numbering-system subtag is doing real work and is not decoration.

**Plurals:** i18next suffix keys, all six Arabic categories. Concatenating a number
onto a translated noun is banned and caught by lint.

**Arabic type:** `--font-ar`, `--leading-ar-*`, and no cap-height vertical trim on
Arabic. This is blueprint Q-13, and it is the reason it is in the plan rather than left
to the stylesheet: 100% line height with cap-height trim clips Arabic glyphs, and it
presents as a font rendering fault rather than as a missing token, so a reviewer who
does not read Arabic will not report it. Letter-spacing stays `0` for Arabic
permanently — positive tracking breaks the cursive joins.

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
| Integration | One audit row per real change; none when the value is unchanged; none after a forced rollback | BR-9.1, BR-9.3, BR-9.8 |
| Integration | The `401` writes a row, and it survives a rollback because it is outside the transaction | BR-9.2, BR-9.4 |
| Integration | A server-authored message arrives in the new language on the request immediately after a switch, with no re-login | AC-24 |
| Frontend | Switching sets `dir` and `lang`; switching back leaves nothing behind | AC-2, AC-3 |
| Frontend | Arabic plural output at 0, 1, 2, 3, 11, 100 | AC-19 |
| Frontend | Latin digits in a ticket number under `ar` | AC-17 |
| Frontend | `dir="auto"` present on user-content elements | AC-18 |
| Lint | No hard-coded user-facing string; no physical CSS direction properties | AC-22 |
| Manual | Every screen walked in Arabic | AC-2; bidirectional layout defects are visual and no assertion catches them |

Integration tests run against a real SQL Server through `Testcontainers.MsSql`. EF
`InMemory` is not a substitute in this feature specifically: the column's `DEFAULT 'en'`
and the rollback half of the audit test both need an engine that enforces things.

The manual pass is listed as a deliverable, not as an afterthought. Right-to-left
defects are almost entirely things a person sees and a test does not: a container sized
to English label text, a directional icon that did not flip, a number on the wrong side
of an Arabic sentence. None of those fail an assertion, and automated visual regression
would need a baseline that does not exist. Calling the pass "covered by tests" would be
false; leaving it unmentioned would mean it does not happen.

## Dependencies

| Depends on | For |
|---|---|
| `003-audit-trail` | `IAuditableCommand` and the pipeline behaviour that writes the row in-transaction |
| `004-auth-and-roles` | `dbo.SupportUsers`, the token issuer, the `401` path |
| `005-localization-core` | Cultures, catalogues, `ProblemDetails` localization, `Content-Language`, the parity harness |
| `006-design-system` | `--font-ar`, `--leading-ar-*`, the primitives the switcher is built from |
| Every Release 1 screen (`007`–`013`) | The Arabic pass has nothing to walk without them, which is why the RTL review runs last |

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Preference as a JWT claim | Query the user row per request | A database read on every request for a value that changes rarely |
| No token reissue on change | Reissue immediately | Needs a refresh-token flow ADR-005 does not build; the client applies the change locally anyway |
| `?culture=` for the rest of the session after a switch | Accept that server messages lag until re-login | The lag is invisible in review and visible to the user — Arabic labels around an English error sentence. See Q-7 |
| `?culture=` for the rest of the session | Reissue the token from this endpoint | Cleaner, and it changes AC-5's `204` into a `200` carrying a token. That is a contract change other features cite, so it is a question, not a silent edit |
| Server preference overrides `localStorage` on sign-in | Device value wins | The stored choice is deliberate and follows the person; the device value is a leftover |
| Key-parity as a test | A pre-commit hook | A hook can be skipped; CI cannot |
| Logical CSS properties | Mirrored stylesheet or auto-flipping | Doubles maintenance and flips things that must not flip |
| Latin digits under `ar` | Arabic-Indic digits | Breaks copy, paste, search, and reading a ticket number aloud (ADR-007) |
| Gregorian under `ar` | Hijri | Support timelines and audit trails are Gregorian; two calendars invite errors |
| Manual RTL pass | Automated visual regression | Correct for a long-lived product; disproportionate for two locales and seven screens, and it would need a baseline that does not exist yet |
| Neutral `ar` | `ar-EG` or `ar-SA` | Culture fallback covers regions at no cost (BR-8.2) |
| `nvarchar(5)` for the column | `varchar(5)`, since a BCP-47 tag is ASCII | Uniformity with ADR-013 row 4 and with the parameter types EF sends. One exceptional column is a question every future reader has to answer |
| No `expectedVersion` on the endpoint | Accept the `rowversion` like the other mutations | The only writer of a person's language is that person; a `409` would be a conflict with oneself |
| No audit row when nothing changed | Always write a row | BR-9.8. Rows recording that nothing happened are what make an audit log unreadable |

## Files to Create or Change

```text
src/Wasl.Domain/SupportUsers/PreferredLanguage.cs
src/Wasl.Domain/SupportUsers/SupportedLanguages.cs
src/Wasl.Domain/SupportUsers/SupportUser.cs
src/Wasl.Api/Features/Me/SetLanguage/Endpoint.cs
src/Wasl.Api/Features/Me/SetLanguage/SetLanguageCommand.cs
src/Wasl.Api/Features/Me/SetLanguage/SetLanguageHandler.cs
src/Wasl.Api/Features/Me/SetLanguage/SetLanguageValidator.cs
src/Wasl.Api/Common/Localization/ClaimsRequestCultureProvider.cs
src/Wasl.Api/Common/Localization/ContentLanguageMiddleware.cs
src/Wasl.Api/Common/Localization/Resources/SharedResource.cs
src/Wasl.Api/Common/Localization/Resources/SharedResource.en.resx
src/Wasl.Api/Common/Localization/Resources/SharedResource.ar.resx
src/Wasl.Api/Common/Persistence/Configurations/SupportUserConfiguration.cs
src/Wasl.Api/Common/Persistence/Migrations/*_AddSupportUserPreferredLanguage.cs
src/Wasl.Api/Common/Auth/TokenIssuer.cs
src/Wasl.Api/Program.cs
src/wasl-web/src/lib/i18n/i18n.ts
src/wasl-web/src/lib/i18n/useLocale.ts
src/wasl-web/src/lib/i18n/formatters.ts
src/wasl-web/src/lib/api/client.ts
src/wasl-web/src/locales/en/*.json
src/wasl-web/src/locales/ar/*.json
src/wasl-web/src/components/LanguageSwitcher.tsx
src/wasl-web/src/features/settings/LocalizationSettingsPage.tsx
src/wasl-web/src/features/settings/api.ts
src/wasl-web/src/features/settings/schema.ts
src/wasl-web/design/tokens.css
src/wasl-web/.eslintrc.cjs
tests/Wasl.Domain.Tests/SupportUsers/PreferredLanguageTests.cs
tests/Wasl.Api.IntegrationTests/Localization/ResourceKeyParityTests.cs
tests/Wasl.Api.IntegrationTests/Localization/CultureResolutionTests.cs
tests/Wasl.Api.IntegrationTests/Localization/LocalizedErrorTests.cs
tests/Wasl.Api.IntegrationTests/Me/SetLanguageTests.cs
tests/Wasl.Api.IntegrationTests/Me/SetLanguageAuditTests.cs
src/wasl-web/src/lib/i18n/parity.test.ts
src/wasl-web/src/lib/i18n/plurals.test.ts
src/wasl-web/src/features/settings/LocalizationSettingsPage.test.tsx
```

There are exactly two source projects and two test projects (ADR-010). The original
plan named `src/Wasl.Application/...`, `src/Wasl.Infrastructure/...`, a
`MeController`, and a `tests/Wasl.Application.Tests` project; none of those exist. The
backend key-parity test moves to `Wasl.Api.IntegrationTests`, which is where the `.resx`
files it reads are now embedded.

## Contract changes

First contract for this resource: [`contracts/me-language-api.md`](contracts/me-language-api.md),
frozen 2026-08-23.

Nothing existed before it, so nothing is broken. The heading stays even when empty — an
empty contract-changes section is the statement that the contract did not move.

One change is **pending an answer to Q-7** and is recorded here rather than made: if the
product owner prefers a reissued token over `?culture=`, `PUT /api/me/language` becomes
`200` with a token body, AC-5 changes, and this section is where that is written down
before either lane sees it.

The frontend lane reads [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) and may start
as soon as that file exists; it does not wait for `BE-014-04`.
