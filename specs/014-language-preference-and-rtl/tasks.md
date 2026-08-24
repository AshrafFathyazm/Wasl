# 014 — Task Breakdown

**Phase:** 4 · **Story:** US-014 · **Feature:** `014-language-preference-and-rtl` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

Agents are **named** here and **not dispatched until the plan is approved**. Naming is
the plan.

## What this migration changed

| Change | Why |
|---|---|
| `Agent` and `Skill` columns on every row | `specs/README.md`, "Who builds what". A task with no owner is a task nobody starts |
| IDs unchanged | The story number and the feature number are both `014`, so `BE-014-nn` was already correct. Nothing to renumber and nothing to re-point |
| `BE-014-01` narrowed to the domain types; the column and migration split out as `BE-014-11` | Schema work belongs to `voltagent-lang:sql-pro` and is verified by a `sys.columns` query, not by a unit test. Existing IDs are preserved rather than renumbered, so nothing citing them breaks |
| `BE-014-12`, `BE-014-13`, `TEST-014-17` – `TEST-014-19` added | The original artifacts predate ADR-008, so **no task carried the audit obligation**. `NFR-10`'s architecture test requires every state-changing command to implement `IAuditableCommand`, so the build would have failed — and the `401` row (BR-9.2 / BR-9.4) had no owner at all |
| `FE-014-10` and `TEST-014-20` added | AC-24. A stale claim outranks `Accept-Language`, so server-authored sentences kept arriving in the previous language for the rest of the session. See `spec.md` Q-7 |
| `FE-014-11` added | Blueprint Q-13. 100% line height with cap-height trim clips Arabic and presents as a font rendering fault, so it survives review |
| `FE-014-12` added | ADR-011 decision 6. Provisional hand-written types are replaced by types generated from OpenAPI, as a task rather than as a hope |
| `FE-014-00` added | Phase 3b preview gate. Rendering a screen costs minutes; changing one that already has tests, translation keys, and query wiring costs hours |
| `REV-014-01` – `REV-014-03` added | The original had no review lane. `REV-014-03` compares the generated OpenAPI against `contracts/me-language-api.md` |
| Paths corrected to ADR-010 | `src/Wasl.Application/**` and `src/Wasl.Infrastructure/**` do not exist. `MeController` becomes one minimal-API endpoint per slice |
| SQL Server types | `varchar(5)` → `nvarchar(5)`; verification by `sys.columns` rather than `\d+`; `Testcontainers.MsSql` |

## Critical path

```text
BE-014-01 → BE-014-11 → BE-014-02 → BE-014-03 → BE-014-04 → FE-014-02 → FE-014-03 → FE-014-06
```

`FE-014-06`, the Arabic pass over every screen, is on the critical path and is the task
most likely to be underestimated. It cannot start until the other Release 1 screens
exist.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-014-01 | `PreferredLanguage` value object and `SupportedLanguages`, in `Wasl.Domain` with zero package references | `001` | `dotnet test tests/Wasl.Domain.Tests --filter "PreferredLanguage"` | AC-5, AC-6 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-014-11 | Migration `AddSupportUserPreferredLanguage`: `nvarchar(5)` not null, default `'en'` — **or a recorded no-op if `004` already shipped the column** | BE-014-01, `004` | The `sys.columns` query in [`data-model.md`](data-model.md), run **before** writing the migration and again after `dotnet ef database update` on a clean database — type `nvarchar`, `max_length` 10, not nullable, and a non-null default `definition` containing `'en'` | AC-5 | `voltagent-lang:sql-pro` | — |
| BE-014-02 | `preferred_language` added to the issued JWT | BE-014-11 | Decode a token in an integration test | AC-8 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-014-03 | `ClaimsRequestCultureProvider` registered **after** `UseAuthentication()` | BE-014-02, `005` | Integration test: claim beats header | AC-8 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-014-04 | `PUT /api/me/language` returns `204`, `400`, `401`, as one minimal-API endpoint in `Features/Me/SetLanguage/` | BE-014-01, BE-014-11 | Integration tests | AC-5 – AC-7 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-014-05 | Full resolution order: query → claim → header → default | BE-014-03 | Integration test per level | AC-13 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-014-06 | `ar-EG` resolves to `ar`; `fr` falls back to `en` with `200` | BE-014-05 | Integration tests | AC-11, AC-12 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-014-07 | `ContentLanguageMiddleware` stamps every response | BE-014-05, `005` | Integration test on several endpoints | AC-10 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-014-08 | Arabic `.resx` populated for every server-authored message added by Release 1 | BE-014-04, `005` | Read against the `en` catalogue; key-parity test green | AC-14 | `voltagent-lang:dotnet-core-expert` | — |
| BE-014-09 | Validation and `ProblemDetails` resolve through `IStringLocalizer` | BE-014-08 | Integration test comparing `en` and `ar` responses | AC-14, AC-15 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-014-10 | Logging remains English under an Arabic request | BE-014-09 | Integration test asserting log output | AC-23 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-014-12 | `SetLanguageCommand` implements `IAuditableCommand` with action `User.LanguageChanged`; the row is written by the pipeline behaviour in the **same transaction**; `Changes` carries the two language codes and nothing else | `003`, BE-014-04 | Integration test asserting one row on success and **no** row after a forced rollback | BR-9.1, BR-9.3, BR-9.8 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-014-13 | The `401` on this endpoint writes an `Auth.Unauthenticated` row **outside** any transaction | `003`, `004`, BE-014-04 | Integration test: the row exists after a `401`, and survives because there is no transaction to roll back | BR-9.2, BR-9.4 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-014-14 | OpenAPI metadata declares `204`, `400`, `401`, and the `language` enum | BE-014-04 | `/swagger` inspected, then compared against `contracts/me-language-api.md` | Contract | `voltagent-lang:dotnet-core-expert` | — |

`BE-014-12` and `BE-014-13` are new in this migration. The original `tasks.md` predates
ADR-008, so no task carried the audit obligation — and `NFR-10`'s architecture test
fails the build when a state-changing command does not implement `IAuditableCommand`.
BR-9's naming table already contains `User.LanguageChanged`, so the action name is
inherited, not invented. `BE-014-13` exists because the `401` row is written outside a
transaction (BR-9.4), which is the opposite of `BE-014-12`'s obligation and therefore a
separate test rather than a variation of one.

AC-24 needs **no backend work**: `?culture=` already sits at the top of BR-8.4's order
and `BE-014-05` proves it. That is the whole reason it was chosen over reissuing a
token — see `spec.md` Q-7.

## Frontend

Starts as soon as [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) exists. It does not
wait for `BE-014-04`.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-014-00 | Screen preview of `/settings/localization`: real tokens, real copy, both languages, all states. **Approved before any wiring** | `006` | Rendered and reviewed (Phase 3b) | AC-2, AC-3 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-014-01 | `i18n.ts` initialised with both catalogues and `fallbackLng: 'en'` | `005`, `006` | `npm run dev` renders from the catalogue | AC-21 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-014-02 | `useLocale` sets `lang` and `dir` on `<html>` and persists to `localStorage` | FE-014-01 | Component test, plus a manual reload | AC-2 – AC-4 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-014-03 | `LanguageSwitcher` on the login screen, and the Localization settings screen reachable from the user popover | FE-014-02, FE-014-00 | Manual, signed in and signed out | AC-1 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-014-04 | On sign-in the server preference overwrites the local value; on change the client calls `PUT /api/me/language`, and a failure **reverts** the selection rather than leaving it out of step with the server | FE-014-03, BE-014-04 | Manual across two browsers; component test with a mocked `400` | AC-4 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-014-05 | `Accept-Language` interceptor on the API client | FE-014-02 | Inspect a request in dev tools; component test on the client | AC-9 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-014-06 | Every screen converted to logical CSS properties and reviewed in Arabic | All Release 1 screens, FE-014-02 | Manual pass, screen by screen, findings written into `tests.md` | AC-2, AC-3 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| FE-014-07 | `formatters.ts` with `ar-u-ca-gregory-nu-latn`; ticket numbers in Latin digits | FE-014-01 | Component tests | AC-16, AC-17 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-014-08 | `dir="auto"` on every element rendering user content | FE-014-06 | Component test; manual with mixed-language content | AC-18 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-014-09 | Plural keys with all six Arabic categories wherever a count is shown | FE-014-01 | Test at 0, 1, 2, 3, 11, 100 | AC-19 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-014-10 | After an in-session switch, the client appends `?culture=<locale>` to every request until the next token issue, and drops it on the next sign-in | FE-014-05, BE-014-05 | Component test on the client, plus an integration check that a server message arrives in the new language | AC-24 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-014-11 | `--font-ar` applied under `[dir="rtl"]`; `--leading-ar-*` in place of `--leading-*`; cap-height vertical trim **not** applied to Arabic; letter-spacing stays `0` | `006`, FE-014-02 | Visual check at every type size in Arabic — ascenders and descenders both intact | AC-2 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-014-12 | Provisional request type replaced with types generated from the OpenAPI document | BE-014-14 | `npm run typecheck` after regeneration | ADR-011 | `voltagent-lang:typescript-pro` | — |

`FE-014-11` is where blueprint Q-13 lands. It is a frontend task and not a design task
because the token values already exist in `design/tokens.css`; what does not exist is
anything applying them. Arabic clipped by cap-height trim looks like a broken font, so
nobody files it as a CSS defect.

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-014-01 | Unit: value object accepts `en` and `ar`, rejects the rest | BE-014-01 | Test run | AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-02 | Backend catalogue key parity, both directions | BE-014-08 | Test run | AC-20 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-03 | Frontend catalogue key parity, both directions, across every namespace | FE-014-01 | Test run | AC-20 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-04 | Integration: `204`, `400`, `401` on the endpoint | BE-014-04 | Test run | AC-5 – AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-05 | Integration: the claim beats `Accept-Language` — the middleware-ordering guard | BE-014-03 | Test run | AC-8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-06 | Integration: full resolution order, one case per level | BE-014-05 | Test run | AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-07 | Integration: `ar-EG` → `ar`, `fr` → `en` with `200` | BE-014-06 | Test run | AC-11, AC-12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-08 | Integration: `Content-Language` on responses | BE-014-07 | Test run | AC-10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-09 | Integration: Arabic error has translated messages and identical `type` and `errors` keys | BE-014-09 | Test run | AC-14 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-10 | Integration: enum values unchanged under `ar` | BE-014-09 | Test run | AC-15 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-11 | Integration: logs stay English under an Arabic request | BE-014-10 | Test run | AC-23 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-12 | Component: `dir` and `lang` set and cleanly reverted | FE-014-02 | Test run | AC-2, AC-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-13 | Component: Arabic plurals at 0, 1, 2, 3, 11, 100 | FE-014-09 | Test run | AC-19 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-14 | Component: Latin digits in a ticket number under `ar` | FE-014-07 | Test run | AC-17 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-15 | Lint rule fails on a hard-coded string and on a physical CSS direction property | FE-014-06 | Introduce one deliberately; confirm the failure | AC-22 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-014-16 | **Manual Arabic walkthrough of the whole demo flow**, screen by screen, findings recorded — including "nothing found" if that is the truth | FE-014-06 | `tests.md`, one section per screen | AC-2, AC-18 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| TEST-014-17 | Integration: one audit row per real change; **none** after a forced rollback | BE-014-12 | Test run | BR-9.1, BR-9.3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-18 | Integration: setting the language to the value already stored returns `204` and writes **no** audit row | BE-014-12 | Test run | BR-9.8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-19 | Integration: a `401` writes one `Auth.Unauthenticated` row, and it is present even though no business transaction existed | BE-014-13 | Test run | BR-9.2, BR-9.4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-20 | Integration: switch to `ar`, then force a validation error on the **next** request with the same token — the message is Arabic, with no re-login | FE-014-10, BE-014-05 | Test run | AC-24 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-014-21 | Accessibility: the language group is a real radio group, keyboard-navigable, each option carrying its own `lang` so a screen reader pronounces `العربية` in an Arabic voice | FE-014-03 | Test run plus a screen-reader pass | AC-1 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

`TEST-014-16` is the deliverable that no assertion replaces. It produces text, not a
green tick: a list of what was walked, what was found, and what was fixed. "Nothing
found" is an acceptable result and a dishonest default — the difference is whether the
list of screens walked is there underneath it.

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-014-01 | `docs/sdd/documentation/development/localization.md` describes how to add a string and how to add a locale | BE-014-08, FE-014-01 | Follow it to add one string | NFR-9 | main session | — |
| DOC-014-02 | API documentation covers `Accept-Language`, `Content-Language`, `?culture=`, and what is never translated | BE-014-07 | Read it against `05-api-conventions.md` | AC-10 | main session | — |
| DOC-014-03 | `summary.md`, board, delivery log | All | DoD checklist | DoD | main session | `verify-story` |
| DOC-014-04 | `tests.md` and `ai-notes.md` completed with **observed** output, including the Arabic walkthrough findings | DOC-014-03 | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-014-01 | Layer boundaries, correctness against every AC, scope creep. Specifically: no physical CSS direction property anywhere in the diff, `CancellationToken` on every async path, no `DateTime.UtcNow` inline | All | `review.md` verdict `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-014-02 | Security: the locale value reaches a response header, so `Content-Language` must not be able to carry an injected value; the `401` reveals nothing about whether the account exists; the audit `Changes` carries no PII | BE-014-07, BE-014-13 | `review.md` | DoD | `comprehensive-review:security-auditor` | — |
| REV-014-03 | Generated OpenAPI compared against `contracts/me-language-api.md` | BE-014-14 | Any difference fixed in one of the two before closing | DoD | main session | — |
| REV-014-04 | Arabic copy reviewed by someone who reads Arabic (`spec.md` Q-5). If no reviewer is available, that is recorded as a limitation rather than passed over | BE-014-08, FE-014-01 | `review.md`, naming the reviewer or naming the gap | A-3, Q-5 | main session | — |

`REV-014-02` looks thin for a language setting and is not. The requested locale arrives
from a header or a query string and ends up in a response header, which is the classic
shape of a header-injection defect. The framework's culture parser rejects anything that
is not a well-formed tag, so the answer should be "already safe" — but "should be" is
what a review is for.

## Droppable if time runs short

| Task | What is lost |
|---|---|
| FE-014-04 cross-device persistence | The preference lives only in `localStorage`; it works on the device it was set on and is forgotten elsewhere. The endpoint still exists, so this is a wiring gap, not a missing feature |
| BE-014-10 and TEST-014-11 | Logs may adopt the request language, making them harder to search. A real defect, but not user-visible |
| FE-014-09 full plural categories, reduced to `one` and `other` | Arabic is grammatically wrong at 2, and at 3–10. Visible to any Arabic speaker, so drop this only if the alternative is not shipping |
| FE-014-10 and TEST-014-20 | Server-authored messages lag one session behind the chosen language. The user sees Arabic labels around an English error sentence. Degrades to the behaviour the original plan accepted, so dropping it is a return to a known state rather than a new unknown |
| FE-014-12 | Hand-written provisional types stay. They are correct today and will not fail when the contract moves — which is the whole reason the task exists |
| TEST-014-21 | The radio group may work by mouse only, and `العربية` may be read aloud in an English voice. Small, and the sort of thing that never gets fixed later |

**Not droppable:** BE-014-03 and TEST-014-05. Get the middleware order wrong and the
stored preference is silently ignored for every user, forever, with no error anywhere.
`005` cannot have caught this: with no preference in existence, both orderings behave
identically.

**Not droppable:** TEST-014-02 and TEST-014-03. Without the parity tests, BR-8.11 is a
convention rather than a control, and the first missing Arabic key reaches a user.

**Not droppable:** BE-014-12. An audit row added after the handler exists is an audit
row with an invisible hole, and `NFR-10`'s architecture test fails the build without
`IAuditableCommand`.

**Not droppable:** FE-014-06 and TEST-014-16. Translated text in a left-to-right layout
is not an Arabic interface, and shipping it would fail the requirement while appearing
to meet it.

**Not droppable:** FE-014-11. Clipped Arabic is worse than untranslated Arabic, because
untranslated text reads as unfinished and clipped text reads as broken.
