# 021 — Communication Provider Abstraction

**Phase:** 5 · Release 2 · **Story:** US-012 · **Status:** Specified, awaiting review

## Understanding

**Communication Channels is a named module in the requirement** — item 3 of
`docs/sdd/00-project-context.md`, alongside Customer Management and Ticket Management,
and FR-3 in `docs/sdd/01-product-spec.md`. Today the whole module resolves to
`Ticket.Channel` and `TicketComment.Channel`: two `nvarchar(20)` columns holding an
enum value. A module that resolves to one enum column reads as **missing**, not as
scoped. That is the reason this story was promoted out of `DEFERRED.md`, and it is
recorded in `docs/sdd/08-board.md` under *"Why US-012 is promoted out of Deferred"*.

What this feature builds is a **seam**: `ICommunicationProvider`, exactly one
`MockCommunicationProvider` behind it, a registry that maps channel → provider, one
command that routes through it, and an `Interaction` row that records what was sent.
No provider account, no credential, no network call — that part of the original
exclusion is untouched and stays untouched (`00-project-context.md`, "Real WhatsApp /
SMS / email delivery integration").

The claim the mock exists to make credible is one sentence: **adding a real provider
later is a new class and one registration line, and nothing in the endpoint, the
validator, the handler, the contract, or the client changes.** AC-4 and AC-24 are that
sentence turned into tests. Without them the seam is a shape, not a claim.

### What DEFERRED.md said, and which half still holds

`docs/sdd/user-stories/DEFERRED.md`, US-012:

> Deferred because no live provider is in scope, which means the abstraction would have
> exactly one implementation and no second one in prospect. An interface designed
> against a single hypothetical consumer is usually the wrong interface, and it costs
> real time to write and test.

| Part of that reasoning | Status |
|---|---|
| "no live provider is in scope" | **Still true, and still enforced.** Nothing here authenticates to anything or opens a socket (AC-17) |
| "an interface designed against a single hypothetical consumer is usually the wrong interface" | **Still true, and accepted as a cost.** `SendAsync` is designed against a mock, so it will be wrong in detail — see the interface-shape risk in `plan.md`. What it is not is *absent*, and the absent version is what reads as a missing module |
| "would have exactly one implementation and no second one in prospect" | **No longer the question being asked.** The value here is not polymorphism deferred until a provider appears; it is that the named module has an addressable surface, a routed call, and a persisted record of the call. The abstraction's justification is demonstrability, and it is written down as such rather than dressed up as future-proofing |
| "it costs real time to write and test" | **True.** Contained by Phase 5 placement (the committed flow ships first) and by the droppable list in `tasks.md` |

US-013 (Incoming Interaction Registration) stays deferred, entirely. Its four blockers —
an inbound webhook endpoint, a provider payload contract, webhook authentication, and a
strategy for matching an inbound message to a customer or ticket — are all still true
and all still depend on the provider that is out of scope. See *Tension 2* below.

### What this is not

It is not `TicketComment.Channel`, and the distinction has to be crisp or the feature
reads as a duplicate of US-010:

| | `TicketComment` with a `Channel` (US-010) | `Interaction` (here) |
|---|---|---|
| Who produced the text | A support user typed it as a note | A support user composed it and **the system sent it** |
| Went through a provider | No | Yes — the registry resolved one and called it |
| Has a delivery outcome | No such concept | `deliveryStatus`, `providerMessageId`, `failureCode` |
| Appears in the ticket timeline (BR-5.7) | Yes | **No** — see Q-C |

## In scope

- `ICommunicationProvider` — `Channel` and `SendAsync(OutboundMessage, CancellationToken)`
- Exactly **one** implementation, `MockCommunicationProvider`, instantiated once per
  sendable channel, which records what it was asked to send so a test can assert it
- `CommunicationProviderRegistry` — a concrete class, no interface, built from the
  registered providers, that maps channel → provider and **is the single source of the
  sendable-channel set** (AC-4)
- DI registration keyed by channel, and a **startup** failure when two providers claim
  the same channel (AC-5)
- `Interaction` — a new domain entity and a new table, append-only, with the migration
  `AddInteractions`
- `POST /api/tickets/{ticketId}/messages` — the one command; routes to the provider,
  records the Interaction, returns it
- `GET /api/tickets/{ticketId}/interactions` — paginated read, so the record is visible
  to a user and not only to a `SELECT`
- `GET /api/communications/channels` — the sendable set, so the client does not
  hard-code a mirror of the registry (AC-4, and *In scope, and why it is not creep*
  below)
- A **Messages** panel on the existing ticket detail screen: composer, delivery status,
  history, all states, both locales
- A configuration-driven failure mode on the mock, so the failure path is reachable by a
  test and by nothing else (AC-6)

### In scope, and why it is not creep

Three endpoints for a seam invites the question. Each earns its place, and two of the
three are on the droppable list in `tasks.md` with what is lost:

| Endpoint | Why it exists |
|---|---|
| `POST .../messages` | Without it the seam is never called by anything a reviewer can run |
| `GET .../interactions` | Without it the `Interaction` row is invisible to every user, and the module still reads as missing — which is the entire reason this story was promoted |
| `GET /api/communications/channels` | Without it the client hard-codes the sendable set, which makes the client a second authority on the registry's contents and guarantees drift the day a provider is added (constitution III) |

## Out of scope

| Excluded | Where it lives |
|---|---|
| A real Email / WhatsApp / SMS provider, any credential, any network call | Out of scope project-wide — `00-project-context.md`, and it stays there. `plan.md` records what the swap looks like when it is not |
| **Inbound** messages: a webhook endpoint, a provider payload contract, webhook authentication, matching an inbound message to a customer or ticket | `DEFERRED.md` US-013, still deferred. `Features/Communications/ReceiveMessage` from `02-architecture.md` is **not built** — Tension 2 |
| Delivery-status callbacks, retries, rate limiting, an outbox, a background dispatcher | No requirement. `plan.md` records the outbox as the change a real provider forces |
| Message templates, canned replies, attachments | No requirement; attachments are excluded project-wide |
| Interactions in the ticket timeline | `013-ticket-timeline-and-comments` owns BR-5.7. Q-C |
| Interaction history on the customer profile (`Features/Customers/GetInteractionHistory`) | `018-customer-overview` (US-004). This feature scopes interactions to a ticket only — A-4 |
| Channel filter on the ticket list | `015-ticket-filters-and-search` (BR-7.3) |
| The channel on a ticket or a comment | `009-create-ticket` and `013`. Both already exist; neither changes here |
| Reopening a Closed ticket so a message can be sent on it | Out of scope project-wide; `Closed` is terminal |

## The two tensions, resolved

The blueprint does not agree with itself here. Both disagreements are real and both are
resolved in the open rather than papered over.

### Tension 1 — the constitution forbids exactly this abstraction

`.specify/memory/constitution.md`, Technology Constraints:

> **No new abstraction without a second implementation in hand or in prospect.** This
> applies to provider wrappers, **channel abstractions**, and generic base classes alike.

`ADR-010` applies the same test by name, and `DEFERRED.md` applied it to this story.
`docs/sdd/08-board.md` then promotes the story anyway. Governance says the constitution
wins over a feature plan — so this cannot be resolved by a plan quietly proceeding.

**Resolution:** the constitution provides the mechanism itself, in Governance:

> Complexity must be justified in writing at the point it is introduced. Any deviation
> from a principle is recorded in the feature's review artifact with its reason — an
> unrecorded deviation is a defect regardless of whether the code works.

This section is that justification, and `REV-021-03` is the recorded deviation in
`review.md`. The reason is stated plainly and is not an engineering one: the module is
named in the requirement, and a named module represented by one enum column is
indistinguishable from an omission. **This is the only abstraction in the repository
admitted on that basis**, and the record says so, so it cannot be cited as precedent
for the next interface with one implementation.

What the resolution does **not** do is soften the rest of the rule: there is still no
`IRepository`, the registry is a concrete class, the recorder is a concrete class, and
`SendResult` is a record — three places where an interface would have been the reflex.

### Tension 2 — `02-architecture.md` lists a `ReceiveMessage` slice

`docs/sdd/02-architecture.md` lists `Features/Communications/SendMessage/` **and**
`Features/Communications/ReceiveMessage/`. `00-project-context.md` puts real delivery
out of scope, and `DEFERRED.md` US-013 rejected the inbound path as four design problems
that all depend on a provider.

**Resolution: `SendMessage` is built. `ReceiveMessage` is not.**

- The same architecture document says *"the exact list of slices evolves with the user
  stories"* and *"not every slice must contain every file"*. The list is illustrative,
  and it predates the US-013 deferral decision.
- Every one of US-013's four blockers is still unresolved, and three of them
  (payload contract, webhook authentication, matching strategy) cannot be designed
  without knowing whose webhook it is.
- Building a *fake* inbound endpoint that an internal user posts to would not be the
  deferred story either. It would duplicate `TicketComment.Channel`, which already
  records an interaction a support user enters by hand (`DEFERRED.md`, "Partial
  coverage").

The absence is made **visible in the schema rather than left as a gap**:
`CK_Interactions_Direction` permits only `Outbound` (AC-9). A query for inbound rows
returning zero is then a fact about what was built, not an ambiguity about whether the
inbound path exists and is broken. Landing US-013 drops that one constraint; it does not
reshape the table.

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | `CommunicationChannel` already exists in `Wasl.Domain/Communications/` — `009-create-ticket` needs it for `Ticket.Channel` | This feature creates the enum instead. One file, no schema effect: `Ticket.Channel` already stores the same strings |
| A-2 | `010-ticket-list-and-detail` has shipped `TicketDetailPage`, and this feature adds a panel to it rather than a screen | The panel becomes a route of its own at `/tickets/:id/messages`. The contract does not change; `frontend-spec.md` does |
| A-3 | The sendable channels are `Email`, `WhatsApp`, and `Sms`. `LiveChat` and `WebForm` have no outbound address in this model — a live-chat session and a web form are things a customer initiates | If a reviewer expects all five to be sendable, the fix is one registration line per channel plus a recipient-resolution rule for it. Nothing else moves, which is the point of AC-4 |
| A-4 | Every interaction in scope belongs to a ticket, so `Interaction.TicketId` is `NOT NULL` | A customer-level interaction with no ticket needs the column nullable plus `CustomerId`, which is a migration and a new authorization question. Deliberately excluded — `018` owns customer-level history |
| A-5 | The recipient address is resolved from the ticket's customer at send time and **snapshotted** onto the row | If the reviewer expects an agent to type a free-form recipient, that is an address book and a validation surface this feature does not have. Snapshotting is also what keeps history truthful after a customer edits their email (`017`) — the same reasoning as BR-9.6 |
| A-6 | The provider call happens inside the request transaction, because the mock is in-process and has no side effect outside it | A real provider makes this wrong — a sent message cannot be rolled back, and a network round trip inside an open transaction holds locks. The change it forces is an outbox, recorded in `plan.md` as a known limitation rather than pre-built |

## Open questions

| # | Question | Working assumption |
|---|---|---|
| Q-A | BR-6's authorization matrix has no row for "send a message to a customer". Who may? | **Mirror the status rows, not the comment row**: a Manager on any ticket; an Agent on a ticket assigned to themselves or unassigned. An outbound message is the only action in this system a *customer* sees, so it is treated as assignment-sensitive rather than as an internal note. If the product owner prefers the comment rule (any support user, any ticket), the change is one guard and one test — AC-13 flips from `403` to `201` |
| Q-B | Is `errors/ticket-closed` the right `type`, and does `013` use the same one for a comment on a closed ticket (BR-5.2)? | Use `errors/ticket-closed`. `013` is unwritten; whichever lands first owns the name and the other matches it. Recorded as a **Contract changes** obligation in `plan.md` so the two cannot diverge silently |
| Q-C | Should an interaction appear in the ticket timeline (BR-5.7)? | **No, not in this feature.** BR-5.7 defines the timeline as the union of comments and history rows; adding a third source changes `013`'s contract and its pagination boundary test. The Messages panel is separate. If the product owner wants one merged conversation view, it is a `013` change, not a schema change |
| Q-D | Should the failure mode be reachable in a demo, so a reviewer can see the `Failed` state? | Configuration only (`Communications:Mock:FailChannels`), never a request field. A demo sets the key in `appsettings.Development.json`. A body token or header that triggers a failure is a backdoor in production code, and AC-6 asserts none exists |
| Q-E | Does `Interaction` need `DENY UPDATE` on the application role, the way `AuditLog` does (BR-9.5)? | **No.** `DeliveryStatus` is precisely the field a real provider's asynchronous callback would later update, so making the row immutable now is a grant that has to be revoked later. Append-only here is a property of the code path, and it is stated rather than enforced — `data-model.md` |

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `POST /api/tickets/{ticketId}/messages` on a sendable channel returns `201` with `deliveryStatus: "Accepted"`, a non-null `providerMessageId`, `providerName: "Mock"`, and exactly one new row in `dbo.Interactions` |
| AC-2 | The mock records what it was asked to send, and a test asserts the recorded body and recipient are **byte-identical** to what the handler passed — including Arabic text, which is what a `varchar` column or a lossy log would destroy |
| AC-3 | The provider is resolved from `CommunicationProviderRegistry` by channel. A channel with no registered provider is rejected as a `400` validation failure before the handler runs; no code path can reach a null provider |
| AC-4 | The sendable-channel set is **derived from the registry**, not declared twice. Registering a provider for `LiveChat` makes `LiveChat` appear in `GET /api/communications/channels` and be accepted by the validator, **with no edit to the validator, the endpoint, the handler, the response, or the contract** |
| AC-5 | Two providers registered for the same channel fail **application startup** with a message naming the channel and both implementation types. It does not fail on the first send, and it does not silently pick one |
| AC-6 | With the default configuration, no channel is configured to fail. The failure path is reachable only through configuration: a repository search finds no request field, header, query parameter, or body token that triggers it |
| AC-7 | When the provider reports a failure, the response is `201` with `deliveryStatus: "Failed"`, `failureCode` set, `providerMessageId: null`, and **the row persists**. It is not a `5xx`, and the record of the attempt does not roll back |
| AC-8 | When a request fails **after** the provider call, the transaction rolls back and no `Interactions` row exists — while the mock's in-memory record of the attempt is still there. Asserted, because it is the difference between a diagnostic buffer and a ledger, and because a reviewer who finds the buffer will otherwise assume it is the record |
| AC-9 | `CK_Interactions_Direction` exists and rejects an insert with `Direction = 'Inbound'`. Verified by querying `sys.check_constraints` for a **non-null** `definition` plus a failing insert — not by reading the migration |
| AC-10 | Arabic text in `Body` and in `RecipientAddress` round-trips byte-identical through the database. `varchar` would return `????`, and this is the test that catches it (ADR-013) |
| AC-11 | Sending on a `Closed` ticket returns `409` `errors/ticket-closed`, writes no row, and **does not call the provider** — the guard runs before the send, so nothing leaves the process for a ticket that cannot receive a reply |
| AC-12 | Sending on a channel for which the ticket's customer has no address returns `409` `errors/no-contact-for-channel`, writes no row, and does not call the provider. An empty recipient never reaches a provider |
| AC-13 | An Agent sending on a ticket assigned to another user returns `403` `errors/forbidden`, writes no `Interactions` row, does not call the provider, and produces an audit row per BR-9.2 and BR-9.4 (Q-A) |
| AC-14 | An unauthenticated request returns `401` and never reaches the registry |
| AC-15 | An unknown `ticketId` returns `404`, not `400` and not `409` |
| AC-16 | `SendMessageCommand` implements `IAuditableCommand`; one audit row `Communication.MessageSent` is written **in the same transaction** as the interaction (BR-9.1, BR-9.3). Its `Changes` carries channel, recipient, delivery status, and interaction id, and **not the message body** (BR-9.7, by the same reasoning that excludes a comment body) |
| AC-17 | No credential and no network: `src/Wasl.Api/Features/Communications/` contains no `HttpClient`, `Socket`, `SmtpClient`, or `WebSocket` usage, and no configuration key naming a secret, key, token, or account. Verified by search **and** by the security review |
| AC-18 | The mock honours `CancellationToken`: a pre-cancelled token produces `OperationCanceledException`, no row is written, and the cancellation is not swallowed into a `Failed` delivery status |
| AC-19 | `GET /api/tickets/{ticketId}/interactions` is paginated per NFR-3 and BR-7.2 — default page size 20, a request above 100 clamped to 100, not rejected — and is ordered `CreatedAtUtc` ascending, the reading order BR-5.7 uses for a conversation |
| AC-20 | A ticket with no interactions returns `200` with an empty `items` array, never `404` (BR-7.6) |
| AC-21 | With `Accept-Language: ar`, `ProblemDetails.type`, the keys of `errors`, the `channel` values, `deliveryStatus`, `failureCode`, and `providerMessageId` are byte-identical to the English response; only `title`, `detail`, and the `errors` messages differ (BR-8.7). Every new server-side resource key exists in `en` and `ar`, enforced by the parity test (BR-8.11) |
| AC-22 | The composer's channel options come from `GET /api/communications/channels`, not from a client-side constant. `failureCode` is mapped to a translated sentence through an i18n key and is never rendered raw to a user |
| AC-23 | The Messages panel renders correctly right-to-left in Arabic: layout mirrors via CSS logical properties, while `RecipientAddress`, `providerMessageId`, and timestamps do not mirror. Walked and recorded, because no assertion catches a panel sized to English labels |
| AC-24 | **The seam's claim, proven.** A test-project stub provider registered for a channel is routed to instead of the mock, and the diff needed is *one new class in the test project and one registration line* — no edit to `Endpoint.cs`, `Command.cs`, `Handler.cs`, `Validator.cs`, `Response.cs`, the contract, or the client |

## Edge cases

| Case | Expected |
|---|---|
| Two providers registered for `Email` | Startup fails, naming the channel and both types (AC-5). The alternative — last registration wins — is a routing bug that presents months later as "the wrong provider sent it" |
| No providers registered at all | Startup succeeds; `GET /api/communications/channels` returns an empty array; every send is a `400`. The module is then visibly disabled rather than throwing a `NullReferenceException` at the first send |
| A provider whose `Channel` property disagrees with the key it was registered under | Impossible by construction: the registry indexes **by `provider.Channel`**, so the property is the key. There is no second place for them to disagree |
| The mock is asked to send an empty body | Cannot happen — the validator rejects it as `400` first, and the `Interaction` factory enforces the same invariant in the domain. Two layers, one rule, per constitution III |
| Body at exactly 4000 characters, and at 4001 | 4000 → `201`. 4001 → `400`. The boundary is tested because `nvarchar(4000)` truncating silently would look like a successful send of a shortened message |
| The provider throws instead of returning a failure | `500` through the shared middleware, transaction rolled back, no row. The mock never throws except for cancellation; a real provider will, and the failure shape is therefore specified rather than discovered |
| Request cancelled mid-flight (client disconnect) | `OperationCanceledException`, transaction rolled back, no row (AC-18). The mock's buffer may still show the attempt — the same asymmetry as AC-8 |
| A message sent on a ticket that is deleted concurrently | The insert fails on the foreign key, the transaction rolls back, no orphan row. `ON DELETE NO ACTION` per ADR-013, so the ticket delete is what fails if an interaction exists |
| A customer with both an email and a phone, sending on `WhatsApp` | Routes to `PhoneE164`. The channel → address map is one table in `contracts/communications-api.md`, in one place |
| `POST` with `channel: "LiveChat"` | `400` validation, naming `channel` and listing the sendable set from the registry — not `409`, because sendability is a property of the request value, not of ticket state |
| `POST` with `channel: "Carrier Pigeon"` | `400` validation from enum binding. The message names the field, not the exception |
| Fifty interactions on one ticket, page 3 with `pageSize=200` | Clamped to 100, `200` with the envelope, `totalCount` correct (BR-7.2) |
| An inbound path is looked for | `POST /api/communications/inbound` does not exist and returns `404`; the generated OpenAPI document contains no inbound operation. Deliberate, and `CK_Interactions_Direction` is the schema-level statement of it (Tension 2) |
| A reviewer greps for a credential | Finds nothing, including in `appsettings.Development.json` (AC-17). A mock that needs a fake API key has already lost the argument for being a mock |
| The buffer receives more entries than its capacity | Oldest entries are dropped. It is a bounded ring, not a list, because an unbounded in-memory record of every message sent is a memory leak with a slow fuse |

## Rules referenced

- **FR-3.1** — the five channels · **FR-3.2**, **FR-3.3** — channel recorded on a ticket
  and on an interaction. FR-3's own note ("a provider adapter can be added later without
  changing the ticket model") is what this feature makes true rather than asserted
- **FR-4.1**, **FR-4.2** — every endpoint here requires an authenticated support user
  with a role
- **FR-5.3**, **FR-5.7**, **FR-6.1** — server-authored messages localized; user content
  stored verbatim; the state change audited
- **BR-5.2** — mirrored: no message on a `Closed` ticket (Q-B)
- **BR-5.7** — the timeline's definition, and the reason an interaction is not in it (Q-C)
- **BR-6** — the authorization matrix, which has no row for this action (Q-A)
- **BR-7.2**, **BR-7.6** — pagination clamp, and empty is `200`
- **BR-8.6**, **BR-8.7**, **BR-8.9**, **BR-8.11** — what is translated, what never is,
  logs in English, key parity
- **BR-9.1**, **BR-9.2**, **BR-9.3**, **BR-9.4**, **BR-9.7** — one audit row, in the
  transaction; denials audited independently; nothing sensitive in `Changes`
- **NFR-3** — list endpoints paginated · **NFR-4** — no leak in an error ·
  **NFR-10** — an audit gap is a build failure
- **ADR-006** as amended by **ADR-013** — append-only tables carry no `rowversion`
- **ADR-007** — `UseRequestLocalization()` after `UseAuthentication()`; `dir="auto"` on
  user content
- **ADR-010** — two projects, vertical slices, no repository, one transaction per
  request opened by a behaviour
- **ADR-011 §4** — three kinds of component, and only the route fetches
- **ADR-013** — `nvarchar`, `datetime2(3)`, `ON DELETE NO ACTION`, check constraints
  verified against `sys.check_constraints`
- **US-012** — the story, promoted in `08-board.md`. **US-013** — still deferred

## What fails silently here, and where each is caught

The most valuable part of this document. Five of these look like success:

| Silent failure | Caught by |
|---|---|
| Two providers registered for one channel; one of them never runs | AC-5, at startup |
| The sendable set hard-coded in a validator or in the client, drifting from the registry | AC-4, AC-22 |
| A provider failure returning `5xx`, rolling back the record of the attempt, so nothing shows a message was tried | AC-7 |
| The in-memory buffer mistaken for the record of what was sent | AC-8 |
| `CK_Interactions_Direction` created without its check, so a future half-built inbound path can write rows nobody specified | AC-9 |
| Arabic body stored through a `varchar` column and returned as `????` | AC-10, AC-2 |
| The message body copied into the audit row's `Changes` | AC-16 |
| A "mock" that quietly reads a configuration key that looks like a credential | AC-17 |
