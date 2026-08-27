# 024 — Task Breakdown · FRONTEND

**Phase:** 2 · **Role:** Story Planner · **Skill:** `speckit-tasks` ·
**Spec:** [`spec.md`](spec.md) — approved 2026-08-26

Every task has one owner, one verification, and something it serves. **Verified by** is a
command or a written-down observation, never "it works". **Serves** is an `AC-*` or a
`BR-*`; a task serving nothing is scope creep. A task that cannot be verified on its own
is too big and is split.

**No subagent is dispatched. Every row is executed in the main session**, and the Agent
column says so on purpose rather than being deleted — `specs/README.md` requires the
column, and an empty one reads as an oversight.

The reason is time, not capability: each dispatch costs an `ai-notes.md` entry and a
review of what came back, and with under a day left the coordination is dearer than the
parallelism.

## Backend

**None.** No `.cs` file, no migration, no endpoint. `009-create-ticket` is the backend
feature and its contract is frozen; this feature consumes it. No `BE-024-*` task exists.

Recorded rather than omitted, so the empty lane is visibly a decision.

---

## The decision this list forces, before anything else

**There is no test runner in `src/wasl-web`.** `023` shipped without one and recorded it
as a known limitation: every result in its `tests.md` is a manual observation. Nine rows
below say "component test", and they cannot mean anything until Vitest exists.

`FE-024-01` installs it, **and it is deliberately scoped to six tests**:
`TEST-024-01 · 02 · 05 · 06 · 07 · 11`.

The reason is not coverage. It is that those six cover behaviour which cannot be
re-checked by hand at any useful frequency — the trim before measuring, the double-submit
guard, the `404` preserving the user's typing, the debounce window, and a gate that has
to be seen failing. **The other five — `03 · 04 · 08 · 09 · 10` — are recorded
observations**, the same standard `023` shipped at, because each of them is visible on
screen in one look.

Vitest + RTL + a smoke test + CI is about twenty minutes; six tests is about twenty more.
Forty minutes buys the part that cannot be watched. Eleven tests would not.

---

## Critical path

```text
FE-024-00 → FE-024-02 → FE-024-03 → FE-024-06 → FE-024-08 → FE-024-09 → FE-024-12
```

Preview, the two new controls, the form, the route, the failures, the strings. Stop here
and the screen is honest and complete at what it claims: a ticket can be created in a
browser in both languages, and every failure path does the right thing.

---

## Frontend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| ✅ FE-024-00 | **Preview, in Arabic first.** Real tokens, real copy, plausible lengths, every state in `009/frontend-spec.md` including *no customer selected*, at 720px. Reviewed **before any wiring** | `023` | Rendered and reviewed. The three-selects-in-one-row question answered on the **Arabic** labels and the answer written down | AC-19, A-3 | main session | `frontend-design` |
| ✅ FE-024-01 | Vitest + React Testing Library, one passing smoke test, `npm run test` wired into the same CI job as the other gates | `023` | `npm run test` exits 0 on a real assertion, and non-zero when that assertion is inverted | Every `TEST-024-*` | main session | `superpowers:test-driven-development` |
| ✅ FE-024-02 | `Select` — default, hover, focus, open, disabled, error, empty option. Chevron at the inline-**end**. Single-select only | FE-024-00 | Every state visible on `/_preview`; `npm run test -- Select` green | AC-18 | main session | `frontend-design` |
| ✅ FE-024-03 | `Textarea` — the **fifth primitive built**, with the written reason already in `spec.md` §2. Default, hover, focus, disabled, error, with-helper, with-error. Block-axis resize only. **Consumes no field-height token** | FE-024-00 | Every state on `/_preview`; a computed-style assertion that it carries none of `--field-height-sm/-md/-lg` | AC-18 | main session | `frontend-design` |
| ✅ FE-024-04 | `Toast` — one message, no stack, no portal, auto-dismiss plus manual dismiss, `role="status"` | FE-024-00 | Visible on `/_preview`; dismisses both ways | AC-1, Q-4 | main session | `frontend-design` |
| ✅ FE-024-05 | The feature-local section card. **Not** in `src/components/` | FE-024-00 | `git ls-files src/components` shows no card | Q-7 | main session | `frontend-design` |
| ✅ FE-024-06 | `api-types.provisional.ts` — **one file**, every type carrying the required comment verbatim, enums transcribed character for character from the frozen contract. `createdByUserId: string \| null`. `allowedTransitions: TicketStatus[]` | Contract frozen | `npx tsc -b` clean; a character-level diff of the four enum unions against `009/contracts/tickets-api.md`'s table | AC-9, AC-13, spec §5 | main session | — |
| ✅ FE-024-07 | The Zod schema and the RHF wiring. `.trim().min(1)` on `subject` and `description`; `priority` omitted from the payload when untouched | FE-024-06 | `npm run test -- schema` green, including `"   "` failing and `""` never being sent | AC-6, AC-8 | main session | `superpowers:test-driven-development` |
| ✅ FE-024-08 | `CustomerPicker` — debounced 300ms, fires at ≥2 characters, listbox semantics, single selection. The fetcher is **stubbed against `008`'s frozen contract** and lives beside the real query hook | FE-024-02, FE-024-07 | `npm run test -- CustomerPicker`; a manual run showing no request below 2 characters | AC-2, AC-3, AC-4, Q-1 | main session | `frontend-design` |
| ✅ FE-024-09 | `CreateTicketPage` — the route, the mutation, and navigation on the `Location` header. Both fetches live here, never in a child (ADR-011 §4) | FE-024-06, FE-024-08 | A ticket created in a browser against the real endpoint; the toast carries the returned `ticketNumber` verbatim | AC-1 | main session | `frontend-design` |
| ✅ FE-024-10 | The four failure branches: `400` field-level by the server's own key names · `404` clearing **only** the picker · `401` → `/` · malformed → generic | FE-024-09 | `npm run test -- failures`, one case per branch | AC-10, AC-11, Q-5 | main session | `superpowers:test-driven-development` |
| ✅ FE-024-11 | The submit guard: disabled while pending, fields read-only, so a double-click sends **one** request | FE-024-09 | A test asserting one handler call from two clicks | AC-12 | main session | `superpowers:test-driven-development` |
| ✅ FE-024-12 | Every string a key, in `en` **and** `ar`. One key per enum value, the **key** carrying the wire value (`tickets:channel.Sms`) | FE-024-09 | `npm run lint:i18n` green; `npm run lint` green (no JSX literal) | AC-15, BR-8.8, BR-8.11 | main session | — |
| ✅ FE-024-13 | `/tickets/:id` placeholder rendering the created `ticketNumber`, mounted beside the existing nav placeholders | FE-024-09 | The `Location` from a real `201` resolves and shows the number | Q-2, AC-1 | main session | `frontend-design` |
| ✅ FE-024-14 | Character counters from 180 and 3800 at the inline-end, `aria-live="polite"`; every field programmatically labelled; the disabled section's reason exposed to assistive technology | FE-024-07 | `TEST-024-08`, plus the a11y pass in `REV-024-02` | AC-7, AC-16, AC-2 | main session | `frontend-design` |
| ✅ FE-024-15 | `scripts/check-no-domain-types.mjs` — no domain type outside `api-types.provisional.ts` — wired to `npm run lint:types` and into CI | FE-024-06 | Introduce a `TicketStatus` in a component, watch it exit non-zero naming the file and line, then remove it | AC-14 | main session | — |

---

## Tests

**Six rows are automated** — `TEST-024-01 · 02 · 05 · 06 · 07 · 11` — and depend on **FE-024-01**.
The other five are **recorded observations**, marked as such, and depend on nothing but the
feature being on screen. See *The decision this list forces*.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| ✅ TEST-024-01 | `"   "` in `subject` fails client-side and never reaches the network | FE-024-07 | Test run. Replace `.trim().min(1)` with `.min(1)` and watch it go red | AC-6 | main session | `superpowers:test-driven-development` |
| ✅ TEST-024-02 | An untouched `priority` is **absent** from the request body; `""` is never sent | FE-024-07 | Test run asserting on the serialised payload, not on form state | AC-8 | main session | `superpowers:test-driven-development` |
| ✅ TEST-024-03 **(obs)** | Every option list is built from the constants file. Adding a value to the constants adds an option; no list is hand-typed | FE-024-06 | Test run, plus `git grep -nE "'(Billing\|Technical\|Account\|General)'" src \| grep -v provisional` returning nothing | AC-9 | main session | `superpowers:test-driven-development` |
| ✅ TEST-024-04 **(obs)** | A `400` attaches each `errors[field]` to that field **by the server's own key**, and focus moves to the first invalid one | FE-024-10 | Test run querying by accessible description, never by class name | AC-10 | main session | `superpowers:test-driven-development` |
| ✅ TEST-024-05 | A `404` clears the picker and **preserves** `subject`, `description`, and the three selects | FE-024-10 | Test run asserting the other five fields are unchanged | AC-11 | main session | `superpowers:test-driven-development` |
| ✅ TEST-024-06 | Two clicks on submit produce **one** request | FE-024-11 | Test run counting fetch calls | AC-12 | main session | `superpowers:test-driven-development` |
| ✅ TEST-024-07 | The picker issues no request below two characters, and one request per debounce window | FE-024-08 | Test run with fake timers | AC-3 | main session | `superpowers:test-driven-development` |
| ✅ TEST-024-08 **(obs)** | The counter is `aria-live="polite"` and does **not** announce on every keystroke | FE-024-14 | Test run, plus the observation recorded — a live region's chattiness is judged, not asserted | AC-7 | main session | `chrome-devtools-mcp:a11y-debugging` |
| ✅ TEST-024-09 **(obs)** | The result list is a listbox: arrow keys move, Enter selects, and every result carries `dir="auto"` | FE-024-08 | Test run plus a keyboard walk | AC-4 | main session | `chrome-devtools-mcp:a11y-debugging` |
| ✅ TEST-024-10 **(obs)** | The disabled ticket section conveys **why** it is disabled to a screen reader, not only visually | FE-024-14 | Accessible-name/description query, recorded | AC-2 | main session | `chrome-devtools-mcp:a11y-debugging` |
| ✅ TEST-024-11 | `FE-024-15`'s gate fails on a deliberately introduced domain type and passes once removed | FE-024-15 | One deliberate violation, one non-zero exit naming file and line | AC-14 | main session | `superpowers:verification-before-completion` |

---

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| ✅ DOC-024-01 | `tests.md`: the commands run and their **observed** output, every AC mapped to a named test or a recorded observation, and a *Not verified* section naming what was not | All FE, all TEST | The `verify-story` gate. No result written that was not seen | DoD | main session | `verify-story` |
| ✅ DOC-024-02 | `ai-notes.md`: accepted / modified / rejected per dispatched agent, and **how each accepted output was run** | All | Read against the diff; every accepted output names the command that exercised it | DoD | main session | — |
| ✅ DOC-024-03 | `summary.md`: what was built, the trade-offs, every deviation with its reason, and the known limitations | All | A reviewer can go from any deviation to its reasoning without asking | DoD, `CLAUDE.md` gate 6 | main session | — |
| ✅ DOC-024-04 | The **provisional-types register**: the exact date permission was given, the removal condition, and the one file it is confined to — carried forward into `009`'s `FE-009-05` so the swap is not forgotten | FE-024-06 | The entry exists in `summary.md` *Deviations* and names `FE-009-05` | ADR-011 §6 | main session | — |

---

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| ✅ REV-024-01 | Code review: ADR-011 §4 component kinds, fetching only at the route, no barrel file, no `any`, no domain type outside the provisional file, no hand-typed enum | All FE | `review.md` verdict is `Approved` | DoD | main session | `code-review:code-review` |
| ✅ REV-024-02 | **The Arabic walk of this screen**, recorded — including "nothing found" if that is the truth. RTL defects are visual; no assertion catches a container sized to English label text | FE-024-12 | Findings written into `tests.md`, each measured rather than eyeballed | AC-17 | main session | `chrome-devtools-mcp:a11y-debugging` |
| ⏸ REV-024-03 | **Contract check**: the four enum unions and the response shape compared character for character against `009/contracts/tickets-api.md`. A difference is a defect in one of the two and both are corrected — never one silently | FE-024-06 | A recorded diff. **Deferred to `FE-009-05` for the full OpenAPI comparison**, which cannot run until `/swagger` exists | ADR-011 §6 | main session | — |

---

## Droppable if time runs short

Fixed **now**, in this order, while nobody is attached to the work.

| # | Task | What is lost |
|---|---|---|
| 1 | `FE-024-04` — `Toast` | The success message becomes inline text above the form. The `ticketNumber` is still shown verbatim, which is the part AC-1 actually requires |
| 2 | `FE-024-14`'s character counters | The `maxLength` attribute still stops over-typing and the server still validates. The counter is a courtesy; the limit is not |
| 3 | `FE-024-13` — the `/tickets/:id` placeholder | The toast carries the number and the user stays on a cleared form. Worse, and survivable — but AC-1's `Location` round-trip is then unproven, so record it as unproven |
| 4 | `FE-024-05` — the section card | Two `<section>`s with a border from `base.css`. Indistinguishable to a user at this fidelity |
| 5 | `FE-024-01` and the six automated tests | **The whole automated layer.** All eleven rows become recorded observations. Honest, not repeatable — and the six were chosen precisely because they are the ones a person cannot re-check reliably. Drop this only after 1–4 |

## Not droppable

| Task | Reason |
|---|---|
| ✅ FE-024-00 — the Arabic preview | It is the cheapest moment to answer the three-selects question, and `009/frontend-spec.md` predicts that answer is *no*. Discovering it after wiring, tests, and translation costs hours instead of minutes (ADR-009) |
| ✅ FE-024-06 — the provisional types, in one file | The permission was conditional on the containment. Spread across components, the file cannot be deleted when generation lands, and the swap silently misses whatever was copied out |
| ✅ FE-024-07 — `.trim()` before measuring | Three spaces passes a naive check and fails at the server, on a field the form said was fine |
| ✅ FE-024-10 — the `404` branch preserving the user's typing | Losing someone's work because another user changed data is the worst response available, and it is the default if the branch is not written |
| ✅ FE-024-11 — the submit guard | The endpoint is **not idempotent** and has no duplicate rule. This is the only thing standing between a double-click and two real tickets |
| ✅ FE-024-12 — `en` and `ar` parity | BR-8.11, and the gate already exists. A key added in one language only is a build failure, not a discovery |
| ✅ FE-024-15 — the no-domain-type gate | The rule that makes the provisional file removable. Without it the containment is a convention, and conventions are not enforced |
| ✅ REV-024-02 — the Arabic walk | A deliverable, not a check (`docs/sdd/testing/test-strategy.md`) |

---

## What this list deliberately does not contain

| Not here | Why |
|---|---|
| A task to build `Checkbox`, `Table`, or `Modal` | No consumer on this screen. The cap exists to stop exactly this |
| A task to replace the provisional types | It is `FE-009-05`, and it fires when `/swagger` is real. Duplicating it here would create two owners for one swap |
| A task to build `/customers/new` | `007`. The link renders disabled with an explanation (Q-3) |
| A task to build the ticket detail screen | `010`. `FE-024-13` is a placeholder, and it says so |
| A `403` or `409` branch | Neither can occur on this endpoint: BR-6 permits both roles, and two identical tickets are two real tickets. Recorded so the omission is visibly a decision |

---

## Status at close — 2026-08-26

**✅ 41 rows complete. ⏸ 1 row partly complete**, and the two are marked in the table
rather than left to be discovered:

| Row | What is done | What is not, and who closes it |
|---|---|---|
| `FE-024-13` | **Closed 2026-08-27.** A real `201` was received from the running API in both locales, the real `Location` followed, and `TCK-2026-000007` / `TCK-2026-000008` rendered verbatim. `tests.md` §11 | — |
| `REV-024-03` | The four enum unions were compared character for character against `009/contracts/tickets-api.md` — this is where `Sms` rather than `SMS` was confirmed | The **generated OpenAPI** cannot be compared until `/swagger` exists. Deferred to `FE-009-05` by the row's own verification column, not newly |

A ✅ on any other row means the verification column's command was run and its stated output
observed. `tests.md` §1 carries that output verbatim, and §9 names everything that was not
verified — which is the section to read before trusting any of the ticks above.
