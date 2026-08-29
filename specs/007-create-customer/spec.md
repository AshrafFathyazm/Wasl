# US-001 — Specification

**Phase:** 1 · **Story:** US-001 · **Feature:** `007-create-customer` · **Status:** reconciled against delivered code 2026-08-28, **awaiting review**

---

## Reconciliation — what changed under this spec since it was written

This is the **oldest** spec in the repository — it predates the spec-kit migration and still says
*Status: Complete*, meaning complete as a document. It was written as the **first write path in the
system**. It is now the sixth.

### Its opening claim is entirely superseded, and that is good news

> *"This is the first write path in the system. It establishes the validation approach, the error
> contract, and the persistence pattern that later stories follow."*

| What it claimed to establish | Established by | Effect here |
|---|---|---|
| The error contract | `002` — one `ProblemDetailsFactory`, a 17-row type registry, `errors/duplicate-customer` already in it | `007` raises an existing type; it defines nothing |
| The validation approach | `002`'s `ValidationBehaviour` + FluentValidation, first exercised by `009` | `007` writes a validator like the other five |
| The persistence pattern | `009` — command, handler, validator, one `SaveChanges` inside the pipeline's transaction, `IAuditableCommand` | `007` follows it |

So `007` is now a **small** feature: a factory, two indexes, one endpoint, two normalisers. Nothing
about it is foundational any more, and the parts that would have been hard are decided.

### Six things are now true that were not

| # | Then | Now | Effect |
|---|---|---|---|
| 1 | `Customer` would be created by this feature | The **entity exists** from `001` with private setters and **no factory** — `Customer.Create` is genuinely missing and `007` adds it. Every other feature that needed a customer inserted one by reflection or by raw SQL | The one piece of this spec that is exactly as described |
| 2 | The duplicate rule's indexes would ship with the table | `001` deliberately **left them out** and said so: *"No filtered unique indexes here. They ARE the duplicate rule (BR-4.8) rather than schema mechanics, and belong with the behaviour they enforce — feature 007."* | `007` adds both, and ADR-013 names the trap: **verify `filter_definition` comes back non-null** from `sys.indexes`, because an unfiltered index rejects the *second* customer who has no email |
| 3 | BR-4.1 would need enforcing | `CK_Customers_Contact` already exists — `001` shipped it because *"creating the table without it would allow a violating row to exist in the window before 007 lands"* | The validator produces AC-3's `400`; the constraint is the backstop. Neither is new |
| 4 | AC-14 needs a resource to `GET` | **`008` shipped `GET /api/customers/{id}` yesterday** | AC-14 is satisfiable. Had `007` come first it would have faced `009`'s dilemma — a `201` whose `Location` returns `404` — and would have had to absorb the read endpoint. **The delivery order avoided a repeat** |
| 5 | AC-15's `401` is a criterion | `004` made `RequireAuthenticatedUser` the fallback policy | Trivially true, still asserted because `AuthorizationSurfaceTests` reads endpoint **metadata** |
| 6 | Nothing normalised `email` | `008` Q-E recorded that the frozen contract calls `email` *"the normalised form (lowercased, trimmed)"* and **nothing made it true** | **`007` closes that.** The three seeded customers happen to be lowercase and E.164 already, so no data needs correcting — checked, not assumed |

### And one thing that makes AC-9 weaker than it looks

`001` gave `Customers.Email` an explicit **case-insensitive collation**
(`SQL_Latin1_General_CP1_CI_AS`), and `008` extended that to the other searched columns.

So once the unique index exists, `ALI@EXAMPLE.COM` conflicts with a stored `ali@example.com`
**whether or not the application lowercases anything.** AC-9 will pass on the collation alone.

That is not a reason to drop BR-4.2's normalisation — the contract promises a lowercased value on
read, and `008` returns whatever is stored — but it means **AC-9's test must not be the only
evidence that normalisation happens.** A separate assertion reads the stored value back and checks
it is lowercase. Recorded because a criterion satisfied by the wrong mechanism is a criterion that
stops being satisfied when that mechanism changes, and nothing points at the change.

---

## In Scope

- Creating a customer with name, email, phone, company, and notes
- Normalising email and phone before comparison and storage
- Rejecting duplicates on email and on phone
- Returning `201` with a `Location` header
- A create-customer form in the client with validation and error display — **frontend lane**

## Out of Scope

| Excluded | Reason |
|---|---|
| Update and deactivate | `017` |
| Search and list | **Delivered in `008`** |
| Customer overview with tickets | `018` |
| Merging existing duplicates | No requirement; a rule that prevents new duplicates does not imply a tool for old ones |
| Bulk import | No requirement |
| Attachments | Out of scope project-wide |
| Address fields | Not in the requirements; adding them speculatively means validating and displaying data nobody asked for |
| **Country inference for phone numbers** | See Q-B. The normaliser accepts an already-international number and refuses to guess a country code |
| **Reactivating an inactive duplicate** | BR-4.4 scopes the rule to **active** customers, and the filtered index makes that structural. So an email matching an inactive customer is accepted, which is a stated limitation rather than an oversight — reactivation is `017`'s design problem |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | A customer is a single person, not a company with contacts. `CompanyName` is a label on the person, not a relationship | The model needs a `Company` entity, which is a new story |
| A-2 | Phone numbers may be international, so E.164 is the storage format | If all customers are single-country, normalisation could be simpler — but E.164 is not wrong in that case |
| A-3 | Email is the primary contact method in practice, but the system must not require it | If phone-only customers do not exist, the invariant could be simplified |
| A-4 | Two customers sharing a name is legitimate and common | If the business wants name-based duplicate warnings, that is a soft-warning feature, not this rule |
| **A-5** | **The application check and the index are both needed** (BR-4.8) | They are, and they do different jobs: the check produces the friendly `409` naming the field, the index is what makes AC-13's race safe. Dropping the check gives a `DbUpdateException` and therefore a `500`; dropping the index gives a `409` that two simultaneous requests can both pass |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should a duplicate return the existing customer's id so the client can navigate to it? | No. It names the conflicting field only. Returning the id leaks a record the caller may not have been entitled to look up, and `008`'s search is the intended way to find it |
| Q-2 | Is a customer ever deleted? | No hard delete. `IsActive` exists and `017` exposes it |
| ~~Q-A~~ **RULED 2026-08-28** | **`CLAUDE.md`'s structure block lists `Customers/ Customer, EmailAddress, PhoneNumber`. The two value objects do not exist — `Customer` holds plain `string?` for both.** Build them, or normalise with static helpers? | **Static normalisers, not value objects — and this is a change to a documented structure, so it needs a ruling.** A value object earns its place by making an invalid instance impossible to construct. Here the entity already has private setters and will have exactly one factory, so there is one place an invalid value could enter and it is already closed. Against that, two wrappers cost an EF value converter each, a conversion on every read — `008`'s two projections, `009`'s duplicate check, `018` later — and they would carry no invariant the factory does not already enforce. **If the ruling goes the other way**, the cost is one converter per type and the projections in `008` change shape, which is a frozen contract's worth of churn for no behavioural difference |
| ~~Q-B~~ **RULED 2026-08-28** | **How much phone normalisation?** BR-4.3 says "E.164 (leading `+`, digits only)". True E.164 requires knowing the country for a local number | **Strip spaces, dashes, parentheses and dots; accept the result only if it is `+` followed by 8–15 digits; otherwise `400` naming `phone` (AC-7).** No country inference and no `libphonenumber`: guessing that `0501234567` is Saudi would be a business rule nobody has stated, and getting it wrong writes a wrong number into a record whose whole purpose is being reachable. **The consequence is stated rather than hidden:** a user who types a local number gets a `400` telling them to include the country code, and `017` can revisit it with a stated default region |
| **Q-C** | AC-13 asks for a real concurrency test: two simultaneous identical requests, one `201` and one `409` | **Write it, and it is the first test in this project to exercise that row of `CLAUDE.md`'s checklist.** `009` recorded `POST /api/tickets` as **not idempotent** with no owner; here the index *is* the owner, so the claim is testable. The `409` must come from the caught unique-index violation, not only from the pre-check — which is exactly what a race defeats |
| ~~Q-D~~ **RULED 2026-08-28** | Does the `409` from the **index** look like the `409` from the **check**? | **It must, and that is a design constraint rather than a nicety.** A client cannot tell which of two racing requests it was, so the two paths have to produce the identical body — same `type`, same `errors` key. That means catching `DbUpdateException`, identifying the index by name, and raising the same `DuplicateValueException` the pre-check raises |

## Architectural ruling — Q-A, recorded before implementation

**`EmailAddress` and `PhoneNumber` value objects are NOT built. Normalisation is two static
methods on `ContactNormalisation` in `Wasl.Domain/Customers/`.**

Ruled by the product owner 2026-08-28. Recorded here as a decision rather than as a working
assumption, because it contradicts a documented structure and a later reader will otherwise treat
the document as the requirement.

**The argument that decided it.** A value object earns its place by making an invalid instance
impossible to construct. Here `Customer` already has private setters and exactly one factory, so
there is a single place an invalid value can enter and it is already closed. Two wrappers would
add nothing that `Customer.Create` does not already enforce.

**The cost they would have carried.** An EF value converter per type, and a conversion on every
read — `008`'s two projections, `009`'s duplicate lookup, `018` later. Real work, on every request
that reads a customer, to move a validation one call earlier than it already is.

**Two documents said otherwise and are corrected in this commit, not later:**

| Where | Was | Now |
|---|---|---|
| `CLAUDE.md`, project structure | `Customers/  Customer, EmailAddress, PhoneNumber` | `Customers/  Customer, ContactNormalisation`, with a one-line reason |
| `docs/sdd/12-delivery-log.md` | — | A dated row giving the reason, **so nobody adds the two types later on the grounds that the structure asks for them** |

That second row is the point of writing this down. `CLAUDE.md` is read at the start of every
session; a file that describes something which does not exist is the same failure `009` and `011`
both hit in their own planning artifacts, and it is cheaper to correct than to explain twice.

---

## Acceptance Criteria

AC-1 … AC-17 keep their numbers. **AC-18 and AC-19 are added by this reconciliation.**

| # | Criterion |
|---|---|
| AC-1 | `POST /api/customers` with a name and at least one contact method returns `201` with a `Location` header pointing at the new resource |
| AC-2 | A missing or whitespace-only `fullName` returns `400` with a field-level error naming `fullName` |
| AC-3 | A request with neither `email` nor `phone` returns `400` naming both fields (BR-4.1) |
| AC-4 | Email is trimmed and lowercased before storage; `"  Ali@Example.COM  "` is stored as `ali@example.com` (BR-4.2) |
| AC-5 | A syntactically invalid email returns `400` |
| AC-6 | **Formatting characters are removed from a phone number — spaces, dashes, parentheses and dots — and the remainder is accepted only if it is already international: a leading `+` followed by 8–15 digits** (BR-4.3). `"+966 (50) 123-4567"` is stored as `+966501234567`. **No country code is inferred and no country-aware conversion is attempted** — a local number such as `0501234567` has its formatting stripped, fails the international check, and becomes AC-7's `400`. See the ruling on Q-B |
| AC-7 | A phone that cannot be normalised returns `400` naming `phone`, **not** `409` (BR-4.3) |
| AC-8 | A normalised email matching an existing **active** customer returns `409` `errors/duplicate-customer` naming `email` (BR-4.4, BR-4.7) |
| AC-9 | The duplicate check is case- and whitespace-insensitive: `ALI@EXAMPLE.COM` conflicts with a stored `ali@example.com` |
| AC-10 | The same behaviour for a matching normalised phone (BR-4.5) |
| AC-11 | Two customers with the same `fullName` and different contact details are both created (BR-4.6) |
| AC-12 | The `409` response does not include the existing customer's id or any other detail (BR-4.7) |
| AC-13 | A unique database index enforces both rules, so two concurrent identical requests produce one `201` and one `409` (BR-4.8) |
| AC-14 | The created customer can be retrieved at the URL in the `Location` header |
| AC-15 | A request without a valid token returns `401` |
| AC-16 | The client form shows field-level validation before submitting, a loading state while submitting, and the server's message on `409` — **frontend lane** |
| AC-17 | Submitting the form twice quickly produces one request — **frontend lane** |
| **AC-18** | **Both unique indexes are filtered, and `filter_definition` comes back non-null from `sys.indexes`** — asserted by querying the database, not by reading the configuration. ADR-013 names this as one of four provider-coupled points that fail **quietly**: an unfiltered unique index rejects the *second* customer who has no email, with a `409` that is correct-looking and wrong. The filter must also include `IsActive = 1`, because BR-4.4 scopes the rule to active customers |
| **AC-19** | **The stored email is lowercase, read back from the database** — separately from AC-9. `Customers.Email` already carries a case-insensitive collation, so AC-9 passes on the collation alone whether or not the application normalises anything. Without AC-19, BR-4.2 would be a rule nothing verifies, and the contract's promise that `email` is returned normalised would rest on data that happens to have been entered in lower case |

## Edge Cases

From `testing/edge-cases.md`: empty string, whitespace-only, exactly at maximum length, one over,
unicode in a name, mixed-case email, phone with formatting characters, unparseable phone, `null`
versus omitted, unknown field in the body, malformed JSON, two simultaneous identical creations,
double-submitted form.

Specific to this story:

| Case | Expected |
|---|---|
| Email matching an **inactive** customer | Created. BR-4.4 scopes the rule to active customers and the filtered index makes that structural. A stated limitation — reactivation is `017`'s problem |
| Email valid but 320 characters | Accepted; 321 returns `400` |
| Name of 200 characters | Accepted; 201 returns `400` |
| Both email and phone duplicate a record | `409`; the response names `email` first and stops. One conflict is enough to act on |
| **A phone-only customer, then a second phone-only customer with a different number** | Both created. **This is the case an unfiltered index breaks** — with `Email` null on both rows, an unfiltered unique index on `Email` sees two nulls as a duplicate on SQL Server and rejects the second. AC-18 exists for this row |
| **A local phone number, `0501234567`** | `400` naming `phone`. Q-B: no country is inferred |
| **Two simultaneous identical requests** | One `201`, one `409`, and **the two `409` bodies are indistinguishable** — the one from the pre-check and the one from the index violation (Q-D) |
| **A duplicate arriving while the first request is still in its transaction** | The second blocks on the index and then gets `409`. It must not get a `500`, which is what an uncaught `DbUpdateException` produces |

## Rules Referenced

BR-4.1 – BR-4.8, BR-6 (create is permitted for both roles, so this feature has **no `403` path**),
BR-9.1 (the create writes an audit row through the existing pipeline), ADR-013 (the filtered-index
trap, and `nvarchar` for every human-written field).

**BR-7.6 removed** from the list. It was cited "only to note it is deferred to US-002", and US-002
shipped as `008` — a rule this feature neither uses nor defers no longer belongs in its references.
