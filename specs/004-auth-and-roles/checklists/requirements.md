# 004 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is trusted,
and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md` |
| ☑ | Every excluded item names the feature that owns it **and its production consequence** | `spec.md`, Out of scope — 16 rows, each with a consequence column |
| ☑ | The most serious gap is named as such rather than softened | `spec.md`: no lockout and no rate limiting, quoting ADR-005; and the 8-hour lifetime called a weak mitigation in `spec.md`, `plan.md`, and `contracts/auth-api.md` |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-8 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-A – Q-F |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-30 |
| ☑ | Edge cases include failure and permission cases, not only happy variations | `spec.md`, Edge cases — 19 rows, of which 11 are failures or denials |
| ☑ | Referenced rules are cited by ID and not restated at length | `spec.md`, Rules referenced |
| ☑ | The contract states every status code and every `ProblemDetails` `type` | `contracts/auth-api.md` — `200`, `400`, `401` on the endpoint; `401`, `403` inherited |
| ☑ | The schema change is specified to the column, with a named migration | `data-model.md` — `AddSupportUsers` |
| ☑ | The plan names every file it will create or change | `plan.md`, Backend design and Frontend design |
| ☑ | At least two real alternatives are considered and rejected with reasons | `plan.md`, Risks and trade-offs — five rejected, four accepted risks |

## Testability

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task in `tasks.md` | Full map below |
| ☑ | No AC needs a follow-up question to turn into a test | Each names a command, a query, a status code, or an observable DOM state |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell is a command, a query, a test run, or an inspection someone else could repeat |
| ☑ | The silent failures each have their own criterion | AC-6 (claim renaming), AC-7 (role claim type), AC-9 (clock skew), AC-10 (unprotected endpoint), AC-11 (short key), AC-21 (middleware order), AC-27 (redirect loop) |
| ☑ | Each silent-failure test is verified by **breaking it on purpose** | `TEST-004-06`, `TEST-004-07`, `TEST-004-09`, `TEST-004-10`, `TEST-004-19` each carry "revert the setting and watch it go red" in their `Verified by` |
| ☑ | Anything knowingly untested is listed with a reason | `plan.md`, Test strategy § *Deliberately not tested* — seven items |

### AC → task map

| AC | Tasks |
|---|---|
| AC-1 | BE-004-12 → TEST-004-01 |
| AC-2 | BE-004-05 → TEST-004-02 |
| AC-3 | BE-004-05 → TEST-004-03 |
| AC-4 | BE-004-12 → TEST-004-04 |
| AC-5 | BE-004-12 → TEST-004-05 |
| AC-6 | BE-004-06 → TEST-004-06 |
| AC-7 | BE-004-07 → TEST-004-07 |
| AC-8 | BE-004-06 → TEST-004-08 |
| AC-9 | BE-004-06 → TEST-004-09 |
| AC-10 | BE-004-07, BE-004-13 → TEST-004-10 |
| AC-11 | BE-004-04 → TEST-004-11 |
| AC-12 | BE-004-03 → TEST-004-12 |
| AC-13 | BE-004-03 → TEST-004-22 |
| AC-14 | BE-004-01, BE-004-03 → TEST-004-23, TEST-004-24 |
| AC-15 | BE-004-09, BE-004-12 → TEST-004-13 |
| AC-16 | BE-004-09, BE-004-12 → TEST-004-14 |
| AC-17 | BE-004-10 → TEST-004-15 |
| AC-18 | BE-004-10, BE-004-11 → TEST-004-16 |
| AC-19 | BE-004-09, BE-004-10 → TEST-004-17 |
| AC-20 | BE-004-13 → TEST-004-18 |
| AC-21 | BE-004-13 → TEST-004-19 |
| AC-22 | BE-004-02 → TEST-004-20 |
| AC-23 | BE-004-02, BE-004-03 → TEST-004-21 |
| AC-24 | FE-004-06 → TEST-004-25 |
| AC-25 | FE-004-04, FE-004-06 → TEST-004-26 |
| AC-26 | FE-004-08 → TEST-004-27 |
| AC-27 | FE-004-05 → TEST-004-28 |
| AC-28 | FE-004-03, FE-004-10 → TEST-004-29 |
| AC-29 | FE-004-02, FE-004-09, FE-004-11 → TEST-004-30 |
| AC-30 | FE-004-08 → TEST-004-31 |

No AC is unmapped, and no `TEST-004-*` task serves nothing: `TEST-004-24` serves BR-8.1 and
AC-14, and every other test names an AC.

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | JWT bearer, two roles, seeded users, `PasswordHasher<T>`, and the signing key from configuration | ADR-005 |
| ☑ | Every gap ADR-005 declines to build is repeated here with its consequence, none added and none dropped | ADR-005 § *What is deliberately not built* |
| ☑ | Role-only rules as authorization policies; data-dependent rules in the application layer | BR-6, ADR-005 |
| ☑ | The `ManagerOnly` policy covers exactly the three role-only rules in the matrix | BR-2.1, BR-3.2, BR-9.11 |
| ☑ | `PreferredLanguage` is carried as a claim so culture resolution costs no query | ADR-007 §4 |
| ☑ | `UseRequestLocalization()` after `UseAuthentication()`, recorded and tested | ADR-007 §4, `plan.md` § *`Program.cs`* |
| ☑ | Every authentication and authorization event writes a row | BR-9.2 |
| ☑ | A denial's row is written outside any transaction, and it is tested | BR-9.4, ADR-008 |
| ☑ | Actor email and role are snapshotted, not joined | BR-9.6 |
| ☑ | No password, hash, token, or key can reach an audit row — by the writer's signature, not by filtering | BR-9.7 |
| ☑ | Audit `TraceId` matches the response `traceId` | BR-9.9 |
| ☑ | Action names taken from the registry unchanged, so `LIKE 'Auth.%'` still works | `04-business-rules.md` § *Action naming* |
| ☑ | Two projects, one slice, cross-cutting parts in `Common/Auth/` | ADR-010 |
| ☑ | No repository. A named query object with one caller and no interface | ADR-010 |
| ☑ | `nvarchar`, `datetime2(3)`, `rowversion`, case-insensitive collation on `Email`, filter definition verified | ADR-013, `data-model.md` |
| ☑ | Integration tests against a real engine, never EF `InMemory` | `docs/sdd/testing/test-strategy.md` |
| ☑ | `/health` and the token endpoint are the only unauthenticated routes | `docs/sdd/05-api-conventions.md` § *Endpoint inventory*, FR-4.1 |
| ☑ | `type`, `errors` keys, enum values, and `traceId` identical in every locale | BR-8.7, `contracts/auth-api.md` |
| ☑ | One small auth context, no store, `returnUrl` in the URL, fetching at route level | ADR-011 §1, §2, §4 |
| ☑ | The plain login panel; the designed one is Phase 6 | ADR-009, `design/screens/01-login.md` |
| ☑ | The eight-primitive cap is respected — shell extras are feature components until a second consumer | ADR-009, ADR-011 §3 |
| ☑ | CSS logical properties, `dir="auto"` on user content, Latin digits | ADR-007 §6, §7, §8 |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| No lockout, no rate limiting, no token revocation, no refresh, no password reset, no registration, no MFA | ADR-005 rejected each on scope and named the consequences. `spec.md` repeats every one with its production consequence, and the README carries them as limitations (`DOC-004-02`). This is the largest gap in the product and it is stated four times rather than once |
| The 8-hour lifetime is the entire revocation control, and it is weak | Stated plainly in `spec.md`, `plan.md`, and the contract. Fixing it means refresh tokens or a revocation list, both of which ADR-005 declined |
| A deactivated user's live token keeps working for up to 8 hours | `spec.md` Q-F. Closing it means a database read on every request, which is precisely what ADR-007 §4 put the claim in the token to avoid |
| A `401` flood writes unbounded audit rows | `spec.md` Q-D. BR-9.2 is followed as written; the missing control is the rate limiting ADR-005 already names. Quietly dropping some rows would put the code in disagreement with a business rule |
| `MiddlewareOrderTests` asserts over source text and can be defeated by refactoring | `plan.md` § *Accepted risk*. ASP.NET Core exposes no ordered middleware list; the behavioural equivalent belongs to `005`. A weak test on the right thing, with its weakness written down |
| No Manager-only production endpoint exists yet, so the end-to-end `403` uses an endpoint registered by the **test host** | `research.md` R-11. AC-10's inventory test deliberately runs against the production endpoint set so the test-only endpoint cannot weaken it — stated in `plan.md` because that is exactly how such a test erodes |
| `Wasl.Api` unit tests live in `Wasl.Api.IntegrationTests` | ADR-010 fixed the project count. A third project to satisfy a name was rejected; the container fixture is opt-in per class so those tests do not pay for Docker |
| `RowVersion` on `SupportUsers` has no consumer in this feature | `data-model.md`. Created because the schema requires it and because `014` updates `PreferredLanguage`, which is the edit ADR-006 protects |
| The token is stored where a script on the origin can read it | `spec.md` Q-A, `research.md` R-9. Recorded as a trade-off with its mitigations rather than ticked as safe; `REV-004-01` records it as a gap, not a pass |
| The collapsed sidebar, its flyout, and its tooltips are absent | `spec.md` Out of scope, with the space cost stated. At this feature the nav has one item and no children, so the flyout would have nothing to show |
| Cross-tab sign-out does not propagate | `spec.md` Edge cases. The second tab discovers it on its next request, which `401`s |
| No load or performance verification of the token endpoint | No stated requirement; `docs/sdd/testing/test-strategy.md` lists performance as deliberately untested |
| Docker is not currently running on this machine | `001/research.md` R-8, carried forward as A-8. Every integration AC here is unverifiable until Docker Desktop is started. Stated rather than discovered by a red suite |

## Tensions found in the blueprint, raised rather than resolved

Each of these is a place where two blueprint documents, or one document and the phase
order, do not agree. None is decided unilaterally inside this folder.

| # | Tension | Where it is recorded |
|---|---|---|
| 1 | `003` needs an actor for the audit row; `004` produces the actor. Neither can be first in the strong sense | `spec.md` Q-B, `plan.md` § *The circularity between `003` and `004`* |
| 2 | NFR-10 requires every `ICommand` to be auditable in-transaction; BR-9.4 requires a failed sign-in's row to survive a rollback. `IssueTokenCommand` cannot satisfy both | `spec.md` Q-C, `research.md` R-6 |
| 3 | The ER diagram and the `SupportUser` entity table both omit `PasswordHash` and `RowVersion`; the physical shape and ADR-005 include them | `research.md` R-14, `data-model.md` header |
| 4 | `PasswordHash` is specified as `nvarchar` while the same file says ASCII-by-definition columns stay `varchar` | `research.md` R-13 |
| 5 | ADR-007 §1 puts client-side localization in the walking skeleton, but the React application does not exist until `006`, which is after `005` | `spec.md` Q-E |
| 6 | The app-shell screen spec needs Avatar, icon button, tooltip, popover and flyout; ADR-009 caps the primitives at eight and includes none of them | `frontend-spec.md` § *Components*, resolved within ADR-011 §3 rather than by raising the cap |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — this feature is awaiting approval before implementation |
| The six tensions above confirmed or corrected by a human | **Pending.** Tension 1 and 2 must be settled **before `003` starts**, not before `004` |
| Plan names every file it will create | ☑ `plan.md` |
| Contract frozen | ☑ `contracts/auth-api.md`, including the half every other endpoint inherits |
| Frontend handoff derived from the contract, with types marked provisional | ☑ `FRONTEND-API-GUIDE.md` |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` |
| Droppable and not-droppable both recorded with reasons | ☑ `tasks.md` |
