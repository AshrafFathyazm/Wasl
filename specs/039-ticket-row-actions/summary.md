# 039 — Reassign and Close, from the ticket row · summary

**Delivered** 2026-09-06 · frontend lane · 68 new tests, **1147 frontend tests total**
Evidence: [tests.md](tests.md) · Decisions and disproofs: [ai-notes.md](ai-notes.md)

---

## What was built

Two of the ticket row's four menu items act in place instead of navigating.

**Reassign is a menu** — 308px, hung under the row's actions cell through a fixed portal.
A search field, the support users with their role and their open-ticket count, then a rule
and «إلغاء الإسناد». Picking commits immediately; there is no confirm control, and its
absence is asserted rather than assumed. The height is capped in JavaScript against the room
under the trigger and the menu flips above it when that is not enough.

**Close is a modal** — `Modal size="sm"`, four reasons, «التذكرة الأصلية» only under
«مكرّرة», an optional summary. The three fields compose into the one `note` the contract
carries.

**Every success fires one toast**, from the system's `Toast`: `success` for an assign and a
close, `info` for an unassign. The surface closes first, then the toast appears.

`AssigneePanel` and the tinted `Avatar` moved out of `TicketDetailPage.tsx`, so the detail
rail and the list menu render one component. That part of the work removes code.

---

## `026`'s ruling is reversed, and its objection is answered rather than dismissed

`026` shipped the row menu with a rule in a comment: *every item navigates*, because
«Reassign and Close … [live] on the detail screen. Firing either from a list row would mean
a second implementation of the concurrency handling, in a component that has no version to
send.»

**The premise was right and is still right.** `TicketListItem` carries no `version` and no
`allowedTransitions`, and `010` excluded both deliberately — "nothing on the list acts".

What changed is where they come from. **Opening either surface fetches the ticket**, under
the same `ticketKeys.detail(id)` the detail route uses. One request answers all three of the
row's absences — the version for `expectedVersion`, `allowedTransitions` for whether Close
is legal at all, and the current assignee for which row wears the tick — and no rule is
implemented twice. BR-1 still exists only on the server; the client reads what it was given.

The cost is one round trip before the first pick can commit, and it is paid visibly: every
control is disabled until the version is in hand. A menu that let you pick sooner would have
to send an empty `expectedVersion`, and `004b` length-checks that into a `400`.

---

## Three things the mock draws that this does not

`027` set the rule and this keeps it: **draw the unbuilt actions and leave them read-only;
draw no unbuilt data at all.** All three are absent, not disabled, and
`rowActions.guards.test.ts` asserts each absence.

| Left out | Why |
|---|---|
| «إشعار العميل» | `021` (`ICommunicationProvider`) is specified and **not built**. A checkbox promising a customer a message is a fact the product does not have that looks exactly like a working one. Ruled Q-2 |
| the amber «آخر رسالة من العميل بلا ردّ» banner | **There is no customer message in this product.** `Interaction` was never built — `034` went looking for a home for one and found `Wasl.Domain/Communications/` holds a single enum |
| a link or a merge on «التذكرة الأصلية» | No endpoint, no field, nothing that resolves a number to an id. It is text in a note, and the field's helper says so |

A **disabled** checkbox was the other option for the first row and was turned down:
`027`'s "draw it inert" ruling covers *actions*, and a disabled input in a form reads as
"not yet" rather than "never".

---

## Trade-offs, each stated rather than absorbed

**The count is derived, and the derived number is not the same number.** `SupportUser` is
`(id, fullName, role)`; there is no `openTicketCount` on any contract. It is one
`countTickets` per support user, fired only while a menu is open and cached under `026`'s
count key. Ruled Q-1, with the contract change recorded in `openTicketCounts.ts` as the
right long-term answer — **and with the reason the two diverge**: a client count is the
count *this user is allowed to see*. With no per-user list scoping the two agree; the day
scoping arrives they part, and nothing goes red.

**The second line is the role, not a team.** The mock draws «الدعم الأول». There is no team
and no department on any contract — `027` met this first and recorded it. The role is real
and is what renders.

**The house red wins over the mock's red.** The mock's three count colours are `#C4362F`,
`#8A5A00`, `#76818C`. Two are tokens exactly (`--state-warning-text`, `--text-muted`); the
first is not — `--state-danger-text` is `#e54545`. The token ships, the same way `037`
normalised a supplied icon set to the house keyline. No hex literal appears in this
feature's CSS and a guard enforces it.

**The modal is 420, not the mock's 440** (Q-3). A fourth size on a primitive eight screens
depend on is the change with the wider blast radius. The 20px is recorded here.

**The unassign toast is 5s, not the brief's 4s** (Q-4). It is `info`, and
`feedback-layer.md` §2's timing table gives `info` five seconds. Changing `TOAST_MS.info`
would change every info toast in the product; the tone wins and the duration follows it.

**The panel is 308, where the detail rail's was 316**, and its search box is the system
`Input` — which has no icon slot, so the magnifier went. One component, one geometry; two
widths for one panel is the drift being removed. The brief asks for the system's components,
and this is what that costs.

**`Dropdown` is not used for the picker, and the brief names it.** Abyan Dropdown §10 says
in words: «لا تستخدمها كقائمة إجراءات مع حالة اختيار — افصل بين النوعين». `DropdownOption`
is `{ value, label, description, icon, disabled }` — no trailing slot for the count, no
pinned foot outside the scroller, which are the two things the panel exists for. What **is**
reused is the mechanism: `useMenuSurface`, the hook `031` split out for exactly this second
consumer. The system's mechanism, not the system's value model.

**"Recompute on scroll" is satisfied differently from how the brief words it.** The hook
*closes* a menu on any outside scroll — `031`'s rule, shared with eight consumers — so the
surface can never be stale relative to the page. A scroll inside the menu's own list moves
nothing. Resize does recompute.

---

## What `useMenuSurface` gained, and why nothing else changed

Two opt-in additions:

- **`maxBlockSize`** — the room on the side the menu actually opened towards, measured per
  open and on resize. It is published as `--menu-max-block-size` and the stylesheets take
  `min()` of it and their own ceiling, so **a measurement can only ever make a menu
  shorter**. `Dropdown` publishes nothing, the fallback is `100vh`, and `min()` resolves to
  the token exactly as before.
- **`align: 'end'`** — for a menu wider than its trigger, which `031`'s "both edges
  coincide" reasoning does not cover. `'stretch'` is the default and is unchanged.

`Dropdown` passes neither. Both halves of that are asserted, and `Dropdown`'s own 21 tests
pass untouched.

---

## The defect that shipped for an hour, and how it was found

**Reported from the running app, in English**, with a screenshot: the assignee panel opening
far to the right of the table and off the page. Every test was green.

`useMenuSurface` measures twice, and the second pass never ran: **a dependency array is
built at render time while a ref attaches at commit time**, so on the render that mounts the
menu `menuRef.current` is still `null` and the effect keyed on it does not re-fire. The
geometry stayed the one measured with no menu, and `menuWidth` fell back to the trigger's
34px against a real panel of 308.

**It could only show in English.** Under `rtl` the aligned edge is `rect.left`, which never
touches the menu's width; under `ltr` it is `rect.right - menuWidth`, which is entirely
width. Every test fixture in this feature is Arabic.

`031` never met it because a `Dropdown` menu takes its trigger's width, so only the flip
depended on the second pass.

Fixed with a third effect, no dependency array, guarded by a ref. **And the first
reproduction test was worthless** — `renderHook` + `rerender()` supplies the very ordering
the bug needs to be absent, and it passed with the fix removed. The test is a real component
now, and the control goes red naming the number.

---

## Known limitations

- **Two round trips before the first pick.** The support users and the ticket are fetched in
  parallel when the menu opens; on a cold cache the rows are visible and disabled for that
  time. Deliberate — see above.
- **The open-ticket count is N requests for N support users.** Three today. A product with
  forty agents needs the contract change, not this loop.
- **No screen was viewed in Arabic in a browser for this feature.** The mock-up was; the
  built screen was not. Recorded unmet in `tests.md` §8 rather than claimed.
- **The Arabic copy is this lane's**, unreviewed. Q-8 in `11-open-questions.md` — who writes
  and reviews it — is still open.
- **The cap is verified as arithmetic, not as paint.** jsdom performs no layout; the rects
  are stubbed and a source scan holds the CSS half.
- **A pre-existing test-isolation leak was found and not fixed here.**
  `customerSheet.test.tsx` (`035`) leaves `document.body.style.overflow: hidden` behind,
  which breaks `Modal` and `SideSheet` in any single-process run. Invisible under the
  project's own isolated `vitest run`. Handed to the customers lane — see `tests.md` §5.

---

## Deviations from the plan

| Planned | What happened |
|---|---|
| `tasks.md` FE-039-01…10 in order | Held, with one addition: the LTR defect forced a third measurement effect into FE-039-01 after FE-039-08 was already built |
| Five test files as listed | Held. `menuSurfaceCap.test.ts` became `.tsx` — the reproduction needs a real component, not `renderHook` |
| `tokens.css` untouched | Held |
| No 038 file touched | Held |
