# 001 — AI Usage Notes

**State: specification phase only. No implementation has run.**

Everything below describes AI use on the *planning* artifacts. The implementation
sections are headings with nothing under them, and they stay that way until code exists
— an empty section is honest, a pre-filled one is a false statement.

---

## Specification and planning

**Used for:** reading the whole SDD blueprint (19 root documents, 13 ADRs, 12
story-artifact sets, the design and testing folders) and reconciling it against two
external inputs — the assessment sheet and the house platform repository.

**Accepted as-is:**

- The blueprint's business rules (`BR-1` – `BR-9`), acceptance-criteria style, and
  Definition of Done. They were already written as testable propositions
- ADR-008's audit reasoning, ADR-007's localization ordering constraint, ADR-004's
  state machine — none needed changing

**Modified, and why:**

| What | Change | Reason |
|---|---|---|
| ADR-001 (PostgreSQL) | Superseded by ADR-013 (SQL Server) | The product owner specified SQL Server. ADR-001 itself said to revisit rather than defend if that happened |
| ADR-006 concurrency token | `xmin` → `rowversion`, reasoning preserved | Provider consequence of the above |
| `03-domain-model.md` physical shape | Rewritten in SQL Server types | `uuid`/`timestamptz`/`jsonb`/`boolean` do not exist there. `varchar` → `nvarchar` matters most: it is the one that breaks Arabic and looks like a font bug |
| `CRM.*` namespaces | → `Wasl.*` | Two names for one system across the blueprint |
| `FakeItEasy` | → `Moq` | House platform convention, no reason of our own to differ |
| `openapi/README.md` | Added a contract-first amendment | "The app is the contract" leaves the frontend unable to start. A frozen contract file now precedes both lanes |
| Story artifacts | Migrated to `specs/NNN-slug/` | Spec Kit's shape, matching the house platform's own `specs/` folders |

**Rejected:**

| Suggestion | Why it was rejected |
|---|---|
| Drop MediatR "to reduce complexity and keep the solution easier to explain" | ADR-008 needs a pipeline behaviour to make the audit row and the transaction boundary **structural** rather than something each handler remembers. Without it, BR-9.3 becomes discipline, and discipline is what the architecture test exists to replace. The house platform also uses MediatR, so the familiarity argument points the other way |
| ~~Four-project Clean Architecture, matching the house platform~~ — **this was not rejected in the end** | Raised as the safer choice, initially overruled in favour of ADR-010's vertical slices, and then **adopted on 2026-08-24** when the product owner reversed the decision. ADR-010 is now `Rejected`. Kept in this table rather than deleted because the sequence is the record: the argument was made, was set aside, and won on its own terms — the house convention, separation of concerns visible without explanation, and the developer being fastest in a familiar structure. Two things were carried over from the rejected proposal: feature folders inside `Wasl.Application`, and `IApplicationDbContext` instead of a repository |
| Adopt the house response envelope `{ IsSuccess, StatusCode, Data, Errors }` | The assessment sheet counts "returning 200 with an error in the body" against you. `ProblemDetails` with correct HTTP status codes is the deliberate divergence, and it is defended rather than accidental |
| Create every table in `InitialCreate` | A migration is the cheapest place to get a type mapping wrong. One table reviewed now beats seven reviewed at once |
| Add `Serilog`, `Mapster`, and `Swashbuckle` in this feature because the house platform has them | No consumer yet. Each is revisited at the feature that first needs it (`research.md` R-7). Adding a package with zero consumers is speculative, which is the same test ADR-010 applied to `IRepository` — and that particular conclusion survived its own rejection: there is no repository, only `IApplicationDbContext` |

**How each accepted output was verified:** every claim about the house platform was
checked by reading `azm-formbuilderBE/src` — project list, `TargetFramework` in the
csproj files, the `PackageReference` set, and the existing `specs/` folder shape. Every
claim about the blueprint was checked by reading the file, not by recalling it. The
Postgres-specific leakage was found with a grep across all 244 files, not by inspection,
because inspection is what let it survive this long.

**Not put into any prompt:** no credentials, no connection strings, no customer data.
The `sa` password in `docker-compose.yml` is a local throwaway and is not the
application own connection string: the development loop uses Windows auth, so there is no
application credential at all (AC-10, and `research.md` R-8).

---

## Implementation

*Empty. No code has been written for this feature.*

To be filled per task with: what the agent was given, what came back, what was
accepted, what was modified and how, what was rejected and why, and — for each accepted
output — the command that was **run** to verify it. Reading is not verifying.

---

## Testing

*Empty. No tests have been run.*

`tests.md` records the commands and their real output. Nothing is written there that
was not observed, which is the one rule in this process that a reviewer can check in
about ten seconds.
