# Contract — Customers (read)

**Feature:** `008-customer-list-and-profile` · **Story:** US-002 · **Status:** FROZEN 2026-08-23
· **Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in
[`plan.md`](../plan.md) first — see `docs/sdd/openapi/README.md`.

The write side of this resource is [`007`'s contract](../../007-create-customer/contracts/customers-api.md)
and is not reopened here.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Content-Type:** `application/json`
- Timestamps are UTC, ISO 8601, `Z` suffix. Formatting for display is the client's job,
  in the client's locale
- Identifiers are `Guid` strings. Enums are strings on the wire
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)
- Both endpoints are readable by `Agent` and `Manager` alike (BR-6), so **neither
  returns `403`**. Its absence from the tables below is the authorization matrix, not an
  omission

---

## `GET /api/customers/{id}`

Returns one customer's profile.

### Request

```http
GET {{baseUrl}}/api/customers/8f1c2d34-5678-4abc-9def-0123456789ab
Authorization: Bearer <JWT>
Accept-Language: ar
```

| Part | Type | Rules |
|---|---|---|
| `id` | `Guid` in the path | A value that is not a `Guid` is a `400`, **not** a `404`. See the note below |

There is **no route constraint** on `id`. `{id:guid}` would make an unparseable value
fail to match the route, which produces `404` — indistinguishable, from the client's
side, from a customer that does not exist. AC-3 requires the two to be distinguishable.

### `200 OK`

```json
{
  "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
  "fullName": "علي الأحمد",
  "email": "ali@example.com",
  "phone": "+966501234567",
  "companyName": "شركة الرياض",
  "notes": "Prefers WhatsApp.",
  "createdAtUtc": "2026-08-23T12:00:00Z",
  "updatedAtUtc": "2026-08-23T12:00:00Z",
  "version": "AAAAAAAAB9E="
}
```

| Field | Type | Note |
|---|---|---|
| `id` | `string` (uuid) | |
| `fullName` | `string` | Verbatim as stored. Never translated (BR-8.10) |
| `email` | `string?` | Normalised form (lowercased, trimmed) — BR-4.2 |
| `phone` | `string?` | E.164. `null` when the customer has only an email |
| `companyName` | `string?` | |
| `notes` | `string?` | Up to 2000 characters, line breaks preserved |
| `createdAtUtc` | `string` (date-time) | |
| `updatedAtUtc` | `string` (date-time) | Equal to `createdAtUtc` until `017` ships an update path |
| `version` | `string` | Base64 `rowversion` (ADR-006 as amended by ADR-013). Returned here so `017` does not have to change the read shape later — US-002 AC-3 |

This shape is a **superset** of `007`'s `201` body: it adds `updatedAtUtc`. It is a
distinct type, `CustomerDetailResponse`, and not the same one reused.

`IsActive` is **not** in the response. Nothing sets it in release 1, and exposing a flag
whose only value is `true` invites a client to branch on it. It arrives with `017`.

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `id` is not a parseable `Guid`. `errors` names `id` (AC-3) |
| `401` | `errors/unauthenticated` | Missing or invalid token (AC-14) |
| `404` | `errors/not-found` | Well-formed `Guid`, no such customer (AC-2) |

#### `404` — not found

```json
{
  "type": "https://wasl.local/errors/not-found",
  "title": "The requested resource was not found.",
  "status": 404,
  "instance": "/api/customers/8f1c2d34-5678-4abc-9def-0123456789ab",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

No `errors` dictionary — there is no field at fault. `detail` is omitted rather than
carrying "customer 8f1c… does not exist", which adds nothing the `instance` does not
already say.

#### `400` — malformed identifier

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/customers/not-a-guid",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "id": ["'id' must be a valid identifier."]
  }
}
```

It is the **same** `type` as a body-validation failure, on purpose: from the client's
point of view, both are "the request was malformed", and a second type would only make
the error branch wider without making it more useful.

---

## `GET /api/customers`

Paginated list, optionally filtered by a free-text search.

### Request

```http
GET {{baseUrl}}/api/customers?page=1&pageSize=20&search=ali
Authorization: Bearer <JWT>
```

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `page` | `int` | `1` | 1-based. `0` or negative is **clamped** to 1, never rejected (AC-6) |
| `pageSize` | `int` | `20` | Above 100 is clamped to 100; `0` is clamped to the default of 20. Never rejected (BR-7.2, AC-5) |
| `search` | `string?` | absent | Case-insensitive substring over `fullName`, `email`, and `phone`. Trimmed; a whitespace-only value is treated as absent (AC-7) |

Clamping rather than rejecting is BR-7.2 as written. A client sending `pageSize=500`
gets 100 rows and a `200` — it does not get a `400` to handle.

`includeInactive` does **not** exist. Deactivation arrives with `017`; a parameter frozen
into a contract before anything can exercise it is a promise nobody has tested.

### `200 OK`

```json
{
  "items": [
    {
      "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
      "fullName": "علي الأحمد",
      "email": "ali@example.com",
      "phone": "+966501234567",
      "companyName": "شركة الرياض",
      "createdAtUtc": "2026-08-23T12:00:00Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "totalCount": 137,
  "totalPages": 7
}
```

The envelope is the shared one from `docs/sdd/05-api-conventions.md`, and `010` and `015`
reuse it unchanged.

| Field | Type | Note |
|---|---|---|
| `items` | `CustomerListItem[]` | Empty array when nothing matches — never `null` (BR-7.6, AC-9) |
| `page` | `int` | The **effective** page after clamping, not what was sent |
| `pageSize` | `int` | The **effective** page size after clamping |
| `totalCount` | `int` | Rows matching the filter, ignoring paging |
| `totalPages` | `int` | `ceil(totalCount / pageSize)`. `0` when `totalCount` is `0` |

`CustomerListItem` deliberately omits two fields the detail response has:

| Omitted | Why |
|---|---|
| `notes` | Up to 2000 characters × 20 rows of payload that no column renders |
| `version` | Nothing on a list mutates. A concurrency token on a read-only row invites a client to hold a stale one |

**Order:** `fullName` ascending, then `id` ascending. The `id` tiebreaker is not
decoration — names are not unique (BR-4.6), and `OFFSET`/`FETCH` over a non-total order
can return the same row on two pages or skip it entirely (AC-15).

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `page` or `pageSize` is not an integer; `search` exceeds 200 characters |
| `401` | `errors/unauthenticated` | Missing or invalid token (AC-14) |

An out-of-range **value** is clamped; a non-integer is a `400`, because there is nothing
to clamp. `search=%` is not an error: `%` is matched as literal text (AC-8).

### What stays identical in every locale

`title`, `detail`, and the messages inside `errors` are translated (BR-8.6). These are
**not** (BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| The **keys** of `errors` | They are request field names, part of this contract |
| `traceId` | An identifier |
| Every field name in the envelope and in the items | Contract, not copy |
| `fullName`, `companyName`, `notes` values | User content, returned verbatim (BR-8.10) |

`Content-Language` on the response names the locale that was actually applied, so a
client can tell that its request for `fr` produced English (BR-8.3).

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| `GET /api/customers/not-a-guid` | `400` `errors/validation` naming `id` | AC-3. With a `{id:guid}` route constraint this would be a `404`, and with unconstrained minimal-API binding alone it would be a `400` with an **empty body** — a client branching on `type` would read `undefined`. The mapping lives in the shared middleware |
| `search=100%` | Matches the literal text `100%` | The term's `LIKE` metacharacters are escaped server-side (AC-8) |
| `search=[a-z]` | Matches the literal text `[a-z]` | `[` is a `LIKE` metacharacter **on SQL Server** and is not one on PostgreSQL. It is the character AC-8's original list did not name |
| `search=احمد`, record stored as `أحمد` | **No match** | Stated limitation. Arabic hamza/alef/ta-marbuta normalisation is `docs/sdd/11-open-questions.md` Q-7, deferred with the fix written down. And for a customer with a phone and no email, BR-4 will not catch the resulting duplicate either — the prevention and the guarantee miss the same row |
| `search=ALI` where the stored email is `ali@example.com` | Matches | Case-insensitivity is applied by an **explicit** `COLLATE` in the query, not inherited from the server's default collation (AC-16). The behaviour is identical on a case-sensitive server, which is the point |
| `page=9999` on 137 rows | `200`, `items: []`, `totalCount: 137` | An empty page is a valid answer (AC-10). The client offers a way back to page 1 |
| `pageSize=500` | `200` with 100 items and `pageSize: 100` | Clamped, not rejected (BR-7.2). Read the **returned** `pageSize`, not the one you sent |
| Nothing matches | `200`, `items: []`, `totalCount: 0`, `totalPages: 0` | Never `404` (BR-7.6, AC-9) |
| Two customers share a name | Both appear, in a stable order, exactly once across a full traversal | AC-15 |
| The customer is inactive | The **detail** endpoint returns it; the **list** excludes it | Q-1 and Q-3. Nothing can be inactive until `017`, so the difference is currently unobservable — it is fixed now so it cannot change results later |
| Either endpoint is called successfully | **No audit row is written** | BR-9.1 covers state changes. A customer read is not `Audit.Read`, which is reading the audit log itself (BR-9.11) |
| A call without a token | `401`, and **one** audit row (`Auth.Unauthenticated`) written outside any transaction | BR-9.2, BR-9.4 |
| The `Tickets` count shown on the list screen | Not in this contract | `dbo.Tickets` does not exist until `009`. The column arrives with `018` |
| A list request | Costs exactly **two** database commands: the page and the count | AC-11. A test asserting "one command" would fail correct code — the count is deliberately a second query (`05-api-conventions.md`) |

## Verification

| What | How |
|---|---|
| Every status code above | `TEST-008-02` … `TEST-008-07`, `TEST-008-11` |
| The malformed id is a `400` with a `type` and a body | `TEST-008-03` |
| Pattern characters are literal, including `[` | `TEST-008-06` |
| Case-insensitivity is explicit, not collation-dependent | `TEST-008-10` |
| Paging is stable over duplicate names | `TEST-008-09` |
| One list request, two commands | `TEST-008-08` |
| A read writes no audit row; the `401` writes one | `TEST-008-12`, `TEST-008-11` |
| Arabic content round-trips byte-identical, and Q-7's limitation is pinned | `TEST-008-13` |
| Arabic `type` and `errors` keys byte-identical to English | Covered by `005-localization-core`, re-asserted here |
| This contract matches what was built | Generated OpenAPI compared before the feature closes — `REV-008-03` |

---

## Contract changes

### 2026-09-01 — `033-customers-list` adds five list parameters and one endpoint

**The frozen text above is not edited.** This is the rule `error-contract.md` set when `429`
arrived late and `034` followed when it added `?customerId=` to `010`'s list: a frozen contract
is amended at its foot, so a reader can see both what was promised and what changed.

The canvas the product owner supplied draws a filter panel with controls this endpoint had no
parameters for. `033` §4 records the ruling — **build the canvas as drawn** — which is what
reopens the contract rather than reducing the screen.

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `sort` | enum `fullName` \| `createdAtUtc` | `fullName` | An unknown value is a **`400`**, not a fallback |
| `dir` | enum `asc` \| `desc` | `asc` | Same |
| `company` | repeated string | absent | **Exact** match on `CompanyName`, case-insensitive from the column's own collation. Repeated values are OR-ed. **Clamped to 20**, per BR-7.2 |
| `noCompany` | bool | `false` | `CompanyName IS NULL`, **OR-ed with `company`** so "Acme or none" is expressible |
| `createdFrom` | `yyyy-MM-dd` | absent | Inclusive, read as UTC midnight |
| `createdTo` | `yyyy-MM-dd` | absent | Inclusive **to the end of that day** — the handler compares `< createdTo + 1 day` |
| `calendar` | enum `gregorian` \| `hijri` | `gregorian` | Applies to **both** bounds. `015` built the parser; the other lane moved it to `Common/DateRangeFilter` for this feature |

**Every ordering ends `ThenBy(Id)`.** `008` AC-15 already required it for names (BR-4.6 makes
duplicates ordinary); `createdAtUtc` makes ties *likely* rather than possible, because
`RequestTimestamp` truncates to `datetime2(3)` and `--seed` writes many customers inside one
request.

**An unknown `sort` is a `400` while an out-of-range `pageSize` still clamps**, and the
distinction is the one this contract already draws: *an out-of-range value is clamped; a
non-integer is a `400`, because there is nothing to clamp.* `pageSize=500` has an obvious
nearest legal value. `sort=email` does not — silently ordering by name returns a
correct-looking page in the wrong order, which is the failure a client cannot see.

**An inverted range is an empty page, not a `400`.** `createdFrom > createdTo` describes a
window with nothing in it, `totalCount: 0` says exactly that, and BR-7.6 already covers the
shape. **The tickets list answers `400` for the same shape** (`Validation.TicketFilter.CreatedRangeInverted`,
`015`, 2026-08-31) — the two endpoints therefore differ, which is raised in `033`'s summary for
a ruling rather than reconciled by whichever lane touched it last.

`?sort=1` and `?dir=0` are `400`s: `Enum.TryParse` accepts an ordinal — including one no member
has — so without an explicit digit guard the request would succeed and order by something the
caller never asked for. `009` shipped exactly that class of defect through a `DEFAULT` the
caller could not see.

### `GET /api/customers/companies`

New with `033` §5.3. **The filter panel needs the list of companies to offer and nothing
returned it.**

```http
GET /api/customers/companies?search=gulf&limit=50
```

```json
{ "items": ["Gulf Logistics Co.", "Gulf Services Ltd."], "hasUncompanied": true }
```

| Part | Rules |
|---|---|
| `search` | Case-insensitive substring, the same provider-escaped `Contains` the list uses. Trimmed; whitespace-only is absent |
| `limit` | Default 50, **clamped** to 100 |
| `items` | Distinct non-null `CompanyName` of **active** customers, ordered ascending, capped at `limit` |
| `hasUncompanied` | Whether any **active** customer has no company — so the panel offers the "no company" row only when it would match something |
| Auth | `[Authorize]`, both roles. No `403`, like the rest of this contract's reads |
| `401` | Without a token, and it writes one `Auth.Unauthenticated` audit row (`004b`) |

| Situation | Response |
|---|---|
| No companies match | `200` with `items: []`. BR-7.6 — empty is `[]`, never `null` |
| A deactivated customer's company | **Absent.** Its presence would be a filter that returns nothing, on a name the UI itself offered — the list has filtered on `IsActive` since Q-1 and the two must agree |
| `?limit=5000` | Clamped to 100. `200`, never a `400` |
| Two customers at one company | One entry. `Distinct()` in the query, not in the client |
| One request | Costs **two** database commands — the names and an `EXISTS` for `hasUncompanied`. The second cannot be derived from the first: the cap means an absent name may exist beyond it, and a null company is not in `items` by construction |

**`hasUncompanied` is not `items.Any(x => x is null)`.** That is the shape this endpoint exists
to avoid: a client deriving it from a capped list would offer or hide the row by accident.

## Verification — the 2026-09-01 additions

| What | How |
|---|---|
| Sort on both columns, both directions | `CustomerFilterTests.Sorting_*` |
| A tie **exists**, and is then broken across two pages of one | `Two_customers_can_share_a_creation_instant_byte_for_byte`, `A_tie_is_broken_so_two_pages_of_one_cover_both_rows_exactly_once` |
| An unknown `sort`/`dir`, and the ordinal form, are `400`s naming the parameter | `An_unknown_sort_or_direction_is_refused_and_names_the_parameter` |
| `pageSize` still clamps | `An_out_of_range_page_size_is_still_clamped` |
| `company` OR, exact, case-insensitive, and OR-ed with `noCompany` | `Two_companies_are_ored_and_a_third_is_excluded`, `The_company_match_is_case_insensitive_and_exact`, `A_company_and_no_company_are_ored_with_each_other` |
| The 20-value clamp drops the twenty-first | `More_than_twenty_companies_are_clamped_rather_than_refused` |
| `createdTo` includes `23:59:59.999` of that day | `Created_to_includes_the_last_millisecond_of_that_day` |
| An inverted range is an empty page | `An_inverted_range_is_an_empty_page_rather_than_a_refusal` |
| A Hijri bound needs `?calendar=hijri`, and works with it | `A_hijri_looking_date_without_the_calendar_is_refused`, `A_hijri_range_filters_when_the_calendar_is_declared` |
| The companies list is distinct, ordered, active-only | `The_companies_endpoint_returns_distinct_names_in_order`, `The_companies_endpoint_ignores_deactivated_customers` |
| Its cost does not grow with the answer | `The_companies_endpoint_costs_the_same_for_one_company_as_for_twenty` |
| Both roles, and `401` without a token | `An_agent_may_read_the_companies_too`, `The_companies_endpoint_refuses_an_anonymous_caller` |
