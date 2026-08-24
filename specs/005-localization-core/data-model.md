# 005 — Data Model

## There is no schema change in this feature, and no migration

Stated explicitly rather than by omission, because "the localization feature" sounds like
it should own the column that stores a language preference, and it does not.

**Migration name:** none. `dotnet ef migrations list` is unchanged by this feature, and
that is a verifiable claim (`TEST-005-13`).

## Why nothing is persisted here

| Candidate | Where it actually lives | Reason |
|---|---|---|
| `SupportUsers.PreferredLanguage` — `nvarchar(5) NOT NULL DEFAULT 'en'` | `014-language-preference-and-rtl`, migration `AddSupportUserPreferredLanguage` (`docs/sdd/story-artifacts/US-014-language-preference/plan.md`) | The column exists to persist a **choice**, and there is no way to make a choice until `014` ships `PUT /api/me/language` and the switcher. A column that only ever holds its default value is not a feature, it is a migration waiting to be re-reviewed |
| `SupportUsers` table itself | `004-auth-and-roles` — the token needs users to issue tokens for | This feature reads a **claim**, never a row. ADR-007 decision 4 is explicit that the language is in the JWT precisely so resolving it costs no query per request |
| Translated strings in a table | Nowhere. Rejected in ADR-007's alternatives table | A query per request, an admin UI to be worth anything, and strings outside version control where they cannot be reviewed |
| A `Languages` or `SupportedCultures` lookup table | Nowhere | NFR-9 says a third locale is *a resource file and a registered culture*. The supported list is configuration (`Localization:SupportedCultures`), and AC-19 tests exactly that. A table would make it data, add a query, and still need a `.resx` to go with each row |

## The catalogues are the only "data", and they are source files

| Artifact | Path | Format |
|---|---|---|
| Server, English (neutral) | `src/Wasl.Api/Common/Localization/SharedResource.resx` | `.resx`, XML, UTF-8 |
| Server, Arabic | `src/Wasl.Api/Common/Localization/SharedResource.ar.resx` | `.resx`, XML, UTF-8 |
| Client, English | `src/wasl-web/src/locales/en/*.json` | JSON, UTF-8, no BOM |
| Client, Arabic | `src/wasl-web/src/locales/ar/*.json` | JSON, UTF-8, no BOM |

They are reviewed in pull requests, versioned with the code that uses them, and compared
by a build-failing parity test (AC-14, AC-28). That is the whole reason ADR-007 rejected
database-stored translations.

## The one SQL Server fact this feature depends on and does not create

Arabic text reaching the database at all is `001`'s guarantee, not this feature's:
`nvarchar` for every column a human writes into, because `varchar` returns `????` for
Arabic and looks like a font bug (ADR-013, `001/data-model.md`, `001` AC-12).

This feature **relies** on it and adds nothing to it. The relationship is worth one line
because the two failures look identical from the browser — an Arabic string rendering as
question marks is a column type, and an Arabic string rendering as
`Error.DuplicateCustomer.Email` is a resource path (`research.md` R-2). They are diagnosed
in different files, and knowing which one you are looking at saves the afternoon.

## Verification

| Claim | How |
|---|---|
| No migration is added | `TEST-005-13` — `dotnet ef migrations list` output is identical before and after this feature's commits |
| No `DbContext` change | The diff touches no file under `Common/Persistence/` |
| No table is read to resolve a culture | `TEST-005-06` asserts the resolution path issues zero database commands, using an EF Core command interceptor in the test host. This is ADR-007 decision 4's stated benefit, and it is the kind of claim that quietly stops being true |
