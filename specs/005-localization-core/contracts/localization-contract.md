# Contract — Localization

**Feature:** `005-localization-core` · **Status:** FROZEN 2026-08-23 ·
**Lanes:** backend implements · frontend consumes · **every other feature inherits**

This is a **shape** contract, not an endpoint contract. `005` adds no route to the
inventory in `docs/sdd/05-api-conventions.md`. What it freezes is how *every* request in
this system asks for a language and how *every* response says which one it got — so the
feature that adds `POST /api/tickets` does not have to decide any of it again.

Any change goes through **Contract changes** in [`plan.md`](../plan.md) first.

## Conventions inherited

- **Base:** `{{baseUrl}}/api` · errors are RFC 7807 `ProblemDetails` (`002`)
- `200` is never returned with an error in the body
- Timestamps are UTC ISO 8601 with a `Z`; **formatting for display is the client's job,
  in the client's locale** — the server never formats a date for a human

---

## Request side — how a caller asks for a language

Three inputs, applied in this order. The first one that yields a **supported** culture
wins (BR-8.4, BR-8.5).

| # | Input | Example | Who sets it |
|---|---|---|---|
| 1 | `?culture=` query parameter | `GET /api/tickets?culture=ar` | A human testing, or a shared link (BR-8.5) |
| 2 | The preferred-language **claim** in the JWT | `"preferred_language": "ar"` | `004` issues it; `014` lets a user change it |
| 3 | `Accept-Language` request header | `Accept-Language: ar` | The frontend, on every call, from the active locale |
| 4 | *(fallback)* | — | `en` (BR-8.1) |

```http
GET /api/tickets HTTP/1.1
Authorization: Bearer <JWT>
Accept-Language: ar
```

### Rules that hold for every endpoint

| Rule | Detail |
|---|---|
| A query parameter beats a claim beats a header | BR-8.4. A stored preference is a deliberate choice; the header is the browser's guess (BR-8.5) |
| Region resolves to language | `ar-EG`, `ar-SA` → `ar`; `en-GB`, `en-US` → `en` (BR-8.2). No per-region catalogue exists |
| An unsupported locale is **not** an error | `fr`, `de`, `zh` → English content, **`200`** (BR-8.3, FR-5.8) |
| A malformed value is ignored, not rejected | `Accept-Language: !!!`, `?culture=`, an empty claim → fall through to the next input. **Never a `400`** |
| Case does not matter | `AR`, `ar`, `Ar` all resolve to `ar` |
| No cookie is consulted | `CookieRequestCultureProvider` is deliberately removed. A cookie is not one of BR-8.4's four sources, and left in place it would outrank both the claim and the header (`research.md` R-6) |
| Resolution costs no database query | The language is a claim, not a row (ADR-007 decision 4). Asserted by `TEST-005-06` |

---

## Response side — how a response says which language it is in

**Every response carries `Content-Language`**, naming the locale that was actually
applied — not the one that was requested.

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json
Content-Language: ar
```

| Value | Meaning |
|---|---|
| `en` | English was applied — either asked for, or fallen back to |
| `ar` | Arabic was applied |

The value is always a **neutral** culture name. A request for `ar-EG` is answered
`Content-Language: ar`, because `ar` is what was applied (AC-8).

### Every status code, and what this contract says about it

| Code | `Content-Language` | Localized parts | Note |
|---|---|---|---|
| `200` | yes | any server-authored message in the body | Data is never translated (BR-8.10) |
| `201` | yes | — | `Location` is a URL, never localized |
| `204` | yes | — | No body; the header still names the locale |
| `400` | yes | `title`, `detail`, every **value** in `errors` | Every **key** in `errors` is untranslated |
| `401` | yes | `title`, `detail` | Only true because localization is registered **before** `UseAuthorization()` (`research.md` R-5). AC-12 |
| `403` | yes | `title`, `detail` | Same. The permission decision is not locale-dependent; the sentence about it is |
| `404` | yes | `title`, `detail` | |
| `409` | yes | `title`, `detail`, `errors` values | `type` distinguishes the cause and never changes (`05-api-conventions.md`) |
| `500` | yes | `title` | `detail` carries no stack trace, SQL, exception type, or connection string — in either language |

**There is no status code that localization can produce.** Asking for a language the
system does not speak yields content, not an error (BR-8.3). If a request ever returns
`400` because of a culture value, that is a defect in this contract's implementation.

---

## What the server localizes

| Localized | Owner | Rule |
|---|---|---|
| `ProblemDetails.title` | Server | BR-8.6 |
| `ProblemDetails.detail` | Server | BR-8.6 |
| Every **value** inside `errors` | Server | BR-8.6 |

That is the complete list. The server authors sentences about failures; it authors nothing
else a human reads. Labels, buttons, headings, empty states, and enum display names are
the client's (BR-8.8, ADR-007 decision 2) — the rejected alternative was the server
returning display strings, which costs a round trip to render a button and couples UI copy
to a backend deployment.

---

## What is NEVER localized — exhaustively, with the reason for each

This table is the contract. Every row is a thing a well-meaning change could translate,
and each reason is why it must not.

| Never localized | Reason |
|---|---|
| `ProblemDetails.type` | The identifier the client branches on. A client branching on `type` keeps working in Arabic; one branching on `title` was already broken (BR-8.7, constitution IV) |
| The **keys** of `errors` | They are request field names, and field names are part of the API contract. Translating `email` to `البريد` would mean the client cannot attach the message to the input it belongs to |
| Enum values on the wire — `InProgress`, `Email`, `Manager` | An identifier, and it is **stored as text** in `TicketHistory`. Translating it would make persisted data locale-dependent, break every filter, and corrupt history written under a different request locale (ADR-007 decision 3) |
| `TicketNumber` — `TCK-2026-000042` | Read aloud on the phone, pasted into email, and searched for against the stored value. In Arabic-Indic digits it is none of those things (BR-8.13, ADR-007 decision 7) |
| `traceId` | An identifier, and it must match the log entry byte for byte or it is useless during an incident |
| All identifiers — `Guid`, `id`, `Location` header values | Machine-readable |
| **Resource keys** themselves — `Error.DuplicateCustomer.Email` | They are code. Symbolic keys are the point of ADR-007 decision 5; a key that reached a user is the failure AC-16 exists to catch |
| Log messages | Read by engineers, not users. A log that changes language with traffic cannot be searched (BR-8.9). Asserted by AC-18 |
| `AuditLog` content | Forensic record, read by engineers (BR-9.10). Same reason, higher stakes |
| `GET /health` — `status`, `checks[].name`, `checks[].description` | Consumed by tooling and by CI, not by a person (`001/contracts/health-api.md`) |
| `Content-Language` itself | An HTTP token from the IANA registry |
| Digits in an identifier, in any locale | ADR-007 decision 7. Arabic-Indic digits are correct Arabic typography and wrong for anything that is copied, pasted, or searched |
| Content a user typed — customer name, subject, description, comment, notes | BR-8.10, FR-5.7. Stored and returned verbatim, rendered with `dir="auto"`. Machine translation of free text is a different product |

**The check a reviewer can run in one minute:** issue the same request twice, once with
`Accept-Language: en` and once with `ar`, and diff the two responses. Everything that
differs must be a human sentence. Everything else being byte-identical is AC-13.

---

## The server catalogue this feature ships

Keys are symbolic (ADR-007 decision 5). `SharedResource.resx` is English **and** is the
neutral-culture fallback (`research.md` R-3); `SharedResource.ar.resx` is Arabic.

| Key | `en` |
|---|---|
| `Error.Validation.Title` | One or more validation errors occurred. |
| `Error.Validation.Detail` | See the errors property for field-level messages. |
| `Error.Unauthenticated.Title` | Authentication is required. |
| `Error.Forbidden.Title` | You do not have permission to perform this action. |
| `Error.NotFound.Title` | The requested resource was not found. |
| `Error.Conflict.Title` | The request conflicts with the current state. |
| `Error.Internal.Title` | An unexpected error occurred. |
| `Diagnostics.FallbackProbe` | English fallback probe. Do not translate; do not remove. |

Seven keys plus one probe — exactly the generic `ProblemDetails` titles the status-code
table in `docs/sdd/05-api-conventions.md` requires, and nothing speculative.

**Feature-specific keys are added by the feature that raises them**, per ADR-007 decision
2. `Error.DuplicateCustomer.Email` arrives with `007`; `Error.InvalidStatusTransition`
with `012`. This feature does not pre-create keys for messages nobody sends yet — the
parity test would then be guarding empty strings.

### `Diagnostics.FallbackProbe` — the one deliberate parity exemption

Present in English only, by design, and named in the parity test's exemption list. It
exists so BR-8.12's runtime English fallback can be **demonstrated** (AC-15), which is
otherwise impossible: the parity test guarantees no real key is ever missing.

One documented exemption beats a safety net nobody has seen catch anything.

---

## Frontend obligations this contract creates

| Obligation | Where |
|---|---|
| Send `Accept-Language` on every request, from the active locale, set once | `FRONTEND-API-GUIDE.md`; AC-31 |
| Read `Content-Language` and warn in development on a mismatch — never show the user an error, because falling back is legitimate (BR-8.3) | AC-31, `research.md` R-15 |
| Branch on `type`, never on `title` | `FRONTEND-API-GUIDE.md` |
| Render server messages as received; never re-translate or map them | Doing so would put the same sentence in two catalogues |
| Render `TicketNumber`, enum values, and identifiers without formatting them | Passing an identifier through a number formatter is how Arabic-Indic digits get in (AC-27) |

---

## Deliberately not in this contract

| Not here | Why |
|---|---|
| `PUT /api/me/language` | `014`. This contract is how a locale is *negotiated per request*; that endpoint is how a *preference is stored* |
| A `GET /api/locales` discovery endpoint | Two locales, both known at build time on both sides. It would be a round trip to learn something the bundle already contains |
| `Vary: Accept-Language` | Correct in front of a shared cache, and there is no shared cache: one deployable, no CDN, no reverse-proxy caching (ADR-002). Add it the day one appears — recorded so it is a decision rather than an oversight |
| A `Content-Language` on `GET /health` | It is outside `/api` and consumed by machines (`001/contracts/health-api.md`). No harm if the middleware sets it; nothing asserts it |
| Localized `Retry-After`, `WWW-Authenticate`, or any other header value | HTTP tokens, not sentences |

---

## Verification

| What | How |
|---|---|
| The resolution order, all four levels | `TEST-005-01` … `TEST-005-05` |
| `Content-Language` on seven status codes | `TEST-005-07`, using **test-only** probe endpoints registered by the test host, never in `Program.cs` — `005` ships no route of its own, and the header must be provable on codes no real endpoint returns yet |
| `401` and `403` localized (the ordering consequence) | `TEST-005-08` |
| The never-localized table, byte-for-byte | `TEST-005-09` — the same request in `en` and `ar`, diffed |
| Catalogue parity, both sides, failing the build | `TEST-005-10`, `TEST-005-12`; observed failing in CI (AC-32) |
| `ResourceNotFound == false` for every shipped key | `TEST-005-10` |
| This contract matches what was built | Compared against the generated OpenAPI document before the feature closes. `Content-Language` is a response **header** on every operation, so its absence from the generated document is itself a finding |
