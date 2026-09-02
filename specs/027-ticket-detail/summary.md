# 027 — Ticket Detail · Summary

**Lane:** Frontend · **Delivered:** 2026-08-31 (v2) → **rebuilt to v3 2026-09-01** ·
**Suite:** 511 frontend tests, 62 of them this screen's

`/tickets/:id` is a real screen over seven endpoints that were delivered across `009`,
`011`, `012`, `013` and `034` and called by nothing. It has been rebuilt once, on the
product owner's v3 canvas, and this summary covers both passes because the second one
replaced most of the first.

---

## 1 · What was built

| Region | Endpoint | Notes |
|---|---|---|
| Header: status pill **as the control** | `PUT /tickets/{id}/status` | menu from `allowedTransitions`; the current status shown ticked and inert |
| Header: priority · escalated | `GET /tickets/{id}` | **read-only** — there is no change-priority endpoint and `016` owns escalation |
| Header: «اتخاذ إجراء» | one live row | Close (a transition); escalate · merge · extend-due **drawn and inert**, each stating why |
| Rail: assignee + picker | `PUT /assignee`, `GET /support-users` | one panel for both branches, anchored to the rail group |
| Rail: customer | `GET /tickets/{id}` + `032` | link to the profile, company name under it |
| Rail: their other tickets | `GET /tickets?customerId=` | a parameter `010` had accepted since August and no screen had asked for |
| Rail: channel · category · created · updated · closed | `GET /tickets/{id}` | `closedAtUtc` only when there is one |
| Subject card | — | priority-coloured inline-start edge, `dir="auto"` subject and description |
| Tags | `GET /tags`, `PUT`/`DELETE /tickets/{id}/tags/{id}` | five derived tints, no two alike on one ticket |
| Composer | `POST /comments` | internal switch, reply templates, amber Send when internal, locked when `Closed` |
| Two tabs with their own totals | `GET /timeline?type=` | `034`'s filter and both counts on either response |
| Feed | same | newest first, four at a time, «تحميل الأقدم» at the foot |
| States | — | loading · not found · ticket error · feed error with the trace id · empty · forbidden · client fault · conflict · closed · send-failed |

## 2 · The trade-offs

**The rule that shaped it, in the owner's words:** build the columns the backend has, and
*"لو حاجه او اكشن او كولوم ملهوش موازي ليه في الباك اند اعتبره مش موجود في الديزاين"*.

Then a refinement that looks like a contradiction and is not: **draw the unbuilt ACTIONS,
leave them read-only.** A menu row promises nothing until it is pressed, so an inert row
with a reason is a roadmap the screen carries. A DATA region is different — an SLA
countdown drawn from nothing is a fact the product does not have, and it looks exactly like
a working one. So the SLA pill, the rail's SLA block, the breach banner, `@mentions` and
the priority-change history row are **absent**, and escalate/merge/extend-due are **inert**.

**Inert is structural, not an attribute.** There is no client fetcher for the three: a test
asserts `tickets.api.ts` exports nothing matching `escalateTicket`, `mergeTicket`,
`extendDue`, `/escalate` or `/merge`. A `disabled` prop is one edit away from deletion; a
function that does not exist is not.

**Colour is derived, and that is a design decision with a boundary.** `TagSummary` is
`(id, name)` and `SupportUserOption` is `(id, fullName, role)` — neither carries a colour,
and the owner ruled they must differ. The tint comes from the name, so nothing is *claimed*
by it: it says "this is a different one", never "this one is urgent". Two rules pull
opposite ways and both are deliberate — a **tag** must differ from the tag beside it (the
hash chooses, a collision walks within the ticket); a **person** must be one colour
everywhere, so there is no walk, because de-colliding per region would give one person two
colours on one screen.

**The v2 preview was deleted rather than updated.** It rendered the old screen from the same
stylesheet the real page uses, so every shared class silently restyled a design nobody was
maintaining. ADR-009's gate was spent — the screen is built and was reviewed in a browser
by the owner, which is what a preview stands in for.

## 3 · What deviated from the plan, and why

| # | Plan | Built | Why |
|---|---|---|---|
| 1 | `027` Q-2: newest at the **bottom**, "load earlier" above | **Newest first**, «تحميل الأقدم» at the foot | The v3 canvas labels the strip «الأحدث أولاً» and is the later ruling |
| 2 | One merged timeline (Q-2's premise, and `013`'s shape) | **Two tabs**, server-filtered | `034` added `?type=` and both counts. Two lists with two counts genuinely are two lists |
| 3 | AC-11: the preview is rendered and reviewed **before** wiring | Honoured for v2; **void for v3** | v3 arrived as a canvas plus eleven review frames on the running screen. The preview is deleted — see §2 |
| 4 | §5: the customer is text, the profile link is `018` | **A link** | `032` built `/customers/:id` on 2026-08-31 |
| 5 | §5: escalation out of scope | An **inert row** named it | The owner's read-only ruling |
| 6 | Design doc: "the wire is newest-first; the render reverses a prefix" | **Each page arrives ascending** | Measured, and `013`'s frozen contract says ascending too. The doc contradicted its own contract |
| 7 | Design doc: the `403` renders **inline beside the control** | A **banner above the layout** | The controls are now spread across the header, the rail and the composer; one place to look beats three |
| 8 | Provisional types complete | Two fields were missing | `closedAtUtc` and `customer.companyName` were on the wire and undeclared — the same gap `027` §3 recorded for `assignee` |

## 4 · What is not done

- **The 027 spec's own ACs still read as v2** — a v3 revision section is appended to
  `spec.md`, but the AC table is not renumbered. AC-11 is recorded void there.
- **No keyboard pass.** Tabs carry `aria-selected`, menus carry `role="menu"`, Escape
  closes and an outside press closes — but there is **no arrow-key navigation, no roving
  tabindex and no focus return** when a menu closes.
- **Only 1440px was rendered.** The 980px single-column stack and the 700px filter-bar
  fallback are written and were never looked at.
- **The integration suite did not run** — Docker was not available on this machine. Domain
  189 and Application 26 are green; the 390 integration tests are unverified in this
  session, and nothing in this feature is backend code.
- **The OpenAPI-vs-contracts comparison did not run** in this session. Both parameters this
  client newly calls are contracted, checked by hand: `?customerId=` at the foot of `010`'s
  frozen contract (added by `034`) and `?type=` at the foot of `013`'s.
- Open **C**: past five people, two share an avatar tint. A palette decision, stated.
- Open **D**: «تذاكره الأخرى» stops at three and then a muted count with **no link** —
  `?customerId=` is a list filter, not a facet, and a chip for it would put an id in the
  filter bar.

## 5 · What this feature actually taught

**A browser found what 49 passing tests could not, three times.** The feed was upside down
under a label that said «الأحدث أولاً»; the assignee panel was painted through by the
composer because `position: sticky` establishes a stacking context; the panel opened in the
wrong place because it hung off a 28px pencil. None of the three is visible to jsdom, which
has no layout.

**And two of my own measurements lied before they were fixed**, which is the more useful
half: `document.querySelector('[aria-haspopup="menu"]')` returned the **shell's account
button** and its three items were reported as the status menu's; and the first CDP run
screenshotted the **login screen four times** and reported no errors, because the token
lives in `sessionStorage` without "remember me". A measurement that names the wrong thing is
worse than none, because it is believed — this file's fifth entry in that column.

**Two guards fired and both were right.** `029` AC-12 refused a local `@keyframes` in this
feature's stylesheet (one waiting animation, in `components/Loader`); BR-8.8 refused two JSX
literals that turned out to be separator glyphs rather than words.

**A guard can pass on its own prose.** The absence guard for the unbacked regions searched
for `sla` and went red on `useTranslation` — t-r-a-n-s-l-a-t-i-o-n contains it. Then the
sidebar guard went red on the comment *explaining* the declaration it forbids. Both now
strip comments first, and each has a control proving the stripper ran.

**A stale comment costs real time.** `tokens.css` said `--on-brand` is "COMPUTED at
runtime". Nothing computes it — `grep setProperty` finds four callers, none touching a brand
token — and that sentence was the leading hypothesis for an hour of chasing a white page
number. Corrected in place rather than deleted.

**Deriving what the data does not carry took two corrections, both from the screen.** Three
tint buckets over five tags collide by arithmetic; six buckets from a five-hue palette
produced two washes nobody could tell apart. And the hash itself was the weak part —
summing code units clusters on Arabic names, which are built from a small set of letters, so
two of three seeded agents shared a colour at four buckets *and* at five.
