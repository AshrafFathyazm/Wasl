# `033` — Summary

**Phase:** 7 · **Role:** Summary · **Status:** Delivered 2026-09-02, with the parity work
of the same day
**Scope as approved:** «033 كامل بدون Panel» — the full directory, the row click
navigating to the profile rather than opening a side sheet.

---

## What was built

A customer directory with server-side search, filtering, sorting and paging, and the
backend to answer it.

**Backend** — `GET /api/customers` gained seven parameters (`sort`, `dir`, `company[]`,
`noCompany`, `createdFrom`, `createdTo`, `calendar`) and a second endpoint,
`GET /api/customers/companies`, for the filter panel's vocabulary. Every change is
recorded **at the foot** of `008`'s frozen contract rather than edited into it.

**Frontend** — `/customers`: five columns, a debounced search, a filter panel that applies
on «تطبيق», applied-filter chips, three ordered empty states, and a pager. The URL is the
filter state; nothing is mirrored in component state.

**Two primitives were promoted out of the ticket list** — `TablePager` and `DateField` —
because this screen was their second consumer, which is the bar `033` §7.1 sets.

---

## The trade-offs, and what deviated

### The scope question was asked, not assumed

Four shapes were possible and the product owner picked one. That choice was later reversed
by `035` for the CREATE action and for the row click, both from supplied frames — recorded
there, not silently applied here.

### `pageSize` clamps, `sort` refuses, and the line between them is written down

An out-of-range `pageSize` has an obvious nearest legal value; `sort=email` does not.
Silently ordering by name returns a correct-looking page in the wrong order, which is the
failure a client cannot see. `?sort=1` is a `400` too — `Enum.TryParse` accepts an ordinal
that no member has, so without an explicit digit guard the request would succeed and order
by something nobody asked for. `009` shipped exactly that class of defect through a
database `DEFAULT` the caller could not see.

### The inverted date range was left open, and closed a day later

`033` shipped `createdFrom > createdTo` as an empty page while `/api/tickets` answered
`400` for the identical shape, and raised the difference rather than resolving it in one
lane. **Closed 2026-09-03**: both refuse it. §5.4's reasoning — "the range describes a
window with nothing in it" — was wrong; it describes a contradiction, and a window with
nothing in it is `from == to` on an empty day, which still returns zero. Measured before
the change: `/customers` said «لا عميل يطابق هذا» — a false claim about the data in answer
to a broken claim about the request.

### `AC-11`'s tie-break is recorded UNPROVEN

Control B1 stayed green at 2, 8 and 24 tied rows. The `createdAtUtc` tie-break is in the
handler and every branch ends `.ThenBy(c => c.Id)`, but **no control was found that turns
the claim red**, so it is recorded unproven rather than claimed as covered — the rule
`013` and `010` both established.

---

## What the review found, and it was not in the plan

Putting the two list screens side by side on 2026-09-02 produced five defects, and the
useful part is that **every one of them was invisible to the tests that existed**:

| Found | Why nothing caught it |
|---|---|
| The search box 51px apart on the two screens | Nothing asserted a position; jsdom has no layout |
| Two different تصفية buttons, 6px apart | Both rendered, both had the right label |
| 84px and 102px of empty space above the two headings | Three owners for one gap, none of them wrong on its own |
| Header text on the opposite edge from its own column | The `<th>` and `<td>` **tracks** were identical to the pixel; only the text inside differed |
| `/tickets/new` reachable only by typing the URL | The button rendered and took focus. It had no `onClick` at all |

The alignment one took four attempts, each measured, and the conclusion is worth carrying:
**one element cannot own both the box and the cut.** `dir` fixes the ellipsis and moves the
box; no `dir` fixes the box and cuts a mixed-direction value at its *beginning*;
`unicode-bidi: plaintext` fixes the cut only; and `text-align: match-parent` — the
declaration CSS provides for exactly this — **is unsupported in Chrome 152 and is dropped
from the cascade silently**. A flex wrapper in the page's direction with the `dir` on the
value is what ships.

### Two of my own measurements were wrong first, and both read as success

`Range.selectNodeContents` measures the **box**, not the glyphs — it reported 0px drift on
a column that was 102px out. And `Range.getClientRects()` returns **unclipped** geometry —
227px of overflow read as 227px of misalignment. Both are in the family `CLAUDE.md`
already records: *a measurement that names the wrong thing is worse than no measurement,
because it is believed.*

---

## Known limitations

- **`AC-11`'s tie-break is unproven** (above).
- Nothing on either list screen has been measured below 1500px.
- The company vocabulary is capped at fifty server-side; a tenant with more has no way to
  filter by a company outside the first fifty except by typing its name into the panel's
  search, which is answered by the same capped query.
- `listParity.test.ts` asserts the source, not the paint. The browser numbers in
  `tests.md` are recorded and would not fail if the CSS changed underneath them.

---

## Evidence

`tests.md` — the measurements, both languages, with the negative controls and the two
tools that lied. Suites at delivery: **604 frontend tests in 34 files**, **665 backend**
(189 + 26 + 450), `tsc` · `eslint` · `stylelint` · locale parity all clean.
