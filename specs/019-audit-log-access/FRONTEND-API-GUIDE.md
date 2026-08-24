# Frontend API Guide — Audit log (US-015)

Everything the frontend lane needs to build `/audit` **without waiting for the backend**.
Derived from [`contracts/audit-api.md`](contracts/audit-api.md), which is frozen.

> Start now. Do not wait for `BE-019-05`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Role:** `Manager` only. An `Agent` gets `403` — and **the denial is recorded**
- **Locale:** send `Accept-Language: ar` or `en`; read `Content-Language` to know which was
  applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title` is
  translated, `type` is not
- Timestamps arrive UTC with a `Z`. Format for display client-side, in the active locale

### The one thing to internalise before writing any code

**Every successful `GET /api/audit` writes a row into the table it just read.** That is
BR-9.11, not a quirk.

So on this screen, and only on this screen, fetching is a side effect:

```ts
// features/audit/queries.ts
useQuery({
  queryKey: ['audit', filters],
  queryFn: () => fetchAudit(filters),
  refetchOnWindowFocus: false,   // every refetch appends a row
  refetchOnMount: false,
  refetchInterval: false,        // never poll. 30s polling = 2,880 rows/day/tab
  staleTime: 5 * 60_000,
});
```

A filter change refetching is correct — a person asked for it. A window regaining focus
refetching is not. `Refresh` is an explicit button.

## The one endpoint

`GET /api/audit` — read-only. There is no create, no update, no delete, and there will not
be (BR-9.5). Any other verb returns `405`.

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose:** they are replaced by
types generated from the OpenAPI document once the endpoint is real (ADR-011 §6), and the
swap is a deliberate task (`FE-019-08`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-019-08.

export type AuditOutcome = 'Success' | 'Denied' | 'Failed';
export type AuditEntityType = 'Ticket' | 'Customer' | 'SupportUser' | 'AuditLog';

export interface AuditQuery {
  entityType?: AuditEntityType;
  entityId?: string;          // requires entityType — 400 without it
  actorUserId?: string;
  action?: string;            // PREFIX match. 'Auth.' returns every Auth.* row
  outcome?: AuditOutcome[];   // repeated in the query string, OR'd
  from?: string;              // ISO 8601 Z
  to?: string;                // ISO 8601 Z
  cursor?: string;            // the id of the last row of the previous page
  pageSize?: number;          // default 20, clamped to 100
}

export interface AuditEntry {
  id: string;                 // a DECIMAL STRING, not a number — see below
  occurredAtUtc: string;      // ISO 8601 Z, millisecond precision
  actorUserId: string | null; // null for anonymous events (failed sign-in)
  actorEmail: string | null;  // SNAPSHOT at write time
  actorRole: string | null;   // SNAPSHOT — the role held THEN, not now
  action: string;             // 'Entity.Verb'. Never translated
  entityType: AuditEntityType | null;
  entityId: string | null;    // may point at a deleted row — no FK exists
  entityLabel: string | null; // snapshotted label; may be Arabic → dir="auto"
  outcome: AuditOutcome;      // never translated
  changes: Record<string, { from: unknown; to: unknown }> | unknown | null;
  traceId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditPage {
  items: AuditEntry[];
  pageSize: number;           // the value ACTUALLY APPLIED after clamping
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId: string;
  errors?: Record<string, string[]>;   // present only on 400
}
```

**`id` is a string, and must stay one.** The column is `bigint`; a value above 2^53 loses
precision in `JSON.parse` with no error, and a cursor built from a rounded id reads the
wrong page. Never `Number(entry.id)`, never arithmetic on it — it is an opaque token that
is echoed back as `cursor`.

**`changes` is typed loosely on purpose.** The `{field:{from,to}}` shape is what
`003-audit-trail` writes and what the server documents, but the server passes the column
through unvalidated (`research.md` R-6). Narrow it with a type guard and fall back to
`<pre>{JSON.stringify(changes, null, 2)}</pre>` for anything else — a row you cannot
pretty-print must still be visible.

### Request

```http
GET {{baseUrl}}/api/audit?entityType=Customer&outcome=Denied&outcome=Failed&from=2026-08-01T00:00:00Z&pageSize=50
Authorization: Bearer <JWT>
Accept-Language: ar
```

Repeated parameters, not a comma-joined list:

```ts
const params = new URLSearchParams();
if (q.entityType) params.set('entityType', q.entityType);
if (q.entityId)   params.set('entityId', q.entityId);      // only with entityType
if (q.action)     params.set('action', q.action);
q.outcome?.forEach(o => params.append('outcome', o));      // append, not set
if (q.from)       params.set('from', q.from);
if (q.to)         params.set('to', q.to);
if (q.cursor)     params.set('cursor', q.cursor);
if (q.pageSize)   params.set('pageSize', String(q.pageSize));
```

### Responses, and what the UI does with each

| Code | `type` | What the UI does |
|---|---|---|
| `200`, `items` non-empty | — | Render the table. Store `nextCursor`; enable **Older** when `hasMore`. Show the applied `pageSize`, which may be lower than what was asked for |
| `200`, `items` empty, no filters | — | Empty state: "no audit activity yet". **Different component and different copy** from the next row |
| `200`, `items` empty, filters active | — | Empty state: "nothing matched" plus **Clear filters**. Never the same as the row above (`10-shared-patterns.md`) |
| `400` | `errors/validation` | Attach each `errors[field]` message to that filter control. An inverted range names **both** `from` and `to` — show it on both |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in. Not a page error |
| `403` | `errors/forbidden` | Inline **Forbidden** state on the page, with the `traceId`. Not a toast, not a redirect. An Agent should never see the entry point, but a deep link is a real path |
| `500` | `errors/unexpected` | Error state: message, `traceId`, Retry. Never a spinner that stops |

`405` is not a state the client can reach — it does not issue any other verb.

## Pagination — this is not the shared pattern

`10-shared-patterns.md` specifies `Rows per page` plus numbered pages `‹ 1 2 3 … 13 ›`.
**That pattern does not apply here.** There is no `page`, no `totalCount`, and no
`totalPages`, because a count over a constantly appended table is a full scan returning a
number that is stale before it renders (`research.md` R-4).

What to build instead:

```ts
// Newer/Older over a cursor stack. The stack is what makes "Newer" possible at all:
// the API only pages one direction.
const [stack, setStack] = useState<string[]>([]);   // cursors already consumed
const older = () => { setStack([...stack, page.nextCursor!]); };
const newer = () => { setStack(stack.slice(0, -1)); };
```

- **Older** is enabled when `hasMore`; **Newer** when the stack is non-empty.
- Rows-per-page stays as a `Select` (20 / 50 / 100) and resets the stack when changed.
- The current cursor belongs in the URL along with the filters, so a page is linkable.
- A cursor from a different filter set is still valid — it is only an `id` boundary — so
  changing a filter does not have to clear it. Resetting the stack on a filter change is
  still the kinder behaviour.

## Client-side validation — mirror, never authority

Mirror the server so the user is told sooner. Every rule below is enforced server-side;
the client is not the authority (ADR-003, ADR-011).

```ts
const schema = z.object({
  entityType: z.enum(['Ticket', 'Customer', 'SupportUser', 'AuditLog']).optional(),
  entityId:   z.string().uuid().optional(),
  actorUserId:z.string().uuid().optional(),
  action:     z.string().trim().max(80).optional(),
  outcome:    z.array(z.enum(['Success', 'Denied', 'Failed'])).optional(),
  from:       z.string().datetime().optional(),
  to:         z.string().datetime().optional(),
  pageSize:   z.number().int().positive().max(100).optional(),
})
.refine(v => !(v.entityId && !v.entityType), {
  message: 'audit.errors.entityIdNeedsType', path: ['entityId'],
})
.refine(v => !(v.from && v.to) || v.from <= v.to, {
  message: 'audit.errors.rangeInverted', path: ['from'],   // also set on ['to']
});
```

Things the client deliberately does **not** do:

| Not done client-side | Why |
|---|---|
| Escape `LIKE` metacharacters in `action` | The server owns it (`research.md` R-8). Send what was typed |
| Clamp `pageSize` before sending | The server clamps and **tells you what it applied** in the response. Clamping twice means two rules that can disagree |
| Decide whether the user is a Manager | The server is the authority. Hide the entry point for an Agent as a courtesy; render the `403` state anyway |
| Sort, filter or paginate in memory | Every one of those is a server round trip by design |
| Translate `action`, `outcome`, or anything in `changes` | BR-9.10. See below — this is the rule most likely to be "fixed" by mistake |

## Localization — the deliberate mix

| Item | Rule |
|---|---|
| Page title, filter labels, column headers, state messages, buttons | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| `400` messages from the server | Already translated on arrival. Render them; do not map or re-translate |
| **`action`, `outcome`, `entityType`, `entityLabel`, `changes`** | **Never translated, in any locale** (BR-9.10, BR-8.9). `Customer.Updated` renders as `Customer.Updated` in Arabic |
| `traceId`, `ipAddress`, `id`, timestamps in the raw column | Identifiers. Latin digits, no mirroring |
| `dir` | On the document root. `entityLabel` and every value inside `changes` carry `dir="auto"` |
| Layout | CSS logical properties. `padding-inline`, never `padding-left` |

**Arabic chrome around English data is correct here.** It reads like a translation gap and
it is not one: audit content is always English so that a forensic record does not depend on
who was looking at it. `AC-17` is the test, and it is written down so nobody helpfully
"finishes" the translation.

`outcome` is the one exception worth being precise about: the **value** stays `Denied`, and
the `Badge` beside it may carry a translated *label*. If that is done, the raw value must
still be visible or copyable — an auditor pastes `Denied` into a filter.

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/audit-api.md`](contracts/audit-api.md) (`REV-019-03`). A difference is a defect
in one of the two, and both are corrected — never one silently.

If the contract moves while you are building, it arrives as a **Contract changes** entry in
[`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by the
frontend failing to compile is the failure this process exists to prevent.
