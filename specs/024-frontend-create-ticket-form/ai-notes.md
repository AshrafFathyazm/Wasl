# 024 · AI usage notes

**No agent was dispatched for this feature.** The product owner's instruction on
2026-08-26 was explicit: execute in the main session, because each dispatch costs an entry
here plus a review pass, and the feature did not have the time for it. Every task row in
`tasks.md` therefore carries `main session` in its **Agent** column.

That makes this file shorter than the template expects, and the short version is the honest
one: there is no accepted-versus-modified-versus-rejected table because there was nothing
returned to accept, modify, or reject. What follows is the part of the record that still
applies — the skills that shaped the work, and how each output was **run** rather than read.

---

## 1 · Skills used, and what each changed

| Skill | Where | What it changed |
|---|---|---|
| `frontend-design` | `FE-024-00` preview, the four primitives, the Arabic walk | The preview-before-wiring order, and the decision to render it in Arabic first so the three-selects row was judged on the longer labels |
| `superpowers:test-driven-development` | `TEST-024-01 · 02 · 05 · 06 · 07` | The mutation check in `tests.md` §2 — a gate that has only ever been green has not been tested |
| `chrome-devtools-mcp:a11y-debugging` | `TEST-024-08 · 09 · 10`, `REV-024-02` | The verbose accessibility tree, which is what exposed the missing group name (`tests.md` §6) |
| `superpowers:verification-before-completion` | `TEST-024-11` | The deliberate violation, run in both directions |
| `verify-story` | `DOC-024-01` | The *Not verified* section as a required part of the record, not an afterthought |

---

## 2 · Every accepted output was run

The Definition of Done asks that an accepted AI output be **run, not just read**. Nothing
here was accepted on inspection. The mapping from artefact to the command that exercised it:

| Artefact | The command that exercised it | Observed |
|---|---|---|
| `createTicket.schema.ts` | `npx vitest run …/createTicket.schema.test.ts` | 7 passed; 3 fail when `.trim()` is removed |
| `Input`/`Select`/`Textarea` `forwardRef` | A browser probe reading `document.activeElement` after a real `requestSubmit()` | `afterIsSubject: true`, en and ar |
| `Input` counter | A browser probe at 179 / 180 / 200 / cleared | Absent, `180 / 200`, `200 / 200` warning, absent |
| `CustomerPicker` keyboard handling | A browser probe dispatching real `ArrowDown` / `ArrowUp` / `Enter` | 0→1, 1→0, focus retained, Enter selects |
| The double-submit guard | Two synchronous `.click()` calls in Vitest, and three in the browser | 1 call, 1 request |
| `handleFailure`'s `400` branch | A stubbed `window.fetch` returning real `application/problem+json` | Two fields flagged by the server's own keys, focus moved |
| `handleFailure`'s `404` branch | `TEST-024-05` | Picker cleared, five fields preserved, reason in an `alert` |
| `scripts/check-no-domain-types.mjs` | A deliberate violation file, added and deleted | exit 1 naming file, line and rule; exit 0 after removal |
| The legend fix | The verbose accessibility tree, then `getBoundingClientRect` | `group "Ticket Select a customer to continue"`; and a 26px input, which is how the float regression was caught |
| `ci-frontend.yml` | **Not run.** It has never executed on a runner | Named in `summary.md` under *Known limitations* |

The last row is the point of the table. Everything above it was executed; that one was not,
and saying so is cheaper than discovering it on the first push.

---

## 3 · Where the human corrected the machine

Recorded because the corrections are the part of this record with the most information in
it, and because two of them were about *my* errors, not the code's.

| Correction | What it changed |
|---|---|
| `Textarea` is the **fifth** primitive built, not the ninth | The `component-inventory.md` arithmetic: six of eight used, two slots left, three known claimants. My count was wrong and would have hidden the shortfall |
| The Arabic glossary term is **موظف الدعم**, with the definite article | The catalogue copy |
| A frontend-only spec folder must carry the lane in its name | `024-frontend-create-ticket-form`, and the rule written into `specs/README.md` |
| `Textarea` separate, not `Input.multiline` | Four reasons given, all of them structural: `Input`'s height is a token, its behaviour is single-line, a flag makes half the props invalid depending on its value, and the inventory wrote "comment composer" before `Input`'s shape was settled |
| Build the preview **in Arabic**, not English | The three-selects decision was then made on the longer labels rather than validated against them afterwards |
| Record the three measurement-tool failures as a **category**, not one by one — *"النمط أنفع من الحالات"* | [`023/tests.md` §12](../023-frontend-foundation/tests.md), and the habit that caught two more of them in this feature |

---

## 4 · The provisional-types exception

Permission to hand-write domain types was given **2026-08-26**, in writing, with six
conditions. It is recorded in full in `summary.md` under *Deviations* — including the
removal condition and the task that owns it, `FE-009-05`. It is repeated there rather than
here because a deviation belongs in the document a reviewer opens first.

---

## 5 · The AC-1 run — 2026-08-27

Added after the feature was accepted, when the product owner instructed that the API be
started locally and AC-1 verified for real.

**No agent was dispatched for this either.** The row that mattered in §2's table was the
last one — `ci-frontend.yml`, "**Not run.**" The same standard applied here: AC-1 had been
described as *unprovable* rather than *proven*, and the only thing that changes that is
running it.

| Artefact | The command that exercised it | Observed |
|---|---|---|
| `toAppPath` | A real `201` whose `Location` was absolute | Navigated to `/tickets/{id}`; the previous `.replace()` would have passed the whole URL through |
| The Vite dev proxy | The same submit, after CORS blocked the direct call | `POST http://localhost:5199/api/tickets` → `201`, same-origin, no preflight |
| `api-types.provisional.ts` | `GET` on the returned `Location` | Every field present and typed as written — the first evidence the hand-written types are right |
| The `<bdi dir="ltr">` ticket number | The Arabic run | `TCK-2026-000008` in Latin digits inside an RTL toast, the number's own run computed `ltr` |
| `Accept-Language` | The Arabic run | `ar` sent; `Content-Language` came back absent, which is now a reported observation |

**What running it cost, and what it bought.** Three things were believed and turned out to be
wrong: the port was 5272 and not 5000, the `Location` header is absolute and not relative,
and the API has no CORS policy at all. None of the three is visible from the contract, and
none of them would have been found by any test in this repository. That is the whole
argument for the Definition of Done's *run, not just read*, applied to an integration rather
than to a snippet.
