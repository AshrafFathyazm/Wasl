# Frontend API Guide — The Error Envelope

Everything the frontend lane needs in order to handle **any** failure from **any** endpoint,
now and for every later feature. Derived from
[`contracts/error-contract.md`](contracts/error-contract.md), which is frozen.

This guide is unusual: it documents no endpoint. It documents the response shape every
endpoint shares, so that each later feature's guide lists only *which* failures its
endpoints can produce and points here for what they look like.

> Start now. The utilities are written inside `006-design-system` (`spec.md` Q-D), and every
> screen from `007` onward imports them.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
  except `GET /health` and `POST /api/auth/token`
- **Every error:** `Content-Type: application/problem+json`, RFC 7807
- **Locale:** send `Accept-Language: ar` or `en`; read `Content-Language` on the response to
  know which was actually applied. Before `005` ships, every sentence is English regardless
  — and the machine-readable half of the envelope is already final
- **Branch on `type`, never on `title`.** `title` is translated; `type` is not (BR-8.7)
- **`200` is never an error.** If the status is 2xx, there is no problem body to parse

## Types — provisional until generated

Hand-written from the frozen contract. **Marked provisional on purpose:** they are replaced
by types generated from the OpenAPI document once `/swagger` is real (ADR-011 §6), and the
swap is a task (`FE-002-04`), not something to remember.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-002-04.
export interface ProblemDetails {
  type: string;                          // absolute URI. The thing you branch on
  title: string;                         // localized sentence. NEVER branch on it
  status: number;                        // equals the HTTP status line
  detail?: string;                       // localized. Absent on 500
  instance?: string;                     // the request path
  traceId: string;                       // matches the server log. Show it on a 500
  errors?: Record<string, string[]>;     // present per type, not per status
}

// PROVISIONAL — mirrors contracts/error-contract.md. Keep in step with that file.
export const PROBLEM_CODES = {
  validation:               'validation',                 // 400
  malformedRequest:         'malformed-request',          // 400
  unauthenticated:          'unauthenticated',            // 401
  forbidden:                'forbidden',                  // 403
  notFound:                 'not-found',                  // 404
  methodNotAllowed:         'method-not-allowed',         // 405
  unsupportedMediaType:     'unsupported-media-type',     // 415
  duplicateCustomer:        'duplicate-customer',         // 409
  invalidStatusTransition:  'invalid-status-transition',  // 409
  alreadyEscalated:         'already-escalated',          // 409
  ticketClosed:             'ticket-closed',              // 409 — reserved by 012
  concurrencyConflict:      'concurrency-conflict',       // 409
  internal:                 'internal',                   // 500
  unparseableResponse:      'unparseable-response',       // client-side only
} as const;
```

## The three functions

```ts
parseProblem(response: Response): Promise<ProblemDetails>
problemCode(problem: ProblemDetails): string
applyFieldErrors(problem, setError, knownFields): string[]   // returns keys it could NOT place
```

### `parseProblem` never throws

```ts
const res = await fetch(url, init);
if (!res.ok) {
  const problem = await parseProblem(res);   // always resolves, never rejects
  handle(problemCode(problem), problem);
}
```

| The server (or a proxy) sent | You get |
|---|---|
| A contract-shaped problem body | It, parsed |
| Valid JSON with no `type` | `unparseable-response` |
| An HTML page from a gateway | `unparseable-response` |
| An empty body — the classic empty `404` | `unparseable-response` |
| `502` / `504` from infrastructure | `unparseable-response` |

`traceId` on a synthetic problem is the empty string, and that is honest: the client never
received one, and inventing a value puts an unfindable reference number in front of a user.

A `fetch` that **rejects** — DNS failure, offline, CORS — never reaches `parseProblem`. That
is `errors.network.title`, not a `ProblemDetails` case.

### `problemCode` returns the last path segment

```ts
switch (problemCode(problem)) {
  case PROBLEM_CODES.duplicateCustomer:   /* field message */   break;
  case PROBLEM_CODES.concurrencyConflict: /* refetch + reload */ break;
  default:                                 /* generic failure */ break;   // ← MANDATORY
}
```

Never compare the whole URI. The base is a compile-time constant on the server today, and
one environment differing would break every branch at once — `problemCode` contains that
blast radius to zero. AC-25 is the test that changes the host and proves no branch moved.

The `default` branch is a contract obligation, not a nicety. A new registry row must not
break a deployed client.

### `applyFieldErrors` returns what it could not place

```ts
const unplaced = applyFieldErrors(
  problem,
  (field, message) => setError(field as keyof FormValues, { message }),
  ['fullName', 'email', 'phone', 'companyName', 'notes'],
);
if (unplaced.length > 0) setFormLevelMessages(unplaced.map(k => problem.errors![k][0]));
```

Rendering `unplaced` is required, not optional. A `409 duplicate-customer` naming `email` on
a form whose field is called `emailAddress` would otherwise produce a submit that fails with
no visible reason — the failure mode AC-26 exists for. A server message the user cannot see
is worse than no validation at all.

## Every response, and what the UI does with it

| Status | `type` code | What the UI does |
|---|---|---|
| `400` | `validation` | Attach each `errors[field]` message to that field. Re-enable submit. Do not retry |
| `400` | `malformed-request` | Generic failure with a retry. This is a **client bug** — the body or a route value was unparseable. It should never reach a user, and hiding it helps nobody |
| `401` | `unauthenticated` | Session expired or absent. Redirect to sign-in. **Not a form error.** Never retried |
| `403` | `forbidden` | Inline: "you do not have permission for this action". No retry. Use the **client's** own copy — the server's `detail` deliberately says nothing about which role would work |
| `404` | `not-found` | Not-found state. The resource — or the route — does not exist. Do not retry |
| `405` | `method-not-allowed` | Generic failure. A client bug |
| `415` | `unsupported-media-type` | Generic failure. A client bug: the request was not sent as `application/json` |
| `409` | `duplicate-customer` | Attach `errors[field]` to the named field. **Inline, not a banner** — the user needs it where the problem is. There is no existing-customer id to link to, by design (BR-4.7) |
| `409` | `invalid-status-transition` | Refetch the ticket and re-render from its `allowedTransitions`. The client's view of what was possible is stale |
| `409` | `already-escalated` | Refetch; the action is gone |
| `409` | `ticket-closed` | Refetch; `Closed` is terminal (BR-1.5) |
| `409` | `concurrency-conflict` | Explanatory message plus a **reload** action, so the user sees what changed. **Never an automatic retry** (ADR-006) |
| `500` | `internal` | Generic message **plus the `traceId`**, and offer retry once. No `detail` arrives, by design |
| any | *unrecognised* | Generic failure with a retry |
| any | `unparseable-response` | Generic failure with a retry. Never a blank screen |

**Never auto-retry a `409`.** Every `409` means the server state is not what the client
believed, and retrying without a human looking is guessing at intent.

**Always surface the `traceId` on a `500`.** It is the only thing joining a user's report to
the server log (BR-9.9). Render it `dir="ltr"` with Latin digits — a trace id is
punctuation-heavy and the bidirectional algorithm otherwise moves its leading `00-` to the
wrong end of an Arabic sentence, where it looks like a typo rather than a bug.

## Client-side validation — mirror, never authority

Every rule mirrored into Zod exists so the user is told sooner. Every one of them is also
enforced server-side, and the client is **never** the authority (ADR-003, constitution III).

| Rule | Who is the authority |
|---|---|
| Required, max length, format | Server. Zod mirrors it; a `400` from the server is still handled |
| Normalisation — email lowercasing, phone to E.164 | **Server only.** Send what was typed, render what came back (`007`, BR-4.2, BR-4.3) |
| Uniqueness — duplicate customer | **Server only.** Only the database can answer it (BR-4.8) |
| Which status transitions are permitted | **Server only.** The API returns `allowedTransitions`; the UI renders what it was given and never re-derives the BR-1 matrix |
| Which actions a role may take | **Server only.** The UI may hide a control it knows is not permitted; the `403` is still handled, because a hidden control is not a security boundary |

Three failures this rule prevents, all of which have the same shape — two implementations of
one rule, drifting:

1. A client-side phone normaliser producing a different E.164 string from the server's, so a
   number the user typed once appears twice
2. A client-side duplicate check against a stale list, so a user is told a name is free and
   then told it is taken
3. A client-side transition matrix that goes out of date when BR-1 changes, so a button
   appears that always returns `409`

**Corollary that is easy to miss:** because the client is never the authority, **every
mirrored rule still needs its server error handled**. A form that validates perfectly
client-side and has no `400` branch is not finished — it is one server rule change away from
a submit that silently does nothing.

## Localization

| Item | Rule |
|---|---|
| `title`, `detail`, `errors[*]` messages | Already translated on arrival (BR-8.6). Render as received. Do not re-translate, do not map to a client key, do not post-process |
| `type`, `errors` **keys**, `status`, `traceId` | Never localized (BR-8.7). Byte-identical in every locale — which is what makes `problemCode` safe to branch on |
| Client-authored failure copy | `frontend-spec.md` i18n table. Every key in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| `traceId` rendering | `dir="ltr"`, Latin digits, no digit shaping (BR-8.13) |
| Enum values inside a message | Identifiers. `InProgress` is not translated; only its **label** is, from the client catalogue |

Before `005` ships, every sentence is English at both locales. That is not a defect and not
a `400` — asking for a language the system does not yet speak is not a client error
(BR-8.3). Nothing in the machine-readable half of the envelope changes when `005` arrives,
which is exactly why the frontend can build against this now.

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/error-contract.md`](contracts/error-contract.md). A difference is a defect in one
of the two, and both are corrected — never one silently (`REV-002-02`,
`docs/sdd/openapi/README.md`).

If the contract moves while you are building, it arrives as a **Contract changes** entry in
[`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by the
frontend failing to compile is the failure that process exists to prevent — and a change to
*this* contract is a change to every feature at once, which is why it is the hardest one to
unfreeze.
