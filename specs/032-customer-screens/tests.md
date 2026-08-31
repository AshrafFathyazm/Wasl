# 032 — Evidence

Every number here was observed in a run on **2026-08-31**. Nothing is asserted from
memory. Where a measurement contradicts something written in this repository, the
contradiction is recorded rather than resolved.

---

## 1 · The runs

```text
cd src/wasl-web

npx tsc -p tsconfig.app.json --noEmit      → no output (clean)
npm run lint                               → eslint . , no output (clean)
npx vitest run                              → Test Files  24 passed (24)
                                              Tests      376 passed (376)
npm run build                               → ✓ built in 783ms
```

**376 tests, of which 60 are this feature's.** The suite stood at **316** before `032`.

| File | Tests | Covers |
|---|---|---|
| `features/customers/CustomerProfilePage.test.tsx` | 17 | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 · AC-10 · AC-11 · Q-5 |
| `features/customers/CreateCustomerPage.test.tsx` | 16 | AC-1 · AC-6 · AC-7 · AC-8 · AC-9 · AC-10 · the `returnUrl` |
| `features/customers/createCustomer.schema.test.ts` | 12 | AC-9, BR-4.1 · BR-4.2 · BR-4.3, the length maxima |
| `features/customers/customerGuards.test.ts` | 15 | AC-12 · AC-13, and that no duplicate pre-check exists |

Two chunks were added to the production bundle and no more — ADR-011 §7's one chunk per
page:

```text
dist/assets/CreateCustomerPage-B1kFJY5O.js      5.66 kB │ gzip: 2.09 kB
dist/assets/CustomerProfilePage-BjJBjKjJ.js     9.70 kB │ gzip: 2.63 kB
```

`ls dist/assets | grep -i preview` → **no output.** The preview harness is stripped, as
`routes.tsx` claims.

## 2 · The criteria, and where each is met

| # | Criterion | Test | Verdict |
|---|---|---|---|
| AC-1 | Reads from `GET /api/customers/{id}`; nothing renders a customer from a write response | `calls GET /api/customers/{id} with the id from the URL and renders it` · `navigates by the Location header and seeds no customer cache entry` | **Met.** The second asserts `client.getQueryData(['customer', id])` is `undefined` after a `201` |
| AC-2 | A well-formed unknown id and a malformed id both reach not-found | three cases in `AC-2 — both id shapes reach the not-found state` | **Met**, including the contract's `400` that the server does not currently send |
| AC-3 | The error state carries the `traceId` | `renders the traceId verbatim, isolated LTR, with a Retry that refetches` · `shows no traceId when the request never reached a server` | **Met** |
| AC-4 | Copy writes the raw value | `copies the whole id while the screen shows a truncated one` | **Met.** Asserts the clipboard payload **and** that the full id is absent from the DOM |
| AC-5 | Empty notes are distinguishable from loading and from error | three tests in `AC-5` | **Met** |
| AC-6 | One request per submit, name unchanged | `sends exactly one POST for two synchronous clicks` · `keeps the submit control's accessible name while the request is in flight` | **Met** |
| AC-7 | A `400` renders the server's message, read as a string | three tests in `AC-7` | **Met.** One of them is the negative control: a key-shaped message renders verbatim |
| AC-8 | The `409` names the field, offers find-existing, and no pre-check exists | `names the field and offers a search for the value that collided` · `issues no request before the submit` · `reaches the network from customers.api.ts and nowhere else` · `exposes exactly two fetchers` | **Met** |
| AC-9 | BR-4.1 as a cross-field refinement, hint above both fields | `renders the contact rule as a hint on an empty form, not as an error` · `blocks a submit with a name and no contact method, naming both fields` · the schema suite | **Met** |
| AC-10 | Email and phone LTR, name/company/notes follow their content | `keeps the address and the number LTR while the name follows its content` · `carries dir="ltr" on phone only, in the Arabic interface` · §3 below | **Met, and it changed the implementation** — see §3.2 |
| AC-11 | Dates through `lib/formatters.ts` | `renders the created and updated dates in Latin digits in both locales` | **Met.** Asserts **two** rows carry the value, so a dropped row fails |
| AC-12 | No hex, no raw radius or spacing, logical properties only | 11 tests in `customerGuards.test.ts` | **Met**, and it found a real literal — see §4 |
| AC-13 | Every state rendered in Arabic and recorded | §3, with screenshots | **Met** |
| AC-14 | The profile preview reviewed before wiring | `/_preview/customer-profile`, eight variants | **Met** — and the preview is what found two of the three defects in §3 |

## 3 · What the browser found that 60 green tests did not

Chrome, 1120px, the interface in Arabic. **Three defects, and jsdom could not see any of
them.** This is the section worth reading.

### 3.1 · The preview page did not render at all

```text
Unexpected Application Error!
You cannot render a <Router> inside another <Router>.
```

`CustomerProfilePreview` wrapped every frame in a `MemoryRouter`, because the view holds
three `Link`s. The preview route is mounted **inside** the application's router, so
react-router refused and the whole page became an error boundary.

**Fifty-nine unit tests were green while this was broken**, because each of them mounts a
page in its own `MemoryRouter` and none of them goes through `routes.tsx`. That is the same
blind spot that let `/tickets` render a placeholder for an entire release — recorded in
`routes.tsx`'s own comment — and it recurred here in a different shape.

### 3.2 · `dir="auto"` on an element whose text is inside a `<bdi>` inverts its alignment

Measured before the fix, in the Arabic frame:

| element | `dir` attribute | computed direction | box (x) | its avatar (x) |
|---|---|---|---|---|
| `h2` — the name | `auto` | **ltr** | 57 → 673 | 667 → 671 |
| `h2 > bdi` | — | rtl | 57 → 165 | |
| `p` — the company | `auto` | **ltr** | 57 → 673 | |
| `p` — the notes | `auto` | **ltr** | 350 → 720 | |

`dir="auto"` reads the first strong character **in** the element and skips any descendant
that manages its own direction — which is what a `<bdi>` is. With the text inside a bdi
there is nothing left for `auto` to see, so it fell back to `ltr`, and `text-align: start`
resolved to the **left** edge inside an RTL page. The Arabic name rendered 610px from its
own avatar while the bdi inside it was correctly `rtl` the whole time.

After removing `dir="auto"` from the four user-content elements:

| element | computed direction | box (x) | avatar (x) |
|---|---|---|---|
| `h2 > bdi`, Arabic | rtl | **565 → 673** | 667 |
| `h2 > bdi`, English | ltr | 867 → 1017 | 869 |

**This deviates from `07-customer-profile.md`**, which specifies `dir="auto"` on the name
and the company. The deviation is deliberate and the measurement is the reason.

### 3.3 · The phone placeholder rendered its country code at the far end

`/customers/new`, interface in Arabic:

| field | placeholder | computed direction | rendered |
|---|---|---|---|
| name | (none) | ltr | — |
| email | (none) | ltr | — |
| phone | `+966 5X XXX XXXX` | **rtl** | **`5X XXX XXXX 966+`** |

`+`, the spaces and the digit groups are all directionally weak or neutral, so an RTL
paragraph reorders the runs — and the result still looks like a phone number, which is why
it survives a glance. `Input` hard-coded `dir={type === 'password' ? 'ltr' : 'auto'}`.

**A phone number is the same class of value as a password**: not language content, no
strong character of its own. `Input` gained a `dir?: 'auto' | 'ltr'` prop, default
unchanged, and the phone field passes `'ltr'`. After the change:

```text
dirAttr: "ltr" · computedDirection: "ltr"
placeholder: "+966 5X XXX XXXX" · value: "+966 50 123 4567" · <html dir="rtl">
```

### 3.4 · The Arabic frame rendered English labels — a preview defect, not a gap

The first browser pass showed Arabic **data** under English **labels** inside a correct RTL
layout: `Email`, `Record details`, `Added`. i18next has one current language per instance,
so both frames rendered whichever was active. `cloneInstance({ lng })` per frame fixed it,
and the Arabic frames then read the real catalogue:

```text
loaded:    العملاء · علي الأحمد · البريد الإلكتروني · نسخ البريد الإلكتروني · رقم الهاتف · الشركة
notFound:  عميل غير معروف · هذا العميل غير موجود · العودة إلى قائمة العملاء
error:     تعذّر تحميل الملف · 0HN7QK3M9V2P1:0000000B · إعادة المحاولة
```

**This is worth more than the copy maps the older previews carry.** `CreateCustomerPreview`
and `TicketDetailPreview` hard-code their strings, so they review copy that is not what the
product renders — and a key missing from `ar` is invisible in exactly the place it should
be loudest.

### 3.5 · Layout facts measured, not eyeballed

| Claim | Measurement |
|---|---|
| The strip divider moves to the inline-end under RTL | second cell: `border-right: 0.889px`, `border-left: 0px` |
| Email and phone stay LTR in the Arabic profile | both `computedDirection: ltr`, `dir="ltr"` |
| The trace id is isolated | `dir="ltr"`, text `0HN7QK3M9V2P1:0000000B` |
| The Arabic font is applied | `"IBM Plex Sans Arabic", "IBM Plex Sans", system-ui, sans-serif` |
| Three copy controls on a loaded profile | `3` buttons in the loaded frame |
| Eight variants render | `8` RTL frames |

Screenshots, in the session scratchpad: `profile-ar.png` (before 3.2), `profile-ar-fixed.png`
(full page, after), `create-ar.png` (English), `create-ar2.png` (Arabic, before 3.3),
`create-ar3.png` (after), `profile-wired-error-ar.png` (the wired route, Arabic).

**What was NOT verified in a browser:** the wired screens against a live API. The backend
stack was not started this session, so `/customers/new` and `/customers/:id` were opened
with a locally-written session entry (cleared afterwards) and the API unreachable — which
is why the wired profile screenshot shows the transport-failure state. The `200`, `404`,
`400` and `409` paths are covered by the unit suite against a mocked module, not by a real
round trip. That is a gap and it is stated rather than implied.

## 4 · The guards, seen to fail

`CLAUDE.md`: a guard that has never been seen to fail has not been verified. Five controls,
each run and then reverted.

| # | The change | Observed |
|---|---|---|
| C-0 | *(none — the first run of the guard against the real stylesheet)* | **Red on a real literal.** `Customers.module.css: gap: 2px: expected '2px' to match /var\(--/` — a 2px gap copied from the source document. Replaced with `var(--space-1)` |
| C-0b | *(the same run)* | **Red on the guard's own over-reach:** `expected 'var(--button-radius)' to match /var\(--radius-/`. `--button-radius` and `--field-radius` are defined in `tokens.css` as `var(--radius-sm)`, so refusing them would push this stylesheet into re-deriving a button's radius. The GUARD was wrong and was widened |
| C-1 | `.cellLink { color: #1570EF; }` | Red: `expected '…' not to match /#[0-9a-fA-F]{3,8}\b/` |
| C-2 | `font-family: var(--font-mono, monospace)` | Red: `expected [ '--font-mono' ] to deeply equal []`. **This is the failure the guard exists for**, and it was in the stylesheet on the first pass — the design specifies IBM Plex Mono and no such token exists. An undeclared `var()` renders as its fallback and nothing warns |
| C-3 | the double-submit ref guard removed from `CreateCustomerPage` | Red: `expected "spy" to be called 1 times, but got 2 times` |
| C-4 | `CopyValue value={shortId(customer.id)}` | Red: AC-4's clipboard assertion. The screen looked identical |
| C-5 | the `400` branch removed from the not-found mapping | Red: AC-2's third case only. The other two stayed green, which is the point of having three |

**The token-existence check is the one to keep.** It is *"verify a measurement with
something below it"* applied to CSS, and it caught a reference that compiles, renders, and
silently falls back.

## 5 · Contract-vs-build differences found, and NOT resolved here

`CLAUDE.md`: a difference between a frozen contract and the build is a defect in one of the
two, never fixed silently. Four, all raised as `032` Q-7.

| # | The frozen contract says | The build does | Evidence |
|---|---|---|---|
| 5.1 | `008`: a malformed `id` is `400 errors/validation` naming `id`, and *"there is no route constraint on `id`"* | `[HttpGet("{id:guid}")]`, so the route never matches → `404 errors/not-found` | The backend's own `A_malformed_id_returns_404_which_the_contract_says_should_be_400`, **green**. Its remark says *"this test goes red the day `002b` lands"* — and `CLAUDE.md` and `08-board.md` both record `008` AC-3 as **closed by `002b`**. The three cannot all be true |
| 5.2 | `008`: the `404` omits `detail` | It carries `detail: "No customer was found with that id."` | `CustomerReadTests` asserts that exact sentence |
| 5.3 | `008`: *"`IsActive` is **not** in the response … It arrives with `017`"* | `CustomerProfile` declares `bool IsActive`, and an inactive customer answers `200` | `GetCustomerByIdQuery.cs:37`; `The_profile_shows_an_inactive_customer_and_the_list_hides_it` |
| 5.4 | `008`: the read shape is *"a distinct type, `CustomerDetailResponse`, and not the same one reused"*; `007`'s `201` example carries neither `updatedAtUtc` nor `isActive` | **One DTO for both.** `CreateCustomerCommand : IAuditableCommand<CustomerProfile>` and `[ProducesResponseType(typeof(CustomerProfile), 201)]`. No `CustomerDetailResponse` type exists in the solution | `CreateCustomerTests:75` asserts `isActive` **on the `201` body** |

5.4 has a consequence for this feature that is recorded in
`api-types.provisional.ts` rather than hidden: `CreateCustomerResponse` is an **alias** of
`CustomerDetail`, so the compiler no longer objects to feeding a create response to the
profile. AC-1's rule is therefore carried by a test — `getQueryData(['customer', id])` is
`undefined` after a `201` — and not by the type system. **That is a weakening, and an
unrecorded weakening is how a rule dies.**

## 6 · Cross-lane edit, declared

`customers:new` was a **string** consumed by `features/tickets/CustomerPicker.tsx`, while
`08-create-customer.md` specifies `customers:new.submit`. Making `new` an object would have
rendered the raw key as the picker's button label, so both call sites were moved to
`customers:new.link` — a key change and nothing else, asserted by
`keeps customers:new an object with a link label, which the ticket picker reads`.

**The picker's disabled button and its "new customer unavailable" copy are now stale**:
`/customers/new` exists. `032` did not enable it — the picker has to consume the created
customer from the navigation state and `024`'s suite covers that flow. Left with a comment
naming the owner.

`tickets.api.ts` still carries `STUBBED_CUSTOMER_SEARCH = true` although `008` delivered
`GET /api/customers`. Also not touched, for the same reason, and stated here so it is not
mistaken for something `032` introduced.

## 7 · The token map — the source's literals, and what each became

The source document is raw hex throughout. Every value below was mapped rather than copied,
which is what AC-12's guard enforces.

| Source | Token | Used for |
|---|---|---|
| `#F9FAFB` | `--surface-content` / `--Neutral-00` | the page ground |
| `#FFFFFF` | `--surface-card` | cards, the strip |
| `#DEE5E7` | `--border-subtle` | every card border |
| `#EDF1F2` | `--border-divider` | the cell dividers, the record rows |
| `#0D2626` | `--text-primary` | values, headings |
| `#606873` / `#76818C` | `--text-secondary` / `--text-muted` | labels, secondary copy |
| `#B3BFC6` | `--text-placeholder` | the empty-notes line, the crumb separator |
| `#1570EF` | `--text-link` | the address and the number |
| `#F1F4F5` | `--surface-chip` | the copy control's hover, the pending icon |
| `#F3F3FB` / `#DDDCEF` / `#1D174D` | `--brand-subtle` / `--brand-border` / `--brand` | the avatar |
| `#FDE9EB` / `#C4362F` | `--state-danger-bg` / `--state-danger-text` | the error glyph, the form banner |
| `#2A7A72` | `--accent-presence` | the copy confirmation tick |
| `12px` radius | `--radius-lg` | cards |
| `6px` / `7px` radius | `--radius-sm` via `--button-radius` | controls |
| `999px` radius | `--radius-pill` | the avatar, the blank-state glyph |
| `IBM Plex Mono` | **not adopted** | `index.html` loads Plex Sans and Plex Sans Arabic only; a third webfont for two identifier strings is a request on every page load. System `monospace` instead, recorded in the stylesheet |
| `ldSkel` / `ldSpin` keyframes | **not adopted** | `029` owns the waiting vocabulary. `Skeleton` and `Button`'s own loader are used |

---

## 8 · The review round — five things the product owner saw that the tests did not

Same session, 2026-08-31, against the running dev server. **Every one of these was
green-on-green before it was reported**: 376 tests passing, `tsc` clean, `eslint` clean, and
a browser pass already recorded in §3. Listed because the pattern is now four for four —
what a screen LOOKS like is not something this suite measures.

| # | Reported as | Measured cause | Fix |
|---|---|---|---|
| 8.1 | *"في مشكلة في الوان بوتون الكوبي"* — the copy buttons were navy squares with white icons | `base.css` gives **every** bare `<button>` the primary fill with `!important`: `background-color: var(--action-primary-bg) !important; color: var(--action-primary-text) !important; -webkit-text-fill-color: … !important`. A class cannot beat `!important` on specificity, so `.copyButton { background-color: transparent }` was inert. Computed: `rgb(29, 23, 77)` / `rgb(255, 255, 255)` while this stylesheet said `transparent` | `!important` on all three, matching the house pattern `Input`'s `.reveal` and `Toast`'s `.dismiss` already use. Verified: `rgba(0, 0, 0, 0)` / `rgb(159, 171, 181)`, box `28x28` |
| 8.2 | *"الباك جراوند الفاضيه دايما يكون فيها لوجو wasl"* — an empty surface must carry the mark | Nothing in the product had a tiled brand pattern. `brand/Mark.tsx` has the glyph; the source design has the tile and this feature had not adopted it | Four tokens in `tokens.css` — `--wasl-pattern`, `--wasl-pattern-size`, `--wasl-pattern-mask`, `--wasl-pattern-opacity` — so the next empty state in the product uses the same asset rather than drawing a second one. Applied to both blank states via `::before`, which cannot be read by a screen reader at all (the design puts a real `<span>` there and then has to hide it) |
| 8.3 | *"فين الكوبي توستر"* — where is the copy toast | The toast is the PAGE's; the preview stood in for it with a line of text reading `copy → toast`. Defensible reason (eight fixed pills would stack in one corner) and it made the confirmation unreviewable — the state was listed as covered and could not be seen | The real `Toast` renders inside each preview frame. **The question was the correct one to ask of a preview claiming to show every state** |
| 8.4 | *"عرض التوستر ضخم جدا"* — the toast was a full-width bar | `Toast` is a block-level flex container with no width of its own — correct, since it is *"rendered inline where the caller puts it"* — so a slot with no constraint stretched it and the dismiss control ended up an inch from a four-word sentence | `inline-size: max-content` plus a cap on both slots. The primitive is untouched: positioning is the caller's by its own contract |
| 8.5 | *"دا الشكل الصح"* — the design groups the phone digits and labels the field الجوال | The screen rendered the raw E.164 `+966501234567` and the label `رقم الهاتف` | `formatPhone` in `lib/formatters.ts`, **Saudi mobiles only and every other number returned unchanged** — grouping is per-country and a wrong grouping reads as a typo in someone's number. Three tests. `ar.field.phone` → `الجوال`. **This makes AC-4 mean something for the phone**: the DOM now holds `+966 50 123 4567` and the clipboard holds `+966501234567`, asserted in both directions |

Two things this round ADDED to the design system, both additive and both recorded where they
live:

- **A fourth `Toast` tone, `inverse`** — the dark pill the design draws. The other three are
  untouched, so no existing caller moves. `030-feedback-layer` owns the product-wide toast
  rules and is approved for spec, **not** for implementation; it can keep, rename or drop
  this tone.
- **The brand pattern tokens**, above. The navy is a literal in `tokens.css` because a
  `var()` cannot be interpolated into a `data:` URI — and that file is the provenance file,
  which is why the AC-12 guard scans the two feature stylesheets and not it.

**One deliberate difference from the design remains in the toast:** it renders a `×`. The
design shows none, and `Toast`'s own comment makes manual dismissal non-optional — *"an
auto-dismissing message that cannot be dismissed by hand is a message someone reading slowly
loses"*. Kept, and named here rather than silently resolved either way.

### 8.6 · The toast size, and the property that was actually setting it

*"صغر حجم التوستر كمان شويه"* — and the padding was not the cause. Measured:

| | pill | padding | font | dismiss control |
|---|---|---|---|---|
| before | **139 × 58** | 8px / 12px | 12px | 16 × **40** |
| after | **139 × 39** | 8px / 12px | 12px | 16 × 14 |

The paddings were already the small ones. `base.css` gives every `button`
`block-size: var(--button-height-md)` — 40px — so the dismiss control stood 40px tall inside
an 8px-padded pill and set its height. Every padding value in this stylesheet said
otherwise, which is exactly why reading the CSS could not find it. `block-size: auto` on the
control inside the slot, and the pill collapses to its glyph.

The pill is also scoped smaller than the primitive's default — `--space-2` / `--space-3`
padding and `--type-body-sm` text against the primitive's `--space-3` / `--space-4` and
`--text-ui`. Scoped to the slot rather than changed in `Toast.module.css`: the primitive's
size is right for an inline message reporting an outcome inside a form, and this is a
floating acknowledgement. Two callers, two sizes, one component — the alternative is a
`size` prop on a primitive `030` is about to rule on anyway.

**That is the third time in this feature that `base.css`'s element rules were the cause** —
the copy button's fill (§8.1), the copy button's height, and this. A bare `<button>` in this
product is a primary button until a rule says otherwise, and the two properties that carry
it are `background-color` (with `!important`) and `block-size` (without).

### The runs after this round

```text
npx tsc -p tsconfig.app.json --noEmit   → exit 0
npm run lint                            → exit 0
npx vitest run                          → Test Files  24 passed (24)
                                           Tests     379 passed (379)
npm run build                           → ✓ built in 805ms
```

**379, up from 376:** three tests for `formatPhone`, plus two existing assertions rewritten
to the new truth — the profile now asserts the grouped form is on screen **and** the raw
form is not, and the create form's label matcher follows `الجوال`.
