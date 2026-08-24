# 021 — Plan

**Phase:** 5 · **Role:** Architecture · **Agent:** `feature-dev:code-architect` ·
**Skill:** `speckit-plan`

## Backend design

Every file named. A plan that does not name its files is a description.

```text
src/
  Wasl.Domain/
    Communications/
      Interaction.cs                        NEW  entity + Outbound factory, invariants
      InteractionDirection.cs               NEW  Inbound / Outbound
      InteractionDeliveryStatus.cs          NEW  Accepted / Failed
      CommunicationChannel.cs               EXISTS (009). Not touched — spec A-1

  Wasl.Api/
    Features/
      Communications/
        Providers/
          ICommunicationProvider.cs         NEW  Channel + SendAsync. The seam
          OutboundMessage.cs                NEW  record: Channel, RecipientAddress, Body, TicketId
          SendResult.cs                     NEW  record: Status, ProviderMessageId, FailureCode
          MockCommunicationProvider.cs      NEW  the ONE implementation
          MockProviderOptions.cs            NEW  FailChannels, BufferCapacity
          SentMessageBuffer.cs              NEW  bounded, thread-safe, concrete. No interface
          CommunicationProviderRegistry.cs  NEW  channel -> provider, SendableChannels
          CommunicationsRegistration.cs     NEW  AddCommunicationProviders() extension
        SendMessage/
          Endpoint.cs                       NEW  POST /api/tickets/{ticketId}/messages
          Command.cs                        NEW  IRequest<InteractionResponse>, IAuditableCommand
          Handler.cs                        NEW  guards -> resolve recipient -> send -> record
          Validator.cs                      NEW  body, channel-in-registry
          Response.cs                       NEW  InteractionResponse
        ListInteractions/
          Endpoint.cs                       NEW  GET /api/tickets/{ticketId}/interactions
          Query.cs                          NEW
          Handler.cs                        NEW
          TicketInteractionsQuery.cs        NEW  named query object, one caller, no interface
        GetSendableChannels/
          Endpoint.cs                       NEW  GET /api/communications/channels
          Query.cs                          NEW
          Handler.cs                        NEW
          Response.cs                       NEW
    Common/
      Persistence/
        WaslDbContext.cs                    CHANGE  add DbSet<Interaction>
        Configurations/
          InteractionConfiguration.cs       NEW
        Migrations/
          *_AddInteractions.cs              GENERATED
    Program.cs                              CHANGE  AddCommunicationProviders + eager registry
    appsettings.json                        CHANGE  Communications:Mock section, empty FailChannels
    Resources/
      ProblemDetails.en.resx                CHANGE  4 new keys
      ProblemDetails.ar.resx                CHANGE  the same 4 keys

tests/
  Wasl.Domain.Tests/
    Communications/
      InteractionTests.cs                   NEW  factory invariants, no database
  Wasl.Api.IntegrationTests/
    Communications/
      SendMessageTests.cs                   NEW  AC-1, 7, 11, 12, 13, 14, 15
      MockProviderTests.cs                  NEW  AC-2, 6, 18
      ProviderRegistryTests.cs              NEW  AC-3, AC-5 (startup), AC-4
      SecondProviderRoutingTests.cs         NEW  AC-24 — the seam's claim
      StubChannelProvider.cs                NEW  test-project only. Not a second production impl
      InteractionSchemaTests.cs             NEW  AC-9, AC-10, sys.check_constraints
      ListInteractionsTests.cs              NEW  AC-19, AC-20
      TransactionRollbackTests.cs           NEW  AC-8
      AuditOnSendTests.cs                   NEW  AC-16

wasl-web/src/
  features/communications/
    api.ts                                  NEW
    queries.ts                              NEW  useInteractions, useSendableChannels, useSendMessage
    schema.ts                               NEW  Zod, mirrors the contract
    TicketMessagesPanel.tsx                 NEW  feature component
    SendMessageForm.tsx                     NEW  feature component
    InteractionList.tsx                     NEW  feature component
    DeliveryStatusBadge.tsx                 NEW  feature component over the Badge primitive
  features/tickets/
    TicketDetailPage.tsx                    CHANGE  owns the queries, renders the panel (ADR-011 sec 4)
  locales/en/communications.json            NEW
  locales/ar/communications.json            NEW
```

### The seam

```csharp
public interface ICommunicationProvider
{
    CommunicationChannel Channel { get; }
    Task<SendResult> SendAsync(OutboundMessage message, CancellationToken cancellationToken);
}
```

Four properties of that signature, each with a reason:

| Choice | Reason |
|---|---|
| `Channel` is a property **on the provider** | It is the registry key, so the key and the implementation cannot disagree (`research.md` R-4). There is no second place to keep in step |
| One `OutboundMessage` parameter, not four | A real provider will need more fields. Adding one to a record is a compile-safe change in one file; adding a fifth parameter changes every call site and every fake |
| `SendResult`, not `bool` and not `void` | A `bool` is the shape that has to change the day a provider returns an id and a reason, and `void` cannot express "the provider said no" at all (`research.md` R-5) |
| `CancellationToken`, not optional | Constitution: every async path. The mock honours it (AC-18) so the contract is exercised rather than assumed |

### Registration, and how a second provider arrives

```csharp
// CommunicationsRegistration.cs
services.Configure<MockProviderOptions>(config.GetSection("Communications:Mock"));
services.AddSingleton<SentMessageBuffer>();

foreach (var channel in new[] { CommunicationChannel.Email,
                                CommunicationChannel.WhatsApp,
                                CommunicationChannel.Sms })
{
    services.AddSingleton<ICommunicationProvider>(sp =>
        new MockCommunicationProvider(channel, sp.GetRequiredService<SentMessageBuffer>(), …));
}

services.AddSingleton<CommunicationProviderRegistry>();   // throws on a duplicate channel
```

```csharp
// Program.cs — eager, so AC-5 fails at startup and not at the first send
app.Services.GetRequiredService<CommunicationProviderRegistry>();
```

**Adding `EmailProvider` later is: one new class, one `AddSingleton` line, and deleting
`CommunicationChannel.Email` from the loop above.** Nothing in `Endpoint.cs`,
`Command.cs`, `Handler.cs`, `Validator.cs`, `Response.cs`, the contract, or the client
changes. That is the claim, and `SecondProviderRoutingTests` (AC-24) is the test that
makes it a fact rather than a paragraph.

Forgetting to delete the mock's registration for that channel is then a **startup
failure** naming both types (AC-5) — not a coin flip over which provider handles Email.

### `Handler.cs` — the order matters, and the order is the specification

```text
1  load the ticket with its customer         → 404 if absent                    AC-15
2  authorization: assignee or Manager        → 403                              AC-13
3  status guard: not Closed                  → 409 errors/ticket-closed         AC-11
4  resolve the recipient for the channel     → 409 errors/no-contact-for-channel AC-12
5  registry.Get(channel)                     → cannot fail; the validator ran   AC-3
6  provider.SendAsync(message, ct)           ← the ONLY step that leaves the handler
7  Interaction.Outbound(...) from the result → domain invariants                AC-7
8  DbContext.Add + SaveChanges (behaviour-owned transaction)                    AC-16
```

Steps 1–5 precede step 6 deliberately: **nothing leaves the process for a request that
was going to be refused** (AC-11, AC-12, AC-13). The tests assert the mock's buffer is
*empty* on each refusal, which is the only way to prove a negative like that.

Validation of `channel` against the registry happens in `Validator.cs`, so step 5 cannot
fail and does not need a null check that would be dead code.

### Where each decision is enforced

| Decision | Enforced by | Not by |
|---|---|---|
| The sendable set has one source | `CommunicationProviderRegistry.SendableChannels`, read by both the validator and the channels endpoint | A `readonly` array in the validator and a matching constant in the client |
| Two providers for one channel is a startup failure | The registry's constructor, resolved eagerly in `Program.cs` | A comment on the registration loop |
| The audit row is in the transaction | `AuditBehavior` + `TransactionBehavior` from `003`; the command implements `IAuditableCommand` | The handler remembering to write one |
| The body never reaches the audit row | The `Changes` projection lists its fields explicitly (channel, recipient, status, interaction id) | A redaction filter that has to recognise a body |
| Only `Outbound` rows exist | `CK_Interactions_Direction`, plus an `Outbound`-only factory | The absence of an inbound endpoint today |
| No accepted row without a provider id | `CK_Interactions_Outcome`, plus the same rule in the factory | The handler being careful |
| Time comes from `TimeProvider` | Injected into the handler and into the mock | `DateTime.UtcNow` |
| The mock reaches no network | AC-17's search, plus the security review | The class being called "Mock" |

### `Program.cs` ordering

Nothing new, and one thing that must not be disturbed: `UseAuthentication()` **before**
`UseRequestLocalization()`. ADR-007 calls this the single most likely defect in the build
because it fails silently — the user's stored `PreferredLanguage` (BR-8.4) is
unavailable if localization runs first, so every server message quietly falls back to
`Accept-Language` and the bug looks like a translation gap. This feature adds
server-authored messages (four new `ProblemDetails` keys), so it is one of the features
that *would* show the symptom. `TEST-021-14` asserts an Arabic `409` title arrives
translated for a user whose stored preference is `ar` and whose `Accept-Language` is
`en` — which is the assertion that distinguishes the two orderings.

## Frontend design

One panel on an existing screen. Full detail in
[`frontend-spec.md`](frontend-spec.md); the API surface is
[`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

| Component | Kind (ADR-011 §4) | Fetches? |
|---|---|---|
| `TicketDetailPage` (existing, `010`) | Route / page | **Yes** — owns all three queries and the mutation |
| `TicketMessagesPanel` | Feature | No — props only |
| `SendMessageForm` | Feature | No |
| `InteractionList` | Feature | No |
| `DeliveryStatusBadge` | Feature, over the `Badge` primitive | No |
| `Select`, `Input`, `Button`, `Badge`, `Toast` | Primitive (`006`) | No |

No new primitive. `DeliveryStatusBadge` is a feature component that maps two enum values
onto the existing `Badge`, exactly as the ticket status badge does — a ninth primitive
would need a written reason (ADR-009) and this is not one.

No global store: the channel list and the interactions are server state (TanStack Query),
the composer is form state (React Hook Form), and there is nothing else (ADR-011 §1).

## Data changes

One new table, `dbo.Interactions`; migration `AddInteractions`. Full definition,
constraints, index, and the verification queries in
[`data-model.md`](data-model.md).

`docs/sdd/03-domain-model.md` has no `Interaction` entity (`research.md` R-2), so the
Definition of Done's "schema change reviewed against `03-domain-model.md`" is satisfied
by amending that document — `DOC-021-01`, not by asserting agreement that does not exist.

## Contract changes

[`contracts/communications-api.md`](contracts/communications-api.md), frozen. This is the
first contract for this module, so nothing existing breaks. Three obligations it creates:

| Change | Where it lands | Owner |
|---|---|---|
| Three new rows in the endpoint inventory of `docs/sdd/05-api-conventions.md`, which currently lists none of these paths | `05-api-conventions.md` | `DOC-021-02` |
| Two new `409` `type` values: `errors/ticket-closed`, `errors/no-contact-for-channel` | `05-api-conventions.md`, error-contract section | `DOC-021-02` |
| One new audit action name, `Communication.MessageSent`, in BR-9's action-naming list | `docs/sdd/04-business-rules.md` | `DOC-021-03` |

**Standing obligation, not a one-off:** `013-ticket-timeline-and-comments` needs a `409`
for BR-5.2 (a comment on a closed ticket). It must use `errors/ticket-closed` — the same
`type` frozen here. Whichever feature lands first owns the name; the second matches it.
Two names for one condition is a client branching on both (spec Q-B).

**Deviation recorded, not smuggled:** the `201` on `POST .../messages` carries **no
`Location` header**, against `05-api-conventions.md`'s `201` row. Reason and the rejected
alternative are in the contract; the deviation is repeated under *Risks* below because
that is where a reviewer looks for it.

## Test strategy

| Level | What | Why there |
|---|---|---|
| Unit — `Wasl.Domain.Tests` | `Interaction.Outbound` invariants: whitespace body, over-length body, empty recipient, accepted-without-id, failed-without-code | Pure rules, no database, no HTTP. They are the second lock on `CK_Interactions_Outcome` and they run in milliseconds |
| Unit — `Wasl.Api.IntegrationTests` (no container needed, but the project has the fixtures) | `CommunicationProviderRegistry`: duplicate channel throws; empty registry yields an empty sendable set; lookup by channel | The registry has no dependency on a database. Placed with the other communications tests so a reader finds the module's tests in one folder |
| Integration — real SQL Server via `Testcontainers.MsSql` | Every status code in the contract; the schema queries; the rollback asymmetry; the audit row; pagination; the Arabic round-trip; stub-provider routing | Every one is a property of the real engine or the real pipeline. EF `InMemory` enforces no check constraint and no foreign key, so it would pass while the migration was wrong |
| Frontend — Vitest + RTL | `SendMessageForm`: channel options come from the query and not a constant; submit disabled while pending; a `Failed` result renders the translated sentence for its code and never the raw code | These are the three ways this panel breaks. Not a snapshot test — a snapshot passes with the wrong copy in it |
| Manual, recorded as a deliverable | The Arabic RTL walk of the panel (AC-23) | RTL defects are visual. No assertion catches a composer sized to English labels (ADR-009) |

**Deliberately not tested, and why:**

| Not tested | Reason |
|---|---|
| That the mock actually delivers anything | It does not, by design. Testing that a mock does not send an email is testing the absence of a feature |
| Provider retry, back-off, delivery callbacks | Not built. See Risks |
| The `500` path when a provider throws | The mock never throws except for cancellation, so producing it needs a throwing stub — which is `SecondProviderRoutingTests`' machinery used for a case with no requirement behind it. The contract documents the shape; the guard is the shared middleware from `002`, already tested there |
| `GET /api/communications/channels` under concurrency | It reads an immutable singleton built at startup |
| Load or volume on `Interactions` | No stated requirement. One ticket has a handful of rows |

## Dependencies

| Depends on | For |
|---|---|
| `001-solution-skeleton` | Solution, `WaslDbContext`, UTC converter, `TimeProvider`, Testcontainers fixture |
| `002-error-contract` | `ProblemDetails` middleware and `ValidationBehavior` — every failure in the contract goes through them |
| `003-audit-trail` | `AuditBehavior`, `TransactionBehavior`, `IAuditableCommand`, and the NFR-10 architecture test that fails the build if the command is not auditable |
| `004-auth-and-roles` | `ICurrentUser`, the role policies, `401`/`403`. **The `errors/forbidden` type name is `004`'s to define** — if it froze a different name, this contract matches it, as a Contract change |
| `005-localization-core` | `IStringLocalizer`, the `.resx` pair, the key-parity test |
| `006-design-system` | `Select`, `Input`, `Button`, `Badge`, `Toast` |
| `009-create-ticket` | `Ticket`, `CommunicationChannel`, `Ticket.Channel` |
| `010-ticket-list-and-detail` | `TicketDetailPage`, which hosts the panel (spec A-2) |

Nothing depends on this feature. It is last but one in Release 2 for that reason, and it
can be cut whole without touching anything else — which is what makes it an honest
Phase 5 item.

## Risks and trade-offs

### Considered and rejected: keyed DI (`AddKeyedSingleton`) with the channel as the key

The literal reading of "DI registration keyed by channel", and one line shorter.
Rejected because **keyed services cannot be enumerated** — there is no supported way to
ask the container which keys were registered. The sendable set is served over HTTP and
mirrored in a `<select>`, so it would have to be maintained by hand in a second place,
which is exactly the drift AC-4 exists to prevent. Full comparison in `research.md` R-4.

The registry's dictionary is the keying, and its key is `provider.Channel` — so the
provider's own property is the key and the two cannot disagree.

### Considered and rejected: `502` when the provider reports a failure

The instinctive answer, and the conventional one for an upstream failure. Rejected for a
concrete reason rather than a stylistic one: the exception unwinds the request
transaction opened by `TransactionBehavior`, so **the `Interaction` row recording the
attempt is rolled back with it**. The system is then unable to show a support agent that
a send was tried and refused, which is the single most useful thing it could show.
`201` with `deliveryStatus: "Failed"` keeps the record and puts the outcome in a field.
`research.md` R-5, and AC-7 is the test.

### Considered and rejected: an inbound `ReceiveMessage` endpoint

`02-architecture.md` lists the slice. Rejected: US-013's four blockers are all still
open, and a guessed webhook payload contract is worse than no endpoint. An internal
"record an inbound message" endpoint was also rejected — it duplicates
`TicketComment.Channel`, which `DEFERRED.md` already names as the partial coverage.
`spec.md` Tension 2, `research.md` R-3. The absence is made visible by
`CK_Interactions_Direction` rather than left as a gap.

### Considered and rejected: an outbox, so the send survives a rollback

The correct pattern for a real provider: record `Pending` in the transaction, dispatch
after commit, update on the callback. Rejected as out of scope — it needs a background
dispatcher, a delivery-status lifecycle, and a retry policy, none of which has a
requirement, and all of which are the shape of the *provider* that is out of scope.

**Recorded as the known limitation it is:** with the mock there is no side effect outside
the process, so a rollback loses nothing real (spec A-6). The day a provider is real,
this shape is wrong and the outbox is the fix. Stating it now is the difference between a
trade-off and a defect.

### Accepted risk: the interface is designed against a mock, so it will be wrong in detail

`DEFERRED.md` said this and it was right: *"an interface designed against a single
hypothetical consumer is usually the wrong interface"*. A real provider brings
authentication, per-recipient results, rate limits, and asynchronous delivery status —
and `SendAsync` returning a synchronous `SendResult` accommodates none of them.

Contained, not denied: the interface has one caller and one implementation, and it lives
in one folder. Reshaping it is a same-day change to `Handler.cs` plus the mock. What the
seam buys is not a correct future interface; it is a **named module with an addressable
surface**, and `spec.md` Tension 1 says so in those words rather than dressing it up as
future-proofing.

### Accepted deviation: `201` without a `Location` header

`05-api-conventions.md` says a `201` carries `Location`. There is no single-interaction
resource to point at, and inventing `GET .../interactions/{id}` to satisfy a header would
add an endpoint with no caller. Recorded in the contract and here; `REV-021-01` records
it in `review.md`. The alternative considered was pointing `Location` at the collection,
rejected because it is not the created resource and a client following it would get a
page of rows.

### Accepted risk: the mock's buffer looks like the record of what was sent

It is in memory, bounded, and outside the transaction — so after a rollback it holds an
attempt that no row records (AC-8). The next reader will find it and assume it is the
ledger. Contained by AC-8 being a *test* rather than a comment, by the buffer's bound
making it visibly lossy, and by the class name.

### Accepted risk: this feature is the precedent nobody should cite

An abstraction admitted on demonstrability grounds against an explicit constitutional
rule is a precedent, and precedents get cited. `spec.md` Tension 1 states that this is
the only one admitted on that basis, and `REV-021-03` records it as a deviation rather
than as a pattern. The mitigation is also structural: three places in this feature where
an interface was the reflex — the registry, the buffer, `SendResult` — are concrete
types, so the diff itself shows the rule still applies everywhere else.
