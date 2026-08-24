# 014 — Requirements Checklist

A completeness check on the **specification**, not on the code. Run against
[`spec.md`](../spec.md), [`plan.md`](../plan.md), [`tasks.md`](../tasks.md), and
[`contracts/me-language-api.md`](../contracts/me-language-api.md) as they stand on
2026-08-23, after the migration from `docs/sdd/story-artifacts/US-014-language-preference/`.

---

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope stated | `spec.md` **In Scope** — eleven items, including the manual Arabic pass as a deliverable |
| ☑ | Out-of-scope stated, each with a reason | `spec.md` **Out of Scope** — nine rows |
| ☑ | Assumptions recorded rather than held silently | `spec.md` A-1 – A-6. A-5 and A-6 added in migration: the table's owner, and the ordering constraint that puts this feature in Phase 4 |
| ☑ | Open questions carry a working assumption | `spec.md` Q-1 – Q-8. Q-4 – Q-8 added in migration |
| ☑ | Edge cases listed, including the ones that are not errors | `spec.md` **Edge Cases** — fifteen rows |
| ☑ | Business rules cited by ID, not restated | BR-8.1 – BR-8.14, BR-9.1 – BR-9.4, BR-9.8, BR-9.10, FR-5.1 – FR-5.8, NFR-8 – NFR-10 |
| ☑ | Every endpoint has a frozen contract | `contracts/me-language-api.md`, one endpoint, every status code including the three it deliberately never returns |
| ☑ | Every screen has a spec, and it references rather than duplicates the design | `frontend-spec.md` → `design/screens/09-settings-localization.md`, `01-login.md` |
| ☑ | Schema change stated, including the case where there is none | `data-model.md` — the migration may correctly be empty, and the query that decides is written down |
| ☑ | Files to create or change named | `plan.md` **Files to Create or Change**, ADR-010 paths |
| ☑ | At least one real alternative considered and rejected with a reason | `plan.md` **Risks and Trade-offs** — fifteen rows; `research.md` R-2 weighs four options on the one decision that changed |
| ☑ | Every task has an owner and a verification | `tasks.md`, `Agent` and `Skill` on every row |
| ☑ | The audit obligation has a task | `BE-014-12`, `BE-014-13` — **absent from the original artifacts entirely** |
| ☑ | A screen-preview gate exists before any wiring | `FE-014-00` |
| ☑ | A review lane exists, including an OpenAPI-versus-contract comparison | `REV-014-01` – `REV-014-04` |

## Testability

Every acceptance criterion maps to at least one task, and every task names what verifies
it. The four rows marked **weak** are findings, not footnotes — they are recorded here
because a map with no weak rows in a feature this wide would be a map that was not read.

| AC | Tasks | Verified by | Note |
|---|---|---|---|
| AC-1 | FE-014-03, TEST-014-21 | Manual signed in and signed out; a11y test run | See Q-4 — "present" means reachable |
| AC-2 | FE-014-02, FE-014-06, FE-014-11, TEST-014-12, TEST-014-16 | Component test; manual pass per screen | |
| AC-3 | FE-014-02, FE-014-06, TEST-014-12 | Component test asserts nothing is left behind | |
| AC-4 | FE-014-02, FE-014-04 | Manual reload; manual across two browsers | **Weak** — cross-device persistence has no automated test. Two browsers is a person, and `FE-014-04` is the first droppable task |
| AC-5 | BE-014-01, BE-014-04, BE-014-11, TEST-014-04 | Integration test run | |
| AC-6 | BE-014-01, BE-014-04, TEST-014-01, TEST-014-04 | Unit + integration; the `400` lists the supported locales | |
| AC-7 | BE-014-04, BE-014-13, TEST-014-04, TEST-014-19 | Integration test run | Also the audited `401` |
| AC-8 | BE-014-02, BE-014-03, TEST-014-05 | Integration test: the claim beats the header | The ordering guard. Not droppable |
| AC-9 | FE-014-05 | Dev-tools inspection, plus a component test on the client | **Weak** — the header is asserted on the client, not observed end-to-end. `TEST-014-05` covers the consequence that matters |
| AC-10 | BE-014-07, TEST-014-08 | Integration test across several endpoints | |
| AC-11 | BE-014-06, TEST-014-07 | Integration test run | The neutral-culture trap — `research.md` R-5 |
| AC-12 | BE-014-06, TEST-014-07 | Integration test run | Guards an absence — `research.md` R-6 |
| AC-13 | BE-014-05, TEST-014-06 | Integration test, one case per level | |
| AC-14 | BE-014-08, BE-014-09, TEST-014-02, TEST-014-09 | Integration test comparing `en` and `ar` responses byte for byte on `type` and keys | |
| AC-15 | BE-014-09, TEST-014-10 | Integration test run | |
| AC-16 | FE-014-07 | Component tests on the formatters | **Weak** — no test asserts a *rendered screen* formats its dates for the locale. The Arabic pass (`TEST-014-16`) is what catches a screen that bypassed the formatter |
| AC-17 | FE-014-07, TEST-014-14 | Component test asserts the digits, not the locale string | `research.md` R-8 |
| AC-18 | FE-014-08, TEST-014-16 | Component test; manual with mixed-language content | |
| AC-19 | FE-014-09, TEST-014-13 | Rendered output at 0, 1, 2, 3, 11, 100 — one per category | `research.md` R-7 |
| AC-20 | BE-014-08, FE-014-01, TEST-014-02, TEST-014-03 | Two parity tests, one per catalogue system | Not droppable |
| AC-21 | FE-014-01 | `fallbackLng: 'en'` configured | **Weak** — no test forces a missing key at runtime. The parity test makes the situation unreachable, which is the argument for not testing it and also the reason it would go unnoticed if parity were ever disabled |
| AC-22 | FE-014-06, TEST-014-15 | Introduce a violation deliberately; confirm the failure | The test is the lint rule failing, not the lint rule existing |
| AC-23 | BE-014-10, TEST-014-11 | Integration test asserting log output | Droppable, with the loss stated |
| AC-24 | BE-014-05, FE-014-10, TEST-014-20 | Integration test: switch, then force an error on the next request with the same token | **Added in migration.** See `spec.md` Q-7 |

Additional obligations with no AC of their own, carried by `Serves` on the task row:

| Obligation | Rule | Tasks |
|---|---|---|
| One audit row per real change, in the same transaction, absent after a rollback | BR-9.1, BR-9.3 | BE-014-12, TEST-014-17 |
| No audit row when nothing changed | BR-9.8 | BE-014-12, TEST-014-18 |
| The `401` row is written outside any transaction | BR-9.2, BR-9.4 | BE-014-13, TEST-014-19 |
| Provisional types replaced by generated types | ADR-011 §6 | FE-014-12 |
| Arabic copy reviewed by someone who reads Arabic | A-3, Q-5 | REV-014-04 |

## Consistency with the blueprint

| ✓ | Check | Result |
|---|---|---|
| ☑ | Status codes match `05-api-conventions.md` | `204` for a successful action with nothing to return; `400` for failed validation; `401` for a missing or invalid token |
| ☑ | Error shape is RFC 7807 with `traceId`, produced by the shared middleware | Contract, both failure examples |
| ☑ | `200` is never returned with an error in the body | No `200` on this endpoint at all |
| ☑ | Machine-readable values untranslated | Contract, **What stays identical in every locale**. `type`, `errors` keys, the `en`/`ar` values themselves, `traceId` |
| ☑ | Resolution order matches BR-8.4 / BR-8.5 | Contract **Conventions**; `BE-014-05`; `TEST-014-06` |
| ☑ | Unsupported *requested* locale falls back with a success status (BR-8.3, FR-5.8) | `AC-12`; and the deliberate asymmetry with a stored preference is in the contract's behaviour table |
| ☑ | Endpoint is the one in `05-api-conventions.md`'s inventory | `PUT /api/me/language`, US-014 |
| ☑ | Audit action name comes from BR-9's naming table | `User.LanguageChanged` is listed there; nothing invented |
| ☑ | SQL Server types per ADR-013 | `nvarchar(5)`, `sys.columns` verification, `Testcontainers.MsSql`. `varchar` and `psql` corrected in migration |
| ☑ | Two projects, vertical slices, minimal APIs per ADR-010 | `Features/Me/SetLanguage/`; no `Wasl.Application`, no `Wasl.Infrastructure`, no `MeController`, no `IRepository` |
| ☑ | Component kinds per ADR-011 §4, fetching only at route level | `frontend-spec.md` **Components** |
| ☑ | No global store; filters and pagination in the URL | Nothing to store — locale lives in i18next (ADR-011 §1) |
| ☑ | Index inventory unchanged | `03-domain-model.md` names this column as the one with no index, and this feature adds none |
| ☑ | Concurrency convention accounted for | No `expectedVersion`; the reason is written down rather than the omission left implicit |
| ☑ | Design tokens, no literals; CSS logical properties | `frontend-spec.md` **Right-to-left** and **Arabic typography** |
| ☑ | Every state named, and every absent state justified | `frontend-spec.md` **States** — four justified absences |

## Gaps accepted, with reasons

| Gap | Reason it is accepted | Where it is recorded |
|---|---|---|
| No `CHECK` constraint on `PreferredLanguage` | NFR-9 requires a third locale to cost a resource file and a registered culture — **no code change**. A check constraint would make it a migration too, inverting the requirement. A manual `INSERT` of `fr` degrades to English (BR-8.3), it does not corrupt | `data-model.md` **Constraints** |
| The claim is stale for the rest of the session | The token is not reissued; ADR-005 builds no refresh flow. `?culture=` closes it for server messages; the claim itself catches up at the next sign-in | `spec.md` Q-7, `research.md` R-2 |
| `Content-Language` on the `204` names the previous locale | It is correct behaviour, not a defect — the request was resolved before the handler ran. Documented so a client does not read it as a failed switch | Contract, behaviour table |
| RTL correctness is verified by a person, not an assertion | A container sized to English text, an unflipped directional icon, and a number on the wrong side of an Arabic sentence fail no assertion. Visual regression would need a baseline that does not exist | `plan.md` **Test Strategy**, `TEST-014-16` |
| The Arabic typeface is a working assumption | Blueprint Q-15. The design's Arabic layer renders through an accidental fallback, so there is no inherited answer to adopt | `spec.md` Q-6, `research.md` R-10 |
| The Arabic copy may not be reviewed by a second Arabic reader | Blueprint Q-8. If no reviewer exists, that is recorded as a limitation rather than passed over — unreviewed Arabic is indistinguishable from machine output to reviewers who read English | `spec.md` Q-5, `REV-014-04` |
| AC-1 is satisfied by *reachable*, not *rendered in every header* | The shell has no header control for it and puts Settings in the user popover deliberately. The user story's own wording is "available" | `spec.md` Q-4 |
| Four weak rows in the AC map | Each names what compensates. None is left as an unqualified tick | **Testability** above |

## Sign-off

| Role | Status |
|---|---|
| Specification reviewed by the product owner | **Pending** |
| Contract frozen | Yes — `contracts/me-language-api.md`, 2026-08-23. One change pending an answer to Q-7, recorded under **Contract changes** rather than made |
| Plan approved | **Pending.** Agents are named in `tasks.md` and **not dispatched** until it is |
| Q-4 – Q-8 answered | **Pending.** Each carries a working assumption; none is a blocker to starting |
| Ready for `/speckit-analyze` | Yes |
