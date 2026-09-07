# 039 — AI notes

What was dispatched, what came back, and what was done with it. Every accepted output was
**run**, not read.

---

## Agents

**None.** No subagent was dispatched for this feature. `tasks.md` names `main` as the agent
on every row and that is what happened — the work is one screen, two surfaces and one hook,
and splitting it across agents would have cost more in handover than it saved.

---

## Tools, and the two that lied

### The browser — `chrome-devtools` MCP

Used to open the product owner's mock-up and drive it. **This is the only reason `spec.md`
§2 exists.** Four of its eight findings change what got built, and none of them is visible
by reading the file:

- the «إشعار العميل» checkbox is `display: none` and sits **outside** the dialog;
- the mock closes an `InProgress` ticket, which BR-1 forbids;
- the panel measures 305 during its entrance animation and 308 after;
- the upward flip is unreachable at the mock's own page height.

**It refused to start.** `The browser is already running for …chrome-profile` — a leftover
automation Chrome from an earlier session, holding the MCP's own profile directory. Killed
by PID after confirming the command line pointed at `chrome-devtools-mcp\chrome-profile` and
not at the user's browser. That leftover is also the most likely cause of the esbuild
service dying on the suite's first run (`tests.md` §5).

### `npx vitest` — resolved a DIFFERENT vitest

Halfway through, every run started failing with:

```text
CACError: Unknown option `--poolOptions`
```

`npx` had begun resolving **vitest 5.0.0 from its own cache** instead of the project's
3.2.7, because the shell's working directory had reset out of `src/wasl-web` between calls.
The error names a flag, so it reads as a flag problem. Every command since is
`./node_modules/.bin/vitest` with an explicit `cd`.

**This is the fifth tool in this repo's log to produce a well-formed report about nothing**,
after the `grep` over `src/`, the wrong-table regex, the preview toggle, the arc-flag SVG
parser and the stale binary. It belongs on that list.

---

## Where the model was wrong, and what corrected it

Four times, and each was caught by running something rather than by re-reading:

| # | The wrong thing | What corrected it |
|---|---|---|
| 1 | `getComputedStyle(el).direction` to decide RTL — the more correct-looking source, since it also sees a `direction` set in CSS | jsdom models no cascade for a presentational `dir`, so it answers `ltr` for an RTL page and the RTL branch was untestable **in the product whose whole point is RTL**. `expected 726 to be 1000`. It reads `document.documentElement.dir` now — `lib/direction.ts`'s own source, and `RadioGroup`'s pattern |
| 2 | The second measure in `useMenuSurface` is enough | **A user opened the app in English and the panel hung off the page.** A dependency array is built at render time; a ref attaches at commit. See `tests.md` §3 |
| 3 | The first reproduction test for that defect | It used `renderHook` + `rerender()`, which supplies the very ordering the bug needs to be absent. **It passed with the fix removed.** Rewritten as a real component |
| 4 | The stripper control in `rowActions.guards.test.ts` | C9 stayed green with `stripComments` neutered to `() => ''`. "The word is in the raw source and not in the stripped one" is satisfied by an empty string |

And one piece of process: **`tasks.md` was written with every row already ticked.** Caught
and reset before anything was built. A task list that ships pre-ticked is a record of
intent wearing the costume of a record of work.

---

## The other lane

`038-new-ticket-redesign` was **live in the same working tree** for the whole of this
feature — its files appeared between the first `ls` of `features/tickets/` and the second.
Three consequences, all handled rather than discovered later:

- **No file of 038's was touched.** `CreateTicketPage`, `CustomerPicker`, `ChannelPicker`,
  `PriorityPicker`, `RadioGroup`, `DuplicateWarning`, `lib/api.ts`.
- **`tokens.css` was not touched either**, and that was luck worth checking: all three of
  the mock's count colours already had semantic tokens (`--text-muted`,
  `--state-warning-text`) or a house equivalent (`--state-danger-text`).
- **The two `tickets.json` catalogues are shared**, and the first write to them re-sorted
  every key — 182 deleted lines of pure churn on a file another lane holds open. Reverted to
  HEAD's order with this feature's keys appended: 61 added / 1 removed in `en`, 75 / 1 in
  `ar`.

One failure seen mid-run belonged to 038 and resolved itself while this feature was being
built: `iconCoverage.test.ts` reported `IconHistory` as consumed-but-listed, because
`DuplicateWarning.tsx` had just started importing it.

---

## Rulings taken to the product owner, not assumed

Four, all on 2026-09-06, before any code — `spec.md` §7. Each was answered with the option
the spec proposed, and the rejected options are kept beside them:

1. the open-ticket count — derive on the client, contract change recorded as the right
   long-term answer;
2. «إشعار العميل» — **left out** until `021`, not drawn disabled;
3. the modal — `sm` at 420, the mock's 440 recorded and not chased;
4. the unassign toast — the tone wins, so 5s, and `TOAST_MS` is not touched.

Two more (Q-5, Q-6) carry working assumptions that follow existing rulings and are there to
be overruled rather than waited on.
