# 005 — AI Usage Notes

**State: specification phase only. No implementation has run.**

Everything below describes AI use on the *planning* artifacts. The implementation and
testing sections are headings with nothing under them, and they stay that way until code
exists — an empty section is honest, a pre-filled one is a false statement.

---

## Specification and planning

**Used for:** reading ADR-007 in full, BR-8.1 – BR-8.14, FR-5.1 – FR-5.8, NFR-8, NFR-9,
`documentation/development/localization.md`, `05-api-conventions.md`,
`09-definition-of-done.md`, `00-project-context.md`, ADR-005, ADR-010, ADR-011, ADR-013,
`US-014`'s story artifacts, and the two reference features (`001`, `007`) — then
reconciling ADR-007 against the two-project layout ADR-010 imposed after it was written.

**Accepted as-is:**

- Every ADR-007 decision's **reasoning**. Nothing in it needed rebutting: the *when*
  argument, the ownership rule, the ban on translating machine-readable values, the
  rejection of a mirrored RTL stylesheet, the Latin-digits argument, and the six-category
  plural rule are all stated better in the ADR than a restatement would be, which is why
  this specification cites them rather than repeating them
- BR-8 as a set of testable propositions. Fourteen rules, thirty-two criteria, and no rule
  needed rewording to become a test
- `001`'s spec/plan/tasks structure and tone, and its task-table columns, copied exactly
- `007`'s contract and frontend-guide format, copied exactly, including the
  "branch on `type`, never on `title`" framing

**Modified, and why:**

| What | Change | Reason |
|---|---|---|
| ADR-007 §2's resource path, `Wasl.Application/Resources` | → `src/Wasl.Api/Common/Localization/` | That project does not exist under ADR-010. The ADR's *intent* — resources next to the code that raises the messages — is satisfied at the granularity the layout actually has (`research.md` R-1). `DOC-005-03` corrects the documentation |
| ADR-007 §5's `SharedResource.en.resx` | → the neutral `SharedResource.resx` holds English | `ar` does not fall back to `.en.resx`; it falls back to the neutral file. With the ADR's literal layout, a missing Arabic key renders the raw symbolic key and BR-8.12 is unimplementable (`research.md` R-3). The decision's substance is unchanged |
| ADR-007 §4's "after `UseAuthentication()`" | → "**between** `UseAuthentication()` and `UseAuthorization()`" | `UseAuthentication()` only populates `HttpContext.User`; the `401` and `403` are emitted by the authorization middleware. Placed after both, ADR-007's wording is satisfied and every `401` is un-localized — in the one situation the user most needs to be told what happened in a language they read (`research.md` R-5) |
| "Insert the claim provider into the default list" | → `Clear()`, then add three | The framework's default list contains `CookieRequestCultureProvider`, verified. Inserting leaves it in place, where a stale cookie outranks both the claim and the header and silently inverts BR-8.5 (`research.md` R-6) |
| US-014's AC set | Split: mechanism here, choice in `014` | `014` carried twenty-three criteria covering both. The mechanism ones are re-derived here against `005`'s scope; `014` keeps the switcher, the endpoint, the column, and the Arabic walk |
| "Localization has no schema change, so `data-model.md` is one line" | → a full file explaining what is *not* persisted and where each candidate lives | "The localization feature" sounds like it should own the preference column. Saying which feature does, and why not this one, is the information |

**Rejected:**

| Suggestion | Why it was rejected |
|---|---|
| Set `LocalizationOptions.ResourcesPath = "Common/Localization"` — the obvious reading of the docs, and what most examples show | The factory **composes** the path with the marker type's namespace, so the lookup becomes `Wasl.Api.Common.Localization.Common.Localization.SharedResource` and every string silently returns its own key. Verified against `Microsoft.Extensions.Localization.xml` in the .NET 10 ref pack, not recalled. This is the single highest-value rejection in the feature and it is why AC-16 exists (`research.md` R-2) |
| Validate the claim value inside `PreferredLanguageCultureProvider` | The middleware's supported-culture filter and parent-culture fallback already handle `ar-EG`, `AR`, `de`, and `""` correctly. A second validator is a second place for BR-8.2 to drift, which is the constitution's rule about business rules living once (`plan.md`) |
| Write a custom `ContentLanguageMiddleware` | `RequestLocalizationOptions.ApplyCurrentCultureToResponseHeaders` was **verified to exist** in .NET 10 and does exactly this. Hand-rolling it would mean owning an ordering question the framework already answers (`research.md` R-4) |
| One `.resx` pair per vertical slice, to make ADR-007 §2 literal | The duplicate-customer message is raised by a validator, a handler, **and** `002`'s mapper, so it has no single owning slice — and a parity test over a shifting set of file pairs eventually gets disabled (`research.md` R-1) |
| Add `ar-SA`, `ar-EG`, `en-GB` to `SupportedCultures` "to be explicit" | Parent-culture fallback defaults to `true`, verified. Adding them creates cultures whose catalogues then must exist and stay in parity, in exchange for behaviour that is already correct (`research.md` R-7) |
| Lazy-load catalogues with `i18next-http-backend` | A network fetch before the first render, so either a flash of untranslated content or a loading gate on the whole application, plus a 404-in-production failure mode static imports cannot have. Two small files (`research.md` R-12) |
| Reflect over `ApplicationBuilder` internals to assert middleware order | Works today, breaks on a framework patch, and a test that goes red for unrelated reasons teaches the team to delete tests. The behavioural test is the real control; the source guard is the tripwire, and it is written down as crude (`research.md` R-11) |
| Ship a `ticketCount` plural key so the six categories have a real caller | Nothing renders a count in this feature. A catalogue entry with no caller is speculative, and AC-21 proves the configuration with an in-test bundle instead |
| Build the whole frontend half in `014`, next to the switcher | It is the retrofit ADR-007 §1 exists to prevent: `006` – `013` would build every screen before `t()`, `dir`, and the lint rules existed, and `014` would convert seven screens in the last phase before delivery (`plan.md`, risks) |
| Ship the parity tests in the integration project's container-bound collection, like every other integration test | Docker is not running on this machine (`001/research.md` R-8). A build-failing control that cannot run where the build runs is not a control (`spec.md` Q-E) |
| Switch the client locale to whatever `Content-Language` says | It would flip the interface out from under a user mid-session because one endpoint answered in English (`research.md` R-15) |

**How each accepted output was verified:**

Every framework API named in `plan.md` and `research.md` was checked against the .NET 10
reference assembly present on this machine —

```text
C:\Program Files\dotnet\packs\Microsoft.AspNetCore.App.Ref\10.0.9\ref\net10.0\
  Microsoft.AspNetCore.Localization.xml
  Microsoft.Extensions.Localization.xml
  Microsoft.Extensions.Localization.Abstractions.xml
```

— by extracting the member list and reading the XML documentation for each. What that
confirmed, rather than assumed:

| Claim | How it was confirmed |
|---|---|
| `RequestLocalizationOptions.ApplyCurrentCultureToResponseHeaders` exists and writes `Content-Language` | Present as a property; its summary names `CurrentUICulture` and the `Content-Language` header |
| The default provider list is QueryString → **Cookie** → AcceptLanguageHeader | The `RequestCultureProviders` summary enumerates all three in order |
| `FallBackToParentUICultures` defaults to `true`, and matches on culture **name** | Its summary says "Defaults to `true`"; its remarks say the parent check uses only the culture name |
| `ResourcesPath` is composed with the type's location | `LocalizationOptions.ResourcesPath` is "the relative path under application root", and `ResourceManagerStringLocalizerFactory.GetResourcePrefix(location, baseName, resourceLocation)` composes the three |
| `RequestCultureProvider`, `ProviderCultureResult`, `CookieRequestCultureProvider`, `QueryStringRequestCultureProvider`, `AcceptLanguageHeaderRequestCultureProvider`, `ResourceLocationAttribute`, `RootNamespaceAttribute` all exist | Enumerated from the type list in both XML documents |
| `LocalizedString.ResourceNotFound` exists | Present in `Microsoft.Extensions.Localization.Abstractions.xml` — it is what AC-16 asserts on |

Every claim about the blueprint was checked by opening the file, not by recalling it: the
`.resx` path came from `documentation/development/localization.md` and ADR-007 §2, the
plural suffix list from ADR-007 §9, the never-localized list from `05-api-conventions.md`
and BR-8.7, the migration name for the preference column from
`story-artifacts/US-014-language-preference/plan.md`, the agent and skill strings from
`specs/README.md`, and the plural test counts (0, 1, 2, 3, 11, 100) from
`testing/test-matrix.md`.

**Two things this feature refuses to state as verified**, because they were not:

- The **default value** of `ApplyCurrentCultureToResponseHeaders`. It is an auto-property
  with no initializer and was added as a non-breaking change, so it is off unless set —
  but that is inference, not an observation. It does not matter: AC-11 asserts the header
  on seven status codes rather than trusting the default
- Whether `002-error-contract` will have shipped when this starts. `plan.md` names its
  mapper by role rather than by file, and declares the edit under **Contract changes**

**Not put into any prompt:** no credentials, no connection strings, no tokens, no customer
data. The JWT in AC-1's test is minted inside the test with a test signing key.

---

## Implementation

*Empty. No code has been written for this feature.*

To be filled per task with: what the agent was given, what came back, what was accepted,
what was modified and how, what was rejected and why, and — for each accepted output —
the command that was **run** to verify it. Reading is not verifying.

---

## Testing

*Empty. No tests have been run.*

`tests.md` records the commands and their real output. Nothing is written there that was
not observed. Two entries in this feature are deliberate-breakage observations rather than
green runs — TEST-005-01 with the middleware moved, and TEST-005-23's two red CI runs —
and both record the red output, not a description of it.
