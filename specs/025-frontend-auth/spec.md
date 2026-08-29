# 025 — Sign-in, route protection, and session · FRONTEND

**Phase:** 2 · **Story:** Auth (frontend half) · **Routes:** `/login` public, everything
else protected · **Folder:** `specs/025-frontend-auth/` ·
**Status:** Specified 2026-08-27, awaiting review · **Lane:** Frontend only

The backend half is [`004-auth-and-roles`](../004-auth-and-roles/). Its contract
[`contracts/auth-api.md`](../004-auth-and-roles/contracts/auth-api.md) is **FROZEN**
(2026-08-23) and this feature consumes it. `004`'s summary names this work as deferred
row 6 — *"the frontend half — login screen, route guard, `401` interceptor, sign-out |
the frontend lane"*. This is that row.

Nothing in `src/Wasl.Api`, `src/Wasl.Application`, `src/Wasl.Domain`,
`src/Wasl.Infrastructure`, or `tests/` is created or changed. No `dotnet` command is run.

---

## 1 · What this is, and what it is not

Today every screen in `wasl-web` is reachable by anyone, the shell shows a hard-coded
person who does not exist, and `lib/api.ts` attaches no credential. `004` landed the
backend on 2026-08-27: the endpoint issues a token, every ticket endpoint is
`[Authorize]`, and the fallback policy is `RequireAuthenticatedUser`. **So the frontend is
currently broken against its own backend** — every request it makes returns `401`.

This feature closes that. One new screen, one guard, one interceptor, one real identity.

**It is not a security feature.** ADR-005 already names what is absent — no rate limit, no
lockout, no refresh, no revocation, no password reset, no MFA — and nothing here mitigates
any of it. A client cannot. The 8-hour token lifetime is the entire mitigation and it is a
weak one; this feature's job is to consume the contract correctly, not to compensate for
it.

**It is not the designed login screen.** `004`'s `frontend-spec.md` splits that screen
into a plain build and a Phase 6 build, and this feature is the plain one. See §4.

### Source of truth, in order

| # | Document | What it settles |
|---|---|---|
| 1 | [`004/contracts/auth-api.md`](../004-auth-and-roles/contracts/auth-api.md) — **FROZEN** | The request, the `200` shape, the `400`/`401` bodies, how every other endpoint carries the token, and *What a client does with each* |
| 2 | [`004/frontend-spec.md`](../004-auth-and-roles/frontend-spec.md) | Components, the complete state list, fields, form requirements, states, actions, i18n keys, RTL, a11y, and what is excluded. **Written before `023` existed** — §2 reconciles it |
| 3 | [`004/FRONTEND-API-GUIDE.md`](../004-auth-and-roles/FRONTEND-API-GUIDE.md) | The API surface as the client sees it |
| 4 | [`design/screens/01-login.md`](../../docs/sdd/design/screens/01-login.md) | Element-by-element geometry, tokens, and icons. **Not restated here** |
| 5 | [`023-frontend-foundation`](../023-frontend-foundation/) | Tokens, primitives, shell, i18n, `lib/api.ts` |

Where 2 and 5 disagree about the app shell, **5 wins** — it is built and seen; 2 is a plan
written before it. Every such disagreement is listed in §2, not resolved silently.

---

## 2 · What `023` already delivered, and what `004`'s frontend-spec still owes

`004/frontend-spec.md` §*The app shell — what is built here* assigns the shell to the auth
feature. **`023` built it first.** Restating it as scope here would mean rebuilding a
delivered screen, so the table below is the reconciliation, and it is the reason this
feature is small.

| `004/frontend-spec.md` says | Actual state | Consequence for `025` |
|---|---|---|
| Sidebar 288px, brand tile, section caption, nav items | **Built** (`023`) | Not in scope |
| Header 68px, breadcrumb | **Built** (`023`) | Not in scope |
| User block: avatar, name, email | **Built**, reading `shell/currentUser.ts` — a hard-coded `Sara Al-Otaibi` | **In scope:** replace the source, not the component |
| User popover with a **Sign out** row in `--red-600` | **Built** — [`Sidebar.tsx:312`](../../src/wasl-web/src/shell/Sidebar.tsx#L312). The button renders, is keyboard reachable, and **has no `onClick`** | **In scope:** wire it. The row is currently a control that does nothing, which is worse than an absent one |
| Drawer below 780px | **Built** (`023`) | Not in scope. `023` records it as *implemented, typechecked, unseen* — that limitation carries forward unchanged |
| Collapsed 68px sidebar, flyout, tooltips | **Built** (`023`, ahead of its own plan) | Not in scope |
| `Checkbox` primitive available from `006` | **Does not exist.** `components/` holds Badge, Button, Input, Loader, Select, Textarea, Toast | **In scope** — see below |
| `RequireAuth`, `RedirectIfSignedIn`, `AuthContext`, `tokenStorage.ts` | None exist | **In scope** |
| `LoginPage`, `LoginForm`, `BrandPanel` | None exist | **In scope** |
| `401` intercepted in `lib/api.ts` | A `TODO — 004-auth-and-roles` comment marks the exact insertion point, and nothing is attached | **In scope** |

### `Checkbox` is the eighth primitive, not a ninth

ADR-009 caps the primitives at eight and names them: **Button, Input, Select, Checkbox,
Badge, Table, Modal, Toast.** `Checkbox` is on that list and has simply not been reached
yet. Building it here needs no written justification under the cap — it needs one only for
*why here*, and the answer is *remember me*, which is its first consumer in the product.

`Loader`, `Textarea`, and `Toast` are already outside the eight; `023` and `024` each
recorded a reason. This one does not consume that allowance.

---

## 3 · In scope

| # | Thing | Notes |
|---|---|---|
| 1 | `Checkbox` primitive | States per `10-shared-patterns.md`. Geometry from `tokens.css` (`--checkbox-size` `23px`, `--checkbox-radius`, `--checkbox-border`), never from a reference |
| 2 | `tokenStorage.ts` | One read point, one write point, one clear point. `localStorage` when *remember me* is checked, `sessionStorage` otherwise. **Clear writes to both**, always (AC-28) |
| 3 | `AuthContext` | Token and `user` read from storage **once**, at start-up. No component reads storage directly |
| 4 | `LoginPage` + `LoginForm` + `BrandPanel` | Plain build only (§4). `LoginPage` owns the mutation; the others take handlers as props |
| 5 | `RequireAuth` | Signed-out → `/login?returnUrl=<encoded current path>` (AC-24) |
| 6 | `RedirectIfSignedIn` | Signed-in on `/login` → redirect **before paint**, no flash (AC-25) |
| 7 | The `401` interceptor in `lib/api.ts` | At the marked TODO. **Excludes `POST /api/auth/token`** (AC-27) |
| 8 | `Authorization: Bearer` on every request | Composed from the response's `tokenType`, never a hard-coded scheme string |
| 9 | Sign-out wiring | Clear both storages, clear the context, redirect `/login`, Back does not restore (AC-28) |
| 10 | Replace `shell/currentUser.ts` | The shell reads identity from `AuthContext`. `023` wrote that file as the single seam for exactly this — one import, not a sweep |
| 11 | Apply `user.preferredLanguage` on sign-in | i18next language plus `dir`/`lang` on the root (AC-30) |
| 12 | The `auth:*` and `common:*` keys | `004/frontend-spec.md` §*Localization* lists 23. `locales/{en,ar}/auth.json` currently holds **one** — `signOut` |
| 13 | `FE-025-00` — preview before build | Both languages, every state in `004/frontend-spec.md` §*States*, before anything is wired |
| 14 | The Arabic walk, recorded | Findings in `tests.md`, not asserted from memory |

## 4 · Out of scope

| Excluded | Where it lives |
|---|---|
| The neural mesh, aurora, blur, grain, drag physics, entrance animation, channel tiles, hub | **Phase 6.** `004/frontend-spec.md` splits the screen and says plainly that building the panel before the product it signs into is the documented way to lose a day (ADR-009) |
| Registration, password reset, social sign-in, captcha, MFA, rate limiting, lockout | Nowhere. ADR-005, each with its consequence. *forgot?* tells the user an administrator must reset it |
| The language switcher above the form | `014`. **Consequence, stated:** someone who cannot read English cannot change the language before signing in |
| Refresh tokens, silent renewal, an expiry countdown, a "session expiring" warning | No refresh endpoint exists. A `401` can arrive mid-session with no warning; the interceptor is the whole response |
| Decoding the JWT client-side | The contract forbids it by name. Everything the UI needs is in `expiresAtUtc` and `user` |
| The Settings row's destination | `009-settings-localization` |
| Role-conditional navigation | Roles differ in permissions, not in navigation (`004/frontend-spec.md`) |
| An audit row on a client-side `401` | `004b`. The client cannot write one |
| Anything on `/tickets` beyond the existing placeholder | `010` |

---

## 5 · Provisional types — the authorised exception

ADR-011 §6 requires client API types to be **generated** from OpenAPI. None are generated
yet. `024` established the register pattern; this feature adds to it.

| Type | Shape from | Replaced when |
|---|---|---|
| `SignInRequest` | `auth-api.md` §*Request* | The OpenAPI document is generated |
| `SignInResponse` | `auth-api.md` §*200 OK* — `accessToken`, `tokenType`, `expiresAtUtc`, `user` | Same |
| `AuthenticatedUser` | `user.{id, fullName, email, role, preferredLanguage}` | Same |

Each is marked **provisional** in the file that declares it, per `024`'s register.

`UserRole` already exists in `shell/currentUser.ts`, cased `'Agent' | 'Manager'` — `023`
records that the ADR-011 §6 gate caught it lowercase, and that the compiler could not
have. **It moves; it is not re-declared.**

---

## 6 · What fails silently here

The house list, applied to this feature. Each row is invisible in a passing test run.

| Failure | How it presents |
|---|---|
| The `401` interceptor does not exclude `POST /api/auth/token` | A wrong password redirects `/login` → `/login`, the form error is discarded, and the screen looks like the button does nothing. **This is AC-27's entire reason for existing** |
| `RedirectIfSignedIn` runs after first paint | The login screen flashes on every reload for a signed-in user. Looks like a rendering glitch, is a guard in the wrong place (AC-25) |
| Sign-out clears only the storage that was written | *Remember me* checked once, unchecked next time — one token survives sign-out and the next visit is silently authenticated (AC-28) |
| `password` is trimmed client-side | A correct password fails with no explanation, and only for passwords with edge whitespace |
| `email` is normalised client-side | Two implementations of one rule; they diverge. The server owns it — the same division as BR-4.2 |
| The `401` message is attached to a field | It tells the user which field was wrong. The server deliberately does not, and this hands back the enumeration the `401` shape exists to prevent |
| `name` / `autocomplete` missing on the inputs | Password managers stop filling. Nothing errors; every sign-in just becomes manual. Two attributes |
| The error block is not `role="alert"` | A screen reader user gets no failure announcement. Silent by definition |
| `Authorization` is built by concatenating a literal scheme | Works until `tokenType` changes, then breaks everywhere at once. The contract issues the field so the client does not hard-code the scheme |
| A stale token from before a signing-key change | Every request `401`s. The interceptor must clear and redirect **once**, not loop — `004/spec.md` names this case |
| `returnUrl` is not encoded, or is honoured as an absolute URL | An open redirect. It must be treated as a path within this application, never as a destination |
| The brand panel acquires focusable content | `004/frontend-spec.md` records an earlier version where five decorative tiles took focus before the email field. The plain panel is `aria-hidden="true"`; Phase 6 must not undo that |
| The Caps Lock hint is `role="alert"` | It interrupts on every keystroke |

---

## 7 · Acceptance criteria

**AC-24 … AC-30 are already written in
[`004/spec.md`](../004-auth-and-roles/spec.md).** They are the frontend criteria and they
are **not renumbered here** — a criterion with two numbers is a criterion that gets
half-verified. This feature is accepted against them, plus five that `004` could not have
written because they concern the reconciliation with `023`.

| # | Criterion |
|---|---|
| AC-24 | *(from `004`)* Signed-out `/tickets` → `/login?returnUrl=%2Ftickets`; sign-in returns to `/tickets`, not a default landing page |
| AC-25 | *(from `004`)* Signed-in `/login` redirects **before paint** |
| AC-26 | *(from `004`)* The four form requirements: Enter submits · `name` + `autocomplete` · `role="alert"` block, never field-level · focus returns to `email` |
| AC-27 | *(from `004`)* `401` anywhere clears and redirects; `401` from the token endpoint does not |
| AC-28 | *(from `004`)* Sign-out clears **both** storages, redirects, and Back does not restore |
| AC-29 | *(from `004`)* Every string from a key present in `en` and `ar`; the Arabic walk done and written down |
| AC-30 | *(from `004`)* `preferredLanguage` applied immediately on sign-in |
| **AC-025-01** | The shell's user block, avatar initials, and role label render the **signed-in** user. `shell/currentUser.ts`'s hard-coded person appears nowhere in a production build — verified by grepping the bundle, not by reading the source |
| **AC-025-02** | The **Sign out** row in the popover performs AC-28. Before this feature it renders and does nothing; a control that looks live and is not is the defect being closed |
| **AC-025-03** | `Authorization` is composed from `tokenType`, and a test proves a changed `tokenType` changes the header |
| **AC-025-04** | `Checkbox` exists as a primitive with its states, is keyboard operable with a visible focus ring, and is used by *remember me*. Its geometry comes from `tokens.css` |
| **AC-025-05** | A stale or invalid token clears and redirects **exactly once**. Observed, with the request count recorded — a loop here is the failure mode `004/spec.md` names |

Every AC maps to a named test and every run output is recorded in `tests.md`, never
asserted from memory.

---

## 7b · Changes asked for after approval

Recorded here rather than folded into the sections above, so the approved spec and what
was actually built stay separable.

| # | Change | Origin |
|---|---|---|
| 1 | The form-side brand lockup, field placeholders, the reference's subtitle copy, "Email address" as the label, and the footer | **Not new scope.** These are the plain build's own content, from `01-login.md`'s Elements table and the login reference — and they were **missed**. The mesh panel remains Phase 6 |
| 2 | A show/hide toggle on the password field | Product owner, 2026-08-28. **Not in the reference** and not in any screen spec, so it is genuinely new. Built into the `Input` primitive rather than the screen |
| 3 | **Submit disabled until both fields are non-empty** | Product owner, 2026-08-28. **Overrides** `004/frontend-spec.md`'s States table, which gives Idle as "empty form, submit enabled" |
| 4 | **A `401` from `POST /api/auth/token` renders our catalogue string, not the server's `title`** | Product owner, 2026-08-28. **TEMPORARY — it has a removal condition, below.** |
| 5 | **The panel gained a heartbeat** — every second or two a packet travels one spoke into the hub, the hub flares, and a ring leaves it | Product owner, 2026-08-28, against `Wasl Login_last.html`. The only motion on the panel that is not a reaction to the pointer |
| 6 | **No required marker on the two sign-in fields** | Product owner, 2026-08-28. `required` itself is unchanged — the native attribute and its `aria-required` stay; only the `*` is suppressed |
| 7 | A **"Drag the hub" hint pill** was built, shown to the product owner, and **removed at their request** the same day | Product owner, 2026-08-28. Recorded because it explains a catalogue key that briefly existed in both locales and is now gone |

### Change 5 — the heartbeat, and where its colour comes from

`Wasl Login_last.html` adds one thing the earlier reference did not have: the mesh is
alive when nobody is touching it. A packet travels a spoke inward, the hub flares, and a
ring leaves it — about every two seconds, on a schedule drawn from the panel's own seeded
generator so it stays deterministic across a resize like the particle field does.

**The accent is read from `--teal-400`, not written into the component.** Canvas takes a
colour string and a custom property is not one, so the token is resolved once from the
panel's computed style. The same rule removed the last hex from `BrandPanel` — the accent
dot in the hub mark now takes its fill from the stylesheet.

**The hub's flare is composed in CSS, not inline.** The loop sets one custom property,
`--glow-shadow`, and the stylesheet appends it as a third `box-shadow` layer. Writing the
whole shadow from JavaScript would have restated the two resting layers in a template
literal, and they would then have lived in two places.

Under `prefers-reduced-motion` the loop never starts, so there is no heartbeat — the same
branch that already disables dragging.

### Change 6 — the marker, without losing the semantics

`Input` gained `requiredMarker`, defaulting to `true`. It hides the `*` and changes
nothing else: `required` still reaches the control, so the native attribute and the
`aria-required` it carries are untouched.

The two are separable on purpose. The marker tells a sighted reader which fields they may
skip; on a form where **every** field is required it distinguishes nothing, and a column
of asterisks reads as a warning. Dropping `required` instead would have removed the
semantics along with the glyph, which is the trade the prop exists to avoid.

### Change 7 — a hint that was built and then withdrawn

The reference carries a pill reading "Drag the hub", timed to appear three seconds in and
dismissed on the first grab. It was built, shown, and removed the same day at the product
owner's request. `auth:panel.hint` existed in both catalogues for the length of that
round trip and no longer exists in either.

Change 3 has one consequence worth stating plainly: a form with no enabled submit control
has no implicit submission, so **Enter does not submit while the form is incomplete**. It
works again the moment both fields hold content — which is every case where submitting
means anything, so AC-26 requirement 1 is unaffected in substance.

The gate tests **presence, not validity**. It deliberately does not wait for the email to
parse: a button that stays dead while someone types a plausible address gives them no way
to find out what is wrong with it. Zod's message on blur does that job, and it can only do
it if the form is submittable.

The password is checked **without trimming** — a password of three spaces is a password,
and trimming here would leave the button dead for exactly the person whose password that
is.

### Change 4 — a temporary deviation, with the condition for removing it

**What it does.** A `401` from the sign-in endpoint renders `auth:error.invalid` from our
own catalogue. Every other response, on every other endpoint, still renders the server's
sentence as received (BR-8.6) — that rule is unchanged.

**Why.** `POST /api/auth/token` currently answers a rejected credential with
`title: "Authentication is required."`, which is the sentence for a *missing token on a
protected endpoint*. The frozen contract specifies `"Email or password is incorrect."` So
the screen was telling someone who had just typed a password that authentication is
required. Rendering the server's text is right as a principle; it stops being right when
the text itself is the defect, because the principle exists to keep one sentence in one
catalogue — not to carry a wrong sentence to a user unchallenged.

**One correction to how this was described.** The screen renders `ProblemDetails.title`,
and always has. `detail` — which carries the raw resource key
`Error.Auth.InvalidCredentials`, untranslated in both locales — was never displayed. Both
are defects in `004`; only the first one reached a user.

> **REMOVAL CONDITION.** When `004` returns the contract's `401` title, delete the
> `status === 401` branch in `LoginPage`'s `onError` and the *TEMPORARY* describe block in
> `LoginPage.test.tsx`. The line beneath the branch already does the right thing: it
> renders `problem.title` and falls back to the catalogue only when the body carried
> nothing usable. **The screen then shows the server's sentence again, like every other
> error in the product.**

The defect itself is **not fixed here** and nothing under `src/Wasl.*` was touched. The
product owner is reporting it to the backend lane (2026-08-28).

---

## 8 · Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | The two seeded users from `004` are how this is exercised in development. Their passwords come from configuration and have **no default** | Sign-in cannot be demonstrated until the configuration is set. A `README` line, not a code change |
| A-2 | `vite.config.ts`'s `/api` proxy makes requests same-origin, so no CORS policy is needed in development | `023` measured the CORS failure that made this necessary; a deployment where the API is elsewhere needs a policy on the API side |
| A-3 | `023`'s shell is not modified beyond its identity source and the sign-out handler | Any further change is a deviation and is recorded as one |
| A-4 | The existing `/tickets` placeholder is the protected target for AC-24 | `004/spec.md` A-6 already accepts this and names `/customers` as the fallback |

## 9 · Open questions

Never guessed into the design. Each carries a working assumption, and the assumption is
**not** the answer.

| # | Question | Working assumption |
|---|---|---|
| Q-1 | **Where does a signed-in user land when there is no `returnUrl`?** `004/frontend-spec.md` says `/tickets`; `023` mounted `/` as a real route with a placeholder | `/tickets`, because the contract's own wording says so |
| Q-2 | **Does *remember me* default checked or unchecked?** Neither `004` nor `01-login.md` states it. It chooses `localStorage` over `sessionStorage`, so the default is a security posture, not a convenience | **Unchecked.** The safer default, and the one the user opts out of rather than into |
| Q-3 | **What does the shell show between start-up and the `AuthContext` read?** A visible unauthenticated frame before the redirect is AC-25's defect in another suit | A blocking start-up read before the first render of any route |
| Q-4 | **Is `expiresAtUtc` used at all in this feature?** The contract issues it so the client never decodes the JWT, but no in-scope behaviour consumes it — no countdown, no pre-emptive sign-out | Stored, unused. Recorded rather than dropped, so the next feature does not re-derive it |
| Q-5 | **Does a `403` surface as a toast, an inline block, or a page?** The contract says explain, do not retry, do not sign out. No screen in scope can produce one — `ManagerOnly` has no consumer until `011`/`016`/`019` | Out of scope; the interceptor passes `403` through untouched to the caller |
| Q-6 | **Are shadow and motion tokens available yet?** `tokens.css` note 11 says none has been extracted, and DESIGN-BRIEF rule 3 forbids inventing one. The login seam and the submit spinner both want one | Literals, each marked `TODO`, gathered under `023` Q-8 with the rest |

---

## 10 · Rules referenced

`ADR-005` scope of auth · `ADR-007` §3 §4 §6 §7 §8 localization and direction ·
`ADR-009` primitive cap and token provenance · `ADR-011` §1 state, §2 URL as truth,
§4 fetch at route level, §6 generated types, §7 lazy routes ·
`BR-6` authorization · `BR-8.6` `BR-8.7` `BR-8.8` `BR-8.11` localization ·
`BR-9.7` never log a password · `FR-4.1` the anonymous endpoint

---

## 11 · Gate

Per `CLAUDE.md`, this document is **step 1**. No code, no scaffold, no package. Steps 3
and 4 — review in full, then an explicit yes — come before anything is built.
