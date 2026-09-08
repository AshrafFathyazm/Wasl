# US-012 — Summary

**Phase:** 7 · **Role:** Summary · **Status:** Complete · **Date:** 2026-09-08

Written for someone who was not present.

## What Was Built

From the user's point of view.

**A support user can send a message to a customer from the ticket, and see what happened
to it.** `/tickets/:id` has a third tab, **الرسائل / Messages**, holding the record of
every message sent on that ticket — the channel, the address it went to, the text, and
whether the provider accepted it — with a composer underneath.

**The channel list comes from the server.** Email, WhatsApp and SMS today. A deployment
that registers nothing shows a panel saying so rather than a composer that fails on
submit.

**A refused message is a row, not an error.** If the provider declines, the message still
appears in the list with a red *Failed* badge and a sentence explaining why. Nothing is
lost, and a support agent has something to show.

**An agent can only send on their own tickets, or unassigned ones.** A manager can send on
any. Somebody who cannot send is told so instead of being offered a composer that would be
refused — and the server refuses it anyway, with an audit row.

**No message can be sent to an arbitrary address.** The recipient is resolved from the
ticket's customer, so there is no field to type one into.

**Nothing leaves the process.** There is no provider account, no credential, no network
call. The one implementation behind the seam records what it was asked to send and returns
a fabricated receipt.

### On the wire

- `POST /api/tickets/{ticketId}/messages` → `201` with the interaction
- `GET /api/tickets/{ticketId}/interactions` → the paged envelope, oldest first
- `GET /api/communications/channels` → `{ sendableChannels }`
- `dbo.Interactions`, migration `AddInteractions`, two check constraints

## Why It Was Built This Way

### The feature's justification is demonstrability, and it is written down as such

`DEFERRED.md` deferred US-012 because *"the abstraction would have exactly one
implementation and no second one in prospect"*, and **that objection is still true.**
`SendAsync` is designed against a mock, so it will be wrong in detail the day a real
provider arrives.

What it is not is *absent*. Communication Channels is item 3 of the requirement and FR-3
of the product spec, and today it resolves to two `nvarchar(20)` columns holding an enum.
A module that resolves to one enum column reads as **missing**, not as scoped. So the
justification here is not future-proofing dressed up as design — it is that the named
module now has an addressable surface, a routed call, and a persisted record of the call.

### A refused delivery is a `201`, and this is the decision most likely to be "corrected"

The request succeeded in recording an attempt, and **the attempt is the resource.** A
`5xx` would unwind the request transaction and take the record of the attempt with it,
leaving a support agent nothing to show for a message they tried to send.

It is not *"`200` with an error in the body"* — the thing `05-api-conventions.md` forbids.
The row is real, a resource was created, and `deliveryStatus` is data about the world
rather than about the request. The consequence for a client is stated in the contract and
in the client's own type: **branch on `deliveryStatus`, not only on the status code.**

### The failure path is configuration-only, and the rejected alternatives are the point

A magic token in the body, or an `X-Force-Failure` header, would have been easier to test
with. Both were rejected: a request-controlled failure switch **ships**, is reachable by
any authenticated caller, and when it fires is indistinguishable from a bug. AC-6 asserts
the absence by search rather than asserting the default — *stating* the default is not
enough, the criterion is that no other trigger exists.

### The registry is the single source of the sendable set

Registering a provider for a channel makes it appear in
`GET /api/communications/channels` **and** be accepted by the validator, with no edit to
either. The alternative — a `SendableChannels` constant — is one fact stated twice, and
the copy that drifts is the one offering a channel the server answers `400` for.

**Two providers for one channel fails application startup**, naming the channel and both
implementation types. Last-registration-wins is a routing bug with no error anywhere: it
presents months later as *"the wrong provider sent it"*, and the data trail looks correct
because `ProviderName` faithfully records whichever provider actually ran.

### Three layers enforce the outcome pairing, and each catches a different mistake

`SendOutcome`'s factories catch a **provider** returning an inconsistent pair.
`Interaction.Send` catches a **handler** passing one. `CK_Interactions_Outcome` catches
anything reaching the table by another route — a seeder, a migration, a manual `INSERT`.
The two rows all three forbid are the two that read as fact and are wrong: an `Accepted`
row with no provider id looks delivered and cannot be chased with the provider, and a
`Failed` row carrying one is a contradiction somebody will resolve in favour of the wrong
half.

### `Accepted` is not "delivered", and the label says so

What a provider reports synchronously is that it took responsibility. Whether the message
reached a handset arrives later, through a callback this product does not have. A badge
reading *Delivered* would be a claim the system cannot make — and one a support agent
would repeat to a customer.

### `CK_Interactions_Direction` is how "no inbound" stays a fact

`InteractionDirection` declares `Inbound` so the column carries information and so US-013
is a **dropped constraint** rather than a migration of every row. Nothing in this release
can write one, and the database says so rather than a comment saying it quietly.

## Trade-offs

| Decision | Alternative | Why |
|---|---|---|
| Sending is assignment-sensitive (Q-A) | Any support user, any ticket — the comment rule | An outbound message is the only act in this system a *customer* sees. An internal note read by the wrong colleague is untidy; a message sent to a customer by somebody with no business on the ticket is not recoverable |
| Interactions are a separate panel (Q-C) | One merged conversation in the timeline | BR-5.7 defines the timeline as comments ∪ history. A third source changes `013`'s frozen contract and its cursor-pagination boundary test — a schema-free change with a large blast radius |
| The page envelope for the read | `013`'s cursor | A ticket's message history is short, bounded and read from the top, so page 2 stays page 2. `CLAUDE.md` records both shapes as deliberate |
| Not idempotent, no `Idempotency-Key` | `036`'s mechanism on `POST /api/tickets` | Deduplicating an outbound message means guessing whether the user meant to send it twice. A swallowed second message is worse than a duplicate: the customer sees neither and the agent believes they sent it. Submit is disabled while in flight |
| No `DENY UPDATE` on `dbo.Interactions` (Q-E) | Append-only by permission, like `AuditLog` | `DeliveryStatus` is precisely the column a real provider's callback would later update, so a deny now is a grant that has to be revoked. Append-only here is a property of the code path, and it is stated rather than enforced |
| `ON DELETE NO ACTION`, unlike `TicketComments` | Cascade with the ticket | An interaction records something that **left the system toward a customer**, which is closer to `AuditLog`'s reasoning (BR-9.12) than to a comment's. A manual ticket delete now fails loudly instead of erasing the record of what was sent |
| `canSend` mirrored in the client | A `canSendMessage` field, like `016`'s `canEscalate` | BR-3.2 is role-only, so the server must answer it. Q-A's rule needs the ticket's **assignee**, which the client already holds and already renders — a server field would be answering a question from data the caller has |
| The provider call is inside the transaction | An outbox | Only sound because the mock is in-process. A real provider makes it wrong twice: a sent message cannot be rolled back, and a network hop inside an open transaction holds locks. Recorded as the change a real provider forces, not pre-built |

## Corrections made at the approval gate, before any code

The spec was written 2026-08-24 and read on 2026-09-08. Four premises had gone stale or
were wrong when written. The full table is at the head of
[`spec.md`](spec.md); the consequential one:

**The whole structural half targeted ADR-010** — minimal APIs, vertical slices, two
projects — and `checklists/requirements.md` had ticked three rows against it. ADR-010 was
evaluated and **rejected**; ADR-002's four-project Clean stands. `research.md` R-7's
*argument* survived unchanged ("nothing in `Wasl.Domain` calls a provider, so an outbound
port there is a port in the wrong place") and only its destination moved:

| Type | Where it went |
|---|---|
| `ICommunicationProvider`, `OutboundMessage`, `SendOutcome` | `Wasl.Application/Common/Abstractions/` — beside every other outbound port |
| `CommunicationProviderRegistry` | `Wasl.Application/Common/Communications/` — the validator and the channels query both need it, and both are Application code |
| `MockCommunicationProvider`, options, buffer | `Wasl.Infrastructure/Communications/` — a folder `CLAUDE.md`'s structure block already named and which did not exist |
| `Interaction` and the two enums | `Wasl.Domain/Communications/` — unchanged |

AC-17's search path went with it. **As written it would have scanned a directory that
never exists and passed vacuously** — the failure mode `001` recorded for its own
architecture test.

## Deviations from the plan

| # | Planned | Built | Why |
|---|---|---|---|
| 1 | Vertical slices in `Wasl.Api/Features/Communications/` | Four-project Clean per ADR-002 | ADR-010 was rejected. See above |
| 2 | *(not planned)* | `MockProviderOptionsBindingTests` | Written to settle a disagreement between two measurements. It is the reason the binder was not "fixed" to satisfy three false negatives — see `tests.md` finding 4 |
| 3 | *(not planned)* | `channelIcons.ts` | `021` became the channel-icon map's second consumer. `037` found `IconEye` declared twice with different geometry; one map now |
| 4 | *(not planned)* | `No_pending_entry_names_an_endpoint_no_contract_declares` | Four dead exemptions, two of them `021`'s own |
| 5 | AC-24 proved with a stub on a new channel | Proved by **replacing** the mock on `Email` | A stub on `LiveChat` gets `409` — correctly, per spec A-3. The `LiveChat` case is kept as its own test asserting what it proves |
| 6 | AC-8 — a rollback after the provider call | **Not done** | Recorded unmet in `tests.md`. It needs a fault injected between the send and the save |
| 7 | AC-18 — cancellation | **Partial** | The mock cannot express a cancelled send as `Failed`; no test drives a cancelled request through the pipeline |

## Known Limitations

- **`--seed-bulk` creates customers with neither an email nor a phone**, which BR-4.1
  allows. So a reviewer opening the Messages tab on a random seeded ticket meets AC-12's
  `409` rather than a composer that works. A demo-data gap, not a product defect — and a
  reviewer should pick a ticket whose customer has contact details, or use one of `--seed`'s
  three.
- **No inbound messages, and the panel does not imply any.** US-013 is deferred with four
  live blockers. The empty state deliberately does not say "no replies yet" — that would
  be a fact the product does not have.
- **No retry on a failed message.** There is no retry endpoint, and re-sending is just
  sending again, which the composer already does. A *Retry* button would quietly create a
  second row.
- **AC-8 is unmet and AC-18 is partial.** Both in `tests.md`.
- **The Messages panel has not been walked keyboard-only or with a screen reader.** Same
  gap `016` recorded for its dialog.
- **`Communications:Mock:FailChannels` cannot be set through an environment variable or a
  command-line argument in a `dotnet run` session** — `launchSettings.json` is in play.
  `appsettings.Development.json` is the path that works and the file now says so.
- **A message the mock "accepted" reached nothing.** Obvious, and worth stating because
  the panel's `Accepted` badge is deliberately not the word *Delivered*.
