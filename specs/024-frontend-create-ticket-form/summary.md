# 024 · Create-ticket form — summary

**Lane:** frontend, alone. **Backend counterpart:** `009-create-ticket`, not delivered at the
time of writing. **Delivered:** 2026-08-26.

The screen a support agent uses to create a ticket: pick a customer, describe the problem,
choose a category and a channel, submit. Built against the frozen contract in
`009/contracts/tickets-api.md` while the endpoint behind it did not exist.

---

## 1 · What was built

**Two primitives**, taking the inventory from four of eight to six of eight.

- `Select` — a native `<select>` with `appearance: none` so our own chevron sits at the
  `inset-inline-end`. Always renders an empty `<option value="">`, because a required select
  has three states and `""` is how "untouched" is representable.
- `Textarea` — **no height token at all**, `resize: block`, `rows`, and a `counterFrom`
  threshold. It is a separate component rather than `Input.multiline`, on the product
  owner's decision: `Input`'s height is a token, its behaviour is single-line, and a flag
  makes half a props table invalid depending on its value.
- `Toast` — one message, no stack, no portal, no timer registry. `006` deferred a toast on
  the grounds that a general one is a system; this screen needs one message, once.

**One dev surface.** `src/dev/CreateTicketPreview.tsx` — eight states, Arabic first, both
languages side by side, with an in-page measurement readout. Built and reviewed **before**
anything was wired, and stripped from the production bundle by a build-time PostCSS rule
plus a `DEV`-guarded dynamic import. `grep` over `dist/` confirms it.

**The screen.** `CreateTicketPage` owns both fetches (ADR-011 §4); `CustomerPicker` is a
feature component that receives results and handlers as props and fetches nothing.
`TicketCreatedPage` is a named placeholder for `010`, existing only so a `201` navigates
somewhere that resolves.

**One contract file.** `src/lib/api-types.provisional.ts` — the only file permitted to
declare a domain type, every type carrying the mandated three-line comment.

**Two gates that did not exist before.** `scripts/check-no-domain-types.mjs` and
`.github/workflows/ci-frontend.yml`.

---

## 2 · The decisions worth defending

**The double-submit guard is a `useRef`, not `isPending`.** Measured, not assumed: two
synchronous clicks sent **two** `POST`s. `disabled` and `isPending` are state and apply only
after a re-render; the second click happens before that. The endpoint is not idempotent and
has no duplicate rule, so two identical tickets would both be real — and the support team,
not the developer, would find them.

**The client never re-derives the server's routing.** `apiFetchDetailed` was added to
`api.ts` so the `Location` header is read rather than rebuilt from `data.id`. Rebuilding it
works until the server's route changes.

**One schema drives the form's types and its validation.** `CreateTicketFormValues` is
`z.input<typeof createTicketSchema>` — derived, not hand-written. It was hand-written first,
and it had already drifted from the schema by one question mark on `priority`, which under
`exactOptionalPropertyTypes` is two different types.

**`.trim()` before `.min(1)`, not after.** A subject of three spaces passes a bare `min(1)`,
reaches the server, and returns a `400` on a field the form had just called valid.

**`priority` is omitted, not defaulted.** A `z.default('Normal')` would send the value the
server would have chosen anyway — harmless until the server's default changes and the client
keeps pinning the old one.

**The `404` is identified by `errors.customerId`, not by the status or the `type`.**
`errors/not-found` is shared with every unresolvable reference in the system.

**Enum lists come from the constants file, never from literals.** A hand-typed `'SMS'`
produces a `400` that reads as a **backend** defect, and the backend lane investigates its
own code while the dropdown looks complete. This is the case the whole ADR-011 §6 gate is
built around.

---

## 3 · Deviations

| # | Deviation | Reason |
|---|---|---|
| D-1 | **Hand-written domain types**, against ADR-011 §6 | See §4 below — a written, conditional, dated exception |
| D-2 | `counterFrom` added to `Input`, whose props table `023` froze | AC-7 asks for a counter from 180 on the subject field, and `Input` had none. The alternative was leaving the AC half-met |
| D-3 | `Select`, `Textarea` and `Input` wrapped in `forwardRef` | AC-10 and AC-16 require focus to move to the first invalid field. React Hook Form does that by calling `.focus()` on a registered ref, and there was none — so focus never moved. Measured before and after |
| D-4 | The section heading became a `<legend>` | AC-2 asks for the disabled reason to reach a screen reader. `aria-describedby` on a `<fieldset>` is not reliably announced on a child; a legend is |
| D-5 | Search results use `<bdi>` isolation rather than `dir="auto"` on the row (AC-4 as written) | `023`'s *one field, two edges*: `dir="auto"` on a container makes a Latin row hug the opposite edge from its Arabic neighbours. `<bdi>` is what the AC is actually asking for |
| D-6 | AC-5's create-customer **link** and its `returnUrl` are not built | There is no customer-create screen to return from (spec Q-2). The copy and the unavailability note render, so the shape is visible |
| D-7 | The search term lives in `useState`, not in the URL (ADR-011 §2) | A half-typed search inside a create form is not a shareable view, and pushing it would put a history entry behind every keystroke |
| D-8 | CI is a **separate** `ci-frontend.yml`, not a job inside `ci.yml` | Two lanes are working the same repository on the same day. A path filter also means a backend commit does not run `npm ci` |
| D-9 | Six automated tests, the rest recorded observations | The product owner's scoping decision. What was observed rather than asserted is marked as such in `tests.md` §3 |
| D-10 | `TicketCreatedPage` exists at all | `010` owns the ticket detail screen. Without a route, a `201` would navigate to a 404 and AC-1 would be unprovable; staying on the form makes the created ticket invisible |
| D-11 | Preview enum lists derived from the contract constants mid-feature | They were hand-written, `TEST-024-03` found them, and a preview that restates a value is a preview that can lie about it |
| D-12 | New key `tickets:new.priorityDefault` in both catalogues | The Arabic walk found "عادية" listed twice with nothing distinguishing them, while the two send different requests |
| D-13 | A Vite **dev proxy** for `/api`, and `BASE_URL` defaulting to `window.location.origin` | The API has no CORS policy, so a direct cross-origin call never reached it. The proxy is in this lane's own config, changes nothing that ships, and replaces a hard-coded port guess that was wrong |
| D-14 | `toAppPath` parses the `Location` header instead of string-replacing it | The server returns an **absolute** `Location`; the contract promises a relative one. Both are legal, and the old `.replace()` that stripped a leading `/api` silently did nothing to the absolute form |
| D-15 | `<title>` is `wasl`, lower case | Product owner, 2026-08-27. Not localized: the document title is read before any module runs, and a product name is not copy |

---

## 4 · The provisional-types register

**Permission given:** 2026-08-26, by the product owner, in writing, with six conditions —
all six met:

1. **One file only** — `src/wasl-web/src/lib/api-types.provisional.ts`. Nothing else in the
   tree declares a domain type, and `npm run lint:types` now proves it rather than promising
   it.
2. **The exact three-line comment on every type**, verbatim.
3. **Written from the frozen contract literally.** Where the contract was silent, the
   question was raised rather than answered — see the spec's *Open Questions*.
4. **Enums copied character for character.** Verified against the contract's enum table, in
   particular `Sms` and not `SMS`.
5. **`createdByUserId: string | null`** — nullable, not optional.
6. **`allowedTransitions: TicketStatus[]`** — rendered as received, never derived.

**Removal condition:** the file is deleted when OpenAPI generation lands. The task that owns
it is **`FE-009-05`**, which also owns the full generated-versus-frozen comparison deferred
from `REV-024-03`. Until then the allowlist entry in `scripts/check-no-domain-types.mjs`
names `FE-009-05` as its owner, so the exception cannot outlive its reason quietly.

Two further allowlist entries exist, each with a reason and an owner in the script itself:
`ProblemDetails` in `api.ts` (RFC 7807, frozen by `002`, not provisional), and `UserRole` in
`currentUser.ts` (a placeholder owned by `004-auth-and-roles`).

---

## 5 · What the gates found

Six defects, each one measured rather than reviewed into existence. They are written up in
`tests.md`; the shortest useful summary:

| Found by | Defect |
|---|---|
| A browser probe counting requests | Two synchronous clicks sent **two** `POST`s |
| A browser probe reading `activeElement` | Focus never moved to the first invalid field — no primitive forwarded a ref |
| The Arabic walk | The empty search field computed `direction: ltr` inside an RTL form |
| The Arabic walk | The priority list showed "عادية" twice, for two different requests |
| The Arabic walk | The subject field had no counter at all |
| The accessibility tree | The disabled section carried its state but not its reason |
| `TEST-024-03`'s grep | The dev preview hand-wrote all three enum lists |
| Re-measuring after a fix | The legend's `float` reset shrank the subject input to 26px |

**`UserRole` was `'agent' | 'manager'`** — lower case, against `Agent` / `Manager` in BR-2
and BR-6. The compiler cannot see that: `'manager'` type-checks against `'manager'`
everywhere in this app, right up to the first request that sends it. The ADR-011 §6 gate
caught it on its first real run, which is a better argument for the gate than anything
written above.

---

## 6 · Known limitations

1. ~~AC-1 has never run end to end.~~ **Closed 2026-08-27** — run against the running API in
   both locales, `201` → real `Location` → `TCK-2026-000007` / `TCK-2026-000008`, and a
   `GET` on the returned `Location` resolves. Two defects were found doing it
   (`tests.md` §11). The API's port is **5272**, not the 5000 that `.env.example` guessed.
2. **Customer search is stubbed**, and now measurably so: `GET /api/customers` returns
   **404** — the endpoint is not built. `STUBBED_CUSTOMER_SEARCH = true` with the real call
   beside it; the switch is one constant, once `008` exists.
3. **`ci-frontend.yml` has never executed on a runner.** Every step in it was run locally,
   in the same order, with the output recorded in `tests.md` §1 — but the workflow itself is
   unproven. It is also a file outside this lane's stated scope (`src/wasl-web/` and this
   spec folder); it was created as a **new** file so it cannot conflict with the backend
   lane's `ci.yml`, and it is one `rm` away from being undone.
4. **`401` navigates to `/`.** There is no sign-in screen until `004`.
5. **`REV-024-03` is deferred.** `GET /swagger/v1/swagger.json` returns **404** — measured,
   not assumed. `FE-009-05` owns the comparison.
6. **The API has no CORS policy.** A direct cross-origin call from the SPA is blocked at
   preflight. Worked around in development with a Vite proxy in this lane's own
   `vite.config.ts`; **not fixed**, because any deployment serving the SPA from another
   origin hits it again. Reported to the backend lane.
7. **Two live differences from the frozen contract**, reported and not absorbed: `errors`
   keys come back PascalCase (which breaks AC-10's per-field messages against the real
   server), and `Content-Language` is not sent at all.
8. **Nothing below 780px has been measured**, and neither has `prefers-reduced-motion` — the
   same two gaps `023` left open, unclosed for the same reason: no measurement, no claim.
9. **No toast motion or duration token exists** (`tokens.css` note 11). `autoDismissMs` is a
   hard-coded 8000. Spec Q-8.
10. **The accessibility tree was read, not heard.** That the group has a name is evidence the
   name exists, not evidence of how a screen reader speaks it.
11. **Two inventory slots, three claimants.** Six of eight primitives are built. `Checkbox`
   (`013`), `Table` (`008`/`010`) and `Modal` (`012`) all want a slot. Recorded as
   arithmetic, deliberately not decided here.

---

## 7 · The ownership test

Can this be explained and modified without help? The parts that need a sentence before
someone changes them, each carrying that sentence in a comment at the call site:

- why the double-submit guard is a ref and not `isPending`;
- why `asEnum` is `z.string().pipe(z.enum(…))` and not `z.enum(…)`;
- why the picker's keyboard handler sits on a wrapper `<div>`;
- why `.control:placeholder-shown { direction: inherit }` exists;
- why the legend is `display: block` and not `float`.

Every one of those was a defect first and a comment second, which is the only order that
produces a comment worth reading.
