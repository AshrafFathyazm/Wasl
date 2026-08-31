# 034 — Ticket Detail · BACKEND

**Phase:** 5 · **Lane:** Backend only · **Status:** spec, awaiting review
**Driven by:** `Wasl Ticket Details v3.dc.html`, supplied 2026-08-31
**Consumer:** `027-ticket-detail` — the frontend cannot start on the redrawn screen
until this lands

---

## 1 · What this is

The v3 ticket-detail design asks the backend for six things it does not do. This builds
them.

It exists as its own backend feature rather than inside `027` because five of the six
touch the **domain or the frozen contracts** — one of them reverses a ruling `013` made
on purpose — and a screen feature that quietly changes an aggregate is how a UI change
becomes a data-model change nobody reviewed.

## 2 · What the design asked for and is NOT being built

Ruled by the product owner 2026-08-31, before any code.

| Asked for | Ruling |
|---|---|
| **SLA** — first-response met, resolution countdown, progress bar, near-breach and breached states, the red banner | **Removed from the design.** `00-project-context.md` excludes the SLA engine by name, and gives the reason: *an SLA clock that is wrong is worse than none, because it reports compliance that did not happen.* BR-3.1: escalation is manual, never time-driven |
| **`@` mentions** | **Out.** `00-project-context.md`: *"Mentions and presence are a messaging product."* A mention with no notification pipeline is decoration |
| **Merge with another ticket** | **Out.** In no requirement, and it is a destructive two-aggregate operation |

These three are recorded here so the next person to open the `.dc.html` does not read
them as a backlog.

## 3 · Six changes, and the one that is a reversal

### 3.1 · A customer can be the author of a comment — **domain change**

The design shows a comment **from the customer**, badged العميل. Today that cannot exist:

```csharp
TicketComment.AuthorUserId   // Guid, NOT NULL
    → FK_TicketComments_Author → dbo.SupportUsers
```

**The customer never signs in** — there is no customer authentication and it is out of
scope — so the message reaches us through a channel and a support user records it.
Ruled: **the agent records the customer's reply.**

That gives two distinct people on one row, and both are real:

| Column | Meaning |
|---|---|
| `AuthorKind` | `Agent` · `Customer`. **An explicit discriminator, not an inference** |
| `AuthorUserId` | **Stays NOT NULL.** The support user who wrote it, or who recorded it |
| `AuthorCustomerId` | The customer it is *from*. Null when `AuthorKind = Agent` |
| `Channel` | Already exists and is already nullable — **this is what it was for** |

`AuthorUserId` staying non-nullable is the load-bearing part. ADR-005 rejects a fake
actor by name, and `004`'s four settings exist so `dbo.AuditLog` never says "someone".
A customer-authored comment still has a support user who caused the write, and the audit
row must name them. **Making `AuthorUserId` nullable would put a NULL actor back into the
audit trail** — the exact defect `011` found and fixed.

Three invariants, in the domain, not in a validator:

- **A customer comment can never be internal.** `IsInternal` means *hidden from the
  customer* (BR-5.4). A comment *from* the customer, hidden from them, is nonsense.
- **The customer must be the ticket's own customer.** Recording a reply from an unrelated
  customer is a data-integrity hole that reads as a feature.
- **A customer comment requires a `Channel`.** They reached us somehow; "unknown" is a
  worse answer than a required field.

### 3.2 · The timeline splits into two feeds — **this reverses `013`**

```
design:    التعليقات (12)  |  السجل (88)     two tabs, two counts
today:     GET /timeline                     ONE union, cursor-paged
```

`013` merged comments and history deliberately, and `CLAUDE.md` records the merged
timeline and its cursor as a considered decision. **This spec reverses that half of it,
and the reversal goes under *Contract changes* in `plan.md` — it is not edited away.**

What does **not** change: the cursor. `CLAUDE.md`'s two-pagination-shapes rule stands —
a feed grows at the end the reader is looking at, so a page number would skip or repeat
entries. Each tab is a cursor feed.

What is new is the **counts**, and they are the part with a trap: a cursor gives
`hasMore`, never a total. Two `COUNT`s per request, and `factory.CountQueries()` asserts
the request issues a fixed number of round trips over a small result set **and the same
number over a larger one** — `008`'s tool, because "it does not count per row" is
measurable and an argument from the LINQ is not.

### 3.3 · `CompanyName` on the ticket's customer summary

`TicketCustomerSummary(Id, FullName, Email)` — the design renders *مؤسسة الرياض للتجارة*
under the customer's name. The column exists on `Customer` already. One field.

### 3.4 · `ClosedAtUtc` on the detail response

On the entity, absent from `CreateTicketResult`. The design's closed state shows
*أُغلقت 30/08/2026 · 14:02*.

### 3.5 · The customer's other tickets

The rail lists two other tickets and *ثلاث تذاكر أقدم*. `GET /api/tickets` has no
`customerId` filter. **`015` owns filters** — this adds that one parameter and says so,
rather than inventing a sub-resource that `015` would then have to reconcile.

### 3.6 · Tags, and canned replies

Both ruled **in** 2026-08-31. Both are new tables.

- **Tags** — `dbo.Tags` + `dbo.TicketTags`. Attaching and detaching are auditable
  actions. Tag names are user content in Arabic, so `nvarchar` with an explicit CI
  collation — the same defect `008` fixed on the customer search columns, where two
  thirds of the surface was case-insensitive by luck of the server.
- **Canned replies** — `dbo.CannedReplies`, read-only. The design scopes them to the
  ticket's **category** (*ردود جاهزة · الفاتورة*), which is the whole reason they are
  useful; a flat list of every template is a list nobody opens twice.

## 4 · In scope

- `TicketComment` gains `AuthorKind`, `AuthorCustomerId`; three domain invariants
- `POST /api/tickets/{id}/comments` accepts a customer-authored reply
- `GET /api/tickets/{id}/timeline` gains `?type=comments|history`, and counts
- `TicketCustomerSummary.CompanyName`; `ClosedAtUtc` on the detail response
- `GET /api/tickets?customerId=`
- `dbo.Tags`, `dbo.TicketTags`, attach/detach endpoints, audit rows
- `dbo.CannedReplies`, `GET /api/canned-replies?category=`
- Migrations for all of it, and the `--provision` grants that go with new tables
- Every new server-authored message in `en` + `ar`, parity-gated
- The frozen contracts updated in both directions, `002c`'s comparison green

## 5 · Out of scope

| Excluded | Why |
|---|---|
| SLA, mentions, merge | §2 |
| Customer authentication or a portal | Out of product scope; §3.1 is what replaces it |
| Editing or deleting a comment | No endpoint exists and none is asked for. An append-only feed is the audit story |
| `021 ICommunicationProvider` ingesting messages | Spec-only, unbuilt. §3.1 deliberately does not depend on it |
| Tag colours | The design tints three tags. Colour from a palette is a frontend concern until someone asks to choose one |

## 6 · Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | A customer-authored comment stores `AuthorKind = Customer`, a non-null `AuthorCustomerId`, **and a non-null `AuthorUserId`** naming the support user who recorded it |
| AC-2 | `dbo.AuditLog` names that support user as the actor. **Asserted by reading the actor columns, not by counting rows** — `011`'s defect was NULL on every row while the count was right |
| AC-3 | A customer comment with `isInternal: true` is refused by the **domain**, and the refusal is asserted against `Ticket`/`TicketComment` directly, not only through HTTP |
| AC-4 | A customer id that is not this ticket's customer is refused |
| AC-5 | A customer comment with no `channel` is refused; an agent comment with one is accepted |
| AC-6 | `Body` still never reaches `dbo.AuditLog` — `003`'s redaction re-asserted, because this is the first change to that entity since it was written |
| AC-7 | `?type=comments` returns only comments, `?type=history` only history, and **no entry appears in both** — asserted by identity across the two responses |
| AC-8 | Omitting `type` returns the union, unchanged. `013`'s existing tests stay green untouched |
| AC-9 | **No entry appears twice across two consecutive pages of either feed**, asserted by identity. `013` found exactly this defect and counting entries passed on it |
| AC-10 | The counts are correct with internal comments present, and `CountQueries()` returns the **same** number over a small and a large result set |
| AC-11 | `companyName`, `closedAtUtc` present on the detail response — `closedAtUtc` null on an open ticket and **the key still present**, because absent renders empty and passes |
| AC-12 | `GET /api/tickets?customerId=` filters, clamps per BR-7.2, and issues no query per row |
| AC-13 | Attaching and detaching a tag each write an audit row in the same transaction |
| AC-14 | Two tags differing only in case are the same tag — asserted against a real SQL Server, since the collation is the mechanism |
| AC-15 | Canned replies are scoped by category; an unknown category returns an empty list, never every template |
| AC-16 | A comment on a `Closed` ticket is `409`, customer-authored or not. BR-1: `Closed` is terminal |
| AC-17 | The generated OpenAPI matches the frozen contracts in both directions |
| AC-18 | Every AC maps to a named test and the run output is recorded in `tests.md` |

## 7 · Open questions

| # | Question | Why it blocks | Working assumption |
|---|---|---|---|
| Q-1 | Does recording a customer reply move the ticket's status? The design's history shows *"النظام غيّر الحالة من بانتظار العميل إلى قيد التنفيذ بعد ردّ العميل"* — an automatic transition | It is a **second writer** of ticket status, and BR-1 has one map | **No automatic transition in this feature.** The history row in the drawing is labelled *النظام*, and there is no system actor — ADR-005 rejects one. Auto-transition is its own feature with its own ruling |
| Q-2 | Does the comment count include internal comments? | Two readers could see different totals for the same ticket | **Yes, it counts them.** Every consumer of this API is support staff; there is no customer-facing read path to protect. Revisit only if one is built |
| Q-3 | Are tags free text, or chosen from a managed set? | Free text becomes forty spellings of one tag; a managed set needs an admin screen nobody has specified | **A managed set, seeded, with no admin UI this feature.** `--seed` provides the starting tags; adding one is a database action for now, and that limitation is stated rather than hidden |
| Q-4 | Who may detach a tag — anyone, or a Manager? | It is the first genuinely Manager-only candidate, and `ManagerOnly` still has no production consumer | **Anyone assigned to the ticket, plus any Manager.** Ruled here rather than defaulted, because BR-6's split decides whether it is a policy or a handler check |
| Q-5 | Does `CLAUDE.md` still list `Communications/Interaction`? | It does, and **that file has never existed** — the folder holds only `CommunicationChannel.cs`. Found while answering §3.1 | **Corrected as documentation drift**, in this feature's commit. It is not a missing entity; it is a structure diagram describing something never built — the same shape as the `EmailAddress`/`PhoneNumber` note already in that file |
