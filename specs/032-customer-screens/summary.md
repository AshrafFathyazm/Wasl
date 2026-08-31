# 032 — Summary

**Delivered** 2026-08-31 · frontend lane · 376 tests (60 new), 0 warnings, build clean.

Written for someone who was not present.

## What was built

Two screens over two endpoints that were delivered, tested, and called by nothing.

- **`/customers/:id`** — the customer profile. Contact strip (email · phone · company),
  notes, and a record card (added, last updated, the identifier). Four states: loading,
  loaded, not-found, failed. Copy-to-clipboard on the three values, each copying the **raw**
  stored value while showing the reader a formatted or truncated one.
- **`/customers/new`** — the create form, wiring FE-007-00's preview to
  `POST /api/customers`. One Zod schema drives the types and the validation, BR-4.1 is a
  cross-field refinement, and the `409` attaches the server's message to the field the
  server named plus a search for the value that collided.
- **`/_preview/customer-profile`** — the ADR-009 gate, eight variants, Arabic beside
  English, including the two states a wired screen can only reach by breaking something.

`/customers` itself keeps `023`'s placeholder. That was spec Q-1's whole question and the
answer turned out to be **already built**: `NAV_PATHS` mounts it, so the breadcrumb, the two
back-to-list controls and the `409`'s find-existing link all land on a real route.

## Why it was built this way

**The view is a component and the page is the route.** `CustomerProfileView` takes a state
and a customer as props; `CustomerProfilePage` owns the single `useQuery`. That is ADR-011
§4, and it is also what makes the preview able to render `notFound` and `error` on demand.
Those two are the states this screen exists to get right — **a `404` is an answer and a
failed request is not** — and a preview that has to break a server to show them reviews
neither.

**No Edit control.** `017` is not built; there is no `PUT /api/customers/{id}` in the API at
all. `07-customer-profile.md` says *hidden until US-003 ships*, and absent beats disabled: a
disabled button here would be a promise about an endpoint.

**`CopyValue` is feature-local, not a ninth primitive.** `component-inventory.md` caps the
set at eight and requires a written reason. This has one consumer. If a second screen needs
it, that is the reason and it moves then.

**The phone field has no fixed `+966` box**, although the design draws one (spec Q-3). A
static prefix makes a non-Saudi number unenterable through the UI while the endpoint accepts
any parseable E.164 — a client narrowing its own API, which is the one direction a client
may not narrow it. The country code is a placeholder and the server normalises.

**An inactive customer gets a badge and nothing else** (spec Q-5). The field exists on the
wire, the profile answers `200` for a deactivated customer, and tickets deliberately keep
linking to it — so hiding it would be wrong and acting on it would be worse, because
reactivation is undesigned.

## What deviated from the plan, and why

| Deviation | Reason |
|---|---|
| **`dir="auto"` removed from the name, both company renderings and the notes** — `07-customer-profile.md` specifies it | Measured: with the text inside a `<bdi>`, `auto` has no strong character to read and falls back to `ltr`, so `text-align: start` resolved to the LEFT edge in Arabic. The name rendered 610px from its own avatar. `tests.md` §3.2 |
| **`Input` gained a `dir` prop** — a contract change on a frozen primitive | Measured: the Arabic phone placeholder rendered `5X XXX XXXX 966+`. A phone number is the same class of value as a password — not language content — and `Input` already had that concept for exactly one type. Default unchanged, so no existing caller moved. `tests.md` §3.3 |
| **The preview clones an i18next instance per frame** | The older previews hard-code their copy because one instance has one language. Measured: the Arabic frame rendered English labels. Cloning shows the real catalogue, so a key missing from `ar` is visible where it should be loudest |
| **System `monospace`, not the design's IBM Plex Mono** | `index.html` loads two faces; a third webfont for two identifier strings is a request on every page load of the product |
| **A neutral `/` breadcrumb separator, not the design's chevron** | The source mirrors its chevron with `transform: scaleX(-1)`, which only holds while the document is RTL. A slash has no handedness to get wrong |
| **`CreateCustomerResponse` is an alias of `CustomerDetail`** | The build returns one DTO from both actions while two frozen contracts say it returns two shapes. Declaring the contract's narrower type would make fields the server demonstrably sends unreachable. `tests.md` §5.4 |
| **`customers:new` became an object, and `CustomerPicker` moved to `customers:new.link`** | `08-create-customer.md` specifies `customers:new.submit`; the picker consumed `customers:new` as a string and would have rendered the raw key |

## Known limitations

- **The wired screens were never exercised against a live API.** The backend stack was not
  started this session. The `200`/`404`/`400`/`409` paths are covered against a mocked
  module; the browser pass used an unreachable API, which is why the wired profile
  screenshot shows the transport-failure state. Stated in `tests.md` §3, not implied.
- **No customer list.** Three affordances point at `/customers`, which renders `023`'s
  placeholder. Until the list ships, find-existing after a `409` lands on a page that
  explains rather than searches — and BR-4.7 means search is the only possible route to that
  record.
- **`updatedAtUtc` always equals `createdAtUtc`.** `017` has not shipped. The row is
  rendered anyway; the equality is a fact about this release, not about the screen.
- **Only Saudi mobiles are grouped for display.** ~~The phone value is rendered exactly as
  the server returns it~~ — that was true at delivery and was corrected in the review round:
  `formatPhone` now renders `+966 50 123 4567`, and **every other number is returned
  unchanged**, because grouping is per-country and a wrong grouping reads as a typo in
  someone's number. `POST /api/customers` accepts any parseable E.164, so a `+44` or `+1`
  customer displays in E.164 while a Saudi one displays grouped. That inconsistency is
  deliberate and it is the honest one.
- **Four contract-vs-build differences are open** (`tests.md` §5, spec Q-7), including one
  where a green backend test, `CLAUDE.md` and the board cannot all three be true about
  `008` AC-3.
- **The Arabic copy is authored in this repository, not transcribed from the source
  document.** The document arrived by a channel that is lossy on non-ASCII — measured, spec
  §2 — so its own wording is still unread. It is diffed against the catalogue when the file
  is vendored byte-exact (spec Q-6).
- **`030` owns the toast rules and is not approved for implementation.** This screen uses the
  existing `Toast` primitive at a fixed bottom-inline-start slot, which `030` may move once,
  product-wide.
- Two stale things in the tickets lane were found and deliberately left: the picker's
  disabled *New customer* button, and `STUBBED_CUSTOMER_SEARCH = true` although `008`
  shipped the endpoint. Both belong to the lane that owns that screen. `tests.md` §6.

## The thing worth remembering

**Sixty unit tests were green while the preview page rendered nothing but an error
boundary**, because every test mounts a page in its own `MemoryRouter` and none of them goes
through `routes.tsx`. Two of the three defects this feature found came from opening a
browser, and the third came from the guard for AC-12 failing on its first run. None of them
was findable by reading the code — and the bidi one had a correct-looking `dir="auto"`
sitting on the element, which is the version a reviewer approves.

---

## Addendum — the review round, same day

The product owner reviewed the running screens and reported five things, **all of them
visual and none of them visible to the suite**: the copy buttons rendered as navy squares,
empty surfaces carried no brand pattern, the copy toast was missing from the preview, the
toast stretched to full width, and the phone was neither grouped nor labelled as the design
labels it. `tests.md` §8 carries the causes and the measurements; the short version:

- **`base.css` styles every bare `<button>` as a primary button with `!important`.** A
  feature stylesheet cannot beat that with a class, which is why `Input`'s reveal affix and
  `Toast`'s dismiss already use `!important` — this now matches them, with the reason
  written beside it.
- **An empty surface carries the mark**, product owner's rule. Four tokens in `tokens.css`
  so the next empty state uses the same asset, applied through `::before` rather than the
  design's real `<span>` — decoration in the markup is decoration a screen reader has to be
  told to ignore.
- **The preview was standing in for the toast with a line of text.** That is why the
  question *"where is the toast"* could be asked at all, and it was the right question: a
  preview that lists a state as covered has to show it.
- **`Toast` has a fourth tone, `inverse`** — the dark pill the design draws. Additive; the
  other three are untouched and `030` still owns the product-wide rules.
- **`formatPhone` groups Saudi mobiles and returns every other number unchanged.** Grouping
  is per-country and a wrong grouping reads as a typo in someone's number. It also makes
  AC-4 mean something for the phone: the DOM now holds `+966 50 123 4567` while the
  clipboard holds `+966501234567`, asserted in both directions.

379 tests, `tsc` and `eslint` clean, build clean.

**One difference from the design is kept deliberately:** the toast renders a `×`. The design
shows none; `Toast`'s own contract makes manual dismissal non-optional, because an
auto-dismissing message that cannot be dismissed by hand is one a slow reader loses. Named
rather than silently resolved.

**The pattern is now four for four.** Every defect in this feature that a user would see was
found by looking at the screen — twice by me in a browser, twice by the product owner — and
none by 379 green tests. The suite protects behaviour; it has never once protected
appearance.
