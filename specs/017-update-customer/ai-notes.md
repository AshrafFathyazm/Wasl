# `017` — AI Usage and Audit

**Phase:** 5 · **Role:** Verification · **Status:** Written 2026-09-27, after the fact

---

## What this file can and cannot say

**`017` was not implemented in a session this file witnessed.** The endpoint and the screen were
built on 2026-09-03 inside `035`, so whatever was dispatched, accepted or discarded then belongs
to that feature's record and not to this one.

**And that record does not exist.**
[`035`'s folder](../035-customer-detail-edit-and-add-sheet/) holds `spec.md`, `summary.md`,
`tasks.md` and `tests.md` — and **no `ai-notes.md`**, which the Definition of Done asks for.
Checked rather than assumed, because the whole point of this paragraph was to hand the reader a
link. So the session that built `017` is unrecorded on both numbers, and this file can only be
honest about that rather than fill the gap with a reconstruction.

So this file records **how the record was reconstructed**, which is the only thing about `017`
that happened on 2026-09-27. Writing anything else would be inventing a session.

**No agent was dispatched.** No subagent, no delegated search.

---

## The sources, and the order they were read in

Four, each checked against the next rather than believed on its own:

1. **`035/summary.md`** — names `PUT /api/customers/{id}` as "the backend half of `017`, on its
   frozen contract, without changing it". That sentence is what makes this record possible and
   what makes it short.
2. **The code** — `CustomersController.cs:193` (`[HttpPut("{id:guid}")]`), and
   `Features/Customers/UpdateCustomer/`. Read to confirm the endpoint exists and the shape the
   contract froze, rather than inferring it from the summary.
3. **`UpdateCustomerTests.cs`** — read for test *names* and the criteria in their doc comments.
   This is the weakest source and is labelled as such throughout `tests.md`: it says what a test
   is *for*, never that it passed today.
4. **`002b/summary.md`** — read only after a contradiction appeared. See below.

---

## Two things the reconstruction got wrong before it got them right

**The scan that found this gap nearly reported the opposite.** A pass over `specs/*/` asking
"does `summary.md` exist" reported `017`, `018` and `019` as **having** summaries. All three are
the untouched template, `Status: Not started`, sitting beside a live endpoint. The repo's own
rule caught it — *assert content, not presence* — arriving through documentation rather than
through a test, which is where it was learned (`003`: four tests went red while `COUNT(*)` still
returned 1).

**`CLAUDE.md` contradicts itself about AC-5, and the first reading took the wrong side.** One
bullet says `002b` "closed `008` AC-3"; another says `008` AC-3 is "recorded unmet — `002b` owns
it". The initial draft of this record was going to copy one of them. Reading `002b`'s own summary
settled it: the criterion is **closed as answered differently** — a malformed id stays `404`
because a `400` would tell an unauthenticated prober that the id *shape* was wrong. Both
`CLAUDE.md` bullets are true of the day they were written; neither was edited, and the ruling is
recorded in `017/summary.md` §4 where the third criterion asking the same question needed it.

---

## One verification that was attempted and failed

The integration suite — the only suite that exercises this endpoint — was run twice and never
reached the product: `Testcontainers` could not start SQL Server against a Docker Desktop WSL
backend that had just restarted. **549 failed, 42 passed, and none of it is about the code.**

It is recorded as NOT RUN in `tests.md` §2, which is what the fixture's own exception message
instructs — *"Never as a pass."* Somebody wrote that instruction into the failure path, and it
is the reason this file does not contain a number it did not see.
