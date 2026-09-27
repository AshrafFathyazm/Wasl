# Deferred Stories

Recorded so that the reasoning survives, and so that a reviewer can see what was
considered and consciously not built.

---

## US-011 — Channel Classification

**Status:** Absorbed, not deferred

Originally scoped as "classify a ticket or interaction by communication channel".

It was removed as a story because it describes a field on two entities rather than a
unit of deliverable value. The requirement is met by `Ticket.Channel` in US-005,
`TicketComment.Channel` in US-010, and the channel filter in US-006.

Keeping it would have inflated the board without adding work — a form of scope
theatre that makes a plan look bigger than the delivery behind it.

---

## US-012 — Provider Abstraction

**Status:** **Promoted and delivered** 2026-09-08 — `021-communication-provider-abstraction`,
tracked in `08-board.md`. Everything below is the reasoning for the original deferral and is
kept because the deferral was correct at the time; it is **not** a standing decision, and a
reader who arrives here should not conclude that `021` was built against one.

**What changed:** the argument below is about an abstraction with one implementation. It
still has one, and the deviation is **recorded rather than argued away**, in
`specs/021-communication-provider-abstraction/review.md` under the mechanism the
constitution specifies in Governance. What the promotion bought is a *demonstrable* seam:
Communication Channels resolved to one enum column, which reads as missing rather than as
scoped. **It is not precedent for the next abstraction.**

**Still out of scope, untouched by `021`:** any credential, any network call, any real
provider account. `MockCommunicationProvider` is the only implementation and AC-17 asserts
by source search that no `HttpClient`, `SmtpClient`, `Socket` or `WebSocket` exists behind
the seam.

<details>
<summary>The original deferral reasoning</summary>

**Status at the time:** Deferred

Originally scoped as "an abstraction over communication providers so that a real
WhatsApp, SMS, or email provider can be plugged in".

Deferred because no live provider is in scope, which means the abstraction would have
exactly one implementation and no second one in prospect. An interface designed
against a single hypothetical consumer is usually the wrong interface, and it costs
real time to write and test.

**When it should be built:** at the point the first real provider is integrated, when
its actual shape — authentication, delivery status, retry semantics, rate limits — is
known rather than imagined.

**What was done instead:** `CommunicationChannel` is a first-class domain enum stored
on tickets and comments. The data needed to route a future provider exists; only the
routing is absent.

</details>

---

## US-013 — Incoming Interaction Registration

**Status:** Deferred

Originally scoped as "register an inbound interaction against a customer or ticket
with channel and content metadata".

Deferred because it requires an inbound webhook endpoint, a provider payload
contract, webhook authentication, and a strategy for matching an inbound message to
an existing customer or ticket. Each of those is a design problem in its own right,
and all four depend on a provider that is out of scope.

**Partial coverage:** `TicketComment` with a `Channel` records an interaction that a
support user enters manually. What is missing is the automatic inbound path, not the
data model.
