# `017` — Verification

**Phase:** 5 · **Role:** Verification · **Status:** Written 2026-09-27, three weeks after the
feature shipped under `035`

Every figure here was observed. Nothing is asserted from memory, and the one suite that could
not run is recorded as not run rather than as a pass.

---

## 1 · What ran, 2026-09-27

From the repository root.

| Command | Result |
|---|---|
| `dotnet build --no-incremental` | **0 Warning · 0 Error** |
| `dotnet test tests/Wasl.Domain.Tests` | **254 passed**, 0 failed |
| `dotnet test tests/Wasl.Application.Tests` | **46 passed**, 0 failed |
| `./node_modules/.bin/vitest run` (in `src/wasl-web`) | **57 files · 1325 passed**, 0 failed |

---

## 2 · The integration suite was NOT RUN, and that is where `017`'s evidence lives

**This is the suite that exercises `PUT /api/customers/{id}`.** Two attempts, both failing
before any test touched the product:

```text
Failed!  -  Failed: 549,  Passed: 42,  Total: 591,  Duration: 35 s
System.InvalidOperationException : Could not start the SQL Server test container.
```

**549 red tests that say nothing about the code.** The failure is `Testcontainers`'
`CheckReadinessAsync` against Docker Desktop's WSL backend
(`internal/engines/wsl/engine_windows.go`), which had restarted minutes earlier — the engine
answered `docker ps` and could not start a new container. This is the shape `CLAUDE.md` names
twice: *a measurement that names the wrong thing is worse than no measurement, because it is
believed.* Read as a product failure it would have condemned nine features.

**The fixture itself says what to do, and this follows it verbatim:**

> *"Could not start the SQL Server test container. Docker must be running for the integration
> suite — see `specs/001-solution-skeleton/quickstart.md`. If Docker is unavailable, run the unit
> suite only and **record the integration suite as NOT RUN in tests.md, with the reason. Never as
> a pass.**"*

**So `017` has no executed backend evidence as of this date.** What §3 lists is a static
citation: the tests exist, they are named for the criteria, and they were last green when `035`
shipped on 2026-09-03 — recorded *there*, not here.

**To close this line:** `dotnet test tests/Wasl.Api.IntegrationTests` with a healthy Docker
engine. The expected total is **591**.

---

## 3 · The criteria-to-test map — static, not executed

Every test below is in `tests/Wasl.Api.IntegrationTests/Customers/UpdateCustomerTests.cs`.

| Criterion | Test |
|---|---|
| AC-1, AC-23 | `A_valid_update_returns_the_resource_and_a_get_returns_the_same_bytes` |
| AC-23 | `The_returned_version_works_on_the_next_update` |
| AC-12 | `An_omitted_optional_field_is_cleared_rather_than_kept` |
| AC-4 | `A_stale_version_is_a_concurrency_conflict` |
| AC-4 + AC-2, ordering | `A_request_that_is_both_stale_and_duplicate_answers_stale` |
| AC-13 | `A_missing_version_is_a_400_naming_the_field` |
| AC-14 | `An_undecodable_version_is_a_400` · `An_over_long_version_is_a_400` |
| AC-7 | `Re_saving_a_customer_with_its_own_contacts_is_not_a_duplicate` |
| AC-2 | `Another_customers_email_is_a_duplicate_naming_only_the_field` |
| AC-8 | `Another_customers_phone_is_a_duplicate` |
| AC-3 | `Clearing_both_contact_methods_is_a_400_naming_both` |
| AC-10 | `An_unparseable_phone_is_a_400_and_not_a_conflict` |
| AC-9 | `The_email_is_normalised_before_it_is_stored` |
| AC-5 (first half) | `An_unknown_id_is_a_404` |
| AC-17 | `A_successful_update_writes_one_audit_row_with_an_actor` |
| AC-18 | `A_rejected_update_writes_no_succeeded_row` |
| AC-16 | `The_row_in_the_database_carries_the_new_values` |

**Two of these are worth reading rather than counting.**

`A_valid_update_returns_the_resource_and_a_get_returns_the_same_bytes` compares the `PUT`
response and the `GET` response **as raw JSON**, not field by field — which is `007` AC-14's
finding applied: a field-by-field comparison walked straight past
`"…57.7129947Z"` from a create against `"…57.712Z"` from a read, because the difference was
precision rather than value.

`A_request_that_is_both_stale_and_duplicate_answers_stale` is the one that pins the **order** of
the three checks. Without it, a handler that checked contacts before the version would pass every
other test in the file.

---

## 4 · Three criteria with no test of their own

Listed so the map above is not read as complete.

| # | What is missing | Why it is not a defect |
|---|---|---|
| **AC-15** | No parallel test. Two updates on one version, one `200` and one `409` | Covered serially by AC-4. The guarantee is the `rowversion` — a database mechanism, not a check — and `007` AC-13 is still the project's only concurrency test |
| **AC-19** | A no-op update writes a row; that its `Changes` is **empty rather than absent** is unasserted | The endpoint deliberately answers `200` to a no-op rather than `409`, and the test file says why. The audit half is simply unmeasured |
| **AC-21** | No test signs in as an `Agent` and updates | The endpoint carries no policy, so there is nothing that could refuse. Asserted by absence — which `027` established as a legitimate shape, and which is weaker than a token |

---

## 5 · No negative control was run for this feature

`035` built it and owns whatever controls were run then. **Nothing was broken on purpose for
this record**, and a guard that has never been seen to fail has not been verified — so this file
claims none.

The one control this record *did* produce belongs to a different piece of work and is recorded
where it happened: the BR-9.7 coverage guard, same day, six controls, five red first time and
one that could not fail for the reason it was written.
