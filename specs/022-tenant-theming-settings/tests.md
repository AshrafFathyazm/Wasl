# 022 — Verification

**Phase:** 6 · **Role:** Verification · **Date:** 2026-09-27 … 2026-10-04

Every figure below was observed in a run. Nothing here is asserted from memory.

## Build

```text
dotnet build --no-incremental
Build succeeded.
    0 Warning(s)
    0 Error(s)
```

**The first two attempts reported `111 Warning(s)` and `6 Error(s)`, and neither number was
real.** Both were `MSB3027` file locks: a `Wasl.Api` process and an orphaned `testhost` from a
previous session still held the DLLs. `CLAUDE.md` names the stale-process hazard for a build and
for a measurement; this is the third shape of it, and the tell is the same — **the failures did
not match the change.** Killed by port owner (`Get-NetTCPConnection -LocalPort 5272` →
`OwningProcess`), then by pid for the testhost, and the build was clean on the next run.

```text
cd src/wasl-web
npx tsc -b --force     (no output)
npx eslint src --max-warnings=0     (no output)
```

## Tests

| Suite | Result |
|---|---|
| `tests/Wasl.Domain.Tests` | **330 passed**, 0 failed (was 245 before `022`) |
| `tests/Wasl.Application.Tests` | **46 passed**, 0 failed |
| `tests/Wasl.Api.IntegrationTests` | **615 passed**, 0 failed, 1 m 45 s (was 591) |
| **Backend total** | **991** |
| `npx vitest run` | **1416 passed** in **61 files** (was 1325 in 57) |

The integration suite was run **whole**, not filtered — `--filter` was used only to diagnose the
one failure below and the full run followed it.

## Acceptance Criteria Traceability

| AC | Test or measurement | Result |
|---|---|---|
| AC-1 | `BrandingTests.The_seeded_default_is_returned_and_there_is_no_not_configured_state` | **Pass** |
| AC-2 | `…An_unauthenticated_read_is_refused` · `…An_agent_may_read_the_branding` | **Pass** |
| AC-3 | `…The_token_responses_theme_equals_the_branding_read_field_for_field` — one test calling both and comparing `GetRawText()`, not two shape assertions | **Pass** |
| AC-4 | `…A_manager_changes_the_branding_and_the_server_recomputes_the_foreground` · `…A_lower_case_colour_is_normalised_on_the_way_in` | **Pass** |
| AC-5 | `…An_agent_cannot_change_the_branding` — `403`, enveloped body, stored row byte-identical | **Pass** |
| AC-6 | `…A_stale_version_is_refused_and_the_row_is_untouched` | **Pass** |
| AC-7 | `…A_malformed_colour_is_a_validation_failure_naming_the_field` (×6) · `BrandContrastTests.A_malformed_colour_is_refused` (×8) | **Pass** |
| AC-8 | `…A_refused_colour_carries_the_gate_and_the_measured_ratios` (×2) · `…The_refusals_numbers_are_identical_in_arabic_and_its_sentences_are_not` | **Pass** |
| AC-9 | `BrandContrastTests.The_refusal_band_is_derived_from_the_candidate_foregrounds` — band computed from the two foregrounds and printed | **Pass** |
| AC-10 | `…An_accepted_colour_carries_the_better_foreground_at_or_above_the_threshold`, per fixture row | **Pass** |
| AC-11 | The nine-row fixture — accepted-with-white, accepted-with-ink, refused-by-text, refused-by-surface | **Pass** |
| AC-12 | `#FFF59D` and `#FFC107` refused by `surface` | **Pass** |
| AC-13 | `…An_accepted_colours_hover_and_active_states_are_also_readable` · `…The_ramp_never_moves_toward_the_foreground` | **Pass** |
| AC-14 | `…An_unknown_sidebar_mode_is_refused` (×4, including the numeric spelling) | **Pass** |
| AC-15 | `BrandSidebarContrastTests` — 1800 accepted brands, every text token at full strength, worst `#559911` at exactly 4.50:1. **Was partial and then FAILED when measured** — see finding 9. The border half is open as Q-I | **Pass (text)** |
| AC-16 | Measured in a browser: 60 fixed tokens snapshotted, `--brand` changed to `#B91C1C`, **0 drifted** · `theme.test.ts` *writes nothing else at all* | **Pass** |
| AC-17 | Measured in a browser: `theme-applied` at **52.9 ms**, `first-contentful-paint` at **476 ms** | **Pass** |
| AC-18 | `theme.test.ts` `paintsTheSame` (×5) · `BrandingPage.test.tsx` *applies the theme and stores it for the next load* | **Pass** |
| AC-19 | The cache is written on sign-in and on save; a device with a stale copy paints it and is corrected once. **Argued, not measured across two devices** | **Partial** |
| AC-20 | `BrandingPage.test.tsx` *states that status colours are fixed, with no interaction* — asserts `toBeVisible` with no interaction | **Pass** |
| AC-21 | `…announces the refusal politely` — `aria-live="polite"` region carries the ratios as text | **Pass** |
| AC-22 | `…offers the colour as text, not only as a swatch` | **Pass** |
| AC-23 | Every integration refusal goes through HTTP, not the form. The client has **no contrast gate at all** | **Pass** |
| AC-24 | Measured in a browser after a fix: root `colorScheme: "light"`, sidebar `colorScheme: "dark"` | **Pass** |
| AC-25 | `…Exactly_one_settings_row_exists_and_a_second_insert_is_refused` · `…The_single_row_constraint_is_on_the_applied_table` | **Pass** |
| AC-26 | `…A_successful_change_writes_one_audit_row_naming_the_colour` — asserts `Changes` **content**, not presence | **Pass** |
| AC-27 | 47 keys in each catalogue, verified equal by key set. Arabic walked in a browser | **Pass** |

One criterion is **not fully claimed**: AC-19, in **Not Tested** with the reason. AC-15's text
half is met; its border half is Q-I, open.

## The oklab ramp, checked against the thing that renders

The gate computes `color-mix(in oklab, …)` in C# to judge a colour's hover state. **If that
arithmetic disagrees with the browser, the gate accepts colours whose real hover state fails,
with a green build.** So it was checked against Chrome 154 rather than against itself:

```text
colour     C# hover   Chrome hover   C# active   Chrome active
#1D174D    #323162    #323162        #140F39     #140F39
#1570EF    #3A83F3    #3A83F3        #0D54B7     #0D54B7
#4A9E96    #63A9A2    #63A9A2        #377872     #377872
#808080    #8E8E8E    #8E8E8E        #616161     #616161
#FFF59D    #FFF6AA    #FFF6AA        #C4BC77     #C4BC77
#FFFFFF    #FFFFFF    #FFFFFF        #C4C4C4     #C4C4C4
#000000    #060606    #060606        #000000     #000000
#2E7D32    #4A8C4B    #4A8C4B        #215E24     #215E24
#FF6B00    #FF803D    #FF803D        #C45000     #C45000
#FFC107    #FFC94A    #FFC94A        #C49404     #C49404
```

**All twenty byte-identical.** Pinned as `BrandContrastTests.The_oklab_mix_matches_what_a_browser_computes`.

**The first attempt to read those values produced confident nonsense.** It read
`getComputedStyle(el).color`, which returns `oklab(0.647882 0.0000295174 0.0000129533)` for a
mix — a plain number regex over that mis-slots every channel, and it reported `#000000` and
`#010000` for every colour. The working probe paints onto a 1×1 canvas and samples the pixel.
Same failure shape `037` recorded for SVG arc flags, and it reported *something* rather than
erroring.

## Findings

### 1. The hover gate refused almost every colour, and the ramp was the cause

**The feature's largest finding, and it was a product decision rather than a bug fix.** With
`006`'s ramp as shipped — `--brand-hover: color-mix(in oklab, var(--brand) 88%, white)`, which
lightens unconditionally — the gate refused:

```text
colour     on-brand   base    hover   verdict
#1570EF    #FFFFFF     4.57    3.66   refused by Hover
#4A9E96    #0D2626     5.01    3.10   refused by Hover
#2E7D32    #FFFFFF     5.13    4.07   refused by Hover   ← the frozen contract's own PUT example
#FF6B00    #0D2626     5.56    3.41   refused by Hover
```

Only `#1D174D` and `#000000` passed. **The default brand is the one colour the old ramp could
not break, which is why nobody had seen it:** the house navy is nearly black, so lightening it by
12% barely moves its contrast against white text.

Both colours `spec.md` AC-11 names as *accepted* were refused. Put to the product owner with the
measured table and the candidate remedy; **ruled: fix the ramp direction in `022`.** Hover and
active now move *away* from the chosen foreground, so contrast is monotonic. After the change
every fixture verdict matches AC-11 as written, and the only remaining refusals are `text` and
`surface` — the gates the spec intends.

### 2. AC-24 failed in a browser, and no test could have caught it

The Dark preset's `color-scheme: dark` was declared beside its colours under
`[data-sidebar-mode='dark']`. **That attribute is on `:root`** — it must be, because the
pre-paint script runs before the sidebar element exists — so the dark scheme applied to the
**whole document**:

```text
before:  rootColorScheme "dark"   sidebarColorScheme "dark"
after:   rootColorScheme "light"  sidebarColorScheme "dark"
```

`DESIGN-BRIEF.md` rule 16 broken, every form control and scrollbar in the product repainted. **The
sidebar looked correct the entire time**, because the token *values* were right; the defect was in
the one property that inherits differently from a custom property. Moved into
`Sidebar.module.css`, scoped to the element.

**jsdom computes no cascade and no `color-scheme`**, so no vitest assertion could distinguish the
broken state from the fixed one. AC-24 exists because this reads as a rendering bug.

### 3. Four invented token names in one stylesheet, each failing silently — and a guard

`var(--does-not-exist)` is not an error: the declaration is dropped and the element renders
without it. `022` wrote four plausible names that do not exist —
`--state-danger-subtle`, `--state-danger-border`, `--state-warning-subtle`, `--leading-relaxed` —
and the refusal panel shipped to a browser **with no background and no border** while `tsc`,
`eslint` and 1359 vitest tests were all green. Three more followed (`--space-5`,
`--type-title-lg`, `--red-200`) in a scale that jumps 4 → 6 and names its sizes `--type-title-1`.

`tokenReferences.test.ts` now scans every `.css` file in `src/`. **`032` had already built this
idea and scoped it to two files in one folder** — its own comment says *"the guard would have
found it; a reader did."* Repo-wide, it immediately found four more in **shipped** stylesheets:

| File | Token | Owner |
|---|---|---|
| `CreateTicket.module.css` (×2) | `--font-mono` | `024` |
| `TicketFilterBar.module.css` | `--surface-raised` | `026` |
| `TicketMessagesPanel.module.css` | `--space-5`, `--surface-default` | **`021` — mine** |

All four fixed. `--font-mono` was **added** rather than deleted: the design asks for a monospace
ticket number and the token had been referenced for longer than it had existed.

**A guard scoped to one folder only protects one folder.**

### 4. The guard went red on four correct declarations, and nearly got them "fixed"

Its first form matched any `var(--name` and reported `--menu-max-block-size`, `--seg-shadow`,
`--motion-fast` and `--motion-ease`. **Every one is written `var(--token, <fallback>)` on
purpose** — the property is published at runtime by a component when it has something to say and
is deliberately absent otherwise, and `Dropdown.module.css` says exactly that in a comment two
lines above its own use.

A `var()` with a fallback cannot silently drop; that is the CSS way to declare "this may not
exist". The pattern requires a closing paren now, and the control asserts the fallback form is
**not** reported alongside the two that should be. `CLAUDE.md`: *a guard that goes red on a
legitimate case gets loosened wholesale.* This one was narrowed instead.

### 5. The radio was 474 × 47 px, and it was the base stylesheet

Reported as "the design is bad". Measured rather than restyled by eye:

```text
radioRect   { width: 474.36, height: 47 }
matched by  input, select, textarea { block-size: var(--field-height-md);
                                      padding-inline: var(--space-3);
                                      inline-size: 100% }
```

A rule written for text fields, and a radio is an `input`. The fix is an explicit reset plus
`flex: none` — not a smaller size, because the control was *stretched*, not mis-sized.

### 6. A test asserted two different things said the same sentence

After the toast was added, `BrandingPage.test.tsx` failed with *"Found multiple elements with the
text: Branding saved."* — the inline confirmation line and the toast both said it. **The right
failure:** two acknowledgements of one action is a screen telling the reader the same thing
twice. The inline line was removed rather than renamed, and the test now asserts there is exactly
one.

### 7. The Arabic refusal test used the wrong lever

`The_refusals_numbers_are_identical_in_arabic_and_its_sentences_are_not` sent
`Accept-Language: en` and `ar` and asserted the titles differed. **Both came back Arabic**, which
reads at a glance like the localization being broken.

It is not. The seeded Manager's token carries `preferred_language: ar`, and `005` orders the
providers **query → claim → header** — the stored preference beats the browser's ask, which is
`014`'s designed behaviour. Switched to `?culture=`, the override that exists above both for
exactly this. **Recorded rather than quietly changed**, because "the test used the wrong lever"
and "the server ignores `Accept-Language`" produce the same red line.

### 8. A migration generated with `--no-build` was empty

`dotnet ef migrations add … --no-build` produced `Up()` and `Down()` with no body, because it
read a stale assembly that had no `OrganizationSettings` in its model. Nothing errored. Removed
and regenerated against a real build. Same family as `CLAUDE.md`'s stale-binary rule, in a tool
that rule does not name.

### 9. AC-15 was recorded "partial" on a reasoned number, and measuring it disproved it

The first delivery recorded AC-15 as partial and called `--sidebar-muted` — `--on-brand` at
72% opacity in the Brand preset — *"the one number in this feature a reader should
distrust"*. Measured on 2026-10-04, over every colour the gate accepts in a 16-step sweep of
the sRGB cube:

```text
accepted brands measured: 1800
brand #EE0000  on-brand #FFFFFF  muted #FAB8B8  2.72:1   ← worst
below 4.5:1 — 1079 of 1800
```

**Not a tuning problem, and the second measurement is what shows it.** The accepted brand with
the least headroom sits at exactly the threshold:

```text
#559911 — 4.50:1 at full strength
  at 99%: 4.45:1
  at 95%: 4.22:1
  at 85%: 3.70:1
  at 72%: 3.03:1
```

Any opacity below 100% blends the text toward its own background, so for a brand on the
boundary **every** alpha below 1 fails. No percentage works for every accepted colour. **AC-15
had already said so in words** — *"mixed foregrounds are used only for borders and dividers,
which are non-text"* — and the first implementation used one for text.

Fixed by making `--sidebar-muted` the full foreground in the Brand preset; muted roles are
distinguished by size and weight, which `Sidebar.module.css` already sets. Four tests in
`BrandSidebarContrastTests`, and the guard **reads `tokens.css`** rather than a constant —
a constant beside the stylesheet is how the 72% survived, because its comment and its
arithmetic disagreed and nothing compared them.

**Negative control:** the 72% declaration put back → the guard red, naming the property and
pointing at the boundary test. Restored → green.

**The border half is Q-I, and it is open.** AC-15 says borders are *"held to 3:1"*. The 20%
border measures **1.14:1 to 1.91:1** across the same 1800 brands — but the Light sidebar's
`--border-subtle` on white has never met 3:1 either, and the product has shipped with it since
`023`. Recorded in `spec.md` rather than resolved by restyling the shipped default.

## Live-server verification

API on `:5272`, real SQL Server via compose, schema applied with `-- --provision` first (`021`'s
lesson: a generated migration is not an applied one, and the integration suite cannot tell you).

**The token response carries the theme (AC-3):**

```json
{"brandColor":"#1D174D","onBrand":"#FFFFFF","sidebarMode":"Light",
 "updatedAtUtc":"2026-09-27T00:00:00Z","version":"AAAAAAABftE="}
```

**The Arabic refusal (AC-8, AC-21), sent as UTF-8 bytes with an explicit charset:**

```json
{"type":"https://wasl.local/errors/inaccessible-brand-color",
 "title":"لا يمكن استخدام هذا اللون.",
 "detail":"لا يوجد لون نص متاح يحقق التباين المطلوب مع هذا اللون. اختر درجة أغمق أو أفتح.",
 "status":400,
 "errors":{"brandColor":["لا يوجد لون نص متاح يحقق التباين المطلوب مع هذا اللون. …"]},
 "refusedBy":"text","bestContrastRatio":4.02,"requiredContrastRatio":4.5,
 "surfaceContrastRatio":3.95,"requiredSurfaceContrastRatio":3}
```

Sentences Arabic; `type`, `refusedBy` and all four numbers untranslated. **`4.02` and `3.95` are
the exact values the frozen contract's own example shows** — written before the gate existed, and
reproduced by it.

## Browser measurements

| What | Observed |
|---|---|
| AC-17 paint order | `theme-applied` **52.9 ms**, `first-contentful-paint` **476 ms** |
| AC-16 fixed tokens | 60 tokens snapshotted, `--brand` → `#B91C1C`, **0 drifted** |
| AC-24 before the fix | root `dark`, sidebar `dark` — **failed** |
| AC-24 after the fix | root `light`, sidebar `dark`, sidebar background `rgb(13, 20, 32)` |
| Radio before | 474 × 47 px |
| Radio after | 18 × 18 px; rows 676 × 83; no horizontal page scroll |
| Hex field | capped at 240px beside a 56px swatch |

Arabic walked end to end: sub-nav, both legends, three preset rows with hints, the fixed-tokens
paragraph, and a live refusal with its ratios.

## Negative controls

| # | What was broken | Expected | Observed |
|---|---|---|---|
| C1 | `--state-danger-subtle` and friends, as written | `tokenReferences` red | **Red, naming all four.** Not staged — this is how they were found |
| C2 | The reference pattern without the closing-paren requirement | Nothing, ideally | **Red on four CORRECT declarations** that carry fallbacks. The guard was narrowed, not the code |
| C3 | A misspelled token planted beside a real one and a fallback form | Only the misspelled one reported | **Exactly `['--space-5', '--state-danger-subtle']`** — discriminates, rather than flagging everything |
| C4 | A token named only inside a comment | Not reported | **Not reported.** The stripper runs |
| C5 | `color-scheme: dark` under the root attribute | Root scheme stays `light` | **Root went `dark`.** AC-24's real failure, found in a browser |
| C6 | The scanner pointed at a non-existent directory | Fail loudly | **Collection error, no tests ran** — `008`'s rule: a scanner that found nothing must not report success |

## Not Tested

| What | Why |
|---|---|
| **AC-19 — a brand changed on device A appears on device B's next load** | **Partial.** One device was exercised. The mechanism is the same `localStorage` read the single-device path uses and the corrective write is tested in `theme.test.ts`, but no two-device run happened |
| Keyboard-only and screen-reader walk of the settings form | Not done. The same gap `016` and `021` each recorded — **three features now**, which makes it a standing task rather than an omission |
| A concurrent `PUT` from two Managers on one version | The sequential stale-version case passes and the mechanism is `rowversion`, unchanged since `007` AC-13. Two in-flight requests are untested |
| The `@supports` fallback for a browser without `color-mix` | Belongs to `006` with the ramp (`research.md` R-4, REV-022-02). `022` makes the ramp tenant-variable and is the first place its absence could be observed — a reason to report it, not to own it |
| That the browser's `color-mix(in oklab, …)` is correct | Testing the engine. What *is* tested is that our arithmetic agrees with it |
