# 027 — Ticket Detail · FRONTEND

**Phase:** 4 · **Lane:** Frontend only · **Status:** spec, awaiting review
**Supersedes:** the detail half of `FE-010-*`, as `026` superseded the list half

---

## 1 · What this is

The screen behind a row click. `026` made `/tickets/:id` reachable and it renders a
placeholder headed *"Ticket detail — not built yet."* This builds it.

**It opens four of the nine chapters in the demo script**, and it is the largest single unlock
left in the product: five endpoints are delivered, tested, and called by nothing.

```
GET  /api/tickets/{id}              009 · the ticket
GET  /api/tickets/{id}/timeline     013 · cursor-paged
POST /api/tickets/{id}/comments     013
PUT  /api/tickets/{id}/status       012 · expectedVersion
PUT  /api/tickets/{id}/assignee     011 · expectedVersion
```

**Four frozen contracts, not one.** `009` owns the ticket shape, `011` the assignee, `012`
the status, `013` comments and the timeline. `010`'s `contracts/` holds only the list. A
screen that reads one contract and assumes the rest is how a field goes missing.

## 2 · Three things the contracts say quietly

Named by the backend lane on 2026-08-30 and measured here against the running server.

### 2.1 · `allowedTransitions` arrives with the ticket. Render it, never derive it

```json
"status": "Resolved", "allowedTransitions": ["InProgress", "Closed"]
```

Measured. **Draw only what was sent.** A button for a transition not in the array is a
button whose only outcome is `409`, and BR-1 lives in `Wasl.Domain` once — a second copy in
React is correct until the day the map changes, then wrong in exactly one place nobody
looks at. An **empty array renders no control at all**, which is the `Closed` case.

### 2.2 · The timeline is a CURSOR. It is not pages

`?before=<cursor>&limit=` — while the list is an envelope. **The difference is deliberate
and must not be unified.** A list grows at the end the reader is *not* looking at, so page 2
stays page 2; a timeline grows at the end they *are* looking at, so a page number silently
skips or repeats entries between two requests.

`013` found exactly that — one comment on two consecutive pages — and the assertion that
caught it was *no entry appears twice*, not a count. A "Next" button carrying a page number
reintroduces it.

### 2.3 · `expectedVersion` has three answers, and the client can act on each

`PUT /status` and `PUT /assignee` both take the `version` that came with the ticket
(`"AAAAAAAAB+c="`, measured).

| Response | Meaning | What the screen does |
|---|---|---|
| `200` | Applied | Take the **new** `version` from the response. The old one is now a `409` |
| `400` | Missing, empty, or non-base64 | A bug in this client, not a user error. It must not reach a user as "try again" |
| `409 errors/concurrency-conflict` | Someone else changed it first | Refetch and tell the reader what happened. **Never retry silently** — the second write would apply to a state they never saw |

Three distinct answers is the whole point of the design; collapsing them into "it failed"
throws away the only one the user can act on.

## 3 · The defect that blocked this screen — FIXED 2026-08-30

`62af3cc`. Verified independently on the running server after the fix, all four cases:

| Case | Result |
|---|---|
| List, assigned | `assigneeName: "Omar Khalid"` on **3 of 3** |
| List, unassigned | both fields `null`, **and the rows are still returned** — an inner join would have dropped them |
| Detail, assigned | `assignee: {"id":…,"fullName":"Omar Khalid","role":"Agent"}` |
| Detail, unassigned | `assignee: null`, **and the key is present** — absent would be `undefined`, which renders empty and passes |

**The framing that settled it was `026` §5**, and it is worth keeping: the rule that no
screen renders a ticket from a write response, and nothing calls `setQueryData` from a
mutation, meant the name existed only in the one place the rule forbids keeping. Not *"the
screen would look better fixed"* but *"it cannot be fixed here without breaking a rule that
exists for a different and correct reason."*

**And the cause was sharper than either lane first said.** Not a join missing in two places:
`Map` takes `assignee` as a parameter **defaulting to `null`** — correct for creation,
because `009` AC-2 says a ticket is never assigned at creation. The write call passed it;
the two reads did not. **One mapper, three call sites, one of them right.**

Four tests were added with it, including the unassigned case and the `010` AC-12 query
counter — so a fix cannot become a query per row.

**Q-1 is closed.** Nothing in this feature is built around it, and nothing needs to be.
## 4 · In scope

- `TicketDetailPage` at `/tickets/:id`, replacing `024`'s placeholder
- Header, summary strip, description — `dir` isolation on subject and description, ticket
  number in Latin digits and `tabular-nums`
- The timeline: cursor-paged, oldest→newest, with a "load earlier" affordance that is **not**
  a page number
- Add a comment
- Change status — rendering **only** `allowedTransitions`
- Assign / reassign / unassign, using `GET /api/support-users` for the picker
- `expectedVersion` on both writes, with the three responses distinguished
- Five states per region: loading · loaded · empty · error · forbidden
- Every string in `en` and `ar`, parity-gated
- The Arabic pass over this screen, recorded
- **The preview before wiring** (Phase 3b, ADR-009), in Arabic first

## 5 · Out of scope

| Excluded | Where |
|---|---|
| Escalation | `016` |
| Attachments | Out of product scope entirely |
| Editing subject, description, customer, category | No endpoint exists |
| Customer profile link | `018`. The customer is text here, as on the list (`026` Q-3) |
| Audit log view | `019` |
| Generated types | `028`, and it is blocked pending authorisation |

## 6 · Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | The page reads from `GET /api/tickets/{id}`. **Nothing renders a ticket from a write response**, and no `setQueryData` seeds a ticket key (`026` §5) |
| AC-2 | Only transitions present in `allowedTransitions` render a control. An empty array renders none — asserted with `[]`, not only with a populated array |
| AC-3 | The timeline pages by cursor. **No entry appears twice across two consecutive pages**, asserted by identity — not by counting entries, which passes on a duplicate |
| AC-4 | A `409` on either write refetches and says what happened. It is **never** retried automatically |
| AC-5 | A `400` from `expectedVersion` is not shown to the user as a recoverable error — it is a client bug |
| AC-6 | After a successful write the client holds the **new** `version` from the response. A second write with the old one is asserted to `409` |
| AC-7 | The assignee picker lists `GET /api/support-users`; an Agent may only self-assign an unassigned ticket, and the **server** decides — the UI mirrors BR-2 for affordance only |
| AC-8 | `dir` isolation on subject, description and every comment body. A Latin comment in an Arabic thread starts on the same edge as its neighbours |
| AC-9 | Dates through `lib/formatters.ts`. Latin digits, Gregorian, in both locales |
| AC-10 | Every state renders in Arabic and is recorded in `tests.md` |
| AC-11 | The preview is rendered and reviewed **before** anything is wired |

## 7 · Open questions

| # | Question | Why it blocks | Working assumption |
|---|---|---|---|
| ~~Q-1~~ | ~~`assignee` / `assigneeName` are `null` on both read paths~~ | **CLOSED 2026-08-30, `62af3cc`.** Fixed at the source, verified independently, four cases. See §3 | — |
| Q-2 | Does the timeline load newest-first with "load earlier", or oldest-first with "load more"? `013` gives a cursor and no direction preference | It decides where the reader lands and which end grows | **Newest at the bottom, "load earlier" above** — a conversation reads down, and the newest entry is what the reader came for |
| Q-3 | Is the status control a menu or inline buttons? | ~~there is no detail-screen design document~~ — false, see Q-5. `04-ticket-detail.md` already specified a **Take action ⌄** menu, so this was settled before it was asked | **A menu**, approved — and the reason is that controls which appear and disappear per state read as a broken toolbar, not the count. Six statuses with three typically allowed is a menu; inline buttons that appear and disappear per state read as a broken toolbar |
| Q-4 | Does a comment support any formatting? | `013`'s contract carries a plain `body` | **Plain text.** Rendering markdown from a field the contract does not describe as markdown is an injection surface |
| ~~Q-5~~ | ~~There is **no design document for this screen**~~ | **CLOSED 2026-08-31 — the premise was false.** `docs/sdd/design/screens/04-ticket-detail.md` existed the whole time: 102 lines naming every region, every action with its endpoint and failure paths, and every state. `design/screens/README.md` lists it in the inventory. It was never opened. | The preview was measured **against** that document rather than substituting for it, and the document was **revised from the approved preview** on 2026-08-31 — four regions kept, five things replaced, each recorded in *What this revision changed* rather than edited away. Q-5's approved conditions still held: Arabic, 100 timeline rows, a 200-character subject, and the document written after approval, not before. **The wrong half is the claim that the preview had no source of truth; it had one, and checking took one `ls`.** |

---

## 8 · Revision — the v3 canvas, 2026-09-01

**This section is appended rather than edited into §4–§7, and the AC table above is left
standing.** A spec is the record of what was asked for and when; rewriting §6 in place would
make it look as though v3 had been the requirement from the start, and the three ACs it
voids are exactly the ones a reviewer would otherwise check against a screen that no longer
has them.

The product owner supplied `Wasl Ticket Details v3.dc.html` and eleven review frames, with
one rule: build the columns the backend has, and *"لو حاجه او اكشن او كولوم ملهوش موازي ليه
في الباك اند اعتبره مش موجود في الديزاين"*.

### 8.1 · What v3 changed about the requirement

| Was (§4–§7) | Is | Where it is recorded |
|---|---|---|
| Q-2: newest at the **bottom**, "load earlier" above | **Newest first**, «تحميل الأقدم» at the foot | design doc §What v3 changed row 3 |
| One merged timeline | **Two tabs**, each with its own total, server-filtered `?type=` | row 2 |
| A take-action menu holding the transitions | **The status pill is the control**; the menu holds one live row and three inert ones | rows 1 and 8 |
| Accordion sections + a 240px anchor rail | **A 292px rail of facts** and no accordion | rows 4 and 7 |
| §5: escalation out of scope | **Drawn, inert, with a reason** | row 8 |
| §5: the customer is text, the link is `018` | **A link to `/customers/:id`** | row 11 |

### 8.2 · Acceptance criteria this revision changes

| # | Status after v3 |
|---|---|
| AC-1 | **Unchanged and held.** Nothing renders a ticket from a write response; no `setQueryData` seeds a ticket key. A source scan asserts it |
| AC-2 | **Unchanged and held**, and now stronger: an empty `allowedTransitions` renders the pill as TEXT and the Close row inert, both asserted with `[]` |
| AC-3 | **Held, and it caught something.** The cursor is unchanged; the DISPLAY order flipped, and the test that can fail on the flip is the two-page one — a single-page test passes either way |
| AC-4, AC-5 | **Unchanged and held**, with a fourth answer added: a `403` is its own banner, not a failure |
| AC-6 | **Unchanged and held** |
| AC-7 | **Held.** The picker lists `GET /api/support-users` and the server decides. The canvas's «وكيل · الفوترة» renders as the role alone — `SupportUserOption` has no department |
| AC-8 | **Unchanged and held** — `dir="auto"` on the subject, the description, every comment body and every tag name |
| AC-9 | **Unchanged and held** — dates through `lib/formatters.ts`, Latin digits in both locales, and the two tab counters with them |
| AC-10 | **Held.** Every state was rendered in Arabic and recorded in `tests.md` §4.3–§4.7, and the English pass with it |
| **AC-11** | **VOID.** It required the preview to be rendered and reviewed before anything was wired. That was honoured for v2. v3 arrived as a canvas plus review frames **on the running screen**, and the preview has been deleted — it showed the superseded design from the same stylesheet the real page uses. ADR-009's gate is satisfied differently here: the owner reviewed the built screen, which is what a preview stands in for. Recorded rather than quietly dropped |

### 8.3 · The five regions with no backend, and what happened to each

The rule's two halves, which are not in tension: a menu row promises nothing until it is
pressed, so an unbuilt ACTION may be drawn inert with its reason. A DATA region may not —
a countdown drawn from nothing is a fact the product does not have and looks exactly like a
working one.

| Region | Backend | Built as |
|---|---|---|
| SLA pill · rail SLA block · «خُرق زمن الحل» banner | no due date, no first-response time, no SLA field, table or setting | **absent** |
| «@ مناداة زميل» | no field on a comment, no notification, nothing to resolve a name against | **absent** |
| priority-change history row | no `PriorityChanged` in `TicketHistoryEventType` | **cannot arrive** |
| تصعيد · دمج · تمديد الاستحقاق | no endpoint | **inert, each stating why**, and no client fetcher exists for any of them |
| the assignee's department | `SupportUserOption` is `(id, fullName, role)` | **role only** |
| per-tag and per-person colour | `TagSummary` is `(id, name)` | **derived from the name** — see the design doc's *Derived colour* |

### 8.4 · Open questions this revision opens

| # | Question | Working assumption |
|---|---|---|
| Q-6 | Past five people, two share an avatar tint. Ten over five must collide | A palette decision, not code. Identity (one person, one colour everywhere) is kept over distinctness deliberately |
| Q-7 | «تذاكره الأخرى» stops at three and then a muted count with no link | `?customerId=` is a list filter, not a facet — a chip for it would put an id in the filter bar. A scoped list route is the answer if it is ever wanted |
| Q-8 | No keyboard navigation inside the four menus: no arrow keys, no roving tabindex, no focus return on close | Escape and outside-press close them, and every row is reachable by Tab. Named as a gap rather than claimed |
