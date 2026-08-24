# Contract — Branding and theming

**Feature:** `022-tenant-theming-settings` · **Story:** — · **Status:** FROZEN 2026-08-23
· **Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in [`plan.md`](../plan.md)
first — see `docs/sdd/openapi/README.md`.

Two surfaces: the **read**, which appears twice (its own endpoint and inside the auth
response, because the theme must reach `:root` before first paint — ADR-012), and the
**write**, which refuses an inaccessible colour.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call in
  this contract, including the read (spec Q-A)
- **Content-Type:** `application/json`
- Timestamps are UTC, ISO 8601, `Z` suffix
- Enums are strings on the wire and are **never** localized (BR-8.7)
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)
- `version` is the base64 `rowversion` (ADR-006 as amended by ADR-013)

### What crosses the wire, and what does not

| Sent | Not sent | Why |
|---|---|---|
| `brandColor` | The five derived ramp values | The ramp is five `color-mix(in oklab, …)` declarations in the stylesheet. Sending hex values would be a second implementation of the ramp that has to agree with the first forever (`research.md` R-6) |
| `onBrand` | — | Not a derivation, a **decision**: the output of the rule that gates the colour. Constitution III — the server tells the client what is permitted rather than the client deriving it |
| `sidebarMode` | The preset's colour values | A mode, not a colour (ADR-012 part 4). The three presets ship in the stylesheet (`006`) |

---

## `GET /api/settings/branding`

The current branding. Any authenticated support user — an Agent needs it to render the
interface, even though only a Manager may change it (BR-6, and `DOC-022-02`).

### Request

```http
GET {{baseUrl}}/api/settings/branding
Authorization: Bearer <JWT>
```

### `200 OK`

```http
Cache-Control: no-store
Content-Language: en
```

```json
{
  "brandColor": "#1D174D",
  "onBrand": "#FFFFFF",
  "sidebarMode": "Light",
  "updatedAtUtc": "2026-08-23T12:00:00Z",
  "version": "AAAAAAAAB9E="
}
```

| Field | Type | Note |
|---|---|---|
| `brandColor` | `string` | `#RRGGBB`, **uppercase**. Normalised on write, so this is what was stored, not what was typed |
| `onBrand` | `string` | `#FFFFFF` or `#0D2626`. Computed server-side from relative luminance; the client writes it to `--on-brand` and does not recompute it |
| `sidebarMode` | `"Light" \| "Dark" \| "Brand"` | Never localized (BR-8.7) |
| `updatedAtUtc` | `string` | ISO 8601 UTC |
| `version` | `string` | base64 `rowversion`. Required on the next `PUT` |

**There is no "not configured" response.** The row is seeded by the migration
(`data-model.md`), so this endpoint returns `200` on a clean database — never `404`, never
a null body (AC-1).

`Cache-Control: no-store` is deliberate. A stale theme is the exact defect this feature
exists to prevent, and the body is under 200 bytes — cheaper than the conditional request
that would save it (`research.md` R-8).

### Failures

| Code | `type` | When |
|---|---|---|
| `401` | `errors/unauthenticated` | Missing or invalid token (AC-2) |

No `403`: every role may read this. No `404`: the row always exists. No `500` path
specific to this endpoint.

---

## The same payload inside `POST /api/auth/token`

**This endpoint belongs to `004-auth-and-roles`.** `004` is not yet specified, so this is
a requirement placed on its contract rather than a change to a frozen one — recorded under
**Contract changes** in [`plan.md`](../plan.md).

The token response gains one object, `theme`, whose shape is **field-for-field identical**
to the `GET` body above:

```json
{
  "accessToken": "<JWT>",
  "expiresAtUtc": "2026-08-23T20:00:00Z",
  "theme": {
    "brandColor": "#1D174D",
    "onBrand": "#FFFFFF",
    "sidebarMode": "Light",
    "updatedAtUtc": "2026-08-23T12:00:00Z",
    "version": "AAAAAAAAB9E="
  }
}
```

Everything else on that response is `004`'s and is not restated here.

**Why it is duplicated rather than fetched:** the interface must be branded on the first
paint after sign-in. A separate request means the default theme renders and then snaps
(ADR-012). One object on a response that is already happening costs nothing; a second
round trip costs the flash.

**Why the read endpoint still exists:** a reload has no auth response. The token is
already held, so the theme has to come from somewhere on every subsequent load, and it
also has to be re-read after another Manager changes it (`research.md` R-5).

**One test asserts they are equal** (AC-3) — not two tests that each check a shape. Two
shape tests pass while the two paths drift.

---

## `PUT /api/settings/branding`

Replaces the branding. **Manager only.** Refuses a colour that cannot be made accessible.

### Request

```http
PUT {{baseUrl}}/api/settings/branding
Authorization: Bearer <JWT>
Accept-Language: ar
Content-Type: application/json
```

```json
{
  "brandColor": "#2E7D32",
  "sidebarMode": "Brand",
  "expectedVersion": "AAAAAAAAB9E="
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `brandColor` | `string` | **yes** | Exactly `#RRGGBB`. Case-insensitive on input, **stored and returned uppercase**. Trimmed before validation. Then gated for contrast — see below |
| `sidebarMode` | `string` | **yes** | Exactly one of `Light`, `Dark`, `Brand`. Case-**sensitive**: it is an enum value, not a label (BR-8.7). `light` is a `400` |
| `expectedVersion` | `string` | **yes** | The `version` from the last read. A mismatch is `409` (ADR-006, spec Q-C) |

A `PUT` **replaces** the resource. `null` or an omitted field is a `400`, not "keep the
current value" — the alternative is a request whose meaning depends on state the client
cannot see.

### The contrast gate

Three checks, in this order, against the two candidate foregrounds `#FFFFFF` and
`#0D2626` (`docs/sdd/design/theming.md`):

| # | Check | Threshold | `refusedBy` |
|---|---|---|---|
| 1 | The better of the two foregrounds against `brandColor` | ≥ 4.5:1 | `"text"` |
| 2 | The same foreground against `--brand-hover` and `--brand-active` | ≥ 4.5:1 | `"hover"` |
| 3 | `brandColor` against the page surface `#FFFFFF` | ≥ 3:1 | `"surface"` |

Check 2 exists because the hover mix is lighter by construction, so a colour that passes
on its base can fail on hover — and nobody hovers during review (AC-13). Check 3 rests on
spec **Q-E** and is an addition to ADR-012, awaiting sign-off: without it a pale yellow
brand passes the text gate with the ink foreground and produces a primary button that
cannot be seen against a white page.

`onBrand` in the response is the foreground that won check 1.

### `200 OK`

```json
{
  "brandColor": "#2E7D32",
  "onBrand": "#FFFFFF",
  "sidebarMode": "Brand",
  "updatedAtUtc": "2026-08-23T14:31:07Z",
  "version": "AAAAAAAAB9M="
}
```

Same shape as the `GET`. `200` rather than `204` because `onBrand` and `version` are both
computed server-side and the client needs both immediately — `204` would force a
follow-up read to learn the value the write just produced.

Submitting values identical to the stored ones returns `200` with the **same** `version`
and writes **no audit row** (BR-9.8 records fields that actually changed).

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `brandColor` malformed or missing; `sidebarMode` not one of the three; `expectedVersion` missing (AC-7, AC-14) |
| `400` | `errors/inaccessible-brand-color` | Well-formed but fails a contrast check (AC-8, AC-12, AC-13) |
| `401` | `errors/unauthenticated` | Missing or invalid token |
| `403` | `errors/forbidden` | Authenticated as an Agent (AC-5). **`002-error-contract` owns this string** — spec Q-D |
| `409` | `errors/concurrency-conflict` | `expectedVersion` does not match the stored `rowversion` (AC-6) |

#### `400` — validation

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/settings/branding",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "brandColor": ["Provide a colour as six hexadecimal digits, for example #1D174D."]
  }
}
```

#### `400` — the colour is refused

```json
{
  "type": "https://wasl.local/errors/inaccessible-brand-color",
  "title": "This colour cannot be made readable.",
  "status": 400,
  "detail": "No available text colour reaches the required contrast against #808080.",
  "instance": "/api/settings/branding",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "refusedBy": "text",
  "bestContrastRatio": 4.02,
  "requiredContrastRatio": 4.5,
  "surfaceContrastRatio": 3.95,
  "requiredSurfaceContrastRatio": 3.0,
  "errors": {
    "brandColor": ["No available text colour reaches the required contrast against this colour. Choose a darker or a lighter shade."]
  }
}
```

| Extension | Type | Note |
|---|---|---|
| `refusedBy` | `"text" \| "hover" \| "surface"` | Which check refused it. Machine-readable, **never localized** — the UI branches on it to say *which* problem it is |
| `bestContrastRatio` | `number` | The better of the two foregrounds, rounded to two decimals |
| `requiredContrastRatio` | `number` | `4.5` |
| `surfaceContrastRatio` | `number` | Against `#FFFFFF` |
| `requiredSurfaceContrastRatio` | `number` | `3.0` |

**These are numbers, not preformatted strings**, and they are byte-identical in every
locale. A server-composed sentence like `"4.02:1, needs 4.5:1"` would put a formatted
number inside a translated string, and Arabic formats numbers differently — so the client
formats them, in the active locale (BR-8.13 keeps Latin digits for identifiers; a ratio
is a number and follows the locale's own number format).

A distinct `type` rather than plain `errors/validation` because the UI does something
different with it: a malformed colour is a typo and the message goes on the field, while
a refused colour is a **decision the user needs explained**, with the ratios rendered
(AC-21). `05-api-conventions.md` establishes exactly this pattern for `409`; the reason is
the same.

#### `409` — stale version

```json
{
  "type": "https://wasl.local/errors/concurrency-conflict",
  "title": "This setting was changed by someone else.",
  "status": 409,
  "instance": "/api/settings/branding",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

The body carries no current value. The client refetches — it never retries blind
(ADR-006).

### What stays identical in every locale

Translated (BR-8.6): `title`, `detail`, and the messages inside `errors`.

Never translated (BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| The **keys** of `errors` | Request field names, part of this contract |
| `refusedBy` | A machine-readable enum |
| The four ratio extensions | Numbers |
| `sidebarMode` values | Enum values. `Light` is an identifier; its label is translated client-side |
| `brandColor`, `onBrand` | Hex values |
| `traceId` | An identifier |

Send `Accept-Language: ar` to see the difference; `Content-Language` on the response names
the locale that was actually applied.

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| `#ffffff` is sent | `400 errors/inaccessible-brand-color`, `refusedBy: "surface"` | The format is accepted and normalised, then the gate refuses it: a white button on a white page is invisible (Q-E) |
| `#FFF59D` (pale yellow) is sent | `400`, `refusedBy: "surface"` — **not** `"text"` | The ink foreground passes at ~14:1. The text gate alone does not catch ADR-012's own stated worry (`research.md` R-2) |
| `#808080` is sent | `400`, `refusedBy: "text"` | Both foregrounds land near 4:1. The only kind of colour that reaches the text-gate refusal |
| `#FFAF36` (amber) is sent | `400`, `refusedBy: "surface"` | A whole family of plausible brands is refused. Known tension, spec Q-F, with the recommendation attached |
| Two Managers `PUT` on the same `version` | One `200`, one `409` | The `rowversion` is the guarantee; the message is the application's |
| An Agent `PUT`s | `403`, and an audit row is written outside any transaction | BR-9.2 and BR-9.4 — a denial has no business transaction to join |
| The same values are `PUT` again | `200`, same `version`, no audit row | BR-9.8. A row recording nothing is noise |
| An unknown field is in the body | Ignored | The DTO binds what it declares |
| `sidebarMode: "light"` | `400 errors/validation` | An enum value, not a label. Accepting a case-insensitive match would make the wire format ambiguous in one direction only |
| A colour is accepted and the client's mirror had refused it | The server wins; the mirror is a defect | The mirror exists to be faster, never to be right (ADR-003, AC-23) |
| The stored colour would be refused by today's thresholds | The `GET` still returns it | The read is not a validation gate. Reachable only by changing the thresholds in a release, and recorded as such |

---

## Verification

| What | How |
|---|---|
| Every status code above | `TEST-022-04` … `TEST-022-10` |
| The auth `theme` object equals the `GET` body | `TEST-022-03` — one test, both calls, compared |
| Each of the three refusal checks fires on its own colour | `TEST-022-06`, over the fixture in `spec.md` AC-11 |
| The refusal band is computed, not hard-coded | `TEST-022-01` prints the derived boundaries |
| Arabic `type`, `refusedBy`, `errors` keys, and all four ratios byte-identical to English | `TEST-022-09` |
| The audit row is in the same transaction and absent on rollback | `TEST-022-11` |
| This contract matches what was built | Generated OpenAPI compared before the feature closes (`REV-022-04`) |
