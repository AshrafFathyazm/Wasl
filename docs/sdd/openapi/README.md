# OpenAPI Strategy

## Source of truth

The running ASP.NET Core application generates the OpenAPI document. The application
is the contract; a hand-maintained document would drift from the code within a day
and would then be worse than none, because it would be trusted.

The generated document defines:

- Endpoints and their HTTP methods
- Request and response schemas
- Every status code an endpoint can return
- Authentication requirements

## Workflow

```text
Story task defines an endpoint
        ↓
Request and response DTOs defined as records
        ↓
OpenAPI metadata declared on the endpoint
   [ProducesResponseType] for every status code, including the failures
        ↓
Document generated and served in Development
        ↓
Contract verified against 05-api-conventions.md
        ↓
Frontend generates its types from the document
        ↓
Integration tests verify the behaviour the document promises
```

## Rules

- Every status code an endpoint can return is declared, including `400`, `403`, `404`,
  and `409`. An endpoint documenting only its success path is documented wrongly, and
  the failure paths are the ones a client needs to plan for.
- The error schema is `ProblemDetails` everywhere, per `05-api-conventions.md`.
- DTOs are never domain entities. A domain entity in the contract couples the API to
  the database schema and leaks fields nobody asked for.
- Enums appear as strings with their allowed values enumerated.
- Every endpoint has a summary that says what it does, not what it is called.
- The frontend generates its types from this document rather than hand-writing them,
  so a contract change becomes a compile error rather than a runtime surprise.

## Breaking changes

A change is breaking if an existing client would stop working: removing a field,
renaming a field, narrowing a type, adding a required request field, or changing a
status code for an existing condition.

Breaking changes require a note in the story's `summary.md` and, if they affect a
decision that outlives the story, an ADR. Within this MVP there is one client and no
external consumers, so breaking changes are cheap — but they are still recorded,
because "no external consumers" is a fact about today.

## Verification

- The document is generated on every run in Development.
- Integration tests assert the status codes the document declares.
- Before delivery, the endpoint inventory in `05-api-conventions.md` is checked
  against the generated document. A mismatch means one of the two is wrong, and both
  must be corrected before the story is Done.

---

## Amendment — the contract is written before the code

**Added 2026-08-23, when the work moved into spec-kit features with a backend lane and
a frontend lane running in parallel.**

The section above says the running application is the contract. That is true *after*
an endpoint exists, and it leaves a hole before: the frontend cannot start against a
document that no code has generated yet. Waiting for the backend serialises two lanes
that have no reason to be serial.

So there are two artifacts, and they have different jobs.

| Artifact | When | Job | Authority |
|---|---|---|---|
| `specs/NNN-feature/contracts/<name>-api.md` | Written in `/speckit-plan`, **frozen before either lane starts** | The agreement. Endpoints, request and response shapes, every status code, every `ProblemDetails.type` | Authoritative **before** implementation |
| The generated OpenAPI document | Produced by the running application | The record of what was actually built | Authoritative **after** implementation |

### The rule that keeps them honest

**Before a feature is Done, the generated document is compared against its contract
file. A difference is a defect in one of the two, and both are corrected before the
feature closes.** Never one silently.

This is the same rule the section above already applies to
`05-api-conventions.md`'s endpoint inventory; it now applies per feature as well.

### What the frontend reads

`specs/NNN-feature/FRONTEND-API-GUIDE.md` — a human-readable handoff derived from the
contract file. Base path, auth header, the request and response for each endpoint, the
failure cases with their `type` values, and which acceptance criterion each serves.

The frontend lane may begin as soon as that file exists. It generates its TypeScript
types from the OpenAPI document once the endpoint is real (ADR-011 decision 6), and
until then it works against the contract with hand-written types **marked as
provisional in the file that declares them**, so the swap is a deliberate step rather
than something forgotten.

### Freezing, and unfreezing

A frozen contract can still change — requirements do. What it cannot do is change
silently:

1. The change is recorded in the feature's `plan.md` under a **Contract changes** heading
2. `FRONTEND-API-GUIDE.md` is regenerated
3. Both lanes are told, because a contract change mid-flight is the one thing that
   invalidates work already done in the other lane

A contract change discovered by the frontend failing to compile is the failure this
process exists to prevent.
