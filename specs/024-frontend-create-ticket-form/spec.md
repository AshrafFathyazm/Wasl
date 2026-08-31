# 024 — Create Ticket Form · FRONTEND

**Phase:** 2 · **Story:** US-005 (frontend half) · **Route:** `/tickets/new` ·
**Folder:** `specs/024-frontend-create-ticket-form/` ·
**Status:** Specified 2026-08-26, awaiting review · **Lane:** Frontend only

The backend half is [`009-create-ticket`](../009-create-ticket/). Its contract is
**frozen**, and this feature consumes it. `009` also carries the `FE-009-*` task rows
that predate the split; **this feature supersedes them** — see *Deviations*.

Nothing in `src/Wasl.Api`, `src/Wasl.Application`, `src/Wasl.Domain`,
`src/Wasl.Infrastructure`, or `tests/` is created or changed.

---

## 1 · What this is, and what it is not

One screen: a support user picks a customer, describes a problem, and creates a ticket.
It is the first screen in the product that **writes**, so it is the first one that has to
answer what happens when the write fails — and there are four distinct failures, each
with a different correct response.

The visual spec is
[`docs/sdd/design/screens/05-create-ticket.md`](../../docs/sdd/design/screens/05-create-ticket.md)
and is not restated here. The API surface is
[`009/FRONTEND-API-GUIDE.md`](../009-create-ticket/FRONTEND-API-GUIDE.md). The build-level
detail — components, states, keys, RTL, accessibility — is
[`009/frontend-spec.md`](../009-create-ticket/frontend-spec.md), and **that file is the
frontend spec for this feature**; it is cited, not duplicated.

What this document adds is what those three cannot know: which primitives do not exist
yet, what the foundation actually shipped, and which of this screen's dependencies are
unbuilt today.

### Source of truth, in order

| For | Read |
|---|---|
| Every type, every enum value, every status code | [`009/contracts/tickets-api.md`](../009-create-ticket/contracts/tickets-api.md) — **frozen**, and the only source for the provisional types |
| The customer picker's endpoint | [`008/contracts/customers-read-api.md`](../008-customer-list-and-profile/contracts/customers-read-api.md) — frozen, **endpoint not built** |
| Layout, tokens, icons | `docs/sdd/design/screens/05-create-ticket.md` |
| Components, states, keys, RTL, a11y | `009/frontend-spec.md` |
| What already exists to build with | [`023-frontend-foundation`](../023-frontend-foundation/summary.md) |

**The guide and the examples are not sources for types.** Where the guide and the
contract could differ, the contract wins; where the contract is silent, this document
raises a question rather than filling it.

---

## 2 · What the foundation gives us, and what is missing

`023` shipped `Button`, `Input`, `Badge`, `Loader`, the app shell, `lib/api.ts`, and i18n.
This screen needs four things that do not exist.

| Needed | Status | Decision |
|---|---|---|
| `Select` ×3 — category, priority, channel | **Not built.** Third of the eight capped primitives (`component-inventory.md`) | **Build it here.** This is its first real consumer, which is exactly when the cap says a primitive should arrive |
| A multi-line `description` | **Not built** | **A separate `Textarea`**, not a flag on `Input`. Its reason is below |
| `Toast` — the success message carrying `ticketNumber` | **Not built.** Eighth of the capped primitives | **Build it here**, minimally. `006` called a toast "a system — a portal, a stack, a timer per item, a manual-dismiss path" and deferred it. One screen needs one toast; see Q-4 |
| A section `Card` | **Not one of the eight.** `component-inventory.md` does not list it | **Feature-local layout, not a primitive.** Two bordered sections on one screen do not justify a ninth primitive; if a second screen wants the same box it is promoted then, with a written reason (ADR-011 §3) |

`Checkbox`, `Table`, and `Modal` remain unbuilt and are not needed here. The cap after
this feature stands at **six of eight** — `Button`, `Input`, `Badge`, `Select`, `Textarea`, `Toast`.

### `Textarea` as its own primitive, and the written reason the cap demands

`component-inventory.md` caps the set at **eight** and requires a written reason for
anything beyond it. `Textarea` is the **fifth** primitive built. This is its reason.

The inventory lists a comment composer under `Input`'s consumers, which reads as
"`Input` handles multi-line". **That was written before `Input`'s shape was settled in
`023`**, and the shape that was settled is single-line:

- Its **height is a token** — `--field-height-sm` / `-md` / `-lg`, three fixed values.
  A multi-line control's height comes from its content and its `rows`, so it has no
  height token to consume and would have to ignore the one it is given.
- **A `multiline` flag makes half the props conditionally invalid.** `rows` means
  nothing when it is false; `size` means nothing when it is true; `inputMode` and
  `maxLength` behave differently across the two. A props table where the validity of one
  field depends on the value of another is a table that has to be read twice, and the
  compiler cannot enforce it without a discriminated union — at which point it is two
  types wearing one name.
- The two also differ in behaviour a caller can see: resize, `Enter` submitting versus
  inserting a newline, and where the character counter sits.

**`Loader` does not consume a slot.** `component-inventory.md` lists "a generic spinner"
under *Not built* and names the converge loader as what stands in its place, so it was
never competing for one.

**The arithmetic, so it is not discovered later.** Built after this feature: `Button`,
`Input`, `Badge`, `Select`, `Textarea`, `Toast` — **six of eight**. The two remaining
slots have **three** known claimants: `Checkbox` (`013`), `Table` (`008`/`010`), and
`Modal` (`012`). The cap is reached before all three arrive, and the feature that needs
the third either writes the reason or the cap is revisited. Recorded here because a cap
that quietly stops being counted is not a cap.

---

## 3 · In scope

- The route `/tickets/new`, inside the app shell, reachable from the sidebar CTA that
  `023` already renders
- `CustomerPicker` — debounced search, ≥2 characters, 300ms, single selection, keyboard
  navigable as a listbox
- `TicketForm` — `subject`, `description`, `category`, `priority`, `channel`
- React Hook Form + Zod, **one schema** driving both types and validation (ADR-011 §7)
- TanStack Query for the search read and the create mutation
- Every state in `009/frontend-spec.md`'s table — none optional
- The four failure paths: `400` field-level · `404` customer gone · `401` · malformed
- `Select`, `Textarea`, `Toast`, and the feature-local section card
- The provisional types, in one file, under the conditions in §5
- Every string from the catalogue in `en` **and** `ar`, parity-gated
- The Arabic walk of this screen, recorded — RTL defects are visual
- The **preview before wiring** (`FE-009-00`, Phase 3b, ADR-009)

## 4 · Out of scope

| Excluded | Where |
|---|---|
| The ticket **detail** screen the `201` navigates to | `010`. See Q-2 — this is a real gap, not a deferral |
| The ticket list | `010` |
| Creating a customer from the picker's empty state | `007`. The link is rendered; its destination does not exist yet — Q-3 |
| Assigning at creation · setting a status · comments · escalation | `011` · `012` · `013` · `016`. BR-2.7 keeps triage and ownership separate |
| Authentication, the token, the `401` redirect target | `004`. The endpoint is temporarily open — see §6 |
| Replacing the provisional types with generated ones | The task exists (`FE-009-05`) and fires when `/swagger` is real |
| Templates · drafts · custom fields · attachments | No requirement; attachments are out of scope project-wide |
| `Checkbox`, `Table`, `Modal` | Their first consumers |

---

## 5 · Provisional types — the authorised exception

ADR-011 §6 requires the client's API types to be **generated** from the OpenAPI document,
never hand-written. Generation does not exist yet. Written permission was given on
2026-08-26 to hand-write them under these conditions, and the conditions are the
specification:

1. **One file only:** `src/wasl-web/src/lib/api-types.provisional.ts`. No domain type
   appears in any other file — not in a component, not in a query hook, not in the Zod
   schema module.
2. **Every type carries this comment, verbatim:**
   ```ts
   // PROVISIONAL — hand-written against specs/009-create-ticket/
   // contracts/tickets-api.md (frozen). Delete when OpenAPI
   // generation lands. ADR-011 §6.
   ```
3. **Written from the frozen contract literally** — not from the guide, not from an
   example payload. Where the contract is silent, ask; do not infer.
4. `CommunicationChannel`, `TicketStatus`, `TicketPriority`, and `TicketCategory` are
   **transcribed character for character** from the contract's enum table. `Sms`, not
   `SMS`. `WhatsApp` with a capital A. A one-character difference breaks the icon map,
   which keys one asset per channel by name.
5. `createdByUserId: string | null` — **nullable, not optional**. `009` ships without
   authentication and returns `null`; the field stays in the shape so that `004` filling
   it in is not a breaking change.
6. `allowedTransitions: TicketStatus[]` — the screen **renders** it. It is never derived,
   never recomputed, never filtered client-side (ADR-004).

The exact enum values, from the contract:

| Enum | Values |
|---|---|
| `category` | `Billing` · `Technical` · `Account` · `General` |
| `priority` | `Low` · `Normal` · `High` · `Critical` |
| `channel` | `Email` · `WhatsApp` · `LiveChat` · `Sms` · `WebForm` |
| `status` | `New` · `Open` · `InProgress` · `PendingCustomer` · `Resolved` · `Closed` |

**The backend is still closing `009`.** If the contract moves, these types move with it —
which is affordable precisely because they are in one file, and is the reason condition 1
is a condition rather than a preference.

---

## 6 · What is different because `004` has not landed

The contract describes the finished world. Three things are not true yet, confirmed by
the backend lane on 2026-08-26:

| The contract says | Today |
|---|---|
| `Authorization: Bearer <JWT>` on every call | **No token is sent.** The endpoint is temporarily open. `lib/api.ts` already carries the single `TODO — 004-auth-and-roles` insertion point and attaches nothing |
| `401 errors/unauthenticated` | **Cannot occur.** The branch is still written — it is four lines and the contract is frozen — but it has no redirect target, because there is no sign-in screen. See Q-5 |
| `createdByUserId` is the token's user | **`null`.** Nullable in the type, and any UI that would show a creator must handle it from the start |

None of this changes the wire shape. When `004` lands, the value is filled in and nothing
here is rewritten.

---

## 7 · Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | A ticket is created in a browser: the form posts, the response's `Location` is read, and the returned `ticketNumber` is shown verbatim — Latin digits, no reformatting, in both locales |
| AC-2 | The ticket section renders **disabled with an explanation** until a customer is selected. Not hidden. The explanation is available to a screen reader, not only visually |
| AC-3 | Search is debounced at 300ms and fires at ≥2 characters. Fewer characters issues no request |
| AC-4 | The result list is a listbox: arrow-navigable, Enter selects, and every result carries `dir="auto"` because a customer name may be Arabic |
| AC-5 | Empty search renders "no matches" plus a link to create a customer, carrying a `returnUrl` |
| AC-6 | `subject` and `description` are **trimmed before measuring**. Three spaces fails client-side rather than arriving as a `400` |
| AC-7 | Character counters appear from 180 and 3800, sit at the inline-end, and are `aria-live="polite"` — they do not announce on every keystroke |
| AC-8 | `priority` is omitted from the request when the user did not touch it. `""` is never sent |
| AC-9 | Every enum option list is built from the constants in `api-types.provisional.ts`. No option list is hand-typed in a component |
| AC-10 | On `400`, each `errors[field]` message is attached to that field by its own name — no mapping table — and focus moves to the first invalid field |
| AC-11 | On `404`, the picker selection is cleared and **every other field the user typed is preserved**. Identified by `errors.customerId`, not by the `type` alone |
| AC-12 | While submitting, the submit is disabled and the fields are read-only, so a double-click sends **one** request. The endpoint is not idempotent; this is the only thing preventing two tickets |
| AC-13 | The client never generates a `ticketNumber`, never computes `allowedTransitions`, and never sends `createdByUserId` |
| AC-14 | No domain type appears outside `api-types.provisional.ts`. A script asserts it |
| AC-15 | Every user-facing string is a key present in `en` **and** `ar`, and `npm run lint:i18n` passes. One key per enum value, the key carrying the wire value |
| AC-16 | Every control is keyboard reachable with a visible focus ring; every field has a programmatic label; a placeholder is never the only label |
| AC-17 | The screen is walked in Arabic and the findings are recorded in `tests.md`, including "nothing found" if that is the truth |
| AC-18 | `Select` renders default, hover, focus, open, disabled, error, and an empty option — every state in `component-inventory.md`'s table. `Textarea` renders default, hover, focus, disabled, error, with-helper and with-error, resizes on the block axis only, and never inherits a field height token |
| AC-19 | The preview is rendered and reviewed **before** anything is wired (Phase 3b), and it is rendered **in Arabic first**. The three-selects-in-one-row question is answered on the Arabic labels, which are the longer ones |
| AC-20 | `npm run build`, `lint`, `lint:css`, `lint:i18n`, and `typecheck` all pass with zero warnings |

---

## 8 · Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | The frozen contract does not move while this is built | The provisional types change. One file, by design |
| A-2 | `POST /api/tickets` is reachable at `VITE_API_BASE_URL` without a token | The form cannot be exercised end to end; the preview and the component tests still stand |
| A-3 | Three selects fit on one row at 720px in Arabic | `009/frontend-spec.md` predicts they will not. **The preview is built in Arabic first, not English** — an English preview would answer the wrong question and pass, and the layout would fail later at the Arabic pass when it costs hours. The fallback is one select per row |
| A-4 | A minimal `Toast` is enough for one screen | If a second consumer needs stacking or per-item timers, it is promoted then |

---

## 9 · Open questions

**Every one of these blocks or changes real work.** None is filled in with a guess.

| # | Question | Why it matters | Working assumption |
|---|---|---|---|
| **Q-1** | `GET /api/customers` **does not exist** — there is no `CustomersController` and no `Features/Customers/`. Its contract is frozen. Stub the fetcher, or wait for `008`? | The picker is the first thing on the screen and every other field is disabled behind it | **Stub it against the frozen contract**, as `009/FRONTEND-API-GUIDE.md` itself instructs — "build the picker against its contract and stub the fetcher". The stub lives beside the real query hook and is swapped by deleting it |
| **Q-2** | A `201` navigates to `/tickets/{id}` and **that screen does not exist** (`010`). `023` mounted placeholder routes for the nav destinations, and `/tickets/:id` is not one of them | AC-1 says the flow ends at the detail. Today it would end at a 404 or a blank placeholder | Navigate anyway, to a **placeholder that renders the returned `ticketNumber`**. It proves the `Location` round-trip and it is one component `010` replaces. The alternative — staying on the form — would make the created ticket invisible |
| **Q-3** | The empty-search state links to `/customers/new`, which **does not exist** (`007`) | A link to nowhere is worse than no link | Render the link **disabled with an explanation**, the same pattern as the disabled ticket section. It is visibly a thing that will work, not a broken control |
| **Q-4** | `006` deferred `Toast` on the grounds that it is "a system — a portal, a stack, a timer per item, a manual-dismiss path", not a component. This screen needs one message | Building the system costs more than the screen | **One toast, no stack, no portal** — rendered in the shell's content region, auto-dismissing, manually dismissible. Recorded as a deliberate reduction, so the second consumer knows what it is inheriting |
| **Q-5** | The `401` branch has **no redirect target** — there is no sign-in screen (`004`) | Writing a branch that cannot be reached, to a route that does not exist | Write the branch; route it to `/`. Four lines, the contract is frozen, and leaving it out means `004` has to find every call site |
| **Q-6** | `009/tasks.md` already carries `FE-009-00` … `FE-009-06`. Do those IDs stay, or become `FE-024-*`? | Task IDs are cited in `tests.md` and the board | **`FE-024-*`**, with a line in `009/tasks.md` pointing here. `specs/README.md` says the number in a task ID is the feature folder's number; keeping `FE-009-*` in folder `024` breaks that |
| **Q-7** | Is `Card` really not a primitive? `05-create-ticket.md` calls the two sections "Section card" and gives it tokens | If a third screen wants it, three copies exist | **Feature-local.** `component-inventory.md` does not list it among the eight, and promoting it on one consumer is what the cap exists to prevent |
| **Q-8** | The screen needs `Select` states that `component-inventory.md` lists but no design source specifies — **open**, and **multi-select** | An invented open-state treatment looks deliberate and is not | Build **single-select only**; no multi-select until a screen needs one (`015`'s filters). The open state follows the field's focus treatment already settled in `023`. Recorded as `(D)` |

---

## 10 · Deviations

| Deviation | Reason | Removed when |
|---|---|---|
| **Hand-written API types**, against ADR-011 §6 | Permission given by the product owner on **2026-08-26**. OpenAPI generation does not exist, and the alternative is a screen that cannot be built at all. Contained to one file, `src/wasl-web/src/lib/api-types.provisional.ts`, so a contract change is one diff and the swap is one deletion | **CONDITION MET 2026-08-30, AND THE OWNER MOVED.** The condition was written as *"when `/swagger` is real"* — and **there is no `/swagger`, deliberately** (`002c`: the document is generated and NOT served, because serving it needs `AllowAnonymous` and would be the third anonymous endpoint on a list `004` AC-10 counts). What the condition actually meant — a generated OpenAPI document to generate from — arrived with `002c` on 2026-08-30. **The swap is now `028-generated-api-types`.** It was `FE-014-12` until 2026-08-30, and was split out because regenerating types touches every consumer of one file: a horizontal change inside a vertical feature. The file is deleted, not edited — a generated type disagreeing with a hand-written one is the finding |
| `FE-009-*` task IDs superseded by `FE-024-*` | `specs/README.md`: the number in a task ID is the feature folder's number | On approval of this spec |
| `Toast` reduced to one non-stacking message | Q-4 | At its second consumer |
| `Card` built feature-local rather than as a primitive | Q-7, and the eight-primitive cap | At its second consumer, with a written reason |
| **`Textarea` as its own primitive**, rather than `multiline` on `Input` | `component-inventory.md` caps the set at eight and requires a written reason for a ninth. It is in §2: `Input`'s height is a token and its behaviour is single-line, and a `multiline` flag would make half its props conditionally invalid. Decided by the product owner on **2026-08-26** | Not removed. It is permanent, and takes the set to **six of eight** |

---

## 11 · What fails silently here

The rows that look like success. Each is why an acceptance criterion exists.

| Silent failure | Why nobody notices | Caught by |
|---|---|---|
| A hand-typed `'SMS'` instead of `'Sms'` | The dropdown looks complete. The server returns a `400` that reads as a **backend** bug, and the backend lane investigates its own code | AC-9 — every option list is built from the constants file, which is transcribed from the contract |
| An enum value added on the server | The dropdown is silently missing a real, selectable category. Nothing throws, no test fails, and the key-parity gate cannot see a key missing from **both** catalogues | Nothing, until generation lands. **This is the strongest argument for `FE-009-05`** and it is why the provisional file is one file |
| `.min(1)` instead of `.trim().min(1)` | Three spaces passes the client and fails the server. The user sees a server error on a field the form said was fine | AC-6 |
| Sending `priority: ""` when untouched | A `400` on a field the user never opened | AC-8 |
| A resolved promise treated as success without reading `Location` | The ticket exists and the user is left on a form that looks like it did nothing | AC-1 |
| Computing `allowedTransitions` client-side "to save a round trip" | Correct until the state machine changes, then wrong in one place only — and BR-1 is the rule the assessment weighs most | AC-13 |
| A `404` that resets the form | The user's typing is destroyed by someone else's data change. It reads as the app losing work | AC-11 |
| No submit guard | Two identical tickets, and the endpoint has no duplicate rule to catch it. The support team finds it, not the developer | AC-12 |
| A domain type copied into a component "just for now" | The generated-types swap then misses it, and the two disagree silently | AC-14 |
| The disabled ticket section conveyed only by opacity | A screen-reader user finds a form that does nothing and is told nothing | AC-2 |
| Three selects that do not fit the Arabic labels | Found after the screen is wired, tested, and translated, when it costs hours instead of minutes | AC-19 — the preview, before wiring |

---

## 12 · Rules referenced

**ADR-011** §3 feature folders and when to promote · §4 only the route fetches · §6 types
are generated, never hand-written · §7 one Zod schema, no barrels ·
**ADR-004** the state machine lives in the domain, once ·
**ADR-007** §6 logical properties · §8 `dir="auto"` on user content · §9 CLDR plurals ·
**ADR-009** preview before build ·
**BR-6** both roles may create — no `403` · **BR-8.6** server messages arrive translated ·
**BR-8.7** enum values are never translated · **BR-8.8** no hard-coded string ·
**BR-8.11** catalogue parity · **BR-8.13** Latin digits in identifiers ·
**BR-1.1** creation status is `New` · **BR-2.7** triage and ownership are separate ·
**BR-9** the audit row is the server's, in the same transaction ·
**`component-inventory.md`** the eight-primitive cap and each primitive's state table ·
**`05-create-ticket.md`** the element-by-element screen spec ·
**constitution III** the client mirrors a rule to tell the user sooner, and is never the
authority.
