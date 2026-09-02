# `027-ticket-detail` — test evidence

**Delivered 2026-08-31.** Frontend lane.

```text
npx tsc -b --force        no output — clean
npm run lint              eslint . — no output
npm run lint:types        ✓ no hand-written domain types outside api-types.provisional.ts
npm run test              27 files, 441 tests, all passed
npm run build             ✓ built
                          dist/assets/TicketDetailPage-Cj2G8BWF.js   12.85 kB
                          dist/assets/TicketDetailPage-BFkvJWFK.css  13.52 kB
```

Before this feature: 422 in 26 files. **19 added**, all in `TicketDetailPage.test.tsx`.

---

## Acceptance criteria → named tests

| AC | Test | Result |
|---|---|---|
| AC-1 (reads from `GET`; nothing renders from a write; no `setQueryData`) | `renders the ticket the READ returned` **+** `refetches after a write instead of seeding the cache from the response` | pass |
| AC-2 (only `allowedTransitions`; **`[]` renders none**) | `offers exactly what the server sent` **+** `renders no status control at all for a Closed ticket` **+** `renders no composer for a Closed ticket` | pass |
| AC-3 (cursor; no entry twice) | `asks with a limit and no page number` **+** `loads earlier entries with the cursor it was given, never a derived one` **+** `offers no load-earlier control when the server says there is no more` | pass — and no-duplicates measured on the wire, below |
| AC-4 (`409` refetches, never retried) | `a 409 says what happened, refetches, and does not retry` | pass |
| AC-5 (`400` is a client bug, not recoverable) | `a 400 is shown as a client defect, not as a recoverable error` | pass |
| AC-6 (the client holds the **new** version) | `sends the version the ticket carried` **+** AC-1's refetch test | pass |
| AC-7 (picker from `GET /api/support-users`; the **server** decides) | `offers every support user, including for an Agent` **+** `sends the version with the assignment too` | pass |
| BR-1.2 (a note when closing unstarted work) | `does not send the transition until a note is typed` **+** `sends Resolved → Closed immediately, with no note demanded` | pass |
| The reachable failure states | `a 404 offers the way back rather than a retry` **+** `any other failure offers a retry rather than the way back` | pass |
| AC-8 (`dir` isolation), AC-9 (dates), AC-10 (Arabic), AC-11 (preview first) | — | **see *Not claimed*** |

## Every negative is a decoy, because the positive passes on a broken screen

- `offers exactly what the server sent` asserts `Open` is **absent**. `Open` is a real status
  and is not in `allowedTransitions`; without that line the test passes on a page rendering
  all six.
- `renders no status control at all for a Closed ticket` loops over four statuses rather than
  checking one, and is asserted with `allowedTransitions: []` — which is what AC-2 asks for
  and what a populated-array test cannot show.
- `a 400 …` asserts the `409` message is **absent**, and vice versa. Collapsing the two
  throws away the only one the reader can act on.
- `a 404 offers the way back` asserts the retry is **absent**. A retry on a `404` is an
  invitation to press it forever.

---

## FE-027-08 was blocked, and the block was correct

The frozen contract described `?page=&pageSize=` with the BR-7 envelope; the server has
always answered a cursor. The lane refused to transcribe either shape, and both refusals were
right:

- the **contract's** shape produces a client that sends `?page=2`, has both parameters
  ignored, receives the newest page every time, and renders a timeline that silently refuses
  to scroll back — nothing errors, nothing is red;
- the **implementation's** shape ratifies an unrecorded contract change from the client side,
  which `CLAUDE.md` forbids by name.

**Ruled by the backend lane on 2026-08-31: the implementation is the truth**, because
`CLAUDE.md` already named the cursor for this endpoint and `013`'s `summary.md` records it as
a chosen design at its Q-B. The frozen file was simply never updated — the defect was the
omission. Recorded as a **Contract change** at the foot of
`013/contracts/ticket-timeline-api.md`, and the guide's superseded paging recipe now carries a
warning above it.

### Measured on a running instance, not transcribed

```text
GET /api/tickets/{id}/timeline?limit=3
  page1: n=3  hasMore=true   commentCount=1  historyCount=6
  page2: n=3  hasMore=true            (?before=<page1.nextCursor>)
  duplicate ids across the two pages: NONE

?type=Comments  ->  1 item,  types: Comment
?type=History   ->  6 items, types: Created, Assigned, StatusChanged, CommentAdded
?type=Comment   ->  400   ← the entries' own `type` says Comment SINGULAR
```

**`?type=` is plural and the entry's `type` is singular**, so the natural guess is a `400`.
That is the trap, and it is now in the contract's amendment.

### The cursor is not in the query key

A cursor is a position inside one logical list. In the key, every scroll-back becomes a cache
entry nothing invalidates, and `hasMore`/`nextCursor` belong to whichever page was fetched
last. `useInfiniteQuery` accumulates under one key. **The filter IS in the key** — `Comments`
and `History` are different lists with different counts.

---

## A `500` on the way, and the suite is blind to it by construction

```text
GET /api/tickets/{id}/timeline  ->  500
SqlException: Invalid column name 'AuthorCustomerId'.
             Invalid column name 'AuthorKind'.
   at TicketTimelineQuery.Handle(...)  TicketTimelineQuery.cs:198
```

Not a code defect. `034`'s two migrations were on disk and the local database had **eight of
ten** applied. `dotnet run --project src/Wasl.Api -- --provision` fixed it.

**The integration suite passed 589/589 throughout**, because `Testcontainers` builds a fresh
database with every migration on every run. The drift only bites a long-lived database, so no
test can see it. Worth knowing before the next person reads a green suite as proof that a
running instance is current.

---

## Four gates each caught something real

### `029` AC-12 — the moved CSS became a shipped component

Moving `TicketDetailPreview.module.css` beside the page it styles made it *shipped*, and
`loaderSystem.test.ts` went red on the same run: the file declared its own
`@keyframes shimmer`. `029` established one waiting vocabulary, and a second animation is not
a duplicate of the first but a second answer to *is this still loading* — different duration,
different easing, two skeletons on one screen pulsing out of step. Rebuilt on
`components/Loader/Skeleton`. **The guard scans by LOCATION rather than by a list somebody
maintains, which is the only reason it fired.**

### `lint:types` R1 — a domain-prefixed name, and a duplicated enum list

`interface TicketFilters` reads to the gate as a shape transcribed from a frozen contract. It
is not; it is the screen's filter state. Renamed `FilterState`, following the precedent
already written into `ListParams`. And the same file had declared `TICKET_PRIORITIES`,
`TICKET_CATEGORIES` and a channel list a **second** time — `api-types.provisional.ts` exports
all three with `satisfies`. **Two lists for one enum is exactly the drift that file exists to
prevent**, and it would have survived the switch to generated types.

### `tsc` — a type written from caution rather than measurement

`TimelineEntry.actor` was typed `| null`. The server's DTO is `TimelineActor Actor`,
non-nullable, while `RecordedBy` beside it is `TimelineActor?`. Eight `actor is possibly null`
errors in the preview, for a state the wire cannot produce. **The actor's own `id` IS
nullable** — `011` fixed `PerformedByUserId` being NULL on every history row ever written, and
a row from before that fix still has a name and no id. Corrected to the DTO, and `channel`
typed as the enum rather than a bare string.

### A test — a label that would have shipped reading `{{status}}`

`detail.moveTo` is `"Move to {{status}}"`, an interpolated per-transition label. The first
version used it as a select's label with no variable, so the control rendered literally
**`Move to {{status}}`**. Caught by a test looking for the accessible name; nothing else would
have. It is one button per allowed transition now, which is what the design's take-action menu
asks for and which renders the permitted set where a reader can see it.

---

## BR-1.2 is not in `allowedTransitions`, and the screen asks anyway

`New → Closed` and `Open → Closed` are both permitted by the BR-1 map and both answer `400`
with `errors.note` when the note is absent — the same rule that turned a `015` backend test
red earlier the same day. So the screen asks before sending: **a validation error naming a
field the reader was never shown is the worst kind.**

`Resolved → Closed` deliberately does not ask. `012` Q-1 ruled that demanding a reason for the
expected outcome trains people to type nothing useful, and both halves are asserted.

---

## Not claimed

| What | Why |
|---|---|
| **Anything visual** — the rendered look, RTL on screen, contrast, focus rings, the layout at a real viewport | **No browser was driven.** `chrome-devtools` MCP disconnected during this session and the project has no Playwright or Puppeteer — searched, not assumed. jsdom has no layout: these tests prove a control writes a request and cannot prove the panel is not overlapping the table. **A gap, not a pass** |
| **AC-10** — every state rendered in Arabic and recorded | Same reason. The catalogue has parity and **parity is not a reading**; Q-8 stands |
| **AC-11** — the preview reviewed before wiring | The preview existed and was approved before this; it was not re-reviewed after the `Skeleton` rebuild |
| **AC-8** — `dir` isolation asserted | `dir="auto"` is on the subject, the description and every comment body, and no test reads the attribute. Written, not verified |
| **AC-9** — dates through `lib/formatters` | `formatDateTime` is used; no test asserts Latin digits on this screen |
| ~~Tags and canned replies~~ | **BUILT 2026-08-31**, after the backend lane added the two reads `034` shipped without. 451 tests. See the section below |
| Escalation | `016`, and `027` §5 puts it out of scope. `isEscalated` is on the response and is not rendered here |
| The rail, the anchors, the sticky action bar | In the preview and in `04-ticket-detail.md`; this page is the flat layout. Named rather than quietly dropped |

---

# Tags and reply templates, added 2026-08-31

```text
npx tsc -b --force   clean       npm run lint       clean
npm run lint:types   clean       npm run test       27 files, 451 tests
npm run build        ✓ built
```

Before: 441. **10 added** — six for tags, four for templates.

## The backend had to move first, and that was the finding

`034` built `PUT` and `DELETE /api/tickets/{id}/tags/{tagId}` and **neither read a client
needs**: nothing returned the vocabulary to attach FROM, and the ticket response carried no
`tags`. **A UI could write tags it could neither list nor display.** Found by building this
screen and measuring the response — `tags` came back `undefined`.

The backend lane added `GET /api/tags` and `tags` on the ticket, recorded as a Contract
change at the foot of `034/contracts/ticket-detail-api.md`. `652595e`.

## `?category=` WIDENS, and the fixture has to show it

Measured before the picker was written:

```text
GET /api/canned-replies              5   Technical · Billing · Billing · null · null
GET /api/canned-replies?category=Billing
                                     4   Billing · Billing · null · null
```

**The two general templates come back too, and the Technical one does not.** A template with
no category applies to every ticket, so filtering the nulls out would hide the general replies
exactly when a category is known — which is always. The test fixture therefore carries one
categorised template and one general one; a fixture with only categorised templates cannot
show the behaviour at all.

The picker labels the difference (`detail.templateGeneral`), because an unlabelled general
template reads as one that was miscategorised.

## Criteria → tests

| What | Test | Result |
|---|---|---|
| The read is what renders | `renders the tags the READ returned` | pass |
| The empty case is stated, not blank | `says so when a ticket has none, rather than showing an empty row` | pass |
| No write whose outcome is already applied | `offers only the tags not already attached` | pass — **control below** |
| Attach then refetch, never `setQueryData` | `attaches, then refetches rather than seeding the cache` | pass |
| Detach, by a control named after its tag | `detaches through a control named after the tag it removes` | pass |
| The vocabulary is not a ticket | `does not refetch the vocabulary when the ticket is invalidated` | pass |
| The templates are asked for by category | `asks for the templates that apply to this ticket` | pass |
| A template INSERTS, never sends | `inserts the body into the draft and sends nothing` | pass |
| A general template is labelled | `labels a template with no category as applying to every category` | pass |
| No templates, no control | `renders no picker at all when the server offers nothing` | pass |

**A template inserts rather than sends**, and the test asserts `addTicketComment` was *not*
called. A picker that sent would post an unedited form letter with one click.

## Negative control

The filter that hides an already-attached tag was removed:

```text
× `034`'s tags … > offers only the tags not already attached
    → expect(element).not.toBeInTheDocument()
```

Restored, 451/451.

## Two tests were red first, and it was the same slip twice

```text
Unable to find an accessible element with the role "combobox" and name "Insert a template"
```

The picker renders only once the templates have arrived, and the tests were waiting for the
**ticket**. A resolved query is not a painted screen — the identical mistake failed four tests
earlier in this file. `findByRole` waits; `getByRole` does not.

## Still not claimed

- **Nothing visual.** No browser was driven; the tag chips' wrap behaviour at a real width and
  the picker's overlap are unverified. `dir="auto"` is on every tag name and no test reads it.
- **`034`'s `authorKind` and `recordedBy`** are on the timeline entry and are not rendered — a
  customer-authored comment looks like any other. `034` built them the same day and `027`'s
  criteria are silent on both.
- **No `expectedVersion` on either tag write**, which is the server's shape rather than an
  omission here: attaching is not a state transition and two people attaching different tags do
  not conflict. So this is the one write on the screen that cannot answer `409`, and nothing
  tests a conflict here because the server cannot produce one.

---

## 4 · 2026-09-01 — the v3 canvas, and the rule "if the backend hasn't got it, it isn't in the design"

**Asked for** with `Wasl Ticket Details v3.dc.html` and eleven follow-up frames. The rule
came with it, in the product owner's words: build the columns the backend has, and
*"لو حاجه او اكشن او كولوم ملهوش موازي ليه في الباك اند اعتبره مش موجود في الديزاين"*.

The screen this replaces was the one `9a64dd5` built from the approved v2 preview: a stack
of accordion sections, a 240px anchor rail, a take-action menu and a sticky bottom bar. v3
is a different screen, not a restyle of that one.

### 4.1 · What the backend actually has — measured, not read off the C# records

```text
GET  /api/tickets/{id}                 19 keys, and TWO of them no client type declared
GET  /api/tickets/{id}/timeline?type=  Comments | History, plus BOTH counts on either
POST /api/tickets/{id}/comments        isInternal
PUT  /api/tickets/{id}/status          expectedVersion · allowedTransitions
PUT  /api/tickets/{id}/assignee        expectedVersion
PUT/DELETE /api/tickets/{id}/tags/{id}
GET  /api/tickets?customerId=          accepted since `010`; no screen had ever asked
GET  /api/support-users · /api/tags · /api/canned-replies?category=
```

**Two fields were on the wire and in no client type**, which is the same class of gap `027`
§3 recorded for `assignee` and costs the same thing — a field the server sends that nothing
declares is a field no screen can show:

```text
keys(response) … "updatedAtUtc","closedAtUtc","allowedTransitions","version","tags"
keys(customer) … "id","fullName","email","companyName"
companyName  "Gulf Services Ltd."      closedAtUtc  null
```

Both are now declared, and both render: the company under the customer's name, the closing
time as a rail row that appears only when there is one.

### 4.2 · The five regions of the canvas that have no backend, and what happened to each

| Canvas draws | Backend | Built as |
|---|---|---|
| SLA pill · rail SLA block · «خُرق زمن الحل» banner | nothing: no due date, no first-response, no SLA field, table or setting | **absent** |
| «تمديد الاستحقاق» | no endpoint, and no SLA to extend | **inert menu row** |
| «تصعيد» | `016`, unbuilt. `isEscalated` is read-only | **inert menu row** |
| «دمج مع تذكرة أخرى» | no endpoint of any kind | **inert menu row** |
| «@ مناداة زميل» | no field on a comment, no notification, nothing to resolve a name against | **absent** |
| priority-change history row | no `PriorityChanged` in `TicketHistoryEventType` | **cannot arrive; nothing renders it** |
| the assignee's department («وكيل · الفوترة») | `SupportUserOption` is `(id, fullName, role)` | **role only** |
| per-tag colour | `TagSummary` is `(id, name)` | **derived from the name — see 4.4** |

**The menu was left out entirely on the first pass and the owner overruled that**, which is
the better answer and worth keeping the reason for: an ABSENT control says the product cannot
do this; a DISABLED one with a stated reason says *not yet*, and the screen carries its own
roadmap. What it must never be is enabled and silent. Every inert row names the cause —
*«غير متاح بعد — لا يوجد في الخادم ما ينفّذ هذا الإجراء»* — rather than apologising.

**«إغلاق التذكرة» is live, and it is the status machine's**, not a second path to `Closed`:
it renders enabled only when `allowedTransitions` contains it, and it goes through the same
BR-1.2 note gate. On an `InProgress` ticket it is inert with its own reason, because BR-1
does not permit that transition — measured on screen, four rows, four states.

### 4.3 · What the browser caught that 49 passing tests did not

Chrome DevTools MCP left this session's tool registry mid-task, so the pass was driven over
CDP directly (`puppeteer-core` from the npx cache the MCP itself had installed). Three
findings, and the first is the one that matters:

**1 · The feed was upside down.** The tab strip is labelled «الأحدث أولاً» and the history
read oldest-first under it.

```text
GET …/timeline?limit=4&type=History
08:51:33 CommentAdded · 08:52:27 CommentAdded · 08:52:38 Assigned · 08:53:10 StatusChanged
```

ASCENDING. The SQL orders `OccurredAtUtc DESC` and the handler hands the page back
oldest-first — `013` Q-2's chat order, newest at the bottom. v3 reverses that ruling, so the
client flips it, **per page and not over the flattened list**:

```text
page 0 asc [a b c]   page 1 asc [x y z]   (z older than a)
flat then reverse  → [z y x c b a]   the second page sorts ahead of the first
reverse each page  → [c b a][z y x]   strictly descending
```

My test had asserted *"the server's order, untouched"* — which was my assumption about the
server, not a measurement of it. Two tests now: one on a single page, and one on two pages
that is the only one able to fail on the flatten-then-reverse version. **Control run: it went
red on exactly that test and on nothing else.**

**2 · The assignee panel was trapped behind the composer.** `position: sticky` on the rail
**establishes a stacking context** — unlike `relative`, and unlike what the code reads like —
so the panel's `z-index: 200` ranked it *inside the rail*, and the rail was a positioned box
at `z-index: auto`. The composer's own `position: relative` wrappers come later in the
document and painted straight through it: the template button and the internal switch showed
on top of an opaque panel. `z-index: 1` on the rail is enough to beat every `auto` sibling and
stays far below the shell's `--z-flyout`.

**3 · The panel opened in the wrong place**, because it hung off the 28px pencil rather than
the rail group. One `position: relative` box, one panel, `inset-inline-start: 0` — which is
right in both directions. It also collapsed two copies of the panel into one; they had been
one per branch, agreeing about geometry, `currentId` and the busy flag by hand.

**And two of my own measurements lied before they were fixed**, both worth recording because
both produced well-formed reports about nothing:

- `document.querySelector('[aria-haspopup="menu"]')` returned the **shell's account button**
  and its three items were reported as the status menu's. Scoped to `main` now.
- the first CDP run screenshotted the **login screen four times** and reported no errors: the
  token lives in `sessionStorage` without "remember me", so a new browser process starts
  unauthenticated even on the same profile directory.

### 4.4 · Colour that is derived, and the two corrections it took

The owner ruled that tags carry different colours, that a person's avatar differs from the
next person's, and that the history's person glyph follows the actor. **None of that exists in
the backend.** So the tint is derived from the identity — a sum of code units over the
name — which is the whole difference between decoration and invented data:

- the same tag is the same colour on every ticket and every reload
- the same person is the same colour in the rail, in their comments and in the picker, which
  is what makes it a scanning aid
- nothing is *claimed* by it. It says "this is a different one", never "this one is urgent" —
  a tag tint that MEANT something would need a field

**Two corrections, both from the screen.** Three buckets over five tags collided by
arithmetic — four amber chips and one grey. Six buckets then produced two washes nobody could
tell apart, because the palette has five usable hues and red is danger, not decoration. The
answer is five hues, mixed strongly enough to survive a 25px chip, **and a de-collision walk
within the ticket**: the hash chooses, a collision takes the next free bucket. Both properties
hold — stable per tag across tickets, distinct within one.

### 4.5 · Run output

```text
frontend suite   27 files · 493 passed        (472 before this work)
                 TicketDetailPage.test.tsx     58 passed  (29 before)
tsc -b           exit 0
eslint .         clean
vite build       built in 1.86s
```

Two guards went red during the work and both were right:

- **AC-12** (`loaderSystem.test.ts`) refused `@keyframes dtPulse` in this feature's
  stylesheet. `029` owns the one waiting animation; the skeletons use `Skeleton` now. A guard
  that has been *seen* to fail.
- **BR-8.8** refused two JSX literals — a middot separator in the sibling row and one between
  the template menu's two catalogue strings. Both are glyphs rather than words and moved into
  the expression, named `DOT`.

### 4.6 · Open, and recorded rather than smoothed over

- **The preview now shows a superseded design.** `TicketDetailPreview.tsx` renders the v2
  accordion screen and imports the same stylesheet, which is why every v3 class is a new name
  (`sheet`, `headRow`, `composeBox`) and nothing above it was edited. `027` Q-5's ruling that
  *the preview IS the design* no longer holds: v3 came from the owner directly, and
  `docs/sdd/design/screens/04-ticket-detail.md` describes neither screen now. **The document
  and the preview both need the v3 pass; neither was done here.**
- **The dev database was being written to by something else throughout.** Comment counts on
  the measured ticket went 0 → 2 → 12 and the status changed under the measurements, with junk
  bodies («بصضصب») and assign/unassign churn. Not this lane. It is recorded because anybody
  re-running the numbers above will get different ones.
- **The visible-four window is a screen rule, not a page size.** `013`'s page stays fifty;
  «تحميل الأقدم» reveals four and fetches only when the fetched rows run out. One control for
  both, because to a reader they are one action.
- **Two avatars can share a tint.** Four buckets, no de-collision for people — unlike tags,
  where the owner asked for distinctness within the ticket. Two agents with colliding names
  will match, and the fix if it matters is the same walk.
- **The composer's amber Send reaches into a primitive** — one property, scoped to the
  wrapper. The alternative was a sixth `buttonType` on `Button` for one caller and one mode.
- **The «read only» notice fires on a 403 from a write**, which is BR-6's handler denial. A
  policy `403` has an empty body and never reaches a handler, so it cannot reach this banner
  either; on this screen no endpoint carries a policy, so that gap is theoretical here.

### 4.7 · Closing the four items §4.6 left open

**1 · The preview showed a superseded design — CLOSED by deleting it.**

`TicketDetailPreview.tsx` rendered the v2 screen from the same stylesheet the real page
uses, so every shared class silently restyled a design nobody was maintaining, and the next
reader to open `/_preview/ticket-detail` would have "fixed" the built screen to match a
superseded canvas. ADR-009's gate was spent: the screen is built and has been reviewed in a
browser by the owner, which is what a preview stands in for.

Deleted with its route, and the CSS it was the only consumer of went with it — pruned
mechanically rather than by eye, with every removed selector printed for review:

```text
consumers of the stylesheet   before: TicketDetailPage.tsx, TicketDetailPreview.tsx
                              after:  TicketDetailPage.tsx
classes the page names        169
rules dropped                 86   (.pageHead .toggle .frame .screen .topBar .strip
                                    .section .accordion .entry .composer .menu .dialog
                                    .picker .banner .empty .skel* .stickyBar …)
rules kept                    216
stylesheet                    62,847 → 43,298 bytes
```

Every dropped selector is a v2 or preview-harness name; the three that look like v3
(`.skelLine`, `.skelRow`, `.skelAvatar`) are the v2 spellings — v3 uses `.skRow` / `.skLines`
and takes its shapes from `Skeleton`. Verified after: 511 tests, tsc, eslint, build, and the
screen re-measured in a browser in both directions with nothing lost.

`docs/sdd/design/screens/04-ticket-detail.md` is **rewritten as the v3 design of record**,
keeping both earlier revision tables — a deleted decision is one somebody makes again. It
also corrects two things the v2 document asserted that the build measured false, and closes
its own open questions A and B.

**2 · The white page number — CLOSED as far as it can be, and the token comment that
misdirected it is fixed.**

The cause chain is exhausted: `--brand` and `--on-brand` are each defined exactly **once**,
in `tokens.css`, and are never scoped down — `grep` over `src/` for a redefinition returns
one line each. Nothing computes them at runtime: `grep setProperty` finds four callers and
none touches a brand token.

**The token comment said `COMPUTED at runtime` and that sentence was the leading hypothesis
for an hour.** Corrected in place rather than deleted, because the claim cost real time.

Four measurements, at page 1 and page 2, in both languages: the active button is
`rgb(29,23,77)` with white ink at rest, on hover, and with a sibling hovered. The symptom is
closed off instead of the cause — the fill is restated across `hover`, `focus`,
`focus-visible` and `active`, with `-webkit-text-fill-color` beside it because the base.css
war showed those two can diverge. **If it recurs, the state to capture is which page is
active and whether it had been clicked.**

**3 · Something else writing to the dev database — NOT A DEFECT.**

The comments arriving during the measurements are authored by **منى العتيبي**, the seeded
Manager, with `recordedBy: null` and bodies like «بصضصب» and «ليبا» — keyboard noise from a
signed-in session, not a process. That is the product owner's own browser on the same API.
Recorded so the numbers in §4.3 are read as a moving target rather than as evidence of a
second writer.

**4 · Two avatars sharing a tint — CLOSED with a better hash and a stated limit.**

The hash was the weak part, and it was measured rather than argued:

```text
sum of code units, 5 buckets   group sizes 4,3,1,1,1      «نورة السالم» = «منى العتيبي»
FNV-1a,            5 buckets   group sizes 3,2,2,2,1      all three seeded agents distinct
```

Arabic names are built from a small set of letters, so their code-unit sums cluster — two of
the three seeded agents collided at four colours *and* at five. FNV-1a with `Math.imul`
(32-bit, so the same name tints identically in every engine) spreads them, and the avatar
palette gains a fifth hue to match the tags.

**Ten people over five colours must collide.** That is pigeonhole, and the trade-off is now
written where the code is: a **tag** must differ from the tag beside it, so the hash chooses
and a collision walks to the next free bucket within the ticket; a **person** must be one
colour everywhere — the rail, every comment they wrote, the picker — so there is no walk,
because de-colliding per region would give one person two colours on one screen. Four tests
pin it, including the exact pair that used to collide, and a control that swaps FNV back for
the sum turns that one red.
