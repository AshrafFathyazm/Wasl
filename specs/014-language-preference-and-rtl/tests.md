# US-014 — Verification

**Phase:** 5 · **Role:** Verification · **Status:** Not started

Nothing in this file is written unless it was observed.

## Build

```text
$ dotnet build
```

## Unit Tests

```text
$ dotnet test tests/Wasl.Domain.Tests
```

There are exactly two test projects (ADR-010). The original template also named
`tests/Wasl.Application.Tests`, which does not exist — the backend key-parity test runs
inside `Wasl.Api.IntegrationTests` (`research.md` R-11).

Count, passed, failed, skipped.

## Integration Tests

```text
$ dotnet test tests/Wasl.Api.IntegrationTests
```

## Frontend Tests

```text
$ npm run test
```

## Acceptance Criteria Traceability

| AC | Test name | Result |
|---|---|---|

An AC with no test is a finding, not a footnote.

## Edge Cases Exercised

| Case | Source | Result |
|---|---|---|

## Arabic Walkthrough — the deliverable (TEST-014-16)

The whole demo flow, walked in Arabic, screen by screen. This is not a checklist item
that gets a tick; it is a list of what was looked at and what was seen. **"Nothing found"
is an acceptable result and is only credible with the screen list filled in underneath
it** — the rows are the evidence, not the verdict.

RTL defects fail no assertion: a container sized to English label text, a directional
icon that did not flip, a number on the wrong side of an Arabic sentence, Arabic clipped
by cap-height trim. Automated visual regression would need a baseline that does not
exist.

| Screen | Direction correct | Layout holds Arabic copy | Icons flipped correctly | Numbers / dates / `TicketNumber` | Type not clipped | Findings |
|---|---|---|---|---|---|---|
| `01-login` | | | | | | |
| `02-app-shell` | | | | | | |
| `03-tickets-list` | | | | | | |
| `04-ticket-detail` | | | | | | |
| `05-create-ticket` | | | | | | |
| `06-customers-list` | | | | | | |
| `07-customer-profile` | | | | | | |
| `08-create-customer` | | | | | | |
| `09-settings-localization` | | | | | | |

| Fix applied | Screen | Was it a token, a layout, or a component? |
|---|---|---|

## Not Tested

| What | Why |
|---|---|

## Findings


---

# Backend half — test evidence, 2026-08-30


**Scope:** the backend half only. The switcher screen is the frontend lane's, as a separate row —
which was the split that let this start.

**Run:** 2026-08-30, Windows 11, .NET 10.0.200 SDK, SQL Server 2022 via `Testcontainers.MsSql`.

```text
dotnet build --no-incremental      0 Warning(s)   0 Error(s)
dotnet test --no-build

Wasl.Domain.Tests            Failed: 0   Passed: 177   Total: 177     397 ms
Wasl.Application.Tests       Failed: 0   Passed:  26   Total:  26     744 ms
Wasl.Api.IntegrationTests    Failed: 0   Passed: 330   Total: 330    1 m 4 s
                                         ─────────────────────────
                                         Passed: 533   Total: 533
```

Before `014`: 521. Twelve new, **all green on the first run.**

---

## Acceptance criteria → named tests

| AC | Test | Result |
|---|---|---|
| AC-1 | `ChangeMyLanguageTests.The_stored_preference_changes_and_reaches_the_next_token` | pass |
| AC-2 | Same test — a fresh sign-in, and `preferred_language` decoded from the new token | pass |
| AC-3 | `An_unsupported_or_regional_language_is_refused` (`ar-SA`, `en-GB`, `AR`, `fr`, empty, whitespace) | pass |
| AC-4 | `An_anonymous_request_is_unauthenticated` | pass |
| AC-5 | `A_language_change_writes_one_audit_row_naming_the_actor` | pass |
| AC-6 | `The_response_names_the_locale_of_this_request_not_the_new_one` | pass |
| AC-7 | `The_command_carries_no_user_identifier` | pass |
| AC-8 | `OpenApiContractTests` — the `NotBuiltYet` entry deleted, and the comparison green | pass |
| AC-9 | `Setting_the_same_language_twice_is_not_a_conflict` | pass |

---

## AC-2 is the one that had to be end to end

The column and the claim being **in step** is the entire reason the preference is stored. A test
that only read the row back would pass on a build where `JwtAccessTokenIssuer` had stopped reading
the column — and the user would switch language to no effect, forever, with every test green.

So the test changes the preference, signs in again, and **decodes the new token**.

`004`'s own record has three instances of this exact class — an entity written only from outside
the real path is an entity nothing has verified — and `CLAUDE.md` keeps the table.

---

## AC-6 exists so a behaviour is not filed as a defect

```text
PUT /api/me/language  {"language":"ar"}   →  204,  Content-Language: en
```

The culture was resolved from the claim that was current when the request arrived, long before
the handler ran. **A client reading this header to confirm the switch will conclude it failed.**

The frozen contract calls it *"the single most confusing thing about this endpoint"* and says
plainly that it is behaviour rather than a defect. It is now asserted, with the reason inside the
test, and repeated in `MeController`'s own remarks — because the next person to meet it will be
reading the controller, not the contract.

---

## The negative control closed a loop `002c` opened

`002c` built a contract comparison and a `NotBuiltYet` list, plus a test that fails when an entry
names an endpoint that **is** built. `014` had to delete its own entry, and the comparison was
red until it did.

Then the control: the route was changed from `api/me` to `api/mine` and rebuilt with
`--no-incremental`.

```text
Failed: 2, Passed: 3

  Every_built_endpoint_appears_in_a_frozen_contract
      … but found at least one item {"PUT /api/mine/language"}

  Every_contracted_endpoint_is_built_or_named_as_pending
      … but found at least one item {"PUT /api/me/language"}
```

**Both directions fired at once**, which is what a two-way comparison is for: the built path is
described by nothing, and the frozen contract describes nothing built. Reverted, rebuilt, whole
suite: **533 / 533.**

---

## Deliberately not conflict, not concurrency

| Decision | Why |
|---|---|
| Same language twice is `204`, not `409` | `012` answers a same-status transition with `409`, and that rule does **not** generalise. A preference is not a state machine and nobody is racing anybody for their own setting |
| No `expectedVersion` | Every other `PUT` here takes one and each guards a shared resource two people can edit. This writes one scalar to the caller's own row, where a lost update means the user's own last click won. Requiring a version would be consistency for its own sake |
| An unknown or inactive subject is `401`, not `404` | The frozen contract, and BR-4.4's reasoning: a `404` tells a caller holding a valid token that the account it names has been removed |

---

## Not claimed

| What | Why |
|---|---|
| **That a user sees the new language without signing in again** | **They do not, and this is the most important limitation of the feature.** The token is signed and immutable, so it carries the old `preferred_language` until the next sign-in. Changing that means re-issuing credentials from a write endpoint, or reading the preference from the database on every request instead of from a claim — both larger decisions than this endpoint, and neither taken. Written in `MeController`'s remarks, in the spec's Q-B, and here |
| The switcher screen | The frontend lane's, as a separate row. This is the split |
| `GET /api/locales` | Still deferred, still in `002c`'s `NotBuiltYet` with its reason: two locales, both known at build time |
| That the Arabic strings are correct | Two more added to the sixty-five nobody who reads Arabic has reviewed. Q-8 |
| That `014` can now start | Its manual Arabic pass needs the **switcher**, not this endpoint. This unblocks the frontend lane, which unblocks `014` |

---

## Frontend half — `FE-014-00`, `03`, `04`, `10` (2026-08-30)

Suite 203 → 214.

### The preview gate found two defects before any wiring

**`English` sat at the far left of an RTL row**, its radio at the right, the whole row width
between them. `dir` was on the language name. Both `dir` and `unicode-bidi: isolate` isolate
the run; only `dir` also rewrites the element direction, and `text-align: start` resolves
against that. `lang` stays — it selects the face. Measured after: both names 17px from their
radio and 54px from the row start, identical across scripts.

**The same defect as the ticket list customer column, in a screen written after that one was
fixed.**

**The preview callout showed nothing changing.** Its stated purpose is that the reader sees
the format change *before* committing to a language they may not be able to read. It used
`dd/MM/yyyy`, which is **byte-identical** in both locales once BR-8.13 pins the digits — it
rendered, changed nothing, and implied it had.

The screen design says `24 August 2026`. Once digits are pinned the **month name is the only
part that can differ**, so `formatDateLong` was added and the callout now reads
`24 أغسطس 2026` against `24 August 2026`. Three tests, including the negative half —
`formatDate(ar) === formatDate(en)` — so nobody simplifies it back.

### `FE-014-10` — measured against the running server, not inferred

Q-7 rests on `?culture=` outranking a stale `preferred_language` claim. `005` rewrote the
provider list, so the assumption was two days old. Checked twice:

1. **Registration**: `QueryStringRequestCultureProvider` is first, ahead of
   `PreferredLanguageCultureProvider`, ahead of `AcceptLanguageHeaderRequestCultureProvider`.
2. **Behaviour**, one token whose claim is `ar`, same request twice:

| Request | `400` title |
|---|---|
| `PUT /api/me/language` | `حدث خطأ أو أكثر في البيانات المُدخلة.` |
| `PUT /api/me/language?culture=en` | `One or more validation errors occurred.` |

**Same token, same claim, different language.** That is the whole mechanism, and reading the
registration alone would not have proved the ordering actually applies.

### The lifetime is the part that could rot

An override that outlived its token would sit at the TOP of BR-8.4's order, above a claim
that is finally correct — the same defect one session later. `clearSessionCulture()` is
called on **both** credential changes:

- **sign-in**, before the preference is adopted, so ordering cannot matter
- **sign-out**, or it survives onto the login screen and onto the sign-in request itself,
  where it would outrank the browser's own `Accept-Language` for a different user

### Negative controls

| Break | Observed |
|---|---|
| Never append the culture | 1 failed — `appends ?culture= to every request once set` |
| `clearSessionCulture()` made a no-op | **3 failed** — the drop test, and both "not set" tests, because the override leaked across cases |
| Failure does not revert the language | 1 failed — `REVERTS when the request fails, and says so` |

### Two things fixed on the way that were nobody's task

- **`useNavigate` was declared after an early return** in `Sidebar` — a conditional hook
  call. eslint caught it; it is now above every return, with the reason written down.
- **`i18n.ts` said "FOUR NAMESPACES"** while registering five. A count in prose goes stale
  the moment the list is edited and nothing fails when it does. Corrected in the same commit
  that added the fifth, which is the only time it is cheap.

### Open

- **The settings area has no shell.** The design shows a sub-nav with `Profile` and
  `Localization`; only the second exists. One screen behind a nav of one item is a section
  that does not exist, and a disabled `Profile` row would promise something the product has
  not. The screen is reached from the user popover, which is the design's other route to it.
- **`FE-014-06`, the Arabic pass over every screen, is not done.** It is the task on the
  critical path and it is bigger than when it was written: login, create ticket, ticket list,
  the detail placeholder, and now this screen.
---

## `FE-014-06` — the Arabic pass, and `FE-014-11`

Run 2026-08-30 on the **real app** against the real API — dev server proxied to a running
`Wasl.Api`, signed in as the seeded Manager, switched to Arabic **through the settings screen**
rather than by forcing a flag.

### `FE-014-11` was already built, and it holds

`locale.css` covers all four points the task names, and keys on **`lang`, not `dir`** — which
is more correct than the task text: the face follows the language, not the direction. Verified
live under `lang="ar"`:

| | Measured |
|---|---|
| Body face | `IBM Plex Sans Arabic` |
| Body line-height | `28px` = 16 × `--leading-ar-normal` (1.75) |
| Cap-height trim | `text-box-trim: none` |
| Arabic leaf nodes tighter than 1.25 | **none**, on any screen |

`letter-spacing` computes as `normal` rather than `0px`, and that is **not** a defect: Chrome
serialises `letter-spacing: 0` as `normal`. Checked before reporting it as one.

### The defect the pass found

**`.panelHeadline` applied `-0.4px` to `كل محادثة، في مكان واحد.`** — negative tracking on
cursive text, which pulls joins together rather than spacing them apart. Worse than the
positive case the rule was written against.

**`locale.css` said "letter-spacing stays 0. PERMANENT." and it was not true.** The rule sat on
`[lang='ar']` and `[lang='ar'] body`, so it was inherited — and **a component class beats an
inherited value**. Every component with its own tracking won under Arabic, silently.

Fixed at the level the claim was made at:

```css
[lang='ar'] *:not([lang]) { letter-spacing: 0; }
```

`:not([lang])` is what keeps it honest. A Latin run inside an Arabic page may legitimately be
tracked — and it says so by declaring its own language, which is correct markup regardless.
The `WASL` wordmark now carries `lang="en"` and keeps its `0.19em`; it is the only tracked
element left under Arabic, and it is tracked **because** it declares what it is.

### Five screens, measured not eyeballed

| Screen | Tracked under Arabic | Arabic lines < 1.25 |
|---|---|---|
| `/login` | only the `lang="en"` wordmark | none |
| `/tickets` | none | none |
| `/tickets/new` | none | none |
| `/settings/localization` | none | none |
| `/tickets/:id`, `/` | none | none |

### `FE-014-04` and `FE-014-10`, end to end in the real app

Switching through the settings screen: `lang` `en` → `ar`, `dir` `ltr` → `rtl`, the preview
callout re-rendered to `24 أغسطس 2026 · 1,250`, no error.

Then the override, **on the wire** rather than in a unit test:

```
/api/tickets?page=1&pageSize=20&culture=ar
/api/tickets?page=1&pageSize=20&culture=ar
```

Every API call after the switch carried it. The unit tests assert the mechanism; this is the
only thing that shows it survives the client, the proxy and the router.

### Noted

The seeded Manager's stored preference is now `en` rather than `ar` — changed by the earlier
endpoint measurements (`ar`, `en`, `ar-SA`, `AR` in that order, so `en` was the last accepted
value). Not a defect and not seed drift to chase: the feature working. Recorded because a
later reader will find the seed and the database disagreeing.