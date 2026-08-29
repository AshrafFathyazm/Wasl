# `005-localization-core` — test evidence

**Scope:** the server half only, ruled 2026-08-29 (Q-J). `023` built the client half; the
switcher and `PUT /api/me/language` are **`005b`**, a named row on the board. Frontend criteria
AC-20 … AC-32 are **not claimed here** and not built by this feature.

**Run:** 2026-08-29, Windows 11, .NET 10.0.200 SDK, SQL Server 2022 via `Testcontainers.MsSql`
(one container for the whole integration suite) plus one `docker compose` container for the
manual verification.

```text
dotnet build --no-incremental      0 Warning(s)   0 Error(s)
dotnet test --no-build

Wasl.Domain.Tests            Failed: 0   Passed: 177   Total: 177     545 ms
Wasl.Application.Tests       Failed: 0   Passed:  17   Total:  17     889 ms
Wasl.Api.IntegrationTests    Failed: 0   Passed: 278   Total: 278      56 s
                                         ─────────────────────────
                                         Passed: 472   Total: 472
```

Before `005`: 442. Net +30 — 12 new tests, and 18 existing ones that had to start saying which
language they wanted (see *The seed speaks Arabic* below).

---

## Acceptance criteria → named tests

### Culture resolution and pipeline order

| AC | Test | Result |
|---|---|---|
| AC-1 | `CultureResolutionTests.An_arabic_claim_beats_an_english_header` | pass |
| AC-3 | `CultureResolutionTests.The_provider_list_is_exactly_three_and_carries_no_cookie_provider` | pass |
| AC-4 | `CultureResolutionTests.The_query_string_beats_an_english_claim_and_an_english_header` | pass |
| AC-5 | `An_arabic_claim_beats_an_english_header`, and `A_claim_in_the_wrong_case_still_resolves` | pass |
| AC-6, AC-7 | `With_no_claim_the_header_decides_and_english_is_the_default` (3 cases) | pass |
| AC-8 | `A_regional_arabic_resolves_to_neutral_arabic` (`ar-EG`, `ar-SA`) | pass |
| AC-9, AC-10 | `An_unsupported_or_malformed_locale_falls_through_to_english` (`fr`, `de-CH`, `!!!`, `;q=`, empty) | pass |
| AC-11 | — | **NOT MET. See below.** |
| AC-12 | `A_denial_carries_content_language_and_a_localized_title` | pass |
| AC-12c | `Both_titles_under_the_unauthenticated_type_are_localized` (`en`, `ar`) | pass |
| — | `A_claim_naming_an_unspeakable_culture_falls_through_to_the_header` | pass |
| — | `An_empty_claim_is_treated_as_absent` (empty, whitespace) | pass |

### Catalogues, keys, and what is never translated

| AC | Test | Result |
|---|---|---|
| AC-13 | `CultureResolutionTests.Only_the_human_half_of_a_response_changes_with_the_locale` | pass |
| AC-14 | `CatalogueParityTests.The_two_catalogues_carry_exactly_the_same_keys` | pass |
| AC-15 | `CatalogueParityTests.A_key_missing_from_arabic_falls_back_to_the_english_sentence` | pass |
| AC-16 | `CatalogueParityTests.Every_shipped_key_resolves_in_both_cultures` (`en`, `ar`) **and** `CultureResolutionTests.The_running_application_resolves_every_key_it_ships` | pass — **two tests, and the second exists because a control proved the first was not enough** |
| AC-17 | `CatalogueParityTests.Icu_is_available_and_arabic_is_a_real_culture` | pass |
| AC-18 | `CultureResolutionTests.A_ticket_number_and_its_enums_are_byte_identical_across_locales` | pass |
| — | `CatalogueParityTests.A_placeholder_present_in_english_is_present_in_arabic` | pass — not in the spec, added because a dropped `{0}` is silent |
| — | `CatalogueParityTests.Both_catalogues_are_embedded_in_the_assembly` | pass |

### Not built, and therefore not claimed

| AC | Why |
|---|---|
| AC-2 | The source-level guard on `Program.cs`'s middleware order. **`004` already ships `MiddlewareOrderTests`** asserting `UseAuthentication` before `UseRequestLocalization`; it does **not** yet assert `UseRequestLocalization` before `UseAuthorization`, which is `005`'s addition (Q-H). The behaviour is covered by control 1 below, and the *source guard* is not written. Recorded as a gap, not as a pass |
| AC-12b | The `429`'s localized `title` and locale-independent `Retry-After`. The throttle is per-process with a five-minute window, so burning it inside the shared-container suite costs every later test that needs a sign-in. The `title` key is covered by the catalogue tests; `Retry-After` carries a number, which BR-8.7 puts outside translation. **Written in the spec, not asserted** |
| AC-19 | A third culture from configuration. `ReadSupportedCultures` reads `Localization:SupportedCultures` and the fallback is exercised on every run, but **no test configures a third culture**, so NFR-9's claim is implemented and unproven |
| AC-20 … AC-32 | Frontend. Out of scope by ruling |

---

## AC-11 is NOT met, and it is recorded rather than reworded

> *Every response carries `Content-Language` naming the locale actually applied — asserted on a
> `200`, a `400`, a `401`, a `403`, a `404`, a `409`, a `429` and a `500`.*

**What is true:** every response produced *without* an exception carries it.

**What is not:** every response produced *by throwing* loses it.

Measured on the wire, same endpoint, same status, same headers sent — the only difference is
whether an exception was raised:

```text
400 model binding    (customerId absent, no exception)      CL='ar'
400 FluentValidation (binds, subject empty — throws)        CL=''
```

```text
200 authenticated                       CL='ar'
404 unmatched route   (routing)         CL='ar'
405 wrong method      (routing)          CL='ar'
404 NotFoundException (throws)          CL=''
401 no token          (denial handler)  CL='ar'      ← fixed by `005`, was '' before
```

**The cause is `UseExceptionHandler`.** `RequestLocalizationMiddleware` writes the header
eagerly on the way down; `ExceptionHandlerMiddleware` clears the response — headers included —
before invoking any `IExceptionHandler`. Our `GlobalExceptionHandler` clears nothing; the
framework does it first.

**The fix is not this feature's to make.** Q-G was ruled: *if the cause turns out to live outside
`005`, come back before fixing it.* It does — the fix belongs in `002`'s exception handler,
which would re-apply the header after the clear. **Raised, not applied.**

**What `005` did do about it, so this is not merely a shrug:** the *bodies* are correctly
localized on every path including the exception ones, because
`LocalizedProblemMessageSource` reads `IRequestCultureFeature` from the context rather than
ambient `CultureInfo.CurrentUICulture` — which the unwind has already restored by the time the
outermost handler runs. **`002` insisted on that in `IProblemMessageSource`'s remarks and called
it belt-and-braces. It is not: without it every error response would be English while every
success response was Arabic.** That is the same defect this feature exists to fix, arriving
through a second door.

---

## Negative controls — both reverted, both rebuilt with `--no-incremental`

### Control 1 — `UseRequestLocalization()` back after `UseAuthorization()`

The pre-`005` position, and the whole of Q-H.

```text
dotnet test --filter "FullyQualifiedName~CultureResolutionTests"
Failed: 7

  With_no_claim_the_header_decides_and_english_is_the_default (all 3 cases)
      Expected ContentLanguage(response) to be "en", but found <null>.
      Expected ContentLanguage(response) to be "ar", but found <null>.
  A_regional_arabic_resolves_to_neutral_arabic (ar-EG, ar-SA)
      Expected ContentLanguage(response) to be "ar", but found <null>.
  A_denial_carries_content_language_and_a_localized_title
      Expected ContentLanguage(challenge) to be "ar", but found <null>.
  Both_titles_under_the_unauthenticated_type_are_localized (ar)
      Expected …GetProperty("title")… to be a match, but it differs at index 0
```

Every failure is on the `401`/`403` path, and both symptoms appear together: the header goes
`<null>` **and** the Arabic title reverts to English. That is the measurement Q-H asked for —
ADR-007 does not forbid the old order, the build stays green, and Arabic users silently get
English on exactly the two responses that tell them they may not proceed.

### Control 2 — `AddLocalization(o => o.ResourcesPath = "Resources")`

The realistic mistake, and the one `research.md` R-2 predicted: a resource path that reads
plausibly and matches nothing.

```text
Failed: 11+

  ResourceKeyLeakTests.No_error_response_renders_a_resource_key   (all 5 cases)
  ResourceKeyLeakTests.A_conflict_on_a_closed_ticket_explains_itself_in_words
  CultureResolutionTests.Only_the_human_half_of_a_response_changes_with_the_locale
  CultureResolutionTests.An_unsupported_or_malformed_locale_falls_through_to_english (all 5)
```

**And the control found a hole in `005`'s own test.**
`CatalogueParityTests.Every_shipped_key_resolves_in_both_cultures` — the test written *for*
AC-16, described in its own remarks as "the only assertion that can tell a missing translation
from a broken lookup" — **stayed green through this control.** It builds its own
`ServiceCollection` and calls `AddLocalization()` with no path, so it proves the catalogue files
are findable and is blind to how the product registers them.

What actually went red was `002`'s `ResourceKeyLeakTests`, written for a different feature.

So a second test was added — `CultureResolutionTests.The_running_application_resolves_every_key_it_ships`
— which resolves through `factory.Services`, the application's own container and its own
`LocalizationOptions`. **Two tests, two ends: one asks whether the files are right, the other
asks whether the application can reach them.** Neither is redundant, and the first one's
docstring was overclaiming until the control said so.

---

## The seed speaks Arabic, and eighteen tests had to admit what they wanted

**`004` seeds the Manager with `PreferredLanguage = "ar"`.** The moment
`PreferredLanguageCultureProvider` was registered, every server-authored sentence on a Manager's
request became Arabic — which is BR-8.4 working exactly as specified, and which turned about a
dozen assertions red at once.

Those tests had been asserting English sentences without ever saying they wanted English. They
now use `factory.CreateEnglishManagerClient()`, which pins `?culture=en` through a
`DelegatingHandler`.

- **Pinned with the query string, not a header**, because BR-8.4 ranks the claim *above*
  `Accept-Language`. Asserting English from a header would have been asserting that the
  resolution order is broken.
- **BR-8.5 says `?culture=` exists for testing and for sharing a link in a known language.**
  This is its first use and it is the intended one.
- **Applied by a handler, not at each call site**, so "this test is about the English catalogue"
  is stated once in the client a test asks for, rather than repeated in fifteen URLs where one
  could quietly go missing.

Two of `005`'s own tests were wrong the same way and were fixed rather than the product:
`A_denial_carries_content_language_and_a_localized_title` sent `Accept-Language: ar` with the
**Agent's** token, whose claim says `en` — the header lost, correctly.

---

## Verified live before and after

Against the running API and the compose container. Before the middleware move:

```text
401 no token          [ar]  CL=''  title=Authentication is required.
401 bad credentials   [ar]  CL=''  title=Email or password is incorrect.
400 validation        [ar]  CL=''  title=One or more validation errors occurred.
                                   errors: email=Enter your email address.
```

After the catalogues and the move:

```text
401 no token          [en]  CL='en'  title=Authentication is required.
401 no token          [ar]  CL='ar'  title=تسجيل الدخول مطلوب.
401 bad credentials   [ar]  CL=''    title=البريد الإلكتروني أو كلمة المرور غير صحيحة.
400 validation        [ar]  CL=''    title=حدث خطأ أو أكثر في البيانات المُدخلة.
                                     errors: email=أدخل بريدك الإلكتروني.
                                             password=أدخل كلمة المرور.
```

`errors` **values** are Arabic and `errors` **keys** are unchanged — AC-13. The remaining empty
`CL` on the two exception paths is AC-11, above.

---

## Not claimed

| What | Why |
|---|---|
| AC-11 | Recorded unmet, with the measurement and the cause. `002` owns the fix |
| AC-2 | The source guard on the new ordering constraint is not written. Control 1 covers the behaviour |
| AC-19 | `Localization:SupportedCultures` is read from configuration, and no test configures a third culture. NFR-9's claim is implemented, not proven |
| The Arabic copy is correct | **Sixty-three strings, written by this agent, reviewed by nobody who reads Arabic.** A-4 called this a delivery risk rather than a code risk, and it still is. `014`'s manual Arabic pass is where it gets read |
| Anything on a screen | No screen is touched. `023` shipped the client catalogues; `005b` and `014` own what a user sees |
| That `?culture=` is safe to expose | Q-F says it is, because it can only select from the supported list. Unchanged and untested — the supported-culture filter is what makes it true, and AC-9 tests that filter |
