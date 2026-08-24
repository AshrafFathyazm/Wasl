# 004 — Frontend Spec

**Screens:** Login, App shell · **Routes:** `/login` (public), everything else (protected)
· **Who can reach the shell:** any authenticated support user — the roles differ in
permissions, not in navigation

The element-by-element screen specs, with tokens, geometry, and icons, are
[`docs/sdd/design/screens/01-login.md`](../../docs/sdd/design/screens/01-login.md) and
[`docs/sdd/design/screens/02-app-shell.md`](../../docs/sdd/design/screens/02-app-shell.md).
They are not duplicated here. This file carries what is specific to **this feature's**
build: what of those two screens is in this feature and what is not, the contract binding,
every state, the i18n keys, and the RTL obligations.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

> **This lane runs after `006-design-system`.** There is no React application, no token
> file, and none of the eight primitives before then (`research.md` R-10). The Phase 0 gate
> for `004` is backend-only, so this is the phase table's intent rather than a delay.

---

## The login screen is built PLAIN, and that is the deliverable

| Built here | Deferred to Phase 6 |
|---|---|
| 50/50 split; brand panel one side, form the other | The interactive neural mesh — canvas, ~46 particles, link thresholds |
| Solid `--navy-900` panel with the brand lockup, headline, and subtitle | Aurora conic + `blur(80px)`, the hub halo, the vignette, the grain |
| The contact-shadow seam (`inset 16px 0 26px -14px`) | Drag physics on the hub and the five channel tiles, the Gaussian field warp |
| Form directly on a white surface — **no card** | The five channel tiles and the hub, and the subtitle swap on tile hover |
| The `<form>`, the error block, the Caps Lock hint, *remember me*, *forgot?* | Entrance stagger, mask reveal, pointer parallax, the mobile breathe |
| The container-query breakpoint at 780px, panel above form | — |

The designed panel is a canvas redrawing every frame behind an 80px blur with spring
physics on seven bodies — the heaviest surface in the product, by its own spec. It is
Phase 6. Building it before the product it signs into exists is the documented way to lose
a day (ADR-009).

**Nothing in the right-hand column is a correctness requirement.** Everything in the left
column is, and the four items in *The form is a `<form>`* below are defects if missed.

## The app shell — what is built here

| Built here | Deferred |
|---|---|
| Expanded sidebar, 288px, `border-inline-end` | The 68px **collapsed** state, its width animation, its `localStorage` persistence → `010` |
| Brand tile + product name; section caption | The flyout for a nav group's children, and leaf tooltips → `010` |
| Nav items from `navItems.ts` — one entry at this feature: Tickets | Dashboard (`020`), Customers (`008`), and Tickets' three children (`010`) |
| Header, 68px, `border-bottom`, breadcrumb | — |
| User block pinned bottom: avatar, name, email | — |
| User popover: identity, role row, **Sign out** in `--red-600` | The **Settings** row — its destination is `009-settings-localization` |
| Drawer below 780px | Auto-collapse between 780 and 1100px → `010` |
| Content region, `--surface-content`, padding 56, gap 24 | — |

The collapsed state's hard part is the flyout for a group's children — the app-shell spec
says plainly that this "is where most implementations quietly break". At this feature the
nav has one item and no children, so a flyout would have nothing to show and the width
animation, which is a stated exception to `DESIGN-BRIEF.md` rule 19, would be carrying no
load. It arrives with the children.

**Consequence, stated so it is a decision and not an omission:** a 1280px laptop spends 288
of 1280px on one nav item and cannot narrow it. A space cost, no data loss.

---

## Components

| Component | Kind (ADR-011 §4) | Fetches? |
|---|---|---|
| `LoginPage` | Route / page | **Yes** — owns the sign-in mutation |
| `AppShell` | Route layout | No |
| `TicketsPlaceholderPage` | Route / page | No — nothing exists to fetch. `010` replaces it |
| `LoginForm` | Feature component | No — handlers as props |
| `BrandPanel` | Feature component | No |
| `Sidebar`, `SidebarNavItem`, `Header`, `UserPopover`, `UserAvatar` | Feature component | No |
| `RequireAuth`, `RedirectIfSignedIn` | Route guard | No |
| `Button`, `Input`, `Checkbox` | Primitive — from `006` | No |

**`UserAvatar`, the popover, and the collapse icon button are feature components, not
primitives.** ADR-009 caps the primitives at eight — Button, Input, Select, Checkbox,
Badge, Table, Modal, Toast — and none of these is on it. ADR-011 §3 says to promote
something to `components/` when the **second** consumer appears, not when one is imagined.
They live in `features/shell/` until a second screen needs them, which keeps the cap intact
without pretending the shell needs nothing outside it.

Fetching happens only at the route level (ADR-011 §4), which here means one mutation in one
place.

## State — and the complete list of it

Per ADR-011 §1. If something is not in this table it is not client state.

| State | Home | Note |
|---|---|---|
| Token, and the current user | `AuthContext`, written once at sign-in | Read from storage **once**, at start-up. A component reading storage directly is how two components come to disagree about whether the user is signed in |
| Where the token is kept | `tokenStorage.ts` | `localStorage` when *remember me* is checked, `sessionStorage` otherwise. One read point, one write point, one clear point |
| `returnUrl` | The URL — `/login?returnUrl=%2Ftickets` | Shareable, survives the back button, and there is one source of truth (ADR-011 §2) |
| Login form values | React Hook Form | |
| Popover open | `useState` in `UserPopover` | |
| Active locale | i18next | Applied from `user.preferredLanguage` on sign-in (AC-30) |

No store. The token is the only piece of genuine client state in the feature.

## Login — fields

| Field | Control | Required | Client rule | Attributes that are not optional |
|---|---|---|---|---|
| `email` | `Input type=email` | yes | non-empty, valid address, ≤320 | `name="email"`, `autocomplete="email"`, `dir="auto"` |
| `password` | `Input type=password` | yes | non-empty, ≤256 | `name="password"`, `autocomplete="current-password"` |
| *remember me* | `Checkbox` | no | — | Chooses `localStorage` over `sessionStorage`. Sent to the server in **no** field |

**`password` is never trimmed.** Leading and trailing spaces are part of a password, and a
client that trims them makes a correct password fail with no explanation.

`email` **is** trimmed and lowercased by the server before lookup, so the client sends what
was typed and does not normalise (the same division as BR-4.2: two implementations of one
rule is how they diverge).

## The form is a `<form>` — four requirements, each a defect if missed

Taken from `docs/sdd/design/screens/01-login.md` and repeated because each is verifiable
and each is silently absent when it is wrong:

| Requirement | What its absence costs | AC |
|---|---|---|
| `<form onSubmit>` with `type="submit"` | **Enter does not submit.** People feel this without being able to name it | AC-26 |
| `name` + `autocomplete` on both inputs | **Password managers do not fill.** Every sign-in becomes manual — the largest UX loss on this screen, and it costs two attributes | AC-26 |
| `role="alert"` on the error block | A screen reader never hears the failure | AC-26 |
| Focus returns to `email` after a failure | The user cannot retype without reaching for the mouse | AC-26 |

## States

### Login — every one is required

| State | What the user sees | AC |
|---|---|---|
| **Idle** | Empty form, submit enabled | — |
| **Validating** | Field-level message on blur, from Zod, before any request | — |
| **Submitting** | Spinner in the button, **button width unchanged**, inputs read-only, submit disabled so a double-click sends one request | — |
| **Invalid credentials** | One `role="alert"` block above the submit; both inputs get the danger border; focus moves to `email`. **Never a field-level message** — the server does not say which field was wrong, and inventing one would tell the user the email exists | AC-26 |
| **Server unreachable** | The same block, a different message, retry available | — |
| **Caps Lock on** | Hint under the password field, from `getModifierState` on `keyup`. One failed sign-in from Caps Lock convinces someone they forgot their password | — |
| **Already signed in** | Redirect **before render**. The login screen never flashes | AC-25 |

There is no **empty** state: a sign-in form has no collection to be empty. Recorded so the
omission is visibly a decision (`docs/sdd/design/screens/README.md` — absence of a state is
a defect, not a gap).

`401` is the form's error state here, and **only** here. Everywhere else in the product a
`401` clears the token and redirects (AC-27).

### App shell

| State | Renders |
|---|---|
| Default, ≥780px | Sidebar 288px + header + content |
| Below 780px | Sidebar leaves the flow; a header button opens it as a drawer over the content |
| Long email in the user block | Truncated with an ellipsis, full value in `title` |
| Manager | The same navigation. Roles differ in permissions, not in navigation |
| Route not found inside the shell | A not-found panel in the content region, with the shell intact |
| Signing out | Token cleared from both storages, redirect to `/login`; the back button does not restore an authenticated view (AC-28) |

## Actions

| # | Trigger | Guard | Request | Success | Failure |
|---|---|---|---|---|---|
| 1 | Submit login | Both fields pass Zod | `POST /api/auth/token` | Store the token per *remember me*, write `AuthContext`, apply `user.preferredLanguage`, navigate to `returnUrl` or `/tickets` | `401` → the one error block, never field-level, and it never reveals whether the email exists. `400` → field messages from `errors` |
| 2 | *forgot?* | — | — | A message: an administrator must reset it (ADR-005 — there is no password reset) | — |
| 3 | Nav item | — | — | Route change; the active state moves | — |
| 4 | Sign out | — | — | Clear both storages, clear the context, redirect `/login` | — |
| 5 | Any authenticated request returns `401` | The URL is **not** `/api/auth/token` | — | Clear the token, redirect `/login?returnUrl=<path>` | — |

Action 5's exclusion is the whole of AC-27. Without it, a wrong password redirects the user
from `/login` to `/login`, discarding the form error, and the screen looks like it did
nothing.

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint. Namespaces follow the
screen specs.

| Key | `en` | Note |
|---|---|---|
| `auth:panel.chip` | Customer Support | The chip above the headline |
| `auth:panel.headline` | Every conversation, in one place. | Two lines in `en`; the `ar` string is longer — see RTL below |
| `auth:panel.body` | Five channels, one thread. | |
| `auth:signIn.title` | Sign in | |
| `auth:signIn.subtitle` | Enter your credentials to continue | |
| `auth:signIn.submit` | Sign in | |
| `auth:signIn.submitting` | Signing in… | |
| `auth:field.email` | Email | |
| `auth:field.password` | Password | |
| `auth:rememberMe` | Remember me | Chooses the storage. The label is a promise the implementation keeps |
| `auth:forgotPassword` | Forgot your password? | |
| `auth:forgotPassword.answer` | Ask an administrator to reset it. | There is no reset flow (ADR-005) |
| `auth:capsLock` | Caps Lock is on | |
| `auth:error.invalid` | Email or password is incorrect | Client mirror for the offline case. The server's own `401` `title` is rendered as received when there is one |
| `auth:error.unreachable` | Could not reach the server. Try again. | |
| `auth:signOut` | Sign out | The only red item in the navigation |
| `common:productName` | Wasl | Not translated as a word; the Arabic wordmark وصل is part of the mark, not a string |
| `common:nav.main` | MAIN | Section caption |
| `common:nav.tickets` | Tickets | |
| `common:nav.settings` | Settings | The row is deferred; the key ships with the catalogue it belongs to |
| `common:role.agent` | Agent | The **label**. The enum value `Agent` is never translated (BR-8.7) |
| `common:role.manager` | Manager | Same |
| `common:notFound.title` | Page not found | For an unmatched route inside the shell |

Every key exists in `ar` as well, enforced by the parity test (BR-8.11) — not by discipline.

**Server-authored messages are not in this table.** The `401` `title` and every `400`
message arrive already translated (BR-8.6) and are rendered as received. Re-translating
them client-side would put the same sentence in two catalogues, and the two would drift.

**Never translated, on either screen:** `user.role`'s value, `user.preferredLanguage`'s
value, `ProblemDetails.type`, the keys of `errors`, `traceId` (BR-8.7). The role *label*
comes from `common:role.*`; the role *value* is what the code compares.

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` and `lang` on the document root, set once (ADR-007 §6), and set **before first paint** so nothing reflows visibly |
| Layout | CSS logical properties throughout. `margin-inline-start`, never `margin-left`; `text-align: start`, never `left` |
| Login halves | Panel and form **swap sides** — `flex` order, not a second layout |
| The seam | `box-shadow: inset 16px 0 …` must become `inset -16px 0 …` under RTL, or the contact shadow falls on the outside edge and reads as a stray line. `box-shadow` has no logical form, so this is one of the few places a direction check is unavoidable — and it is exactly the kind of thing that looks like a rendering artifact rather than a bug |
| Sidebar | Moves to the inline-**end**. The active-item bar is `inset-inline-start`, so it follows automatically |
| Breadcrumb | Separators reverse |
| Brand mark | Does **not** mirror |
| Drawer | Slides in from the inline-end under RTL |
| User content | The email input carries `dir="auto"` — a Latin address typed into an Arabic form is normal, and without it the punctuation lands in the wrong place and looks like a typo (ADR-007 §8) |
| Headline length | The `ar` headline is longer than the `en` one. The panel's text block must not be height-constrained; a two-line English headline becoming three lines in Arabic is the expected case, not the edge case |
| Digits | Latin digits everywhere, including in a future ticket count in the nav — `ar-u-ca-gregory-nu-latn` (ADR-007 §7) |

`FE-004-11` walks both screens in Arabic and records what it found in `tests.md`. RTL
defects are visual — no assertion catches a sidebar sized to English label text, and none
catches a shadow on the wrong edge.

## Accessibility

| Requirement | Note | Verified by |
|---|---|---|
| **The brand panel is `aria-hidden="true"` and holds nothing focusable** | An earlier version of the designed screen gave the channel tiles `tabindex="0"`, so a keyboard user tabbed through five decorative nodes before reaching the email field. The plain panel has no tiles, and it must not acquire focusable content when Phase 6 adds them back | `FE-004-11` |
| Every control keyboard reachable with a visible focus ring | Including the popover trigger and every item inside it | `FE-004-11` |
| Both inputs have a programmatic label, not a placeholder standing in for one | | `FE-004-11` |
| The error block is `role="alert"` and is announced when it appears | | `TEST-004-27`, AC-26 |
| The submit's disabled state is conveyed, not only styled | | `FE-004-11` |
| The popover traps focus while open, returns focus to its trigger on close, and closes on `Escape` | | `FE-004-11` |
| The drawer traps focus while open and is dismissable by `Escape` | | `FE-004-11` |
| `prefers-reduced-motion` | Nothing on either screen animates in this feature, so the query has nothing to disable. Recorded because Phase 6 adds motion and the obligation arrives with it | — |
| Caps Lock hint is a hint, not an error | It must not be `role="alert"` — it would interrupt on every keystroke | `FE-004-11` |

## Client-side validation — mirror, never authority

The Zod schema mirrors the contract so the user is told sooner. Both rules below are
enforced server-side, and the client is not the authority (ADR-003, Principle III).

| Not done client-side | Why |
|---|---|
| Trimming or lowercasing `email` before sending | The server owns the normalisation, the same way it owns BR-4.2 for customers |
| Trimming `password` | Whitespace is part of a password |
| Deciding whether the account exists, is active, or has the right role | Only the server can answer, and its answer is deliberately indistinguishable between the three (contract, `401`) |
| Decoding the JWT to read the role | The response body carries `user.role`. A client that parses the token starts depending on claim names, which are a server-side detail, and gains a parser pointed at attacker-influenced input for nothing |

## Preview before build — not optional

`FE-004-00` renders both screens with real tokens, real copy, plausible data lengths, every
state in the tables above, and both languages **before** anything is wired.

The Arabic headline is longer than the English one and the seam shadow flips; the user
block holds an email that may be forty characters. Finding those in a preview costs
minutes; finding them after the screens have tests, translation keys, and guard wiring
costs hours (ADR-009, `docs/sdd/design/preview-first-workflow.md`).

## Not on these screens

| Excluded | Where |
|---|---|
| Registration, password reset, social sign-in, captcha, MFA | Nowhere. Each is out of scope in ADR-005, listed there with its consequence, and *forgot?* says so to the user |
| The language switcher above the form | `014-language-preference-and-rtl`. Consequence: someone who cannot read English cannot change the language **before** signing in |
| The mesh, aurora, grain, drag physics, and every entrance animation | Phase 6 |
| The 68px collapsed sidebar, its flyout, its tooltips | `010-ticket-list-and-detail` |
| The Settings row in the popover | `009-settings-localization` owns the destination |
| A theme toggle | One appearance only (ADR-009) |
| Global search, a notification bell, a workspace switcher, a help widget | Not in the shell (`02-app-shell.md`) |
| Anything on `/tickets` beyond a protected placeholder | `010`. The placeholder exists so route protection has a target (AC-24) |
