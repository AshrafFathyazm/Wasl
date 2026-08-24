# 021 — AI Notes

What AI was used for, what was accepted, what was modified, what was rejected and why,
and how each accepted output was verified. Constitution VI.

No secrets, credentials, connection strings, or production data were placed in any
prompt. There were none to place: this feature has no credential by design (AC-17).

---

## Specification

**Model / harness:** Claude (Opus 5, 1M context) running as a spec-authoring subagent in
Claude Code, dispatched by the workflow orchestrator, 2026-08-23 to 2026-08-24.

**Inputs given to it:** the repository's own documents, read from disk in this order —
`.specify/memory/constitution.md`, `specs/README.md`, the whole of
`specs/001-solution-skeleton/`, `specs/007-create-customer/contracts/customers-api.md`,
`FRONTEND-API-GUIDE.md`, `frontend-spec.md`, `data-model.md`,
`docs/sdd/00-project-context.md`, `01-product-spec.md` FR-3, `02-architecture.md`,
`03-domain-model.md`, `04-business-rules.md` BR-5 to BR-9, `05-api-conventions.md`,
`08-board.md`, `09-definition-of-done.md`, `user-stories/DEFERRED.md`, ADR-009, ADR-010,
ADR-011, and `design/component-inventory.md` + `design/screens/README.md` +
`design/screens/04-ticket-detail.md`.

### What AI was used for

| Used for | Output |
|---|---|
| Reading the blueprint and finding where it disagrees with itself | Three findings, all carried into the specification rather than smoothed over: the constitution forbids this abstraction (`spec.md` Tension 1); `02-architecture.md` lists a `ReceiveMessage` slice that cannot be built (Tension 2); `03-domain-model.md` has no `Interaction` entity although `02-architecture.md` names the file (`research.md` R-2) |
| Drafting all ten artifacts in this folder | `spec.md`, `research.md`, `data-model.md`, `contracts/communications-api.md`, `plan.md`, `frontend-spec.md`, `FRONTEND-API-GUIDE.md`, `tasks.md`, `checklists/requirements.md`, and this file |
| Deriving the endpoint set, status codes, and `ProblemDetails` types from the existing conventions rather than inventing them | `contracts/communications-api.md`, and the two additions it declares to `05-api-conventions.md` |
| Enumerating what fails **silently** and giving each its own criterion | `spec.md`, AC-4, AC-5, AC-7, AC-8, AC-9, AC-16, AC-17, AC-22 |

### Accepted as-is

| Accepted | How it was verified |
|---|---|
| The document set, names, and section structure | Compared against `specs/001-solution-skeleton/` and `specs/007-create-customer/` file by file. `specs/README.md` requires `spec.md`, `plan.md`, `tasks.md` by exact name because `.specify/scripts/bash/*.sh` looks them up — checked, and those three names are exact |
| Every `BR-*`, `FR-*`, `NFR-*`, `ADR-*`, `AC-*`, `US-*` identifier cited | Each was **grepped in the source document before being cited.** BR-4.1, BR-5.2, BR-5.7, BR-6, BR-7.2, BR-7.6, BR-8.4, BR-8.6, BR-8.7, BR-8.9, BR-8.11, BR-8.13, BR-8.14, BR-9.1–9.13, FR-3.1–3.4, FR-4.1, FR-5.3, FR-5.7, FR-6.1, NFR-3, NFR-4, NFR-7, NFR-10 all read as cited. ADR-011 §1, §4, §5, §6 checked against the file's own numbering |
| The task table columns and the Agent / Skill strings | Copied from the table in `specs/README.md` § *Who builds what* and from `001/tasks.md`. No agent name was invented |
| SQL Server types and constraint syntax | Matched against the DDL already in `docs/sdd/03-domain-model.md` § *Physical shape* — `uniqueidentifier`, `nvarchar(n)`, `datetime2(3)`, `CONSTRAINT FK_… REFERENCES … ON DELETE NO ACTION`, `CREATE INDEX IX_…`. The naming convention (`FK_`, `CK_`, `IX_`, `UX_`) is the repository's, not a guess |

### Modified after drafting

| First draft | Changed to | Why |
|---|---|---|
| `AddKeyedSingleton<ICommunicationProvider>(channel, …)` — the literal reading of "DI registration keyed by channel" | A provider collection plus a concrete `CommunicationProviderRegistry` | Keyed services cannot be enumerated, so the sendable-channel set — which is served over HTTP and drives a `<select>` — would have to be maintained in a second place. That is the drift AC-4 exists to prevent. `research.md` R-4 |
| `502 Bad Gateway` when the provider reports a failure | `201` with `deliveryStatus: "Failed"` | The `5xx` unwinds the transaction opened by `TransactionBehavior` and takes the record of the attempt with it. `research.md` R-5, AC-7 |
| An `ISentMessageLog` interface over the recorder | A concrete `sealed class SentMessageBuffer` | `spec.md` Tension 1 admits exactly one interface-with-one-implementation, not two. Writing a second would have made the exception a habit |
| An unbounded `List<SentMessage>` in the mock | A bounded ring, capacity from options | An in-memory record of every message the process ever sends is a memory leak with a slow fuse. `research.md` R-9 |
| A `Direction` column with no constraint | `CK_Interactions_Direction` permitting only `Outbound` | It turns "there is no inbound path" from an implicit gap into a schema fact (AC-9), and landing US-013 drops one line rather than reshaping the table |
| A `403` derived from the "Add comment" row of BR-6 (any support user) | The assignment-sensitive rule from the status rows, **recorded as open question Q-A** | An outbound message is the only action in this system a customer sees. Both readings are defensible, so it belongs in Open Questions with a working assumption, not silently in the design (constitution I) |
| Logging the message body and recipient from the mock | Logging channel, ticket id, provider, status, and body **length** | BR-9.7 by direct analogy, and a recipient address in a log stream widens who can see a customer's contact details for no diagnostic gain. `research.md` R-10 |

### Rejected

| Rejected | Why |
|---|---|
| Claiming a second implementation is "in prospect" to satisfy the constitution | It is not — real delivery is out of scope and stays out. Asserting it would be the false statement constitution II exists to prevent, and the next question a reviewer asks falsifies it. The deviation is recorded instead (Tension 1, `REV-021-03`) |
| Calling the mock the "second implementation" | Word-play. One interface, one production implementation |
| Building the `ReceiveMessage` slice because `02-architecture.md` lists it | Every one of US-013's four blockers is still open, and three cannot be designed without knowing whose webhook it is. `research.md` R-3 |
| An internal "record an inbound message" endpoint as the cheap half of US-013 | It duplicates `TicketComment.Channel`, which `DEFERRED.md` already names as the partial coverage for inbound |
| A header or body token that forces a provider failure, so a demo could show the state | A request-controlled failure switch is a backdoor that ships. Configuration only, and AC-6 asserts no request-reachable trigger exists. `research.md` R-6 |
| Adding a `TicketEventType` value so a sent message appears in the timeline | It changes the enum in `03-domain-model.md` and `013`'s timeline contract. Raised as Q-C with a working assumption instead of decided inside a design |
| Putting `ICommunicationProvider` in `Wasl.Domain` because it has no dependencies | Nothing in the domain calls a provider. An outbound port the domain never uses invites infrastructure into an entity next. `research.md` R-7 |
| A ninth frontend primitive for the delivery badge | ADR-009 caps them at eight; `DeliveryStatusBadge` is a feature component over `Badge` |
| A retry button on a failed message | No requirement, and a retry that reuses the row erases the record of the first attempt |
| Writing an outbox so the send survives a rollback | The right pattern for a real provider and out of scope for a mock with no side effect outside the process. Recorded as the known limitation instead (`plan.md`) |
| Inventing a `GET /api/tickets/{id}/interactions/{interactionId}` purely so the `201` could carry a `Location` header | An endpoint with no caller. The deviation is recorded instead |

### How each accepted output was verified

This is a specification phase, so "run, not just read" applies to the **claims about the
repository**, which are the only executable things here:

| Claim | Verification performed |
|---|---|
| `03-domain-model.md` has no `Interaction` entity | `grep -n "Interaction" docs/sdd/03-domain-model.md` → no output |
| `02-architecture.md` lists `Interaction.cs`, `SendMessage`, `ReceiveMessage` | `grep -n "Communication\|Interaction\|Channel" docs/sdd/02-architecture.md` → lines 72–73, 100, 118, and the slice list read directly |
| `05-api-conventions.md` lists none of this feature's paths | The endpoint inventory read in full — 19 rows, no communications path |
| ADR-009 does not reject a provider abstraction, despite ADR-010 saying it does | `grep -n "provider\|abstraction" docs/sdd/decisions/ADR-009-design-system-source.md` → no output. Recorded as `research.md` R-1 and `DOC-021-05` |
| `Select`, `Badge`, `Toast` exist as primitives | `docs/sdd/design/component-inventory.md` read — all three are in the table of eight |
| No `US-012-*.md` story file exists | `ls docs/sdd/user-stories/` — US-012 lives only in `DEFERRED.md` and `08-board.md`, which is why both are cited for the story identity |
| The Agent and Skill strings exist | Read from `specs/README.md` § *Who builds what*; each string in `tasks.md` is a copy, not a paraphrase |
| The board's promotion reasoning is what `spec.md` says it is | `docs/sdd/08-board.md` lines 202–221 read in full and quoted in `spec.md` |

**Not verified, and stated as such:** nothing in this folder has been compiled, run, or
migrated. There is no code yet. Every AC is a claim about behaviour that does not exist,
which is why each one names how it will be checked rather than asserting a result. No
`dotnet build`, `dotnet test`, `dotnet ef`, or `npm` command was run for this feature.

**Packages and APIs referenced:** the seam uses only BCL types (`Task`,
`CancellationToken`, `IOptions<T>`, `TimeProvider`) and the DI methods already used in
`001` and `003`. `AddKeyedSingleton` was considered and rejected (above) rather than
used, so nothing here depends on it. No new NuGet package is introduced by this feature —
which is itself checkable at `BE-021-02` by the absence of a `PackageReference` in the
diff.

---

## Implementation

*(Empty until implementation happens. An empty section is honest; a pre-filled one is a
false statement — constitution II.)*

---

## Testing

*(Empty until tests are written and run. The commands and their real output go in
`tests.md`; what AI contributed to producing them goes here.)*
