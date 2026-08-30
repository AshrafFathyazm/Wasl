# `002c-error-contract-tail` — summary

**Delivered 2026-08-30.** 521 tests, 0 warnings, 20 new.

## What was built

| # | What | Where |
|---|---|---|
| 1 | `RequiredMemberCoverageTests` — **the gate**: every non-nullable command member has a validator rule | `Wasl.Application.Tests` |
| 2 | `SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true`, set **only because the gate is green** | `AddPresentation` |
| 3 | `AddOpenApi()` — registered, deliberately **not mapped** | `AddPresentation` |
| 4 | `OpenApiContractTests` — the generated document compared to the frozen `contracts/`, both directions | integration tests |
| 5 | `ValidatorMessageKeyTests` — `002`'s `TEST-002-10`, unwritten since `002` | `Wasl.Application.Tests` |
| 6 | `TraceAndCancellationTests` + `LogCapture` — `002` AC-4 and `TEST-002-15` | integration tests |
| 7 | `ResourceKeyLeakTests` extended to `002b`'s three new statuses and the malformed body | integration tests |
| 8 | `CLAUDE.md`'s `/swagger` line corrected | AC-12 |

## The one thing worth reading

**The gate's first failure was its own false positive, and fixing it by name would have quietly
broken it.**

AC-4 flagged `AddTicketCommentCommand.AuditAction` — `IAuditableCommand`'s computed property,
never bound from a request. The tempting fix is an exclusion list. The fix taken is structural:
a record's positional parameters compile to `{ get; init; }` and are writable, an expression-bodied
property is not, and `CanWrite` separates them. *A list of properties to ignore is a list somebody
extends until the gate stops guarding anything.*

Only once it was green was the binder setting changed — literally, by ruling. Without the gate,
suppressing the implicit-required rule would trade an awkwardly-worded `400` for a
`NullReferenceException`: **a worse defect wearing a localization fix.**

## The Definition of Done item that had never been satisfiable

*"The generated OpenAPI matches `contracts/`"* has been in the list since `001`. There was no
document: neither Swashbuckle nor `Microsoft.AspNetCore.OpenApi` was referenced, and `CLAUDE.md`
promised a `/swagger` that returned `401` from the fallback policy on an unmatched route — which
reads like a protected endpoint rather than an absent one.

Now there is a document, and comparing it found **two endpoints in frozen contracts that nobody
had counted**: `POST /api/tickets/{ticketId}/messages` (`021`) and `PUT /api/settings/branding`
(`022`). Thirteen entries in `NotBuiltYet`, each named with its owning feature, and a fourth test
that fails if an entry names an endpoint that now exists — so the exception list cannot outlive
its reason.

## Deviations

| # | Spec says | Built | Reason |
|---|---|---|---|
| D-1 | A test probe "is never in the document — mapped by the fixture, not by `src/`" | probes **are** in the document, and are excluded by path prefix | The fixture maps them into the **real** pipeline through an `IStartupFilter`, so they are genuine endpoints. The exclusion is checkable rather than asserted: `grep -rn "__probe" src/` returns 0 |
| D-2 | AC-3 — the document declares content types and `401`/`403` per endpoint | **not written** | No action carries `[ProducesResponseType]`, so the document has no statuses to compare. Annotating twelve actions is a real change to `src/` for a documentation property, and larger than the approved scope. Named, not folded in |

## Known limitations

- **AC-3 is not done**, above. The document carries paths, methods and request schemas — enough
  for the contract comparison, not enough to generate a client from. The frontend lane's
  hand-written types stay provisional.
- **`LogCapture` cannot isolate one test's entries** — the suite shares one host. AC-9 asserts
  the trace id is present among the entries, not that the buffer holds only its own.
- **AC-10 asserts the observable**, not which layer noticed the cancellation. That is not
  distinguishable from outside, and inventing a way to see it would be verifying the criterion
  with something else.
- **The document is not served, by ruling.** If a demo wants the explorer it is Development-only
  plus a test asserting `404` in Production — not now.

## What this closes

`002`'s `BE-002-11`, `REV-002-02`, `TEST-002-10`, `TEST-002-15` and AC-4; `002b`'s AC-5 and AC-14
and its raised framework-message defect. **`002`, `002b` and `002c` are now closed together**, and
nothing is left open under a closed feature's name.
