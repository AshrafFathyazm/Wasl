# 032 — Tasks

**Lane:** Frontend only · **Approved for implementation:** product owner, 2026-08-31
**Owner of every row:** this session. No subagent was dispatched — the product owner ruled
against it for this feature, so `ai-notes.md` records the accepted outputs of one worker.

Order is dependency order. `FE-032-00` gates everything after it (ADR-009, AC-14).

| # | Task | Owner | Skill | Closes |
|---|---|---|---|---|
| FE-032-00 | `dev/CustomerProfilePreview.tsx` — four states, Arabic and English side by side, **before any wiring** | session | frontend-design | AC-14 |
| FE-032-01 | `CustomerDetail`, `CreateCustomerRequest`, `CreateCustomerResponse` in `api-types.provisional.ts`, marked provisional, sourced to the two frozen contracts | session | — | §5 |
| FE-032-02 | `features/customers/customers.api.ts` — `getCustomer`, `createCustomer`. Thin: build a path, call the wrapper, return the body | session | — | AC-1 |
| FE-032-03 | `features/customers/createCustomer.schema.ts` — one Zod schema, BR-4.1 as a cross-field refinement, messages as catalogue keys | session | — | AC-9 |
| FE-032-04 | `features/customers/CopyValue.tsx` — copies the **raw** value, confirms on the pressed control, reports upward for the toast. Feature-local, not a tenth primitive | session | — | AC-4 |
| FE-032-05 | `features/customers/CustomerProfilePage.tsx` + `Customers.module.css` — the four states, the copy affordances, no Edit control | session | frontend-design | AC-1 · AC-2 · AC-3 · AC-5 · AC-10 · AC-11 |
| FE-032-06 | `features/customers/CreateCustomerPage.tsx` + `CreateCustomer.module.css` — the preview wired to `POST /api/customers` | session | frontend-design | AC-6 · AC-7 · AC-8 |
| FE-032-07 | `routes.tsx` — `/customers/new`, `/customers/:id`, `/_preview/customer-profile`. `/customers` **keeps** `023`'s placeholder | session | — | Q-1 |
| FE-032-08 | `locales/{en,ar}/customers.json` — every key on both screens, parity | session | — | AC-13 |
| TEST-032-09 | `CustomerProfilePage.test.tsx` — loaded · skeleton · not-found from **both** id shapes · error with `traceId` · empty notes · copy payload · `dir` attributes | session | — | AC-1 – AC-5, AC-10, AC-11 |
| TEST-032-10 | `CreateCustomerPage.test.tsx` — one request per submit, the server's `400` message read as a string, the `409` field error plus find-existing, no pre-check | session | — | AC-6 – AC-8 |
| TEST-032-11 | `createCustomer.schema.test.ts` — BR-4.1 both directions, trim before length, e-mail shape | session | — | AC-9 |
| TEST-032-12 | `customerStyles.test.ts` — no hex, no raw px radius, no `left`/`right` in either module, and the token map recorded | session | — | AC-12 |
| DOC-032-13 | `tests.md` with observed output · `summary.md` · `ai-notes.md` · board and delivery-log rows | session | verify-story | DoD |

## Not tasks, deliberately

- **No new primitive.** The cap is eight with a written reason required for a ninth
  (`component-inventory.md`), and `CopyValue` is one screen's control. If a second screen
  needs it, that is the written reason and it moves then — not now, on speculation.
- **No `/customers` list.** `023` already mounts `/customers` as a placeholder from
  `NAV_PATHS`, which is what Q-1 asked for and it already exists. Nothing to build.
- **No edit path.** `017` is not built (§6). The Edit control is absent, not disabled.
- **No Arabic transcribed from the source document** (§2, Q-6). Values are authored in the
  repository and diffed against the vendored file when it lands.
