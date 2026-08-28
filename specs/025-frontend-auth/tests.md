# 025 — Evidence

**Run 2026-08-28.** Every row below was **observed**, not asserted from memory. Where a
measurement turned out to be lying, that is recorded too — three of them did.

Environment: Vite dev on `:5173`, API on `127.0.0.1:5272` (`--no-build`), SQL Server in
`wasl-db`. Driven through Chrome DevTools MCP.

**The API had to be started detached.** Run as a child of the tool shell it was reaped
mid-session — twice, and the second time it presented as `502 Bad Gateway` rendered in the
form's error block, which reads exactly like an application defect. Noted because the next
person will hit it.

---

## 1 · Gates

| Gate | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit -p tsconfig.app.json` | clean |
| ESLint | `npm run lint` | clean |
| stylelint | `npm run lint:css` | clean (one failure fixed — below) |
| Locale parity | `node scripts/check-locale-parity.mjs` | `ar, en · 4 namespaces · 82 keys compared` |
| Domain types | `node scripts/check-no-domain-types.mjs` | `✓ no hand-written domain types outside src/lib/api-types.provisional.ts` |
| Unit tests | `npm run test -- --run` | `2 files, 11 passed` — `023`/`024`'s suites, unbroken |
| Build | `npm run build` | `✓ built in 738ms`, `LoginPage-a3Ep-8JU.js 5.94 kB` |

`stylelint` failed once on `border-width: 0 0 2px 0` (`shorthand-property-no-redundant-values`)
in the indeterminate dash. Fixed, re-run clean.

---

## 2 · Acceptance criteria

| AC | How it was exercised | Observed |
|---|---|---|
| **AC-24** | Navigated to `/tickets` signed out | → `/login?returnUrl=%2Ftickets`. Also `/tickets/new` → `returnUrl=%2Ftickets%2Fnew`, encoded. Signed in → landed on `/tickets/new`, **not** a default page |
| **AC-25** | Visited `/login` while signed in | → `/tickets`. No flash: the redirect is a `<Navigate>` during render, not an effect |
| **AC-26 · 1** | `<form onSubmit>` + `type="submit"` | Submit fires the mutation; the button is inside the form |
| **AC-26 · 2** | Read the live DOM | `email` → `name="email"`, `autocomplete="email"`; `password` → `name="password"`, `autocomplete="current-password"` |
| **AC-26 · 3** | Real `401` | `alert atomic live="assertive"` containing the server's sentence. One block, above the submit |
| **AC-26 · 4** | Real `401`, then read `document.activeElement` | `INPUT[name=email]` — **after a fix**, see D-1 |
| **AC-27** | Wrong password against the live API | URL stayed `/login?returnUrl=%2Ftickets`. **No redirect.** Error block rendered, form values kept. Then at module level: handler called **0** times for a `401` from `SIGN_IN_PATH` |
| **AC-28** | Signed in without *remember me*, planted a stale token in `localStorage`, signed out | Both storages cleared — including the planted one the session sign-in never wrote. Back → `/login?returnUrl=%2Ftickets`, no sidebar, no leaked name — **after a fix**, see D-2 |
| **AC-29** | Walked `/login` in `ar` | Panel and form swap sides; seam flips (below); every string from a catalogue; parity gate green |
| **AC-30** | Signed in as `agent2@wasl.local` (`PreferredLanguage = ar`) | `documentElement.lang = "ar"`, `dir = "rtl"`, interface Arabic with no switcher touched |
| **AC-025-01** | `grep -ril "Sara Al-Otaibi\|CURRENT_USER" dist/` | **Absent.** Shell rendered `نورة السالم` / `agent2@wasl.local`. Negative control below |
| **AC-025-02** | Clicked **تسجيل الخروج** in the popover | Performed AC-28. Before this feature the row rendered and did nothing |
| **AC-025-03** | Instrumented `window.fetch`, drove a real request | `Authorization: Bearer eyJhbGciOiJIUzI1NiIs…` — composed from the response's `tokenType`. `Accept-Language: ar` alongside |
| **AC-025-04** | Tab to the checkbox | Toggles on Space; label is a second target; checked fill `rgb(29,23,77)` = `--navy-900`; ring `0 0 0 3px` at 22%. Square **after a fix**, see D-3 |
| **AC-025-05** | Three parallel requests with a tampered signature | All three `401`. Handler called **exactly 1** time. No loop |

---

## 3 · Defects found by measuring rather than reading

Each looked correct in the source and was wrong in the browser.

| # | Defect | How it presented |
|---|---|---|
| **D-1** | `field.ref` was never forwarded to `Input` from `Controller` | `shouldFocusError: true` was set and did nothing. After a failed submit `document.activeElement` was the **button**; after a `401` it was **`BODY`**, because disabling the inputs mid-request blurs whatever had focus. The prop was present, the option was set, and the behaviour was absent |
| **D-2** | Back after sign-out restored the authenticated shell | `/tickets/new` came back with the sidebar, the nav, and the previous user's real name and email — while both storages were empty. **bfcache**: the restore does not re-mount, so `AuthContext` returned holding its old session and `readSession()` — which runs once, in the state initialiser — never ran again. Fixed with a `pageshow` handler on `event.persisted` |
| **D-3** | The checkbox was not square: **26.4 × 23** | `base.css` gives every `input` a `padding-inline: var(--space-3)`. With `box-sizing: border-box` a 23px box cannot shrink below its own padding plus border, so 12 + 12 + 1.2 + 1.2 = 26.4. Reads as a broken glyph, not as a padding rule |
| **D-4** | `error=""` for "invalid, no message" silently did nothing | `Input`'s `hasError` tests `!== ''`, so an empty string means *no error*: neither input took the danger border and `aria-invalid` never appeared after a `401`. The form looked right and announced nothing. Fixed by adding an explicit `invalid` prop |
| **D-5** | Sign-out ran two redirect mechanisms | `navigate(LOGIN_PATH)` in the popover raced `RequireAuth`. The guard won, so the URL came out `/login?returnUrl=%2Ftickets` rather than the `/login` the line asked for. Removed; the guard is the one mechanism |

---

## 4 · Measurements verified with something below them

The house rule: a measurement that names the wrong thing is worse than none.

| Measurement | Why it could have lied | Control |
|---|---|---|
| `grep -ril "Sara Al-Otaibi" dist/` → absent | An empty `dist/`, a wrong path, or a grep that matches nothing would give the same answer | `grep -o "wasl\.session" dist/assets/index-*.js` → **hit**. The tool can see the bundle, so the absence is real |
| Checkbox focus ring → `oklab(… / 0) 0 0 0 0` | Read after a **programmatic** `.focus()`, which does not satisfy `:focus-visible`. This was a **false negative** and would have been recorded as a missing ring | Re-measured after two real `Tab` presses: `0px 0px 0px 3px` at 22%, and `el.matches(':focus-visible') === true` |
| Panel is decorative | `aria-hidden` alone does not prove nothing inside can take focus — the defect `004` records is five tabbable tiles | `panel.querySelectorAll('a,button,input,[tabindex]').length` → **0** |

---

## 5 · RTL

Read off the live page at `dir="rtl"`, not inferred.

| Concern | Observed |
|---|---|
| Direction | `documentElement.dir = "rtl"`, `lang = "ar"` |
| Halves swap | Panel right, form left |
| **The seam** | `rgba(13,20,38,0.18) -16px 0px 26px -14px inset` — negative under RTL. Unflipped it lands on the outer edge and reads as a stray line, not a bug |
| The mark | `getComputedStyle(svg).transform === "none"` — does **not** mirror |
| Sidebar | Inline-end after sign-in |
| Caps Lock hint | `مفتاح Caps Lock مُفعّل`, and `role` is **not** `alert` |
| Digits | Latin in the Arabic length messages (`320`, `256`) per ADR-007 §7 — Arabic-Indic digits were written first and corrected |

---

## 6 · A defect in `004`, not in this feature

**Reported, not worked around.** The frontend renders the server's `401` `title` as
received, which is what the contract instructs.

`contracts/auth-api.md` § *`401` — rejected credentials* specifies:

```json
{ "title": "Email or password is incorrect.", "status": 401 }
```

What `POST /api/auth/token` actually returns:

```json
{
  "type": "https://wasl.local/errors/unauthenticated",
  "title": "Authentication is required.",
  "status": 401,
  "detail": "Error.Auth.InvalidCredentials"
}
```

Two problems, and both are the backend's:

1. **`title` is the wrong one.** "Authentication is required." is the sentence for a
   missing token on a protected endpoint. On the sign-in form it tells a user who has just
   typed a password that authentication is required — and it is what the screen currently
   displays, because the contract says to render what arrives.
2. **`detail` is a raw resource key**, `Error.Auth.InvalidCredentials`, not a localized
   sentence. BR-8.6 says `detail` is translated. It is untranslated in both locales.

Per `CLAUDE.md` — *a difference is a defect in one of the two, never fixed silently* — no
client-side override was added. `auth:error.invalid` exists as the mirror and is used only
when the body carries no usable `title`.

---

## 7 · Not verified

Stated so the gap is a decision rather than an omission.

1. **A genuine Caps Lock keypress.** The hint was exercised by dispatching `keyup` with
   `getModifierState` overridden, which proves the wiring and the rendering. A real
   physical Caps Lock toggle was not performed.
2. **`prefers-reduced-motion`.** Nothing on `/login` animates in this build, so there is
   nothing to disable. Carried forward from `023` unchanged.
3. **The screen below 780px.** The `@container` breakpoint is implemented and was not
   rendered at that width.
4. **A password manager actually filling.** `name` and `autocomplete` were read off the
   DOM; no manager was installed to confirm the fill.
5. **No automated test was written for this feature.** Every result above is a manual
   observation, and repeating them is manual. The five in §3 are the ones that most
   deserve a regression test.

---

## 8 · Second pass — 2026-08-28, after the reference comparison

The product owner compared the screen against `wasl_login_final_with_brand.html` and found
the plain build incomplete. What follows was added and re-observed.

### The gap, split by cause

| Item | Was it deferred, or missed? |
|---|---|
| Mesh, aurora, grain, halo, hub, five channel tiles, drag physics, entrance animation | **Deferred.** `004/frontend-spec.md` puts every one in the Phase 6 column |
| Language switcher (`EN`) | **Deferred.** `004/frontend-spec.md` assigns it to `014` |
| Form-side brand lockup — 40px tile + وصل/WASL | **Missed.** `01-login.md` Elements: "Form \| Mark tile \| MarkTile \| 38px" |
| Placeholders on both fields | **Missed.** In the reference |
| Subtitle copy | **Missed.** Reference reads "Welcome back…"; the build had "Enter your credentials to continue" |
| `Email address` label | **Missed.** Build had "Email" |
| Footer `© 2026 Wasl` | **Missed.** In the reference |

### Password reveal — new, not from the reference

`grep -n "eye\|reveal\|toggle"` over the reference returns **nothing**: the toggle is not
in it, and no screen spec asks for one. It is a product-owner request of 2026-08-28.
`IconEye` / `IconEyeOff` were authored in `icons-added.tsx` and labelled `(D)`.

| Check | Observed |
|---|---|
| Type flips | `password` → `text` → `password` |
| `aria-pressed` | `false` → `true` |
| Accessible name | `Show password` → `Hide password` |
| `aria-controls` | resolves to the input's own `id` |
| `dir` while revealed | stays `ltr` — a revealed password must not start following `dir="auto"` and jump ends |
| Background | `rgba(0,0,0,0)` — see D-6 |

### D-6 — the reveal button rendered as a solid navy square

`base.css` gives every `button` the primary fill. The toggle is an affix inside a field,
not an action, and it inherited `rgb(29, 23, 77)` with white icon. Measured, not guessed.
Fixed with `!important` on `background` and `color` — the same override `Button.module.css`
documents, for the same reason.

### Submit gated on both fields

Overrides `004/frontend-spec.md`'s "empty form, submit enabled". Five states driven through
the native value setter so React's `onChange` fires:

| Form state | `button.disabled` |
|---|---|
| Both empty | `true` |
| Email only | `true` |
| Both filled | `false` |
| Password of **three spaces** only | `false` — whitespace is a valid password |
| Password cleared again | `true` |

### Gates, re-run

`tsc` clean · ESLint clean · stylelint clean after one fix
(`declaration-block-no-redundant-longhand-properties` on `margin-block`) ·
locale parity `87 keys` · domain types clean.

---

## 9 · Regression tests — 2026-08-28

**71 tests across 9 files** (`11 → 71`). The rule this closes is the house one: *a defect
found by manual observation, with no test, comes back and nobody notices.*

### Every guard was observed failing before it was trusted

CLAUDE.md: *a guard that has never been seen to fail has not been verified.* Each fix below
was reverted on purpose, its test was watched go red, and the fix was restored. The tree
was then checked clean of the deliberate breakage.

| # | What was broken | Verdict |
|---|---|---|
| 1 | Removed `path !== SIGN_IN_PATH` from the interceptor | **RED** |
| 2 | Removed the burst guard, so every 401 fires the handler | **RED** |
| 3 | Hard-coded `Bearer ` instead of composing from `tokenType` | **RED** |
| 4 | Made `clearSession` write to one backend | **RED** |
| 5 | Made the `pageshow` handler re-use the in-memory session | **RED** |
| 6 | Removed the focus call after a rejected credential | **RED** |
| 7 | Reverted `invalid` back to `error=""` | **RED** |
| 8 | Removed the checkbox's `padding: 0` reset | **RED** |
| 9 | Removed `-webkit-text-fill-color` from the language button | **RED** |
| 10 | Removed `direction: ltr` from the panel | **RED** |
| 11 | Removed the `//host` check from `safeReturnPath` | **RED** |
| 12 | Removed the temporary 401 catalogue branch | **RED** |

`12/12 guards observed failing.`

### What is covered

| File | Tests | Covers |
|---|---|---|
| `lib/tokenStorage.test.ts` | 10 | AC-28 both-storage clear · the remember→session switch · malformed and hostile stored shapes · Arabic name round-trip |
| `lib/api.test.ts` | 9 | **AC-27** the `SIGN_IN_PATH` exclusion, including that it is a path match and not a substring · **AC-025-05** burst collapse and re-arm · **AC-025-03** the header follows a *changed* `tokenType` |
| `features/auth/guards.test.ts` | 11 | The open redirect: `//host`, `/\host`, absolute URLs, `javascript:`, `data:` · query and hash preserved |
| `features/auth/AuthContext.test.tsx` | 4 | **D-2 bfcache** · that a non-persisted `pageshow` is ignored · that the session is read on the *first* render, not in an effect |
| `features/auth/LoginForm.test.tsx` | 13 | **D-1** focus · **D-4** `aria-invalid` on both fields with no field message · AC-26 `name`/`autocomplete` · the submit gate incl. a whitespace-only password · the reveal toggle |
| `features/auth/LoginPage.test.tsx` | 5 | AC-27 at screen level · the **temporary** 401 override · a transport failure saying something different |
| `features/auth/styleRegressions.test.ts` | 8 | D-3, D-6, D-7 — **as source proxies, not layout** |

### The honest limit on three of them

D-3, D-6 and D-7 were all found by **measuring a real browser**, and jsdom can reproduce
none of them: it does no layout, `getBoundingClientRect()` returns zeroes, and it will not
tell you that `-webkit-text-fill-color` beat `color`. `styleRegressions.test.ts` therefore
asserts that the **fix is still in the stylesheet** — it catches the fix being deleted,
renamed, or refactored away, which is the realistic regression for a one-line change whose
purpose is not obvious from reading it. It does **not** catch the defect returning by
another route: a new rule re-introducing the padding, a different selector winning, a token
changing underneath.

The file says this in its own header, because a measurement that names the wrong thing is
worse than no measurement. The real answer is a browser-driven visual check in CI, and that
does not exist in this project.

### Two test-authoring mistakes worth recording

- The first D-1 test focused the submit button on an **empty** form — where the button is
  disabled and cannot take focus. The test failed for its own reason, not the code's.
  Rewritten to the realistic sequence: both fields filled, submit focused, then the 401.
- The first `LoginPage` suite rendered without `AuthProvider`, and `useAuth` threw. That is
  the guard working as designed — it throws rather than returning a signed-out default,
  precisely so a component mounted outside the tree does not silently look logged out.

