# 038 — summary

**Delivered 2026-09-06.** `/tickets/new` rebuilt from the product owner's mock-up and six
named changes. 44 test files, **+33 frontend tests — 1063** (was 1030). No backend work, no
contract change.

## What was built

| | |
|---|---|
| **No conditional disabling** | The whole form is live from first paint. `024`'s `fieldset[disabled]`, its `<legend>` and «Select a customer to continue» are gone. Validation is `onSubmit`, then live per field |
| **Two columns** | `minmax(0, 1fr) 316px` above 1100px, stacked below. Declared in the stylesheet, with a source scan forbidding an inline `style` on the page |
| **Channel as five buttons** | One `role="radiogroup"`, `aria-checked`, roving tabindex, arrows that move the selection and reverse under RTL. A line underneath names the choice in words |
| **The customer card** | Name, email, company, «change» — and result rows carry company too. `companyName` was already on `CustomerListItem`; nothing moved on the wire |
| **Duplicate detection** | One request per selection for the four open statuses, five rows, count from `totalCount`. Amber banner, «show them» disclosure, a link per ticket and a «view all» when there are more |
| **The footer summary** | Fixed bar, «3 fields missing: …», every bad field marked, focus to the first one in reading order |
| **«New customer», wired** | `035`'s `CreateCustomerForm` in a `SideSheet` with a discard confirmation. The created customer is **read back** with `getCustomer(id)`, never seeded from the create response |
| **`Idempotency-Key`** | `036` shipped the server half five weeks ago and no client sent one. This one does |

New files: `RadioGroup.tsx` · `ChannelPicker.tsx` · `PriorityPicker.tsx` ·
`DuplicateWarning.tsx` · two test files. Rewritten: the page, the picker, the stylesheet,
the page's tests. Touched: `lib/api.ts` (a `headers` option), `tickets.api.ts`,
`tokens.css` (`--state-warning-border`), `iconCoverage.test.ts`, four catalogues.

## The four findings that came from RUNNING the mock-up

Reading it would have produced a different screen. It was opened in Chrome at 1443×900
before any code.

1. **Its two-column layout never renders.** `grid-template-columns` sits in the element's
   `style` attribute, which outranks the `@media (min-width:1100px)` rule in its own
   stylesheet. Measured: media query `true`, computed columns a single `1060px` track.
   **This is `027`'s `Sidebar.tsx` defect exactly** — module says one thing, computed style
   says another, nothing errors. Anyone "reproducing the mock-up faithfully" reproduces the
   bug, so `newTicketLayout.test.ts` scans the source and C1 plants the defect to prove the
   scan bites.
2. **Its duplicate banner has no number** — the template variable resolves to empty, and
   the banner ships reading «لدى هذا العميل ⟨ ⟩ تذاكر مفتوحة». The count here is
   `totalCount`, so nine open tickets say nine while five are listed.
3. **Its summary and its focus disagree** — it names the customer first, then focuses the
   subject, because its focus lookup only sees fields with `aria-invalid` and the customer
   search has none. **This bug then turned up in our own build from a different direction**
   (below).
4. **The attachment was mis-decoded** — UTF-8 read through cp1252. Recovered by
   re-encoding with 0 unmapped characters, but cp1252 has no code point for `0x81`, which
   is the second byte of `ف`: every `ف` in the mock-up is unrecoverable. Same class as
   `037` AC-13. All Arabic copy here is written, not transcribed.

## The bug the mock-up had, that we then wrote ourselves

AC-19's test failed on its first run. The page focused the customer search correctly and
**React Hook Form moved focus to subject a moment later** — `shouldFocusError` defaults to
`true`, runs after the invalid callback, and orders fields by registration.

Same visible defect as mock-up finding 3, reached through a library default rather than a
faulty query. `shouldFocusError: false` is the fix and the criterion goes red without it.
Two things follow: the summary and the focus now read **one ordered array**, so they cannot
drift apart; and `customerId` has no rendered control for RHF to reach at all, so its focus
is by element id.

## Trade-offs and deviations

| Decision | Why |
|---|---|
| **`aria-checked`, not the mock-up's `aria-pressed`** | Five mutually exclusive options are a radio group. `aria-pressed` is a toggle button: it announces "pressed / not pressed" per control, with no group and no "3 of 5", so a screen-reader user is never told the others changed |
| **«New customer» is `secondary-outline`, not a borderless text link** | `ButtonType` is `primary \| secondary-outline \| danger`. Adding a fourth variant to a frozen primitive for one call site is a change every screen inherits; ADR-011 §3 promotes on the **second** consumer. Slightly heavier than the mock-up draws — the trade, recorded rather than resolved by growing the component |
| **The head is a breadcrumb, not a back link** | `IconChevron` points forward and mirrors under RTL, so as a back arrow it is wrong in **both** languages. As a separator between «Tickets» and «New ticket» the same glyph is right in both, and it removed the mock-up's extra vertical rule |
| **The counter is always visible, not `counterFrom`-gated** | `023`'s Input reveals a counter near the ceiling, which suits a limit that is a safety net. Here the length is a writing instruction — one line — so `0/200` shows from the start |
| **All four priority dots carry colour** | `TicketBadges` mutes Low and Normal on purpose: "a table where every cell shouts says nothing". That rule is about a row among hundreds; this is a chooser of four where the dot's whole job is telling options apart. The loud end still agrees with the list |
| **One `RadioGroup` behind two pickers** | They look nothing alike and share every behaviour that is easy to get wrong. Written twice, the second copy is where the wrap-around is off by one and nobody notices |
| **Spacing is three values, not four** | The screenshot that prompted «شيل كل المساحات الفاضية» had 24px card padding + 24px stack gap + 16px card margin stacking into 64px of nothing between two fields — three defensible rules. The fix is one scale, not smaller numbers |

## The rulings, and what they cost the mock-up

All seven went to the product owner before any code; five mock-up decisions were overridden
by them. **R-7 was reversed the same day** — the first ruling changed `IconWhatsapp` to a
bubble with two ticks, the second kept the system's icon. `src/icons/` is untouched, no
other screen changes, and **`037`'s trademark question stays open where `037` left it**.
The consequence is recorded rather than quietly accepted: *"the official mark belongs on
the integration page"* is now a live instruction with no guard — the same shape `icons.md`
Rule 2 had for three releases before `037` measured it.

## Known limitations

1. **The running screen has not been walked, in either language.** Every paint criterion —
   rail order, `<bdi>` isolation, the counter, the fixed footer, the Arabic RTL pass — is
   recorded **NOT MET** in `tests.md` rather than assumed from a green suite. jsdom
   computes no layout; a unit test asserting these would be a well-formed report about
   nothing.
2. **AC-36 is half met.** The sheet opens and the ticket fields survive it. The
   `getCustomer` read-back is not driven end to end, because reaching `onCreated` means
   submitting `035`'s form inside the sheet — `035`'s test. The callback is read, not run.
3. **`lint:css` is red on `main`, and this feature did not make it so.** 19 errors, 18 of
   them pre-existing in `TicketDetail`, `TicketFilterBar` and `TicketList`. Mine is fixed.
   A gate that is red before you start is a gate everybody has learned to ignore — which is
   exactly the state `031` found `lint:tokens` in.
4. **The full suite needs `--max-old-space-size=6144`.** The default run died with a V8 OOM
   inside a worker, reported as `ERR_IPC_CHANNEL_CLOSED`. Not a test failure, and the
   failure lands nowhere near the cause.
5. **The subject counter is not asserted** and neither is `maxLength={200}`; both are in the
   source, and the number is the part that matters.

## Not built, and why

Assignment at creation is **drawn, disabled, and states why** (R-1). `POST /api/tickets`
carries no `assigneeId`. It has **no fetcher at all** — `getSupportUsers` exists and is
deliberately not imported, asserted by a source scan, because a `disabled` prop is one edit
away from deletion and a function that is not imported is not.

## For whoever picks this up next

- **`039-ticket-row-actions` is building in the same working tree.** It owns
  `src/components/Dropdown/useMenuSurface.ts`, which is modified and is **not** part of this
  feature. `git commit <paths>` — the lane rule exists because `20d7785` already swallowed
  another lane's work once.
- The three paint criteria above are the first thing to close, in Arabic first.
- `POST /…/comments` still has no idempotency story. This feature gave `POST /api/tickets`
  one; the comment endpoint is the other create `036` §3.5 named and left.

---

## Amendment — R-4b, previous tickets (2026-09-06, after delivery)

Added on a product-owner question: *why can a closed ticket not change status again?*

**It cannot, by design** — BR-1.5, ADR-004, encoded as an empty row in the one transition
map (`TicketStatusTransitions.RawMatrix[Closed] = []`). `Resolved → InProgress` is the
supported way back (BR-1.6). The recommendation was **not** to make `Closed` reopenable:

- A team that wants "reopen" is usually a team **closing** where it should be
  **resolving** — a workflow problem, not a rule problem.
- A reopenable `Closed` makes `ClosedAtUtc` ambiguous, and every duration derived from it
  with it. `020-dashboard` is built on those numbers.

**But the question exposed a real hole, and it was one this feature had just made.** R-4
scoped the duplicate banner to the four open statuses, so a customer whose ticket was
closed yesterday and who calls back today shows **nothing** — the exact case the banner
exists for. The fix is visibility, not a transition: a second, quieter line under the
banner listing the customer's `Resolved`/`Closed` tickets, newest first, three rows,
neutral rather than amber, each row carrying its status badge because `Resolved` invites a
reopen and `Closed` does not.

**The label I first proposed could not be built.** «أُغلقت خلال ١٤ يوماً» needs a closure
date, and `GET /api/tickets` has no `closedFrom` while `closedAtUtc` lives on the ticket
detail rather than on a list row. A creation-date window is wrong in both directions — a
ticket opened six months ago and closed yesterday is missed, one opened ten days ago and
closed nine days ago is included. So the copy makes the weaker claim it can support, and
**a test asserts the stronger one is absent**, because that sentence is exactly what
somebody adds back helpfully. C7 plants it and the test goes red.

**Two requests, not one split client-side.** Six statuses in one call returns five rows
that could all be closed, so the open count — the half that actually warns — would come
back wrong. Each count comes from its own `totalCount`.

+6 tests, two more negative controls (C6, C7), five new criteria (AC-40…AC-44), and
`IconHistory` came off `NOT_YET_CONSUMED` — the third icon in two days, each one found by
the guard rather than by a person.

**Still owed, unchanged:** the running screen has not been walked in either language, and
this amendment adds a region to that debt.
