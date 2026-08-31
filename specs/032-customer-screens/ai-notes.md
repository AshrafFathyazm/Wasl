# 032 — AI notes

`CLAUDE.md`: whatever an agent returns is recorded here, and every accepted output was
**run**, not just read.

## Agents dispatched

**None.** The product owner ruled against subagents for this session, so every task in
`tasks.md` was executed in the main session. There is no third-party output to record, and
this file is therefore the record of what the one worker got wrong and how it was caught.

## What was accepted after being run

| Output | How it was verified |
|---|---|
| `CustomerProfileView` · `CustomerProfilePage` · `CreateCustomerPage` · `customers.api.ts` · `createCustomer.schema.ts` · `CopyValue` | `npx vitest run` (376 passed), `tsc --noEmit`, `eslint .`, `npm run build`, and both screens opened in Chrome in Arabic |
| The four test files | Each was run; five deliberate controls were then applied and each produced a red test naming the right thing (`tests.md` §4) |
| The token map | Enforced by a guard rather than reviewed — `customerGuards.test.ts` refuses a hex literal, a raw radius or gap, a physical property, and a `var()` naming a token that does not exist |
| Three new icons — `IconCopy`, `IconRetry`, `IconAlert` | Rendered in the browser at 15px and 25px in both directions |

## What was wrong on the first pass

Recorded because the pattern matters more than the fixes.

1. **A `MemoryRouter` inside the application's router.** The preview page rendered
   `You cannot render a <Router> inside another <Router>` and nothing else — with 59 tests
   green, because tests never route through `routes.tsx`. Found by opening the page.
2. **`dir="auto"` beside a `<bdi>`**, on four elements. It is inert at best and inverts the
   alignment at worst; the Arabic name rendered 610px from its own avatar. Found by measuring
   computed direction and bounding boxes, not by reading the JSX — the JSX looked correct,
   and `07-customer-profile.md` asks for exactly what was wrong.
3. **`var(--font-mono, monospace)`** — a token that does not exist, silently falling back.
   Caught by a reader, then made uncatchable-by-accident with a guard.
4. **`gap: 2px`** copied from the source document. Caught by that guard's first run.
5. **A guard that was itself wrong**: the radius rule refused `var(--button-radius)`, a
   component token defined as `var(--radius-sm)`. The failure was the guard's, not the CSS's,
   and it was widened rather than worked around.
6. **The Arabic preview frame rendered English labels.** One i18next instance has one
   language; both frames shared it.
7. **The phone placeholder reordered under RTL.** `Input` had no way to pin direction, so the
   primitive gained one.

Four of those seven were invisible to the whole unit suite, and two of them looked *more*
correct in the source than the fix does.

## What was deliberately not done

- No subagent, per the ruling.
- No duplicate pre-check on the create form, and a test asserts the network is reachable from
  one file only — because that is where a pre-check would have to live.
- No enabling of `CustomerPicker`'s *New customer* button, and no deletion of
  `STUBBED_CUSTOMER_SEARCH`. Both are stale, both belong to another lane, both are named in
  `tests.md` §6 with the reason.
- No Arabic transcribed from the source document (spec §2, Q-6).
- No resolution of the four contract-vs-build differences. They are raised, with evidence.
