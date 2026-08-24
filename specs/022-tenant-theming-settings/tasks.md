# 022 — Task Breakdown

**Phase:** 5 · **Role:** Story Planner · **Skill:** `speckit-tasks`

Every task has one owner, one verification, and something it serves. A task that cannot
be verified on its own is too big and is split.

Agents named here are **not dispatched until the plan is approved**. Naming is the plan;
dispatching without recording the result in `ai-notes.md` is what turns evidence into a
claim.

## Critical path

```text
REV-022-01 → BE-022-01 → BE-022-02 → BE-022-03 → BE-022-04 → BE-022-06
          → BE-022-07 → TEST-022-06 → FE-022-03 → TEST-022-14 → DOC-022-04
```

`REV-022-01` is first and it is a **gate**, not a review step: it confirms
`006-design-system` shipped the brand token layer and rewired `--action-primary-bg`. If it
has not, everything after `BE-022-11` builds a correct feature with no visible effect
(`research.md` R-1, spec A-1).

`TEST-022-06` and `TEST-022-14` are on the path rather than in the hardening set because
they are the two criteria the feature exists to satisfy: the refusal actually refusing, and
the theme actually arriving before paint.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-022-01 | `BrandColor` parses `#RRGGBB`, trims, normalises to uppercase, and refuses each of the six malformed shapes | — | `dotnet test --filter BrandColorTests` | AC-7 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-022-02 | `Contrast.cs`: relative luminance, ratio, `OnBrandFor`, and `Evaluate` running the three checks in contract order, returning the first refusal with four ratios | BE-022-01 | `dotnet test --filter ContrastTests` — every fixture row asserted individually | AC-10, AC-12, AC-13 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-022-03 | `OrganizationSettings.ChangeBranding` applies a colour only via `Contrast.Evaluate`; there is **no** setter that bypasses it. `SidebarMode` enum | BE-022-02 | Attempt to set a refused colour through the public API in a unit test — it must be impossible to compile a bypass | AC-4, AC-14 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-022-04 | `OrganizationSettingsConfiguration` and migration `AddOrganizationSettings`: the six columns, four constraints, and the seeded row from `data-model.md` | BE-022-03 | `dotnet ef database update` on an empty database, then `SELECT COUNT(*) FROM OrganizationSettings` returns 1 and `SELECT definition FROM sys.check_constraints` returns non-null for all four | AC-1, AC-25 | `voltagent-lang:sql-pro` | — |
| BE-022-05 | `GET /api/settings/branding` returns the contract's `200` shape with `Cache-Control: no-store`, authenticated, any role | BE-022-04 | `curl -s -H "Authorization: Bearer $T" .../api/settings/branding \| jq` matches the contract; `curl -i` shows the header | AC-1, AC-2 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-022-06 | `PUT /api/settings/branding` behind `RequireAuthorization("Manager")`, with `Validator` covering format, enum case-sensitivity, and `expectedVersion` presence | BE-022-04 | `curl` as Manager returns `200`; as Agent returns `403` | AC-4, AC-5, AC-7, AC-14 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-022-07 | The refusal maps to `400 errors/inaccessible-brand-color` with `refusedBy` and the four **numeric** extensions; the new constant lands in `Common/Errors/ProblemTypes.cs` | BE-022-06 | `curl` with `#808080` returns the contract's refusal body verbatim, ratios as numbers not strings | AC-8, AC-12 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-022-08 | `expectedVersion` mismatch returns `409 errors/concurrency-conflict` and the row is untouched | BE-022-06 | Two `curl` calls with the same `expectedVersion`: one `200`, one `409`; then `GET` shows the first write's values | AC-6 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-022-09 | `Command : IAuditableCommand`; a successful change writes one `Settings.BrandingChanged` row with only the changed fields; identical values write none | BE-022-06 | `003`'s architecture test passes, then `SELECT * FROM AuditLog WHERE Action = 'Settings.BrandingChanged'` after each of the two calls | AC-26 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-022-10 | `Settings.en.resx` and `Settings.ar.resx` carry the refusal `title`, `detail`, and field message; nothing machine-readable is in either | BE-022-07 | `005`'s key-parity test passes; `curl` with `Accept-Language: ar` returns an Arabic `title` and an identical `type` | AC-8, AC-27 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-022-11 | `POST /api/auth/token` response carries `theme`, projected from the same query the `GET` uses | BE-022-05 | `curl` the token endpoint and the `GET`, diff the two JSON objects — must be empty | AC-3 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |

## Frontend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-022-00 | The screen previewed with real tokens, real copy, **every** state including Refused and Forbidden, in `en` and `ar`, before anything is wired | REV-022-01 | The preview walked with the product owner; divergences recorded | AC-20, AC-21 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-022-01 | Provisional types in `FRONTEND-API-GUIDE.md` replaced by types generated from the OpenAPI document | BE-022-05, BE-022-06 | `tsc --noEmit` passes with the generated types and the hand-written ones deleted | ADR-011 §6 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-022-02 | `lib/theme/`: `applyTheme.ts` writes only `--brand` and `--on-brand`; `themeCache.ts` never throws; `contrast.ts` mirrors `Contrast.cs` | REV-022-01 | Vitest run including a corrupt-JSON and a throwing-`localStorage` case | AC-17, AC-23 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-022-03 | The synchronous pre-paint script in `index.html`, with `performance.mark('theme-applied')` | FE-022-02 | `TEST-022-14`'s paint-order observation | AC-17, AC-18 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-022-04 | `BrandingSettingsPage` with `api.ts`, `queries.ts`, `schema.ts` and all eleven states from `frontend-spec.md` | FE-022-01, FE-022-02 | Each state reachable in the browser and named in `tests.md` | AC-4, AC-5, AC-6 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-022-05 | `BrandColorField` (hex input primary, native swatch secondary, `dir="ltr"`) and `ContrastVerdict` (`aria-live="polite"`, ratios formatted client-side, `dir="ltr"`) | FE-022-04 | Keyboard-only entry of `#123456` in Arabic, screen-reader announcement observed | AC-21, AC-22 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-022-06 | `SidebarModePicker` (one radio group, three presets), `FixedTokensNotice` (permanently visible), `BrandPreview` (branded button beside a **fixed** status chip) | FE-022-04 | The notice present in the DOM with no interaction; the fixed chip unchanged across a brand change | AC-14, AC-20 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-022-07 | The screen walked in Arabic and by keyboard and screen reader; findings written down, not summarised as "fine" | FE-022-05, FE-022-06 | `tests.md` carries the findings list, including anything found and left | AC-27 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| FE-022-08 | The Branding item in `SettingsNav`, rendered for a Manager only; `/settings/branding` renders the forbidden state for an Agent who navigates directly | FE-022-04 | Sign in as each role; observe the nav and then the direct URL | AC-5 | `voltagent-lang:react-specialist` | `frontend-design` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-022-01 | The fixture: five named colours minimum, four distinct verdicts, and the accepted/refused band **computed from the two foregrounds** and printed as test output | BE-022-02 | Test run; the printed boundaries read and recorded in `tests.md` | AC-9, AC-11 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-022-02 | `#ABC`, `1D174D`, `#1D174DFF`, `rgb(29,23,77)`, `#GGGGGG`, `" #1D174D "` each rejected as one table row | BE-022-01 | Test run | AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-022-03 | One test calls `POST /api/auth/token` and `GET /api/settings/branding` and asserts the two theme objects are equal field for field | BE-022-11 | Test run | AC-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-022-04 | `GET` returns the seeded default on a clean container; without a token returns `401 errors/unauthenticated` | BE-022-05 | Test run against `Testcontainers.MsSql` | AC-1, AC-2 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-022-05 | `PUT` as Manager returns `200`, a new `version`, and an `onBrand` recomputed by the server rather than echoed from the request | BE-022-06 | Test run — send a request with a deliberately wrong `onBrand`-implying colour and assert the server's value | AC-4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-022-06 | Each of the three refusal checks fires on its own colour: `#808080` → `text`, a base-passing/hover-failing colour → `hover`, `#FFF59D` → `surface` | BE-022-07 | Test run asserting `refusedBy` per case | AC-8, AC-12, AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-022-07 | `PUT` as an Agent returns `403 errors/forbidden`, changes nothing, and writes a denial audit row outside any transaction | BE-022-06, BE-022-09 | Test run plus an `AuditLog` query | AC-5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-022-08 | Two `PUT`s on one `version` produce one `200` and one `409 errors/concurrency-conflict`; the stored row equals the first write | BE-022-08 | Test run | AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-022-09 | With `Accept-Language: ar`, the refusal's `title` and `errors` message are Arabic while `type`, the `errors` keys, `refusedBy`, and all four ratios are byte-identical to the English response | BE-022-10 | Test run comparing the two responses field by field | AC-8, BR-8.7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-022-10 | `sidebarMode: "light"`, `"Blue"`, and `null` each return `400 errors/validation` and leave the stored value unchanged | BE-022-06 | Test run | AC-14 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-022-11 | The audit row is in the same transaction — a forced rollback leaves none — and an unchanged submission writes none | BE-022-09 | Test run | AC-26 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-022-12 | The migration seeds exactly one row; a second insert is rejected; `sys.check_constraints` returns a non-null `definition` for all four constraints | BE-022-04 | Test run against a real engine | AC-25 | `voltagent-lang:sql-pro` | — |
| TEST-022-13 | Changing the brand changes no fixed token: a `getComputedStyle` snapshot of every `--state-*`, neutral, text, border, status, and priority token is byte-identical before and after | FE-022-04 | Browser observation, snapshot diff empty | AC-16 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| TEST-022-14 | On a reload with a warm cache, `performance.mark('theme-applied')` has a strictly smaller `startTime` than the `first-contentful-paint` entry, and `:root` is written exactly once | FE-022-03 | Browser observation, both `performance` entries read and recorded | AC-17, AC-18 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| TEST-022-15 | In Brand sidebar mode every sidebar **text** role reaches 4.5:1 for every accepted fixture colour; in Dark mode `color-scheme` is `dark` on the sidebar and `light` on the root | FE-022-06 | Browser observation over the fixture; computed values read on both elements | AC-15, AC-24 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| TEST-022-16 | The refusal state renders the server's message and ratios; and a request that bypasses the mirror still gets `400` | FE-022-05, BE-022-07 | Vitest run plus one integration test that posts directly | AC-21, AC-23 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-022-17 | Every key in `frontend-spec.md`'s table exists in `en` and `ar` | FE-022-06 | The key-parity test from `005` | AC-27 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-022-01 | `docs/sdd/design/screens/012-settings-branding.md` written to the folder template, and added to that README's inventory, including the hidden-for-Agent sub-nav pattern | FE-022-06 | Read against what was actually built, not against the plan | AC-20, `research.md` R-9 | main session | — |
| DOC-022-02 | `docs/sdd/04-business-rules.md` BR-6 matrix gains a "Change branding" row: Agent ❌, Manager ✅ | BE-022-06 | The row exists and matches the `403` the test observes | AC-5, BR-6 | main session | — |
| DOC-022-03 | `docs/sdd/05-api-conventions.md` endpoint inventory gains `GET` and `PUT /api/settings/branding` | BE-022-06 | Both rows present; the generated OpenAPI lists exactly these two | DoD | main session | — |
| DOC-022-04 | `tests.md`, `ai-notes.md`, and `summary.md` completed with **observed** output — including the printed contrast band, the accepted stale-cache frame (AC-19), and the `@supports` gap left with `006` | All | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-022-01 | **Gate, runs first.** `006` has shipped `--brand`, `--on-brand`, the five ramp tokens, the three sidebar presets, and `--action-primary-bg: var(--brand)` | — | `grep -n "brand" src/**/tokens.css` shows the layer, and a manual `--brand` change in dev tools retints the primary button | A-1 | main session | — |
| REV-022-02 | The missing `@supports (color: color-mix(in oklab, …))` guard raised **against `006`**, not fixed here | REV-022-01 | An entry in `006`'s spec or an open question recorded in `docs/sdd/11-open-questions.md` | A-3, `research.md` R-4 | main session | — |
| REV-022-03 | The surface gate (Q-E) and the width of the refusal set (Q-F) put to the product owner and the answer recorded | — | A decision recorded, and AC-12 either kept or removed as one constant and one branch | Q-E, Q-F | main session | — |
| REV-022-04 | Layer boundaries, the denial audit row, and the refusal body reviewed: no `detail` leaking internals, no ratio smuggled into a translated string | All BE, all TEST | `review.md` verdict is `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-022-05 | The generated OpenAPI compared against `contracts/theming-api.md`, including the four extensions and every status code | BE-022-07, BE-022-08 | Any difference fixed in one of the two before closing | DoD | main session | — |

## Droppable if time runs short

| Task | What is lost |
|---|---|
| FE-022-06's `BrandPreview` | The live preview. The screen still saves and the interface still retints on success — the user just does not see the result until it is applied. Drop the preview before dropping the notice: `FixedTokensNotice` is a requirement (AC-20), the preview is an affordance |
| TEST-022-15 (sidebar contrast over the fixture) | Confidence in Brand mode for *unusual* accepted colours. The three presets are still verified for the shipped default. Drop only if the Brand preset itself is also dropped, so no untested mode ships |
| TEST-022-13 (no-leakage snapshot) | An automated guarantee that no status colour drifted into the themeable set. Partly covered by the fixed status chip in the preview being visible during review — **partly**, which is why this is droppable and not safe |
| BE-022-11 and TEST-022-03 (the `theme` object on the auth response) | The first authenticated paint after sign-in flashes once, on every device, until the cache is warm. The reload path still has no flash. This is A-2's consequence, accepted knowingly |
| DOC-022-01 (the screen spec file) | The screens inventory stays at eleven and this screen looks unbuilt to the next reader. Cheap to write and easy to skip, which is why it is named rather than assumed |

**Not droppable:** `REV-022-01`. Everything else in this feature can be perfectly correct
while the interface never changes colour, and the backend acceptance criteria would all
still pass. It is four minutes of checking and it is the difference between a feature and
a database row.

**Not droppable:** `TEST-022-14`. The no-flash requirement is the one ADR-012 states as a
constraint rather than a difficulty, and a `useEffect` implementation satisfies every other
criterion in this spec. Without this observation the requirement is unverified, not
verified-by-inspection.

**Not droppable:** `TEST-022-06`. It is the only task that proves the refusal path
executes at all. Ship the gate without it and the most likely outcome is code that accepts
every colour and has never been asked to refuse one.

**Not droppable:** `BE-022-02` staying in `Wasl.Domain`. Moving it into a validator to save
a file puts the only server-side copy of the rule next to the client's mirror, with nothing
structural keeping them in step (Constitution III).
