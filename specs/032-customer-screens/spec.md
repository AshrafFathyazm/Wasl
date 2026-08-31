# 032 — Customer Screens · FRONTEND

**Phase:** 4 · **Lane:** Frontend only · **Status:** spec, awaiting review
**Extends:** `006-design-system` (delivered inside `023`) · `029-loader-system` ·
`docs/sdd/design/screens/07-customer-profile.md` · `docs/sdd/design/screens/08-create-customer.md`
**Consumes:** `007`'s frozen `customers-api.md` · `008`'s frozen `customers-read-api.md`
**Source:** `Wasl Customer Screens.dc.html` — a canvas design document, authored in Arabic,
supplied 2026-08-31. **It is not in the repository** and this feature vendors it. See §2.
**Scope ruling:** product owner, 2026-08-31 — **view and add only.** Edit is `017`'s and is
not built here, although the source document designs it. See §6.

---

## 1 · What this is

Two screens over two endpoints that are delivered, tested, and called by nothing.

```
GET  /api/customers/{id}     008 · 408 tests · the profile
POST /api/customers          007 · 434 tests · the create
```

`routes.tsx` has **no `/customers` route of any kind** — the customer surface in the running
product is a picker inside the ticket form. What exists is
[CreateCustomerPreview.tsx](../../src/wasl-web/src/dev/CreateCustomerPreview.tsx) at
`/_preview/create-customer`: `FE-007-00`, an ADR-009 preview built before any wiring, still
untracked. So the create screen is **a preview to wire, not a screen to invent**, and the
profile has neither preview nor route.

The source document supplies three screens — profile, create, edit — as one canvas with a
mode-switched form. Two of the three are in scope.

## 2 · The Arabic in the source could not be read, and that is measured

The document arrived by paste, not as a file. The channel is lossy on non-ASCII, exactly as
recorded in `030` §2: UTF-8 Arabic arrives as cp1252 mojibake with the C1 bytes stripped. Two
labels round-tripped through `Encoding.GetEncoding(1252).GetBytes` → `Encoding.UTF8.GetString`:

| In the supplied copy | Recovered |
|---|---|
| the profile tab label | `ت?اص?? ا?ع???` |
| the form tab label | `إضا?ة ع???` |

Roughly one glyph in three survives. What **is** readable: layout, the state machine, every
`data-*` hook, the colour values, the ARIA attributes, and the English code comments — which
carry the reasoning and are the most valuable part of the document. What is **not**: a single
Arabic string.

**Gate.** No Arabic value is transcribed into `locales/ar/customers.json` from this copy. The
file is vendored byte-exact into `docs/sdd/design/` first, as `030` Q-1 requires of its own
source. Until then the catalogue **keys** are named by this spec and the **values** are pended.

## 3 · What the built API does that the frozen contracts do not say

Read from the code and the green test suite, not from the contracts. Per `CLAUDE.md`, a
difference between a contract and the build is a defect in one of the two and is never fixed
silently — so each row is raised in §8, and this feature codes against **what the server does**.

| # | The contract says | The build does | What this screen must do |
|---|---|---|---|
| 3.1 | A malformed `id` is `400 errors/validation` naming `id`, and *"there is no route constraint on `id`"* | [CustomersController.cs:102](../../src/Wasl.Api/Controllers/CustomersController.cs#L102) is `[HttpGet("{id:guid}")]`, so the route never matches and the answer is `404 errors/not-found`. Asserted green by `A_malformed_id_returns_404_which_the_contract_says_should_be_400` | **No malformed-id branch.** One not-found state serves both inputs |
| 3.2 | The `404` omits `detail`, *"rather than carrying 'customer 8f1c… does not exist'"* | It carries `detail: "No customer was found with that id."` | Render the screen's own not-found copy. Do not surface `detail` — and do not assert its absence either |
| 3.3 | *"`IsActive` is **not** in the response … It arrives with `017`"* | `CustomerProfile` declares `bool IsActive`, and `The_profile_shows_an_inactive_customer_and_the_list_hides_it` asserts a deactivated customer returns `200` with `isActive: false` | The design has **no inactive treatment at all**. Q-5 |
| 3.4 | `updatedAtUtc` equals `createdAtUtc` *"until `017` ships an update path"* | Same | The design's record card mocks two different dates. Render the field; the difference is unreachable in this release |

3.1 has a second consequence worth writing down. The test's own remark says *"this test goes
red the day `002b` lands"* — and it is **green**, while `CLAUDE.md` and
[08-board.md](../../docs/sdd/08-board.md) both record `008` AC-3 as closed by `002b`. One of the
three is wrong. This feature does not resolve it; it is raised as Q-7, and the screen is built
for the `404` the wire returns today.

## 4 · What the design says that the house screen documents do not

| # | The divergence | Ruling asked for |
|---|---|---|
| 4.1 | The design's profile is **much leaner** than [07-customer-profile.md](../../docs/sdd/design/screens/07-customer-profile.md): no 240px rail, no counts by status, no recent-tickets list, and no `GET /api/customers/{id}/overview`. In its place is a dashed placeholder card that names `018` in so many words | `07` describes the screen `018` will build on an endpoint that does not exist. The design describes the screen `008` can serve **today**. Q-2 |
| 4.2 | Copy-to-clipboard on email, phone and id — and it copies the **raw stored value**, not the rendered one. The design comment gives the reason: `+966 50 123 4567` pasted into a dialler fails validation. `07` specifies `mailto:` / `tel:` links and no copy affordance. No copy primitive exists in [components/](../../src/wasl-web/src/components/) | Q-4 |
| 4.3 | The phone field is a **fixed `+966` prefix box** plus a `5X XXX XXXX` placeholder. `08` specifies a plain LTR input. A static prefix makes a non-Saudi number unenterable through the UI, while `POST /api/customers` accepts any parseable E.164 | Q-3 |
| 4.4 | The design's field errors are **client-authored Arabic** — *"must begin with 5 and be 9 digits"*. The server authors its own messages (BR-8), and `002c` replaced the framework's English ones with catalogue keys precisely so the client can render them | No ruling needed: Zod messages are pre-submit only; after a `400`, what renders under a field is `errors[field]` from the response. AC-7 |
| 4.5 | The design shows **Edit** on the profile unconditionally. `07` says *"hidden until US-003 ships"*, and `017` is not built | No ruling needed: the control is **absent**, not disabled. A disabled button with no path behind it is a promise |
| 4.6 | The design carries its own `ldSkel` / `ldSpin` keyframes, ~40 hard-coded hex values, and a dark bottom-inline-start toast. `029` already owns the waiting vocabulary and the motion tokens; `Toast` exists as a primitive; `030` owns the toast and banner rules and is **approved for spec, not for implementation** | No ruling needed: reuse `Skeleton` / `Loader` / `Toast`, map every hex to a semantic token, invent no new surface. `029` deleted a spinner product-wide, and this feature does not reintroduce one |
| 4.7 | The design's create-mode failure is a validation state; its amber *"someone else changed this"* banner belongs to the edit path. `08` specifies the `409 duplicate-customer` treatment: field-level error plus **Find the existing customer** → `/customers?search=<value>` | No ruling needed: `08` governs the `409`, and the amber banner leaves with `017`. AC-8 |

## 5 · In scope

- **`CustomerProfilePage` at `/customers/:id`** — contact strip (email · phone · company), the
  notes card, and the record card (created, updated, truncated id), each with the design's copy
  affordances
- **`CreateCustomerPage` at `/customers/new`** — the existing preview wired to
  `POST /api/customers`, React Hook Form + Zod, one schema driving types and validation
- **Profile states:** loading (skeleton, and the header travels with the body — the design's
  stated reason is that neither a `404` nor a failed request has an identity to put in a
  header) · loaded · not-found · error carrying the `traceId`
- **Form states:** empty · submitting · server field errors · `409` duplicate · `5xx` banner
  with the `traceId`
- Empty notes as a **muted line**, never an absent section — *"nothing written"* must read
  differently from *"nothing loaded"*
- Copy-to-clipboard: the raw value, with confirmation **on the pressed control and** in a toast
- `201` → follow `Location` to the profile; the `returnUrl` path back to `024`'s ticket form kept
- `CustomerDetail` and the create request/response added to
  [api-types.provisional.ts](../../src/wasl-web/src/lib/api-types.provisional.ts), marked
  provisional in the file that declares them, pending `028`
- Every string in `en` and `ar`, parity-gated; the Arabic pass over both screens, recorded
- **The profile preview before wiring** (ADR-009), Arabic first; the create preview reviewed as
  it stands against the vendored source
- A `/customers` placeholder route, so the breadcrumb, the two back-to-list buttons and
  find-existing land somewhere — the `026` precedent for `/tickets/:id`. Q-1

## 6 · Out of scope

| Excluded | Where it lives |
|---|---|
| Edit a customer, `PUT /api/customers/{id}` | **`017`** — spec, plan and a **frozen contract** exist; no `HttpPut` exists in the controller and its `summary.md` reads `Status: Not started`. The design's edit mode and its `409 concurrency-conflict` banner have no server behind them |
| The customer list and its search | Its own feature. Only a placeholder route here (Q-1) |
| Tickets on the profile, counts by status, `See all` | `018` |
| Deactivate · reactivate · merge | No endpoint, and `007`'s contract records reactivation as undesigned |
| Attachments | Out of product scope entirely |
| Types generated from OpenAPI | `028`, blocked pending authorisation. The two shapes stay provisional |
| Modal, side panel, new toast tones | `030` — approved for spec, **not** for implementation |
| Any new backend work | None. Both endpoints are delivered |

## 7 · Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | The profile reads from `GET /api/customers/{id}`. **Nothing renders a customer from a write response**, and no `setQueryData` seeds a customer key (`026` §5) |
| AC-2 | A well-formed unknown id **and** a malformed id both render the not-found state — asserted with **both** inputs, because the API answers `404` to each (§3.1) |
| AC-3 | The error state renders the response's `traceId` verbatim, LTR-isolated inside the Arabic layout |
| AC-4 | Copy writes the **raw** value: asserted by comparing the clipboard payload to the API's value, never to the rendered text. The rendered phone is spaced and the rendered id is truncated, so a DOM-based assertion passes on the wrong string |
| AC-5 | Empty notes render a muted line, asserted **distinct** from both the skeleton and the error state — three states that all show no notes to a shape assertion |
| AC-6 | One request per submit. The control is inactive while in flight and **its accessible name does not change** — the preview's existing ruling: swapping the label renames the control mid-action, and a screen reader announces a different button from the one that was pressed |
| AC-7 | A `400` renders the **server's** message under the field the server named, and the assertion **reads the string**. A raw resource key fails it — `errors[field]` with one entry is a shape assertion, and seventeen unresolved keys once shipped under exactly that assertion |
| AC-8 | A `409 duplicate-customer` names the field and offers find-existing to `/customers?search=<value>`. **No client-side duplicate pre-check exists anywhere in the diff** — check-then-create is a race that two requests both pass, and BR-4.8's index is the guarantee |
| AC-9 | BR-4.1 is one Zod cross-field refinement, and the hint sits **above** both contact fields — a cross-field rule explained under the second field is explained too late |
| AC-10 | Email and phone are LTR in the Arabic layout; `fullName`, `companyName` and `notes` are `dir="auto"`. Asserted, not eyeballed |
| AC-11 | Dates through `lib/formatters.ts` — Latin digits, Gregorian, in both locales |
| AC-12 | No hex, no raw px radius or spacing, no `left` / `right` in either `.module.css`. The design's ~40 literals are mapped to semantic tokens and the mapping is recorded |
| AC-13 | Every state of both screens rendered in Arabic and recorded in `tests.md` |
| AC-14 | The profile preview is rendered and reviewed **before** anything is wired. The create preview's divergences from the vendored source are recorded, not reconciled by quietly editing one of the two |

## 8 · Open questions

| # | Question | Why it blocks | Working assumption |
|---|---|---|---|
| Q-1 | Three affordances in the design navigate to a customer **list** that does not exist: the breadcrumb, the two back-to-list buttons, and `08`'s find-existing on a `409` | The `409` route is the one that matters — BR-4.7 forbids returning the existing customer's id, so search is the *only* way to reach it, and a dead link there removes the user's single path | **A placeholder `/customers` route**, as `026` gave `/tickets/:id` before `027` built it. The affordances render and lead to a page that says what is coming. The list itself is a later feature |
| Q-2 | Which document is authoritative for the profile: this design, or `07-customer-profile.md`? | They describe different screens on different endpoints (§4.1) | **The design, for `032`.** `07` stays `018`'s, and is revised from the approved preview afterwards — the `027` Q-5 pattern, where the document was rewritten *from* the preview and every change recorded |
| Q-3 | The fixed `+966` prefix box (§4.3) | It decides whether a non-Saudi customer can be created at all through the UI | **A plain LTR input with `+966…` as the placeholder.** The server normalises to E.164 and rejects what it cannot parse; a hard prefix narrows the API from the client, which is the one direction a client may not narrow it |
| Q-4 | Copy buttons, `mailto:` / `tel:` links, or both? | `07` says links, the design says copy | **Both**: the value is a link, the button beside it copies. They answer different needs, and the design's own reason for copy — the raw form — is not an argument against a link |
| Q-5 | An inactive customer renders as a normal one. `isActive` is in the built shape (§3.3), the contract says it is not, and the design has no treatment | A deactivated customer's profile is reachable and looks live. Tickets link to it deliberately, so a `404` would be wrong | **A neutral badge on the header, no new endpoint, no branch anywhere else.** It needs a ruling because the contract denies the field exists |
| Q-6 | The Arabic copy cannot be read from the supplied source (§2) | Every string on both screens | **Vendor the file byte-exact, then transcribe.** This spec names the keys; the values wait. No Arabic is guessed |
| Q-7 | §3's four contract-vs-build differences — whose defect, in each case? | `CLAUDE.md` forbids resolving one silently, and 3.1 has a green test, a board row and a `CLAUDE.md` line that cannot all three be true | **`032` codes against the built shape and records each difference.** The backend lane rules on 3.1 and 3.3; 3.2 and 3.4 are contract text to correct |
| Q-8 | Should the profile expose the customer's GUID at all, truncated and copyable? | It is the only place in the product that shows a raw id to a user | **Keep it.** It is the handle support quotes to an engineer, which is why the design copies the full value while showing eight characters |
| Q-9 | The design's toast is a dark pill at bottom inline-start. `030` is specced and not approved | Placement and tone of every confirmation on both screens | **The existing `Toast` primitive, at the placement `024` and the create preview already use.** `030` may move it later, once, for the whole product |
