# Contract — Auth

**Feature:** `004-auth-and-roles` · **Story:** Auth · **Status:** FROZEN 2026-08-23 ·
**Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in [`plan.md`](../plan.md)
first — see `docs/sdd/openapi/README.md`.

**This contract has two halves.** The first is one endpoint. The second — *How every
other endpoint consumes the token* — is inherited by every endpoint in the product, so
it is frozen here once instead of restated in twelve contracts.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Content-Type:** `application/json`
- Timestamps are UTC, ISO 8601, `Z` suffix
- Identifiers are `Guid` strings. Enums are strings on the wire
- Errors are RFC 7807 `ProblemDetails` from the shared middleware owned by `002`.
  **`200` is never returned with an error in the body** (`docs/sdd/05-api-conventions.md`)
- `Content-Language` on every response names the locale that was actually applied

---

## `POST /api/auth/token`

Exchanges an email and password for a signed JWT. **The only endpoint besides
`GET /health` that does not require a token** (FR-4.1).

### Request

```json
{
  "email": "manager@wasl.local",
  "password": "<the configured seed password>"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `email` | `string(1..320)` | **yes** | Trimmed and lowercased by the server before lookup. Must be a syntactically valid email address, or `400` |
| `password` | `string(1..256)` | **yes** | Sent as typed. Never trimmed — leading and trailing spaces are part of a password. Never logged, never echoed, never stored (BR-9.7) |

There is no `rememberMe` field. *Remember me* on the screen chooses where the **client**
keeps the token; the server issues the same token either way, with the same lifetime.

### `200 OK`

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4ZjFjMmQzNC01Njc4LTRhYmMtOWRlZi0wMTIzNDU2Nzg5YWIiLCJlbWFpbCI6Im1hbmFnZXJAd2FzbC5sb2NhbCIsInJvbGUiOiJNYW5hZ2VyIiwicHJlZmVycmVkX2xhbmd1YWdlIjoiYXIifQ.<signature>",
  "tokenType": "Bearer",
  "expiresAtUtc": "2026-08-23T20:00:00Z",
  "user": {
    "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
    "fullName": "Support Manager",
    "email": "manager@wasl.local",
    "role": "Manager",
    "preferredLanguage": "ar"
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `accessToken` | `string` | Signed JWT, HS256. **Opaque to the client** — see below |
| `tokenType` | `"Bearer"` | Constant. Present so the client composes `Authorization: ${tokenType} ${accessToken}` rather than hard-coding the scheme |
| `expiresAtUtc` | ISO 8601 UTC | Equals the token's `exp`. **Issued so the client never has to decode the JWT** |
| `user.id` | `Guid` | Equals the token's `sub` |
| `user.fullName` | `string(..200)` | For the shell's user block and avatar initials. **Not in the token** — it is display data, and a JWT is sent on every request |
| `user.email` | `string` | Normalised: trimmed, lowercased |
| `user.role` | `"Agent"` \| `"Manager"` | Untranslated in every locale (BR-8.7). The client translates the label, never the value |
| `user.preferredLanguage` | `"en"` \| `"ar"` | The client applies it immediately (AC-30) |

**Nothing in this response carries the password hash**, and no other endpoint in the
product ever returns it (AC-1).

**The client must treat `accessToken` as opaque.** Everything the UI needs is in
`expiresAtUtc` and `user`. A client that decodes the JWT to read `role` starts depending
on the claim names, which are a server-side detail, and gains a JSON parser pointed at
attacker-influenced input for no benefit.

#### The claims inside the token

Frozen because `005-localization-core` reads one of them and the audit writer reads three.

| Claim | Value | Consumed by |
|---|---|---|
| `sub` | `user.id` | `ICurrentUser`, the audit row's `ActorUserId` |
| `email` | `user.email` | The audit row's `ActorEmail` (BR-9.6) |
| `role` | `Agent` \| `Manager` | The `ManagerOnly` policy, the audit row's `ActorRole` |
| `preferred_language` | `en` \| `ar` | `005`'s culture provider (ADR-007 §4) — **it is issued here, one feature before its consumer, because adding a claim later means reissuing every live token** |
| `jti` | `Guid` | Nothing yet. Present so a revocation list has something to name if one is ever built |
| `iss`, `aud` | Configured values | Validated on every request |
| `iat`, `exp` | Unix seconds | `exp - iat` is exactly 28 800 (8 hours) — AC-3 |

Claim **names** are part of this contract: `sub`, `email`, `role`,
`preferred_language`. They are not the WS-Federation URIs that the Microsoft handlers
substitute by default, and the inbound map is turned off so they survive validation
(`research.md` R-2, AC-6).

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `email` or `password` missing, empty, or whitespace; `email` not a valid address; either field over its maximum |
| `401` | `errors/unauthenticated` | Unknown email, wrong password, **or an inactive user** — one response for all three |

#### `400` — validation

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/auth/token",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "password": ["'password' must not be empty."]
  }
}
```

A blank password is `400`, not `401`. The distinction is real: `400` says the request was
not usable, `401` says the credentials were not accepted. Returning `401` for an empty
field would tell the client to redirect to sign-in from the sign-in screen.

#### `401` — rejected credentials

```json
{
  "type": "https://wasl.local/errors/unauthenticated",
  "title": "Email or password is incorrect.",
  "status": 401,
  "instance": "/api/auth/token",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

**One body for three causes** — unknown email, wrong password, inactive account — and
identical apart from `traceId` (AC-4). No `errors` object, because a field-level message
would name which field was wrong, which is the enumeration this shape exists to prevent.
No `WWW-Authenticate` header: this endpoint is not a bearer-protected resource, it is the
thing that issues bearers.

An inactive account returning `401` rather than `403` is deliberate. `403` would confirm
that the email exists, turning the endpoint into a user directory.

**What this response does not do:** it does not count attempts, delay, or lock out. There
is no rate limiting (ADR-005, and it is named there as the most serious gap). A client may
send as many as it likes. Each writes one `Auth.LoginFailed` audit row, which records the
attack without slowing it.

### What stays identical in every locale

`title` and `detail` are translated (BR-8.6). These are not (BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| The keys of `errors` | Request field names, part of this contract |
| `tokenType`, `user.role`, `user.preferredLanguage` | Identifiers and enum values, not labels |
| `traceId`, `accessToken`, `user.id` | Identifiers |

---

## How every other endpoint consumes the token

Inherited by every endpoint in the product. A feature contract may narrow the role
required; it may not restate or vary anything below.

### The request

```http
GET /api/tickets HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Accept-Language: ar
```

`Authorization: Bearer <accessToken>`, on **every** call except the two below.

| Path | Auth |
|---|---|
| `GET /health` | **Anonymous.** No token, no audit row (AC-20) |
| `POST /api/auth/token` | **Anonymous** |
| everything else, present and future | **Token required** |

That list is not a convention. Authentication is the application's fallback policy, so an
endpoint added without any authorization metadata is protected; the two above opt out by
name, and an enumeration test asserts the anonymous set is exactly those two (AC-10). An
endpoint that appears public is a failing test, not a discovery.

### `401 Unauthorized`

```json
{
  "type": "https://wasl.local/errors/unauthenticated",
  "title": "Authentication is required.",
  "status": 401,
  "instance": "/api/tickets",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

Returned, with a `WWW-Authenticate: Bearer` header, for every one of these:

| Cause | Note |
|---|---|
| No `Authorization` header | |
| `Authorization` present but not `Bearer` | |
| `Bearer` with an empty or malformed token | Never `500` |
| Signature invalid, or signed with another key | AC-8 |
| `alg` is `none`, or any algorithm other than HS256 | AC-8. The permitted algorithm is pinned, not inferred from the token |
| `exp` in the past | **`ClockSkew` is zero**, so at `exp + 1s`, not `exp + 5m01s` (AC-9) |
| `iss` or `aud` does not match | A token minted for another audience is not this application's token |
| Two `Authorization` headers | No attempt is made to pick one |

**The body never says which.** The distinction between "expired" and "bad signature" goes
to the server log, keyed by the same `traceId` (NFR-4).

**A valid token for a user who has since been deactivated or deleted is accepted** until
it expires. Nothing re-reads the row per request (ADR-007 §4 put the claim in the token to
avoid exactly that query). This is the revocation gap of ADR-005 in another suit and it is
listed as a known limitation, not mitigated by a half-measure.

Every `401` writes one `Auth.Unauthenticated` audit row, `Outcome = Denied`, whose
`TraceId` equals the `traceId` above (BR-9.2, BR-9.9, AC-17, AC-19).

### `403 Forbidden`

```json
{
  "type": "https://wasl.local/errors/forbidden",
  "title": "You do not have permission to perform this action.",
  "status": 403,
  "instance": "/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab/escalate",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

Authenticated, not permitted (BR-6). Two sources, one response shape:

| Source | Decided by | Examples |
|---|---|---|
| **Role-only rules** | An authorization policy at the boundary | Reassign to another user (BR-2.1), escalate (BR-3.2), change priority directly, read the audit log (BR-9.11) |
| **Data-dependent rules** | The handler, via `ICurrentUser`, because the boundary does not have the data | "Is this Agent the assignee?" (BR-2.2, BR-2.3, and the status rules of BR-6) |

The policy for the first group is `ManagerOnly`. Its consumers arrive with `011`, `016`,
and `019`; the policy and its tests exist here (AC-7, AC-18).

**A `403` is never a `404`.** All support users may see all tickets (BR-6), so there is no
resource whose existence must be hidden — and a client that receives `403` knows to stop
rather than to retry.

Every `403` writes one `Auth.Forbidden` audit row, `Outcome = Denied`, **and the row
persists although no business transaction committed** (BR-9.4, AC-18).

### What a client does with each

| Code | Action |
|---|---|
| `401` from any endpoint **except** `POST /api/auth/token` | Clear the stored token and redirect to `/login?returnUrl=<current path>`. Not a form error |
| `401` from `POST /api/auth/token` | Render the message above the submit button. **Do not redirect** — the user is already on `/login`, and redirecting produces a loop (AC-27) |
| `403` | Explain that the role does not permit the action. Do **not** retry, and do not sign the user out — the session is valid |

### The 8-hour lifetime, stated plainly

The token is valid for 8 hours from issue. There is no refresh and no revocation. A stolen
token works for up to 8 hours; a deactivated user works for up to 8 hours; rotating the
signing key invalidates **everyone's** token at once and is not a per-user mechanism.

The lifetime is the entire mitigation, and it is a weak one (ADR-005). The contract states
it here because a client author needs to know that a 401 can arrive mid-session with no
warning and no way to extend.

---

## Verification

| What | How |
|---|---|
| `200` shape, and the claim names inside the token | `TEST-004-01`, `TEST-004-02` |
| `exp - iat` is exactly 8 hours | `TEST-004-03` |
| Wrong password and unknown email are indistinguishable | `TEST-004-04` |
| `400` for blank fields, never `401` | `TEST-004-05` |
| `sub`/`email`/`role` survive validation unrenamed | `TEST-004-06` |
| `ManagerOnly` admits the Manager and refuses the Agent | `TEST-004-07` |
| Bad key, `alg: none`, wrong algorithm | `TEST-004-08` |
| Expired by one second | `TEST-004-09` |
| The anonymous set is exactly two endpoints | `TEST-004-10` |
| Every audit row above, and its `TraceId` | `TEST-004-13` … `TEST-004-17` |
| This contract matches what was built | Generated OpenAPI compared before the feature closes — `REV-004-02` |
