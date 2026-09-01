# 026 — Ticket List · Summary

**Lane:** Frontend · **Delivered:** 2026-08-29 → 2026-08-30 · **Suite:** 200 tests

`/tickets` is a real screen: it fetches, pages, and renders eight states. `Table` is a
system primitive with its own preview and its own tests. Nothing in `026` is wired to a
stub.

---

## 1 · What was built

| Task | Delivered |
|---|---|
| `DOC-026-01` | Token gaps closed — header height, table avatar, row divider, row hover, chip surface, and ten `--channel-*` values. Blueprint first, then mirrored |
| `FE-026-00` | The preview: 100 rows, a 213-character Arabic subject, every state, both languages, three densities |
| `FE-026-01` | **`Table`** — the system's table. Its contract is `table-primitive.md` |
| `FE-026-02` | `lib/formatters.ts`, owned by `014` |
| `FE-026-03` | `TicketListItem`, from the frozen contract's field table |
| `FE-026-04` | `TicketStatusBadge`, `TicketPriorityText` — BR-1, keyed on the wire value |
| `FE-026-05` | 45 catalogue keys × 2. Parity at 142 |
| `FE-026-06`…`09` | `TicketListPage`, URL-held paging, five states, row navigation, the cache gate |
| `TEST-026-11`, `12` | The accessibility and Arabic walks, on the real screen against the real API |

## 2 · The trade-offs

**`Table` took the geometry, not the domain.** It owns row height, the ten-row viewport, the
pinned header, overflow, every state, and where a flyout may open. It knows nothing about a
ticket — the caller passes a rendered cell and a tone, never a status. `/_preview/table`
renders **customers** through it, which is the only way to tell a primitive from one
screen's private layout. That page found a real bug in the primitive on its first render.

**`cell` returns a node, not a string.** A format-and-render API cannot express the two-line
subject or the labelled tinted pill — and a primitive that cannot render its own reference
screen is not the primitive.

**No scrollbar, because nothing overflows.** Column widths are ratios normalised to 100%, so
the table fits any frame and narrow frames truncate. The instruction passed through "hide
them" and "keep them with a gutter" before landing on "remove the need"; only the third is a
design. All eight columns are visible at 880px — the three options originally on the table
each gave something up, and this gives up none.

**Sorting exists as an API and is used nowhere.** `Table` owns the header, `aria-sort` and
the toggle; `015` owns the query and the URL. Built now because a sort control is
header-shaped and adding it later is a breaking change.

## 3 · What deviated, and why

| Deviation | Ruling |
|---|---|
| **No actions column**, though the supplied design shows one with a kebab | Spec Q-7 wins. Documented in `spec.md` §11 as a standing design/spec discrepancy, not reconciled |
| **`New` and `Open` do not share a colour** | The canvas paints both blue; adopted twice and overruled. BR-1 is the source of record |
| **`PendingCustomer` and `Closed` became filled** | The blueprint had outlines; rendered against real rows they were the loudest thing on the table. `03-tickets-list.md` changed with the code |
| **No subtitle line** | It needs a counted noun. Arabic plural agreement makes one string wrong for 2, for 3–10, and again above 10. Unresolved copy decision |
| Search, filters, tabs absent | `015`. The preview draws them; the screen does not |

## 4 · What is not done

- **`--text-muted` and `--state-danger-text` fail WCAG AA** — 3.97 and 3.99 against white,
  measured on the rendered screen. `حرجة` is the worst case: the highest-priority signal on
  the row is the least legible text in the table. **Token-level, product-wide, raised not
  patched** (`tests.md` §1j.4)
- **An LTR subject truncates from its start** — `… privilege live probe`. A consequence of
  the isolation that fixed the name column. Three options costed in `tests.md` §1h.3; not
  decided
- **The escalation marker and the assignee avatar were never rendered on the real screen** —
  no seeded row is escalated or assigned. Covered by fixture tests; no seed data was
  manufactured to make a screenshot look complete
- **The preview still holds its own copy of the table geometry.** Migrating it onto the
  primitive is the duplication `Table` exists to end
- Eight files fail `prettier --check`. All pre-existing and untouched by this feature

## 5 · What this feature actually taught

Every item below cost a defect first, and all of them are in `tests.md`.

**A guard can be satisfied by the wrong thing, and it will not tell you.** Five times:
`toBeVisible` does not see `sr-only` in jsdom; `background-color` **or** `color` lets a rule
lose `!important` on one of them; `className.includes('priority-')` is true of a class that
styles nothing; `diff` on two token files reports formatting, not values; a navigation test
asserting the list is *gone* would pass had the route never changed. **Only negative
controls found any of them.**

**A screen can be green and unreachable.** `/tickets` rendered the `023` placeholder while
every page test passed, because they mount the component directly and never touch the
router. The comment asserting react-router prefers the later of two identical paths was
written before it was checked, and is wrong.

**Rendering finds what reading cannot.** Eleven defects came out of opening the preview,
including twenty-five controls painted navy by a `base.css` rule whose own comment states
the escape this module never used. Two more came out of the Arabic walk: a date rendering
`0/08/2026`, and sixty subjects as blue underlined links.

**A decision already made is not re-decided.** `026` shipped a row menu Q-7 had ruled out
before any code existed, and nothing caught it, because no test asked what a row does.

---

## 6 · Added 2026-09-01 — the two scoped queues

`/tickets/mine` and `/tickets/unassigned` were `023` placeholders in the nav. They are this
same screen now, with `assignee` decided by the **path**: `TicketListPage` takes a
`queue` prop, and `routes.tsx` supplies it. Nothing was duplicated — a second component would
have copied the table, the counts, the pager, the row menu and the whole design pass.

**The one idea worth carrying forward: a scope is not a filter.** It never reaches the URL, it
draws no removable chip, `مسح الكل` does not clear it, it is absent from the `تصفية` badge
count, and it does not make an empty result read as *"no matches"*. Each of those is a line of
code and each has a negative control in `tests.md` §1k.3 — eight of them, all red on exactly
the intended test.

The chip counts are scoped too, which is what stops *تذاكري* heading a four-row table with
`31` beside **All**.

`assignee=me` is resolved from the token server-side, so the client sends no user id — checked
on the wire, twelve requests, `assignee=me` on all twelve.

Sixteen tests added (472 in the suite). Two of them exist because the **browser** caught what
the other fourteen missed: the `تصفية` badge was counting the scope, pointing at a filter with
no control to clear. Two open items, both in §1k.6: the bar's own `مسح الكل` guard is
measurably belt-and-braces today, and the scoped empty state has been read but not rendered —
no seeded queue is empty.
