# `035` — Summary

**Phase:** 7 · **Role:** Summary · **Status:** Delivered 2026-09-03, **except §4.1**
**Scope:** the customer detail/edit/add screens from supplied frames, the backend half of
`017`, and row hover for every table in the product.

---

## What was built

**`PUT /api/customers/{id}`** — the backend half of `017`, on its frozen contract, without
changing it. `Customer` gained its second mutator (`SupportUser.ChangeLanguage` was the
first, in `014`). Three ordered checks: the row exists, the version matches, the contacts
are free.

**`/customers/:id/edit`** — the create form's Zod schema, pre-filled from the read,
sending every field on every save because `PUT` replaces. A `409 concurrency-conflict`
gets its own banner and its own control.

**A side sheet with two contents** — the row's quick view and the create form. `033`'s
"no panel, the row click navigates" is reversed on both halves, from frames.

**Row hover in the `Table` primitive** — the fill and a 3px rail on the leading edge, plus
a selected-row state that the quick view is the first producer of.

**One error notice for every table** — same icon, same words, drawn under the header
instead of replacing the card.

---

## The trade-offs, and what deviated

### The ruling that shaped the whole feature

> لو مش بتوافق الفلاديشن وشغل الباك اند متعملهوش

Three things the frames draw are **refused**, not deferred: the fixed `+966` prefix box
(both endpoints take any parseable E.164), the required asterisk on the email (BR-4.1
requires *one of* the two, and the server creates a phone-only customer), and the
switcher's third segment (from `/customers/new` its pair has no customer to point at).
`createCustomerContract.test.ts` asserts the first two — because `032` had already ruled
the prefix box out **with the reason written in the component**, and it was drawn again in
the next set of frames. A comment is not something a frame can be checked against.

### The version is checked before the duplicate rule, and the order is the feature

A stale client whose email also collides is told to **refetch**, which is the only thing
that helps. The other order tells it to change the email; it does, and the next request is
refused for being stale anyway. Two round trips to learn the first fact. Measured by a
control: swapping them turns exactly that test red.

### `PUT` replaces, and the client is written for it

The contract calls an omitted optional field "the only failure on this endpoint that
produces no error at all: the request succeeds, returns `200`, and four fields are gone."
The form therefore always sends every field, and the TypeScript request type makes all
five **required** although three are nullable — a caller that omits one is a caller that
did not decide to clear it.

### Q-1 was answered, and my working assumption was wrong

The spec recorded the pill above the breadcrumb as the design canvas's artboard switcher,
reasoning from `027` where a similar element genuinely was. **It is product chrome.** The
question is why it was in the Open Questions table at all rather than decided — and the
answer is that it was the right place for it: guessing would have shipped a missing
control instead of a wrong one.

---

## What review found, and none of it was planned

| Found | Why nothing caught it |
|---|---|
| **The list's name cell had no link.** `033` navigated with `onRowClick` alone, which `Table`'s own contract forbids in words | The row click worked for a mouse, so nothing looked broken. **A keyboard could not reach a customer profile at all** — and after the sheet it would have been worse |
| Two stacked headers in the sheet | `chrome={false}` was never passed. jsdom found both headings and no assertion cared which |
| The panel opened on the wrong side | Both frames are Arabic and draw it at the **left**, which in RTL is `inset-inline-end`. I read "left" as "start" |
| The field order was wrong | Every field was already on screen, so a presence assertion passed on the wrong layout. The new test asserts **DOM order** |
| Two scrollbars in the sheet | Two numbers for one distance (24px against 20px), and a `min-block-size: 100%` with a `sticky` child inside it |
| `+966` rendering as `5X XXX XXXX 966+` | See below |

### The `+966` defect is the one worth carrying

Reported three times from screenshots. The element **did** carry `dir="ltr"`, `Input`
**did** forward it, the placeholder string **was** correct — all three checked from the
source, and reported as unverified rather than guessed at, because the local database was
down and there was no way to measure.

Measured the moment Docker came back: **`direction: rtl` computed on an element whose
attribute said `ltr`.** The cause was one unscoped rule two files away —
`.control:placeholder-shown { direction: inherit }` — and **author CSS beats the `dir`
attribute**, which is a presentational hint. Scoped to `[dir='auto']`, which keeps both
intents.

*Reading the source could not find this. One measurement did.*

### Three guards went red and all three were the guard being wrong

`AC-12` refused `border-radius: 0` (the absence of a radius), `calc(var(--space-6) * -1)`
(token-derived) and `var(--font-mono, …)` — the last one correctly, because **that token
does not exist** and `032` had already ruled against inventing it. The fetcher-list guard
failed on a legitimate write while **its own comment argued for deleting it**. Each was
widened or removed with a reason, and the spacing guard was then re-armed with three real
literals — one inside a `calc()` — and caught all three.

---

## Known limitations

- **§4.1 is not done.** `/customers/:id` carries the switcher and «تعديل», and its regions
  are `032`'s — but the three-card contact strip, the two-column split and the ticket
  history block (Q-2) are not laid out to the frame's geometry.
- **Q-5 is open** — the switcher's third segment.
- The sheet has been measured at 1500×900 only. Nothing below that.
- `SideSheet` is **not promoted** to the inventory: `033` §7.1 needs a second consumer
  outside one screen, and both of its consumers are on `/customers`.
- The quick view does not show notes, because `GET /api/customers` does not return them.
  Recorded in the component rather than filled with an empty region.
- ~~No keyboard trap in the sheet~~ — **closed 2026-09-03.** Tab cycles within the panel,
  focus returns to whatever opened it, and the scrim stopped being a second labelled
  dismiss control. See `tests.md`, «The focus trap, and the control that caught a false
  green».

---

## Evidence

`tests.md` — every measurement, both languages, with the negative controls, the browser
verification pass after Docker returned, and the save round trip through the real UI
(`PUT 200` → refetch → the profile showing the new name).

Suites at delivery: **613 frontend tests in 35 files**, **669 backend** (189 + 26 + 454),
`tsc` · `eslint` · `stylelint` · locale parity (381 keys) all clean.

**A correction to what this file said first.** It recorded "four backend failures in
`Resilience.*`" belonging to `036`. They are not failures — they are **flaky**: the same
`dotnet test` command produced 4 red on one run and 454 green on the next, and the class
passes 16/16 under `--filter`. The suite shares one database, so this is order or shared
state, and it is `036`'s to look at. *A test that passes alone and fails in company is
worse than one that fails, because the first green run closes the feature.*
