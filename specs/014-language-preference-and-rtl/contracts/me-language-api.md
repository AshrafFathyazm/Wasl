# Contract — Me (language preference)

**Feature:** `014-language-preference-and-rtl` · **Story:** US-014 · **Status:** FROZEN 2026-08-23
· **Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in [`plan.md`](../plan.md)
first — see `docs/sdd/openapi/README.md`.

One change is already pending an answer, and it is recorded there rather than made
here: if the product owner prefers a reissued token to `?culture=` (`spec.md` Q-7), this
endpoint becomes `200` with a token body.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Content-Type:** `application/json`
- Enums are strings on the wire. `language` is a BCP-47 tag, lowercase
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)
- The active locale for every request in the API is resolved `?culture=` → the caller's
  stored `PreferredLanguage` (from the `preferred_language` claim) → `Accept-Language` →
  `en` (BR-8.4). An unsupported value falls back to `en` with the success status the
  request would otherwise have had — never a `400` (BR-8.3)
- **Every response in the API carries `Content-Language`**, naming the locale that was
  actually applied. That is a cross-cutting obligation of this feature, not a property
  of this endpoint

---

## `PUT /api/me/language`

Stores the caller's interface language so the choice follows them across devices
(FR-5.5). `me` is the subject of the bearer token; there is no path parameter, and no
user can set another user's preference.

### Request

```json
{ "language": "ar" }
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `language` | `string` | **yes** | Exactly `en` or `ar`, lowercase (BR-8.1). Not a region tag — `ar-SA` is a `400` here even though `Accept-Language: ar-SA` resolves to `ar` on a read (AC-11). A stored preference is a stored value, and storing `ar-SA` would mean storing something with no catalogue behind it |

### `204 No Content`

No body. The preference is stored.

```http
HTTP/1.1 204 No Content
Content-Language: en
```

**`Content-Language` on this response names the locale that was applied to *this
request*, which is the one you were using before the switch.** The request was resolved
before the handler ran, from the claim that was current at that moment. A client that
reads `Content-Language` here to confirm the switch will conclude it failed. This is the
single most confusing thing about this endpoint and it is behaviour, not a defect.

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | Missing, empty, or unsupported `language`; a region tag such as `ar-SA` |
| `401` | `errors/unauthenticated` | Missing or invalid token (AC-7). Also the case where the token is valid but the subject's row is missing or inactive — see the behaviour table |

#### `400` — unsupported language

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/me/language",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "language": ["Supported languages are: en, ar."]
  }
}
```

The message **lists the supported locales** (AC-6). The list comes from
`SupportedLanguages` in the domain, so adding a third locale (NFR-9) changes the
message without anyone editing it — and the `en` and `ar` inside the sentence are values,
not translated words, in both catalogues.

#### `401` — unauthenticated

```json
{
  "type": "https://wasl.local/errors/unauthenticated",
  "status": 401,
  "title": "Authentication is required.",
  "instance": "/api/me/language",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

No `errors` dictionary. Nothing about whether the account exists, is inactive, or was
never real.

### Status codes this endpoint deliberately never returns

| Code | Why not |
|---|---|
| `403` | Every authenticated support user may set their own language, both roles (BR-6). A `403` from this endpoint would mean the authorization policy is wrong, not that the caller lacked a permission — so it is not in the contract and the client has no branch for it |
| `404` | `/api/me/*` addresses the caller and nothing else, so there is no resource to report missing. A `404` would also tell a token holder that the account no longer exists, which a `401` does not (`spec.md` Q-8) |
| `409` | No `expectedVersion`. `SupportUsers` carries a `rowversion`, and `05-api-conventions.md` requires the token on endpoints mutating a ticket or a customer — this mutates neither, and the only writer of a person's language is that person. A `409` here would be a conflict with oneself |

### What stays identical in every locale

`title` and the messages inside `errors` are translated (BR-8.6). These are **not**
(BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| The **keys** of `errors` | They are request field names, part of this contract |
| The `language` values `en` and `ar` | They are identifiers. `العربية` is a display label and never travels on the wire |
| `traceId` | An identifier |

A client that branches on `type` works in Arabic. One that branches on `title` was
already broken.

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| You switch to `ar` and the very next error message is still English | The `preferred_language` claim in your token still says `en`, and the claim outranks `Accept-Language` (BR-8.5) | The token is not reissued; ADR-005 builds no refresh flow. Send `?culture=ar` for the rest of the session, or sign in again (`spec.md` Q-7, AC-24) |
| `Content-Language` on the `204` names the old locale | Correct | The request was resolved before the handler ran. See above |
| You `PUT` the language you already have | `204`, and **no audit row** | BR-9.8 records fields that actually changed. Rows saying nothing happened are what make an audit log unreadable. The screen does not send the request at all in this case |
| `{ "language": "AR" }` | `400` | The stored value is a lowercase BCP-47 tag. Case-normalising the input would mean two spellings of one stored value, and the endpoint would be the only place in the system that guesses |
| `{ "language": "ar-SA" }` | `400` | A *request* for `ar-SA` resolves to `ar` by culture fallback (AC-11); a *stored preference* of `ar-SA` would name a catalogue that does not exist |
| `{ "language": "" }` or `{}` | `400` with the same `errors.language` key | One key for one field, whatever went wrong with it |
| `{ "language": "fr" }` | `400` — **not** a fallback to `en` | BR-8.3's fallback applies to *requesting* a locale, where the caller is asking to be understood. Storing a preference is asserting a value, and asserting an unsupported one is a client error. This asymmetry is deliberate and it is the one thing in this contract a reader is most likely to think is a bug |
| `Accept-Language: fr` on this call | The call still succeeds; the `400` or `204` is just phrased in English | Two different things are happening in one request: the locale it is *answered in*, and the locale it is *setting* |
| Two devices switch the same user's language at once | Last write wins, both get `204` | See the `409` row above |
| An unknown field in the body | Ignored | Not an error; the DTO binds what it declares |
| The token is valid but the user row is gone or inactive | `401` | `spec.md` Q-8. It also writes an `Auth.Unauthenticated` audit row (BR-9.2) |

## Cross-cutting: what this feature adds to every other endpoint

| Change | Effect on existing contracts |
|---|---|
| `Content-Language` on every response | Additive. No existing field changes |
| `?culture=` honoured on every request | Additive, and it outranks everything (BR-8.4) |
| Server-authored strings translated | `title`, `detail`, and the **values** in `errors` may be Arabic. `type` and the **keys** of `errors` are byte-identical to English (BR-8.7) |
| `preferred_language` in the JWT | Additive claim. Nothing reads it but the culture provider |

No existing contract file changes as a result. A client that already branches on `type`
needs no edit; a client that branched on `title` breaks here, and was already broken.

## Verification

| What | How |
|---|---|
| `204`, `400`, `401` | `TEST-014-04` |
| The `400` lists the supported locales | `TEST-014-04` |
| The claim outranks `Accept-Language` — the middleware-ordering guard | `TEST-014-05` |
| Full resolution order, one case per level | `TEST-014-06` |
| `ar-EG` → `ar`, `fr` → `en` with the success status | `TEST-014-07` |
| `Content-Language` on responses across several endpoints | `TEST-014-08` |
| Arabic `type` and `errors` keys byte-identical to English | `TEST-014-09`, first established in `005-localization-core` |
| One audit row per real change, none after a rollback | `TEST-014-17` |
| No audit row when nothing changed | `TEST-014-18` |
| The `401` writes a row outside any transaction | `TEST-014-19` |
| A server message arrives in the new language on the next request | `TEST-014-20` |
| This contract matches what was built | `REV-014-03` — generated OpenAPI compared before the feature closes |
