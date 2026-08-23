# US-014 — Task Breakdown

**Phase:** 3 · **Role:** Story Planner · **Status:** Complete

## Critical Path

`BE-014-01 → BE-014-03 → BE-014-04 → FE-014-02 → FE-014-03 → FE-014-06`

`FE-014-06`, the Arabic pass over every screen, is on the critical path and is the
task most likely to be underestimated. It cannot start until the other Release 1
screens exist.

## Backend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| BE-014-01 | `PreferredLanguage` value object and `SupportedLanguages`; column, migration, default | Skeleton | Unit tests; `dotnet ef database update` | AC-5, AC-6 |
| BE-014-02 | `preferred_language` added to the issued JWT | BE-014-01 | Decode a token in an integration test | AC-8 |
| BE-014-03 | `ClaimsRequestCultureProvider` registered **after** `UseAuthentication()` | BE-014-02 | Integration test: claim beats header | AC-8 |
| BE-014-04 | `PUT /api/me/language` returns `204`, `400`, `401` | BE-014-01 | Integration tests | AC-5 – AC-7 |
| BE-014-05 | Full resolution order: query → claim → header → default | BE-014-03 | Integration test per level | AC-13 |
| BE-014-06 | `ar-EG` resolves to `ar`; `fr` falls back to `en` with `200` | BE-014-05 | Integration tests | AC-11, AC-12 |
| BE-014-07 | `ContentLanguageMiddleware` stamps every response | BE-014-05 | Integration test on several endpoints | AC-10 |
| BE-014-08 | Arabic `.resx` populated for every server-authored message added by Release 1 | BE-014-04 | Read against the `en` catalogue | AC-14 |
| BE-014-09 | Validation and `ProblemDetails` resolve through `IStringLocalizer` | BE-014-08 | Integration test comparing `en` and `ar` responses | AC-14, AC-15 |
| BE-014-10 | Logging remains English under an Arabic request | BE-014-09 | Integration test asserting log output | AC-23 |

## Frontend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| FE-014-01 | `i18n.ts` initialised with both catalogues and `fallbackLng: 'en'` | Skeleton | `npm run dev` renders from the catalogue | AC-21 |
| FE-014-02 | `useLocale` sets `lang` and `dir` on `<html>` and persists to `localStorage` | FE-014-01 | Manual; component test | AC-2 – AC-4 |
| FE-014-03 | `LanguageSwitcher` in the app shell and on the login screen | FE-014-02 | Manual, signed in and signed out | AC-1 |
| FE-014-04 | On sign-in the server preference overwrites the local value; on change the client calls `PUT /api/me/language` | FE-014-03, BE-014-04 | Manual across two browsers | AC-4 |
| FE-014-05 | `Accept-Language` interceptor on the API client | FE-014-02 | Inspect a request in dev tools; integration check | AC-9 |
| FE-014-06 | Every screen converted to logical CSS properties and reviewed in Arabic | All Release 1 screens | Manual pass, screen by screen | AC-2, AC-3 |
| FE-014-07 | `formatters.ts` with `ar-u-ca-gregory-nu-latn`; ticket numbers in Latin digits | FE-014-01 | Component tests | AC-16, AC-17 |
| FE-014-08 | `dir="auto"` on every element rendering user content | FE-014-06 | Component test; manual with mixed-language content | AC-18 |
| FE-014-09 | Plural keys with all six Arabic categories wherever a count is shown | FE-014-01 | Test at 0, 1, 2, 3, 11, 100 | AC-19 |

## Tests

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| TEST-014-01 | Unit: value object accepts `en` and `ar`, rejects the rest | BE-014-01 | Test run | AC-6 |
| TEST-014-02 | Backend catalogue key parity, both directions | BE-014-08 | Test run | AC-20 |
| TEST-014-03 | Frontend catalogue key parity, both directions, across every namespace | FE-014-01 | Test run | AC-20 |
| TEST-014-04 | Integration: `204`, `400`, `401` on the endpoint | BE-014-04 | Test run | AC-5 – AC-7 |
| TEST-014-05 | Integration: the claim beats `Accept-Language` — the middleware-ordering guard | BE-014-03 | Test run | AC-8 |
| TEST-014-06 | Integration: full resolution order, one case per level | BE-014-05 | Test run | AC-13 |
| TEST-014-07 | Integration: `ar-EG` → `ar`, `fr` → `en` with `200` | BE-014-06 | Test run | AC-11, AC-12 |
| TEST-014-08 | Integration: `Content-Language` on responses | BE-014-07 | Test run | AC-10 |
| TEST-014-09 | Integration: Arabic error has translated messages and identical `type` and `errors` keys | BE-014-09 | Test run | AC-14 |
| TEST-014-10 | Integration: enum values unchanged under `ar` | BE-014-09 | Test run | AC-15 |
| TEST-014-11 | Integration: logs stay English under an Arabic request | BE-014-10 | Test run | AC-23 |
| TEST-014-12 | Component: `dir` and `lang` set and cleanly reverted | FE-014-02 | Test run | AC-2, AC-3 |
| TEST-014-13 | Component: Arabic plurals at 0, 1, 2, 3, 11, 100 | FE-014-09 | Test run | AC-19 |
| TEST-014-14 | Component: Latin digits in a ticket number under `ar` | FE-014-07 | Test run | AC-17 |
| TEST-014-15 | Lint rule fails on a hard-coded string and on a physical CSS direction property | FE-014-06 | Introduce one deliberately; confirm the failure | AC-22 |
| TEST-014-16 | Manual Arabic walkthrough of the whole demo flow, findings recorded | FE-014-06 | `tests.md` | AC-2, AC-18 |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| DOC-014-01 | `documentation/development/localization.md` describes how to add a string and how to add a locale | BE-014-08, FE-014-01 | Follow it to add one string | NFR-9 |
| DOC-014-02 | API documentation covers `Accept-Language`, `Content-Language`, and what is never translated | BE-014-07 | Read it | AC-10 |
| DOC-014-03 | `summary.md`, board, delivery log | All | DoD checklist | DoD |

## Droppable If Time Runs Short

| Task | What is lost |
|---|---|
| FE-014-04 cross-device persistence | The preference lives only in `localStorage`; it works on the device it was set on and is forgotten elsewhere. The endpoint still exists |
| BE-014-10 and TEST-014-11 | Logs may adopt the request language, making them harder to search. A real defect, but not user-visible |
| FE-014-09 full plural categories, reduced to `one` and `other` | Arabic is grammatically wrong at 2, and at 3–10. Visible to any Arabic speaker, so drop this only if the alternative is not shipping |

**Not droppable:** BE-014-03 and TEST-014-05. Get the middleware order wrong and the
stored preference is silently ignored for every user, forever, with no error anywhere.

**Not droppable:** TEST-014-02 and TEST-014-03. Without the parity tests, BR-8.11 is a
convention rather than a control, and the first missing Arabic key reaches a user.

**Not droppable:** FE-014-06. Translated text in a left-to-right layout is not an
Arabic interface, and shipping it would fail the requirement while appearing to meet it.
