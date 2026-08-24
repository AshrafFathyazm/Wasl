# 021 — Research

Questions that had to be answered before the plan could be written, what was checked,
and what each one settled. A question that turned out not to matter is recorded as
such, because "we looked and it did not matter" is information too.

---

## R-1 · Does the constitution permit this feature at all?

**Checked:** `.specify/memory/constitution.md` (Technology Constraints and Governance),
`docs/sdd/decisions/ADR-010-vertical-slices.md`, `docs/sdd/user-stories/DEFERRED.md`,
`docs/sdd/08-board.md`.

**Found — a direct conflict, not an ambiguity.** The constitution says *"No new
abstraction without a second implementation in hand or in prospect. This applies to
provider wrappers, **channel abstractions**, and generic base classes alike."* ADR-010
applies the same test by name. `DEFERRED.md` applied it to this exact story and
rejected it. `08-board.md` then promotes the story.

**Settled:** the feature proceeds, and the deviation is **recorded** rather than
argued away, using the mechanism the constitution itself specifies in Governance:
complexity justified in writing at the point it is introduced, deviation recorded in the
feature's review artifact. `spec.md` Tension 1 is the justification; `REV-021-03` is the
record.

**Rejected:** claiming a second implementation is "in prospect". It is not —
`00-project-context.md` puts real delivery out of scope and it stays out of scope. That
claim would be the false statement Principle II exists to prevent, and it would be
falsified by the next question a reviewer asks.

**Rejected:** interpreting the mock as the second implementation. There is one
interface and one production implementation. Saying otherwise would be word-play.

**Consequence for the plan:** the justification is *demonstrability of a named module*,
not engineering economy — so the plan must spend its effort on making the seam's claim
**testable** (AC-4, AC-24) rather than on making the interface general. An abstraction
admitted for demonstrability that cannot demonstrate anything is the worst of both.

**Also found, and worth flagging:** ADR-010 line 26–29 says *"the same test ADR-009
applied to a provider abstraction and rejected"*. ADR-009 contains no such passage —
searching it for "provider" and "abstraction" returns nothing. The rejection actually
lives in `DEFERRED.md` US-012 and in the constitution. A stale cross-reference, not a
contradiction; `DOC-021-05` corrects the citation.

---

## R-2 · Does an `Interaction` entity already exist in the blueprint?

**Checked:** `docs/sdd/03-domain-model.md` — the ER diagram, the plain-text view, the
per-entity tables, the enum list, and the index list. `docs/sdd/02-architecture.md`.

**Found:** `grep -n "Interaction" docs/sdd/03-domain-model.md` returns **nothing**.
`02-architecture.md` lists `Wasl.Domain/Communications/Interaction.cs`. The domain model
document — which calls itself *"the single source of truth for entities, relationships,
and persistence concerns"* — has no such entity, no such table, and no
`InteractionDirection` or delivery-status enum.

**Settled:** this feature **creates** the entity and the table, and that is a schema
addition the Definition of Done requires to be reviewed against `03-domain-model.md`
(Database section). Since the entity is absent there, "reviewed against" means the
document is amended — `DOC-021-01` — with the table, the two new enums, the index, and
the check constraint.

**Rejected:** reusing `TicketComment` with a channel and adding delivery columns to it.
Three reasons: it would put nullable provider columns on every comment; `BR-5.5` defines
what a comment means for the timeline and this is not that (`spec.md`, *What this is
not*); and `013` owns that table's read path, so widening it would make two features
share one migration surface for unrelated reasons.

**Rejected:** no table at all — provider call, audit row, done. The audit log is
forensic, `Manager`-only (BR-9.11), and redacts bodies (BR-9.7), so it cannot be the
product's record of what was sent. A module whose only trace is in a table an Agent
cannot read is still invisible.

---

## R-3 · What do `SendMessage` and `ReceiveMessage` actually do?

**Checked:** `02-architecture.md` (slice list), `00-project-context.md` (out of scope),
`01-product-spec.md` FR-3, `DEFERRED.md` US-013, `05-api-conventions.md` (endpoint
inventory — which lists **neither**).

**Settled:** `SendMessage` is built; `ReceiveMessage` is not. Full reasoning in
`spec.md` Tension 2. Two things made the decision rather than the preference:

1. US-013's four blockers are all still open, and three of them cannot be designed
   without knowing whose webhook it is. A guessed payload contract is worse than none.
2. The architecture document already says its slice list is illustrative — *"the exact
   list of slices evolves with the user stories"* — and it predates the deferral.

**Rejected: an internal "record an inbound message" endpoint.** It needs no webhook
authentication, so it looked like the cheap half of US-013. It is not US-013 at all,
and it duplicates `TicketComment.Channel`, which `DEFERRED.md` already names as the
partial coverage for inbound. Two ways to record the same thing is worse than one.

**Rejected: leaving inbound as an unmentioned gap.** Replaced by making it visible in
the schema — `CK_Interactions_Direction` permits only `Outbound` (AC-9). The cost is
one line in a future migration; the benefit is that "no inbound rows exist" is a fact
rather than a question.

**Consequence for the plan:** the endpoint inventory in `05-api-conventions.md` gains
three rows and no inbound row (`DOC-021-02`).

---

## R-4 · Keyed DI, or a collection plus a registry?

**Checked:** the .NET keyed-service API (`AddKeyedSingleton`,
`[FromKeyedServices]`, `IKeyedServiceProvider`) against what this feature needs from the
registration.

**The requirement that decided it:** AC-4 — the sendable-channel set must be **derived**
from what is registered, because it is served over HTTP and mirrored in a `<select>`.

| Option | Cost |
|---|---|
| `AddKeyedSingleton<ICommunicationProvider>(channel, ...)`, resolved by key in the handler | Literally "keyed by channel", and one line shorter. But **keyed services cannot be enumerated** — there is no supported way to ask the container which keys exist. The sendable set would have to be maintained by hand in a second place, which is the exact drift AC-4 exists to prevent |
| Register each provider as `ICommunicationProvider`; one concrete `CommunicationProviderRegistry` singleton indexes them by `provider.Channel` and exposes `SendableChannels` | One more small class. The set is a projection of the registrations, so it cannot drift, and duplicate registration becomes detectable (AC-5) |

**Settled:** the collection plus the registry. "Keyed by channel" is satisfied by the
registry's dictionary; the key is `provider.Channel`, so the provider's own property
**is** the key and there is no second place for them to disagree.

**Also settled by this:** the registry must be constructed during startup, not lazily on
first use, or AC-5's duplicate-registration failure surfaces at the first send — which
in practice means during a demo. Eager resolution at composition time; the failure is a
startup failure with both type names in the message.

---

## R-5 · What does the provider return, and what happens when it fails?

**Checked:** `05-api-conventions.md` status-code table (no `502`), the constitution's
*"`200` is never returned with an error in the body"*, ADR-010's *"one transaction per
request, opened by a behaviour"*, and BR-9.3/9.4 on the audit row's transaction
asymmetry.

**The question that matters:** a synchronous provider rejection — is that an HTTP error,
or is it data?

| Option | Consequence |
|---|---|
| `502` with `type: errors/provider-unavailable` | Adds a status code the convention table does not have. Worse: the exception unwinds the request transaction opened by `TransactionBehavior`, so **the record of the attempt is rolled back with it**. The system then has no trace that a send was attempted — which is precisely what a support agent needs to see |
| `201` with `deliveryStatus: "Failed"` | The created resource is the *record of an attempt*, and the attempt did happen. The row persists, the client renders a `Failed` badge, and nothing is hidden |

**Settled:** `201` with `deliveryStatus: "Failed"` (AC-7).

This is **not** the "200 with an error in the body" the constitution forbids. That rule
is about the *request* failing while the response claims success. Here the request
succeeded: it recorded an attempt and returned it, with the outcome as a first-class
field. The distinction is the same one BR-9.4 already draws — a successful mutation
joins the transaction, a failure that has no business transaction is recorded
separately.

**Rejected:** a `202 Accepted`. It implies asynchronous completion and a later status
transition, which is the outbox this feature deliberately does not build.

**Consequence:** the shape is
`SendResult(InteractionDeliveryStatus Status, string? ProviderMessageId, string? FailureCode)`,
reusing the domain enum rather than inventing a second vocabulary for the same two
outcomes. `FailureCode` is a **machine-readable code**, never a sentence, so BR-8.7
covers it and the client owns the translation (AC-22).

---

## R-6 · How does a test reach the failure path without a backdoor?

**Checked:** what triggers are available, and which of them exist in production code.

| Trigger | Verdict |
|---|---|
| A magic token in the message body, or a `X-Force-Failure` header | **Rejected.** A request-controlled failure switch is a backdoor. It ships, it is reachable by any authenticated caller, and it is indistinguishable from a bug when it fires |
| A test-only provider substituted through `WebApplicationFactory` | Useful, and used for AC-24 — but it tests *a different provider*, not the mock's failure path |
| `IOptions<MockProviderOptions>` with `FailChannels`, default empty, set through configuration | **Settled.** No request can reach it, an integration test sets it through the factory's configuration, and a demo can set it in `appsettings.Development.json` (Q-D) |

**Consequence:** AC-6 asserts the absence of the rejected options — a search for a
request-reachable trigger must find nothing. Stating the default is not enough; the
criterion is that no other trigger exists.

---

## R-7 · Where does the interface live — `Wasl.Domain` or `Wasl.Api`?

**Checked:** ADR-010's dependency direction and the domain's "no dependencies" rule;
`02-architecture.md`, which places `Interaction.cs` and `CommunicationChannel.cs` in
`Wasl.Domain/Communications/` and the slices in `Wasl.Api/Features/Communications/`.

`ICommunicationProvider` returning `Task<SendResult>` needs nothing but the BCL, so the
domain **could** hold it without breaking the architecture test.

**Settled:** `src/Wasl.Api/Features/Communications/Providers/`. Reason: nothing in
`Wasl.Domain` calls a provider. An outbound port in the domain that the domain never
uses is a port in the wrong place, and it invites the next person to inject
infrastructure into an entity. The entity (`Interaction`) and the enums stay in
`Wasl.Domain/Communications/` exactly where `02-architecture.md` puts them.

**Rejected:** `Wasl.Api/Common/`. `Common/` holds cross-cutting infrastructure —
persistence, behaviours, auth, errors, localization, health. The provider seam is one
module's machinery used by one slice today and one deferred slice tomorrow, so it lives
with the module. Keeping it under `Features/Communications/` also means the whole named
module is one folder a reviewer can open, which is the point of promoting the story.

---

## R-8 · Does the provider call belong inside the request transaction?

**Checked:** ADR-010 (one transaction per request, opened by `TransactionBehavior`) and
what the mock actually does (an in-memory record and a log line — no I/O).

**Settled: inside, and recorded as a known limitation.** With the mock, "inside" costs
nothing: no network round trip holds a lock, and there is no side effect outside the
process to be orphaned by a rollback.

**What it would cost with a real provider, stated now rather than discovered:** a sent
message cannot be rolled back. The moment the provider is real, this shape is wrong and
the answer is an outbox — record `Pending` in the transaction, dispatch after commit,
update on the callback. That is a pattern, a background dispatcher, and a delivery-status
lifecycle: out of scope, and named in `plan.md` under risks so nobody discovers it as a
surprise.

**What the mock still exposes, and it is worth an AC:** the in-memory buffer is written
inside the transaction but is **not part of it**. After a rollback, the buffer holds an
attempt for which no row exists (AC-8). That is not a defect to fix — it is the honest
difference between a diagnostic and a ledger — but it is exactly the kind of thing a
reader finds later and mistakes for the record of what was sent. So it is tested and
written down.

---

## R-9 · Is the in-memory recorder a `List`, and does it need an interface?

**Checked:** what a test needs to assert (channel, recipient, body, timestamp), and what
a long-running process can afford to keep.

**Settled:** a `sealed class SentMessageBuffer`, thread-safe, **bounded** (capacity from
options, default 100, oldest dropped), registered as a singleton. **No interface** — the
constitution's rule against one-implementation interfaces applies to this too, and
`spec.md` Tension 1 admits exactly one exception, not two.

**Rejected:** an unbounded `List<SentMessage>`. It is the obvious implementation and it
is a memory leak with a slow fuse: every message the process ever sends, retained for
the lifetime of the process. A bound is one constructor parameter.

**Rejected:** relying on the log alone. A test asserting against log output is a test
coupled to a message template, and BR-9.7-style redaction means the log deliberately
does not contain the body (R-10) — so the assertion AC-2 needs would be impossible.

---

## R-10 · What may the mock log?

**Checked:** BR-8.9 (logs are always English), BR-9.7 (redaction: no password, hash,
token, key, or full comment body), `docs/sdd/testing/security-checklist.md` conventions
on PII.

**Settled:** one English `Information` line carrying `ticketId`, `channel`,
`providerName`, `deliveryStatus`, and body **length**. It carries neither the body nor
the recipient address.

- The body is excluded by direct analogy to BR-9.7's comment-body rule: content a
  customer wrote or will read does not go into a stream engineers grep.
- The recipient address is a customer's email or phone. It is already in
  `dbo.Interactions` for anyone entitled to read it; duplicating it into logs widens who
  can see it to everyone with log access, for no diagnostic gain that the ticket id does
  not already give.

**Rejected:** logging the body at `Debug`. A level is not an access control, and
"only in development" is not a property the code can hold.

---

## R-11 · Which channels can be sent on, and what is the recipient?

**Checked:** the enum in `03-domain-model.md`
(`Email | WhatsApp | LiveChat | Sms | WebForm`), `Customer`'s contact columns (`Email`,
`PhoneE164`), and BR-4.1 — a customer has *at least one* of the two, not both.

**Settled:**

| Channel | Recipient column | Sendable |
|---|---|---|
| `Email` | `Customer.Email` | yes |
| `WhatsApp` | `Customer.PhoneE164` | yes |
| `Sms` | `Customer.PhoneE164` | yes |
| `LiveChat` | — | no |
| `WebForm` | — | no |

`LiveChat` and `WebForm` are mediums a customer initiates; there is no address to send
to. They remain valid values of the enum for `Ticket.Channel` and
`TicketComment.Channel` — a ticket that *arrived* through a web form is normal. Recorded
as assumption A-3, because "why can't I send on LiveChat?" is the first question a
reviewer will ask.

**Settled, and it is the interesting half:** because BR-4.1 allows a customer with only
an email, a send on `Sms` can be valid in every respect and still have no address. That
is state, not input — hence `409 errors/no-contact-for-channel` (AC-12), distinct from
the `400` a non-sendable channel gets (AC-4/AC-11 edge cases). A naive implementation
passes an empty string to the provider and records a meaningless row, and the mock is
happy to accept it — which is why the case has its own criterion.

---

## R-12 · Turned out not to matter: `rowversion` on `Interactions`

**Asked because** every mutable entity in this schema carries one (ADR-006 as amended by
ADR-013), so its absence looked like an oversight.

**Settled: no `rowversion`.** The row is written once and never updated by application
code, exactly like `TicketHistory` and `AuditLog`, neither of which carries one. A
concurrency token on a row nothing updates is a column that can only ever be checked
against itself.

**Recorded because it is the same question as Q-E** (should the row be `DENY`-protected
like `AuditLog`?), and the answers differ: no token *and* no `DENY`, because
`DeliveryStatus` is the one field a real provider's callback would legitimately update
later. Append-only here is a property of the code path, stated in `data-model.md`, not
a grant that would have to be revoked.

---

## R-13 · Turned out not to matter: a `channel` filter on the interactions list

**Asked because** BR-7.3 lists `channel` among the ticket-list filters, so a filter on
interactions looked consistent.

**Settled: not built.** BR-7.3 is about the *ticket* list, and `015` owns it. The
interactions of one ticket are a bounded, small set read in order; filtering them is a
query nobody has asked for and an index nobody needs. Recorded so the omission is
visibly a decision — and so the `IX_Interactions_TicketId_CreatedAtUtc` index stays the
only one, justified by the only query (DoD: every new index justified by a named query).
