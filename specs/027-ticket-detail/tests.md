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
