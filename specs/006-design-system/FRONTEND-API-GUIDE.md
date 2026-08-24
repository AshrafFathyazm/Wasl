# Frontend API Guide — 006 Design System

## There is no HTTP surface

No endpoint is called, no request is made, no response is parsed. `git grep -nE
"fetch\(|axios|XMLHttpRequest" src/wasl-web/src` returns nothing, and that is a
verification, not a claim (`contracts/README.md`).

This file is short by necessity and is not empty, because two things a consumer needs
*are* published by this feature, and one project-wide rule needs restating in its
absence of an API.

---

## 1 · The contract this feature actually publishes

It is the props tables in [`frontend-spec.md`](frontend-spec.md) §3, §4, and §5 — and
they are **frozen** the way an endpoint contract is frozen. `007` builds against them.

| If you are building | Read |
|---|---|
| A form | `frontend-spec.md` §3 `Button`, §4 `Input` |
| A list, a table cell, a detail header | `frontend-spec.md` §5 `Badge` |
| Anything at all | §7 Localization, §8 RTL, §9 Accessibility — those three are obligations on the **caller**, not on the primitive |

A change to a prop name, to a required/optional flag, or to what a state means goes
through **Contract changes** in [`plan.md`](plan.md) first, and this file plus
`frontend-spec.md` are regenerated. A prop change discovered by `007` failing to compile
is the failure that process exists to prevent.

---

## 2 · The one shape that will become an API — `Theme`

ADR-012 requires the tenant theme to arrive in the **bootstrap or auth response** and be
written to `:root` **before first paint**. That response does not exist yet — there is no
auth response until `004` and no bootstrap endpoint anywhere — so the shape below is
hand-written from ADR-012 and `design/theming.md`.

```ts
// PROVISIONAL — hand-written from ADR-012. Replace with types generated from the
// OpenAPI document once 022 defines the response that carries it. See ADR-011 §6.
export interface Theme {
  /** The tenant's single chosen colour, as #RRGGBB. The ONLY themeable input. */
  brand: string;

  /** Light | Dark | Brand. Three presets, never a colour picker — design/theming.md.
   *  Consumed by 008's sidebar; nothing in 006 renders one. */
  sidebar: 'light' | 'dark' | 'brand';
}

// PROVISIONAL — the refusal path. AC-7.
export type BrandCheck =
  | { ok: true;  onBrand: '#FFFFFF' | '#0D2626' }
  | { ok: false; reason: 'contrast-below-4.5' };
```

**Marked provisional on purpose.** ADR-011 §6: the client's API types come from the
OpenAPI document, never hand-written, so that a contract change becomes a compile error
rather than a runtime surprise in whichever screen happened to use the field. These two
are hand-written because there is nothing to generate from yet, and swapping them is a
deliberate task in `022` — not something to forget.

`sidebar` is in the type and **unused** in this feature. It is included because leaving it
out would mean `022` changes the shape rather than filling it, and a shape change ripples
where a field addition does not.

### What the UI does with each outcome

There is no HTTP status code to branch on, so the table is over the function's result:

| Result | What happens | AC |
|---|---|---|
| `{ ok: true, onBrand }` | `applyTheme()` writes `--brand` and `--on-brand` to `:root`. Everything derived follows through the cascade — six brand tokens, every Primary button, every focus ring. No component is notified and no component re-renders | AC-5, AC-25 |
| `{ ok: false, reason: 'contrast-below-4.5' }` | The colour is **refused**. The previous theme stays applied. The *message* is `022`'s screen to render; this feature's obligation is that the function refuses rather than returning an unreadable pair | AC-7 |
| The response has no theme, or the field is absent | The static `--brand` in `tokens.css` stands. This is the state throughout Phase 0 (`spec.md` Q-E) | — |

### Where it is applied, and why not in a component

```html
<!-- index.html, inline, before the module script -->
<script>/* set --brand and --on-brand on documentElement */</script>
```

**Not a `useEffect`.** `useEffect` runs after paint, so the default theme renders first
and then snaps — a flash of unbranded interface on every load, which is the first thing
anyone notices and the last thing anyone reports as a bug (ADR-012, *Applying it without
a flash*).

`lib/theme/applyTheme.ts` is the same logic as a module, used by tests and by `022`. The
inline copy exists because a module cannot run before first paint.

---

## 3 · The mirror rule, in a feature with no API

The project rule is that the frontend may mirror a server rule to improve the experience
and **is never the authority** (constitution principle III, ADR-003). With no API, that
rule lands on the primitives as something sharper:

> **A primitive renders validity. It never decides it.**

| The primitive does | The primitive never does | Who does |
|---|---|---|
| Render `Input.error` when a string is present | Validate anything — no regex, no length check, no required check | Zod in the form (`007`), FluentValidation at the boundary, invariants in `Wasl.Domain` |
| Render a `required` marker | Enforce that the field is filled | The form, then the server |
| Accept `maxLength` as a native attribute | Truncate, or reject a paste | The form's schema, then the server |
| Expose `onBlur` so a caller can show an error at the right moment | Decide *when* the error appears | The form |
| Map `Badge.value` to a colour | Decide what statuses exist, or which transitions are legal | `Wasl.Domain`'s state machine, surfaced as `allowedTransitions` (ADR-004) |

Three consequences worth stating, because each is a place a well-meaning contributor
would put logic in the wrong layer:

- **No client-side normalisation, ever.** `007` establishes that email lowercasing
  (BR-4.2) and E.164 phone normalisation (BR-4.3) are the **server's**. An `Input` that
  formatted a phone number as you typed would be a second implementation of one rule, and
  two implementations of one rule is how they diverge.
- **`Badge` never derives a status.** It maps a value the server sent. A client that
  computed "this is overdue, so show it red" would be reimplementing a rule the domain
  owns.
- **A disabled `Button` is not an authorization decision.** `403` is enforced
  server-side (BR-6) and always will be. A hidden or disabled button is a courtesy;
  removing it from the DOM is not a security control.

---

## 4 · Conventions this feature inherits and does not use

Recorded so `007` does not have to look them up, and so their absence here is visibly a
consequence of having no API rather than an omission:

- **Base** `{{baseUrl}}/api` · **Auth** `Authorization: Bearer <JWT>` on every call
- Send `Accept-Language: ar` or `en`; read `Content-Language` to know which was applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title`
  is translated, `type` is not. A client that branches on `title` was already broken
- `200` is never returned with an error in the body
- Timestamps arrive UTC with a `Z`; formatting for display is the client's job, in the
  active locale
- Identifiers are `Guid` strings; enums are strings on the wire — and `Badge` depends on
  that last one, since `statusTokens.ts` is keyed on the raw enum value

Full inventory: `docs/sdd/05-api-conventions.md`. First consumer: `007`.
