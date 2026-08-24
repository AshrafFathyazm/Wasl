# Frontend API Guide — 003 Audit Trail

**Nothing to consume. There is no HTTP surface in this feature.**

`003` adds a table, two MediatR pipeline behaviours, a redaction rule, a database permission
grant, and an architecture test. It adds no endpoint, changes no request body, changes no
response shape, and makes no new status code possible. There is nothing for the frontend
lane to start against and nothing for it to wait for.

| What a frontend lane might expect here | Where it actually is |
|---|---|
| Endpoints for reading the audit log, their query parameters, the paged response shape, and the `Manager`-only `403` | **`019-audit-log-access`** (US-015, FR-6.6, FR-6.7) |
| `ProblemDetails`, `traceId`, and the rule that you branch on `type` and never on `title` | `002-error-contract` |
| The token, the two roles, and what a `401` versus a `403` means | `004-auth-and-roles` |

One thing that is worth reading before `019` is specified, because it is already frozen by
this feature: the JSON shape of `AuditLog.Changes`, in
[`data-model.md`](data-model.md). `019`'s response will project it, and the envelope keys
(`entity`, `id`, `field`, `before`, `after`) are machine-readable and never localized
(BR-8.7). A redacted field arrives as `"[redacted]"` for both `before` and `after` — that is
data, not a placeholder to hide, and `019`'s UI is expected to render it as written.

No provisional TypeScript types are given here. Writing them now would freeze a guess at
`019`'s response shape, which nothing in this feature has the standing to decide.
