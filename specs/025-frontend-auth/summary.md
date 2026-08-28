# 025 — Summary

**Delivered** 2026-08-28 · Frontend lane only · Evidence: [`tests.md`](tests.md)

Nothing in `src/Wasl.Api`, `src/Wasl.Application`, `src/Wasl.Domain`,
`src/Wasl.Infrastructure`, or `tests/` was created or changed. No `dotnet` command was run
except to **start** the API so this feature could be exercised against a real backend.

Before this feature the frontend was broken against its own backend: `004` landed on
2026-08-27 with `[Authorize]` on every ticket endpoint and `RequireAuthenticatedUser` as
the fallback policy, while the client attached no credential. Every request it made
returned `401`.

---

## What was built

| Area | Files |
|---|---|
| **Session** | `lib/tokenStorage.ts` — one read, one write, one clear; clear always writes to **both** backends |
| **Identity** | `features/auth/AuthContext.tsx` — storage read once in the state initialiser, never in an effect |
| **Guards** | `features/auth/guards.tsx` — `RequireAuth`, `RedirectIfSignedIn`, `safeReturnPath` |
| **Screen** | `LoginPage` · `LoginForm` · `BrandPanel` · `Login.module.css` · `signIn.schema.ts` · `auth.api.ts` |
| **Primitive** | `components/Checkbox/` — the eighth on ADR-009's list |
| **Transport** | `lib/api.ts` — bearer header, the `401` interceptor, the `SIGN_IN_PATH` exclusion |
| **Types** | `SupportRole` · `AuthenticatedUser` · `SignInRequest` · `SignInResponse` in the provisional register |
| **Wiring** | `routes.tsx` (two route groups) · `main.tsx` (provider outside the router) · `shell/Sidebar.tsx` · `shell/currentUser.ts` |
| **Copy** | `locales/{en,ar}/auth.json` — `1 → 23` keys, parity green |

---

## Decisions that are not obvious from the code

### The guard wraps the shell from outside, not inside

A signed-out visitor must never see the shell paint before the redirect. Guarding inside
`AppShell` renders the frame first and replaces it a moment later, which is AC-25's flash
in different clothes. The nesting also makes every new route protected **by default** — the
same shape as the backend's fallback policy, and for the same reason.

### `SIGN_IN_PATH` is a constant, imported by both sides

`auth.api.ts` posts to it and `api.ts` excludes it. Two copies of that string would drift,
and the moment they drift the interceptor stops excluding the endpoint it exists to
exclude — with no error anywhere. AC-27 is one comparison, and this is what keeps the two
sides of it in step.

### The `401` handler clears but never navigates

`RequireAuth` already redirects when `isSignedIn` goes false. A second navigation from the
handler races it, and the loser wins non-deterministically. **This was not theoretical** —
the sign-out path had exactly that bug and the race was visible in the URL (D-5).

### `UserRole` moved rather than being re-declared

It is a contract enum, so it belongs in the provisional register — the only file permitted
to declare one. `023` recorded that the ADR-011 §6 gate caught it lowercase and that the
compiler could not have. A second copy would be a second chance at that.

### `password` gets `dir="ltr"`, everything else keeps `dir="auto"`

`auto` reads direction from the first strong character. A password field renders dots —
there is no strong character, so it falls back to the paragraph direction and the caret
jumps ends mid-entry under RTL. A password is not language content.

---

## Deviations from the approved spec

| Deviation | Why |
|---|---|
| **`Input` gained `type`, `name`, `autoComplete`, `onKeyUp`** | The spec assumed the primitive could express a password field. It could not: `type` was hard-coded to `text` and there was no `name` or `autoComplete`. AC-26 makes all three mandatory. The alternative was a hand-rolled `<input>` on `/login` — a second implementation of a field, disagreeing about focus, errors, and bidi |
| **`Input` gained `invalid`** | The spec's "both inputs take the danger border, neither is told why" had no way to be expressed. `error=""` silently means *no error* (D-4) |
| **`Checkbox` supports `indeterminate`, which has no consumer** | `component-inventory.md` names it as one of five required states and the primitive is built once. First real consumer is `015`'s select-all |
| **Sign-out does not navigate** | See above. The spec's §3 row 9 says "redirect `/login`"; the guard does it |
| **`forgot?` is a `<details>`, not a link** | There is no reset flow (ADR-005), so a link has nowhere to go and a modal is a dialog for one sentence. Native disclosure is keyboard reachable and needs no state |
| **The form-side lockup, placeholders, subtitle copy, and footer were missing** | Caught by the product owner comparing the screen against `wasl_login_final_with_brand.html`. Not Phase 6 content — the plain build owed all four, and `01-login.md`'s Elements table names the mark tile. The cause is mine: I built from the two spec documents and never opened the reference beside them |
| **A password show/hide toggle** | Asked for 2026-08-28. Not in the reference and not in any screen spec. `IconEye` / `IconEyeOff` authored in `icons-added.tsx` — the inherited set has no eye — and labelled `(D)` per DESIGN-BRIEF rule 3. The toggle lives in the `Input` primitive because it is a property of a password field, not of one form |
| **Submit disabled until both fields are non-empty** | Asked for 2026-08-28, and it **overrides** `004/frontend-spec.md`'s "empty form, submit enabled". Gated on presence, never validity. See `spec.md` §7b for the Enter-key consequence |
| **`auth:validation.*` keys instead of the shared `errors.maxLength`** | That key is stored **flat with a dot in its name** while i18next's separator is also `.`, so which one a lookup resolves is ambiguous — and it interpolates `{{max}}` while `024`'s `message()` helper passes no variables. Raised as Q-7, not fixed here |

---

## Five defects the browser found and the source did not

Full detail in [`tests.md`](tests.md) §3. Each looked correct when read.

| Defect | Presented as |
|---|---|
| `field.ref` never forwarded from `Controller` | `shouldFocusError` set and inert — focus on the **button** after a validation failure, on **`BODY`** after a `401` |
| Back after sign-out restored the authenticated shell | bfcache does not re-mount, so `AuthContext` came back holding its old session while both storages were empty. The previous user's real name and email were on screen |
| Checkbox rendered **26.4 × 23** | `base.css` gives every `input` 12px inline padding; under `border-box` a 23px box cannot shrink below padding + border |
| `error=""` for "invalid, no message" | Did nothing. No danger border, no `aria-invalid`, nothing announced |
| Two redirect mechanisms on sign-out | Guard beat the explicit `navigate`; URL came out with a `returnUrl` the line never asked for |

---

## A defect in `004`, reported not patched

`POST /api/auth/token` returns `title: "Authentication is required."` where the frozen
contract specifies `"Email or password is incorrect."`, and `detail` carries the raw
resource key `Error.Auth.InvalidCredentials` instead of a localized sentence (BR-8.6).

The screen renders what arrives, because that is what the contract instructs. Per
`CLAUDE.md`, a difference between contract and implementation is a defect in one of the
two and is never fixed silently — so no client-side override was added. `tests.md` §6 has
the full comparison. **It needs a decision from the backend lane.**

---

## Known limitations

1. **No automated test was written for this feature.** Every result in `tests.md` is a
   manual observation. The five defects above are the ones that most deserve regression
   tests.
2. **The screen below 780px has never been rendered.** The `@container` breakpoint is
   implemented and unseen — the same limitation `023` carries for its drawer.
3. **A real Caps Lock keypress was never made.** The hint was driven by a synthetic
   `keyup` with `getModifierState` overridden, which proves wiring and rendering only.
4. **No password manager was tested.** `name` and `autocomplete` were read off the DOM.
5. **`expiresAtUtc` is stored and unused** (Q-4). No countdown, no pre-emptive sign-out —
   a `401` mid-session is the only signal, which is what ADR-005 accepts.
6. **Two seeded users have unknown passwords.** `manager@wasl.local` and
   `agent@wasl.local` predate this session's configuration and the seeder is idempotent by
   email, so it will not rewrite them. `agent2@wasl.local` was deleted and re-seeded and is
   the working credential. Nothing in the product depends on this; it is a local-database
   state.
7. **`prefers-reduced-motion`** — nothing on `/login` animates, so there is nothing to
   disable. The obligation arrives with Phase 6.

---

## Open questions carried forward

Q-1 default landing (`/tickets`, taken from `004/frontend-spec.md`) · **Q-2 *remember me*
defaults unchecked** — a storage choice is a security posture, so it is opted into ·
Q-3 start-up read is blocking, before first render · Q-4 `expiresAtUtc` unused ·
Q-5 `403` passes through untouched, no consumer until `011`/`016`/`019` ·
Q-6 shadow and motion literals, marked `TODO`, gathered under `023` Q-8 ·
**Q-7 (new) the `errors.maxLength` key is flat-with-a-dot and interpolates a variable
nobody passes** — `024`'s, not this feature's, and not touched.

---

## The ownership test

The feature is four moving parts — a storage module, a context, two guards, and one
interceptor — and each has a single reason to exist that is written where it lives. The
part that would be hardest to re-derive is the bfcache restore, and it is the part with the
longest comment for exactly that reason.
