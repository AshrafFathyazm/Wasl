# 021 — Task Breakdown

**Phase:** 5 · **Role:** Story Planner · **Skill:** `speckit-tasks`

Every task has one owner, one verification, and something it serves. A task that cannot
be verified on its own is too big and is split.

Agents named here are **not dispatched until the plan is approved**. Naming is the plan;
dispatching without recording the result in `ai-notes.md` is the thing that turns
evidence into a claim.

## Critical path

```text
BE-021-01 → BE-021-04 → BE-021-02 → BE-021-03 → BE-021-05 → BE-021-06
          → TEST-021-04 → FE-021-02 → FE-021-03 → DOC-021-06
```

`BE-021-05` is on the path and looks optional: without the registry there is no single
source for the sendable set, and AC-4 — the claim this whole feature exists to make —
becomes untestable. Everything else hardens it.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-021-01 | `Interaction`, `InteractionDirection`, `InteractionDeliveryStatus` in `Wasl.Domain/Communications/`; `Interaction.Outbound(...)` enforces the body, recipient, and accepted/failed pairing | — | `dotnet test tests/Wasl.Domain.Tests` — TEST-021-01 red first, then green | AC-7, `data-model.md` | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-021-02 | `ICommunicationProvider`, `OutboundMessage`, `SendResult` under `Features/Communications/Providers/`. `SendAsync` takes a `CancellationToken` | BE-021-01 | `dotnet build`; and the `001` architecture test still passes, proving the interface did **not** land in `Wasl.Domain` | AC-24, ADR-010 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-021-03 | `MockCommunicationProvider` (one class, one channel per instance), `MockProviderOptions`, `SentMessageBuffer` — bounded, thread-safe, concrete, no interface | BE-021-02 | TEST-021-05 and TEST-021-12; plus `grep -rn "HttpClient\|SmtpClient\|Socket" src/Wasl.Api/Features/Communications/` returns nothing | AC-2, AC-17, AC-18 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-021-04 | `InteractionConfiguration`, `DbSet<Interaction>`, migration `AddInteractions` applied to a clean database | BE-021-01 | `dotnet ef database update` twice (second applies nothing), then the four queries in `data-model.md` § Verification run by hand | AC-9, AC-10 | `voltagent-lang:sql-pro` | — |
| BE-021-05 | `CommunicationProviderRegistry` + `AddCommunicationProviders()`; resolved eagerly in `Program.cs` so a duplicate channel fails **startup** | BE-021-03 | TEST-021-02; and manually: register the mock twice for `Email`, watch the app refuse to start with both type names in the message | AC-3, AC-4, AC-5 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-021-06 | `SendMessage` slice — endpoint, command, handler, validator, response — with the guard order in `plan.md` (404 → 403 → closed → recipient → send) | BE-021-04, BE-021-05 | TEST-021-04, TEST-021-06, TEST-021-07 | AC-1, AC-7, AC-11, AC-12, AC-13, AC-15 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-021-07 | `SendMessageCommand` implements `IAuditableCommand`; `Changes` carries channel, recipient, delivery status, interaction id — and **not** the body | BE-021-06 | TEST-021-10; and the NFR-10 architecture test from `003` fails the build if the interface is removed | AC-16, BR-9.7 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-021-08 | `ListInteractions` slice with `TicketInteractionsQuery`; page/pageSize clamped per BR-7.2, ordered `CreatedAtUtc` ascending | BE-021-04 | TEST-021-11 | AC-19, AC-20 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-021-09 | `GetSendableChannels` slice returning the registry projection in enum declaration order | BE-021-05 | TEST-021-03; `curl -s .../api/communications/channels \| jq` matches the contract | AC-4 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-021-10 | Four new `ProblemDetails` keys in `ProblemDetails.en.resx` **and** `ProblemDetails.ar.resx`: validation channel, forbidden, ticket-closed, no-contact-for-channel | BE-021-06 | The key-parity test from `005` passes; TEST-021-14 asserts the Arabic titles arrive | AC-21 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-021-11 | `Communications:Mock` section in `appsettings.json` with `FailChannels: []` and a `BufferCapacity`; no key naming a secret, token, key, or account | BE-021-03 | `git grep -iE "apikey\|secret\|token\|accountsid\|password" -- src/Wasl.Api/appsettings*.json` returns only pre-existing placeholders | AC-6, AC-17 | `comprehensive-review:security-auditor` | — |

## Frontend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-021-00 | The Messages panel previewed with real tokens, real copy, plausible body lengths, **all ten states**, both languages — before anything is wired | — | Preview reviewed and approved; any divergence later recorded with a reason | AC-23, ADR-009 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-021-01 | `features/communications/api.ts` and the **PROVISIONAL** types from `FRONTEND-API-GUIDE.md`; replaced with generated types once `/swagger` carries these paths | — (contract is frozen) | `tsc` passes against the generated types after the swap; the word PROVISIONAL is gone from the file | ADR-011 §6 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-021-02 | `queries.ts` — `useSendableChannels`, `useInteractions`, `useSendMessage` — consumed **only** by `TicketDetailPage`; the panel receives props | FE-021-01 | `grep -rn "useQuery\|useMutation" wasl-web/src/features/communications/*.tsx` returns nothing outside `queries.ts` | ADR-011 §4 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-021-03 | `SendMessageForm` — channel options from `useSendableChannels`, RHF + Zod, submit disabled while pending, `409 no-contact-for-channel` inline on the select | FE-021-02, FE-021-00 | TEST-021-17 | AC-22 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-021-04 | `InteractionList`, `DeliveryStatusBadge`, and the `failureCode` → i18n-key mapping with the `unknown` fallback. A `201`-with-`Failed` renders as a warning, never a success | FE-021-02 | TEST-021-17 | AC-7, AC-22 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-021-05 | `locales/en/communications.json` and `locales/ar/communications.json`, every key in both, Arabic plural forms for `communications.count` | FE-021-03 | The key-parity test; and `communications.count` rendered at counts 0, 1, 2, 3, 11, 100 in `ar` | AC-21, BR-8.14 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-021-06 | The panel walked in Arabic and by keyboard: layout mirrors, `recipientAddress` and `providerMessageId` do not, focus ring visible, the new row announced. Findings written down | FE-021-04, FE-021-05 | The walk recorded in `tests.md`, including anything that had to be fixed | AC-23 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-021-01 | `Interaction.Outbound` rejects a whitespace body, a 4001-character body, an empty recipient, `Accepted` with no provider id, and `Failed` with no code. Accepts 4000 characters | BE-021-01 | Test run, no database | AC-7, edge cases | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-02 | Registry: two providers for one channel throws naming the channel and both types; an empty registry yields an empty sendable set and no exception; lookup returns the provider whose `Channel` matches | BE-021-05 | Test run, plus a host-startup test asserting the app refuses to start | AC-3, AC-5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-03 | `GET /api/communications/channels` returns exactly what is registered, in enum declaration order; `401` without a token | BE-021-09 | Test run | AC-4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-04 | `POST .../messages` on `Email` returns `201` with `Accepted`, a non-null `providerMessageId`, `providerName: "Mock"`, and exactly one new row | BE-021-06 | Test run against `Testcontainers.MsSql` | AC-1 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-05 | The mock's buffer holds the body and recipient **byte-identical** to what was sent, including an Arabic body; the row round-trips the same bytes | BE-021-03, BE-021-04 | Test run — `varchar` would return `????` | AC-2, AC-10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-06 | With `Communications:Mock:FailChannels: ["Sms"]` set through the factory, an `Sms` send returns `201` with `Failed`, `failureCode: "MockConfiguredFailure"`, `providerMessageId: null`, **and the row exists** | BE-021-06 | Test run | AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-07 | Four refusals — `404` unknown ticket, `403` Agent on another's ticket, `409 ticket-closed`, `409 no-contact-for-channel` — each writes no row **and leaves the mock's buffer empty**, proving the provider was never called | BE-021-06 | Test run | AC-11, AC-12, AC-13, AC-15 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-08 | No token → `401`, and the registry is never consulted | BE-021-06 | Test run | AC-14 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-09 | Both check constraints exist with a **non-null** `definition`; every text column is `nvarchar`; both foreign keys are `NO_ACTION`; a raw insert with `Direction = 'Inbound'` is rejected | BE-021-04 | Test run against the real engine, asserting on `sys.check_constraints`, `sys.foreign_keys`, and `INFORMATION_SCHEMA.COLUMNS` | AC-9, AC-10 | `voltagent-lang:sql-pro` | — |
| TEST-021-10 | One `Communication.MessageSent` audit row per send, in the same transaction; `Changes` contains channel, recipient, delivery status, interaction id and **does not contain the body** | BE-021-07 | Test run, asserting the body string is absent from `Changes` | AC-16, BR-9.1, BR-9.3, BR-9.7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-11 | List: oldest first; `pageSize=200` clamps to 100; `page=0` clamps to 1; a ticket with none returns `200` and `items: []` | BE-021-08 | Test run | AC-19, AC-20 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-12 | A pre-cancelled `CancellationToken` produces `OperationCanceledException`, no row, and **not** a `Failed` delivery status | BE-021-03, BE-021-06 | Test run | AC-18 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-13 | **The seam's claim.** A `StubChannelProvider` in the test project, registered for `LiveChat`, makes `LiveChat` sendable and receives the send. Registered for `Email` *instead of* the mock, it receives `Email`. The diff is one test-project class and one registration line — no slice file changes | BE-021-05, BE-021-06 | Test run, plus `git diff --stat` over `Features/Communications/SendMessage/` showing zero changed lines | AC-4, AC-24 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-14 | With `Accept-Language: ar`, a `409` carries an Arabic `title` while `type`, the `errors` keys, `channel`, `direction`, `deliveryStatus`, and `failureCode` are byte-identical to the English response. A user whose stored `PreferredLanguage` is `ar` gets Arabic even with `Accept-Language: en` — which is the assertion that catches the ADR-007 middleware-order defect | BE-021-10 | Test run comparing both responses field by field | AC-21, BR-8.4, BR-8.7, ADR-007 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-15 | A failure injected **after** the provider call rolls the transaction back: no `Interactions` row, no audit row — while the mock's buffer still holds the attempt | BE-021-06, BE-021-07 | Test run with a behaviour registered after `TransactionBehavior` that throws | AC-8, BR-9.3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-021-16 | No request-reachable failure trigger and no network path: a search over `Features/Communications/` finds no header, query, or body token feeding `FailChannels`, and no `HttpClient`, `SmtpClient`, `Socket`, or `WebSocket` | BE-021-03, BE-021-11 | The searches run and recorded in `tests.md`, plus `REV-021-04` | AC-6, AC-17 | `comprehensive-review:security-auditor` | `code-review:code-review` |
| TEST-021-17 | Vitest: the channel `Select` renders options from the query and not a constant; submit is disabled while pending so a double-click sends one request; a `201` with `Failed` renders the translated sentence for its code, and an unknown code renders the fallback rather than the raw code | FE-021-03, FE-021-04 | `npm run test` in `wasl-web` | AC-22 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-021-01 | `docs/sdd/03-domain-model.md` gains the `Interactions` table, both new enums, the index, and both check constraints — it currently has no `Interaction` entity at all | BE-021-04 | `grep -n "Interaction" docs/sdd/03-domain-model.md` returns the new rows; the DDL matches the applied migration | DoD (Database), `research.md` R-2 | main session | — |
| DOC-021-02 | `docs/sdd/05-api-conventions.md` gains three endpoint-inventory rows and the two new `409` `type` values | BE-021-09 | The inventory lists all three paths; the `409` list names both new types | Contract changes | main session | — |
| DOC-021-03 | `docs/sdd/04-business-rules.md` BR-9 action-naming list gains `Communication.MessageSent` | BE-021-07 | The name in the doc matches the string the audit row actually carries | BR-9, DoD (Audit) | main session | — |
| DOC-021-04 | `docs/sdd/design/screens/04-ticket-detail.md` gains the Messages section: elements, actions, all ten states, RTL | FE-021-06 | The screen spec matches what was built, not what was intended | DoD (Design) | main session | — |
| DOC-021-05 | `docs/sdd/user-stories/DEFERRED.md` US-012 marked **Promoted**, pointing at `08-board.md` and this folder; ADR-010's stale claim that ADR-009 rejected a provider abstraction corrected to cite `DEFERRED.md` | — | Both files read correctly to someone who arrives at DEFERRED.md first and would otherwise conclude this feature was built against a live decision | `research.md` R-1 | main session | — |
| DOC-021-06 | `tests.md`, `ai-notes.md`, and `summary.md` completed with **observed** output; board and delivery log updated | All | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-021-01 | Layer boundaries, the guard order in the handler, `CancellationToken` on every async path, and the `201`-without-`Location` deviation reviewed; verdict recorded | All BE, all TEST | `review.md` verdict is `Approved`, and the deviation appears in it by name | DoD (Review) | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-021-02 | Generated OpenAPI compared against `contracts/communications-api.md`, including every `type` value and the absence of any inbound operation | BE-021-06, BE-021-08, BE-021-09 | Any difference fixed in one of the two before closing | DoD | main session | — |
| REV-021-03 | The constitutional deviation recorded: an abstraction admitted against *"no new abstraction without a second implementation"*, with `spec.md` Tension 1 as the written justification and an explicit note that it is **not precedent** | REV-021-01 | `review.md` contains the deviation, its reason, and the non-precedent statement | Constitution, Governance | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-021-04 | Security review: no credential, no network path, no PII in logs (the mock logs neither the body nor the recipient), nothing sensitive in `Changes` | BE-021-03, BE-021-07, BE-021-11 | `review.md` names each check against `docs/sdd/testing/security-checklist.md` | AC-17, BR-9.7, NFR-4 | `comprehensive-review:security-auditor` | `code-review:code-review` |

## Droppable if time runs short

Ordered. Drop from the top.

| Task | What is lost |
|---|---|
| BE-021-08 + TEST-021-11 (`GET .../interactions`) | The record becomes invisible to a user — a `SELECT` still shows it, and the send response still returns the created row, so a demo can send a message and see it once. What goes is persistence across a reload, and with it half the reason the module stops reading as missing. Drop only if the alternative is cutting a test |
| FE-021-04 partially — the `failureCode` catalogue beyond the single known code | The `unknown` fallback covers it, which is the behaviour that actually matters (AC-22). What is lost is one specific sentence |
| BE-021-09 + TEST-021-03 (`GET /api/communications/channels`) | The client falls back to a mirrored constant, and AC-4 loses its most visible half. Drop **only** together with a note in `summary.md`, because it re-creates the drift the endpoint exists to prevent |
| TEST-021-15 (the rollback asymmetry) | AC-8 goes untested, and the next reader may take the buffer for the ledger. Cheap to keep; listed last for a reason |

## Not droppable

**BE-021-05 and TEST-021-13.** Together they are the feature's only claim: adding a real
provider is a class and a registration. Without them this is an interface with one
implementation and no evidence — which is precisely what `DEFERRED.md` rejected, and the
rejection would then be right.

**TEST-021-07.** Four refusals that must not reach the provider. A guard that runs *after*
the send looks identical in every test that only checks the status code, and the failure
mode is a message going to a customer on a ticket the sender was not permitted to touch.

**BE-021-07 and TEST-021-10.** BR-9.1 is not optional, and the NFR-10 architecture test
fails the build without `IAuditableCommand` anyway. TEST-021-10 exists for the other half:
that the message body is **not** in `Changes`.

**BE-021-04 and TEST-021-09.** A check constraint created without its definition is the
silent failure this schema has (AC-9), and reading the migration does not catch it.

**DOC-021-05.** A reviewer who arrives at `DEFERRED.md` and reads US-012 as still
deferred will conclude this feature was built against a standing decision. Two sentences
prevent that, and no test does.
