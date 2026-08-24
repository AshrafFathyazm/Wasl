# Contracts — 006 Design System

## This feature has no HTTP surface

No endpoint is added, changed, or consumed. There is no request, no response, no status
code, and no `ProblemDetails` `type` to freeze. Nothing in `src/wasl-web` fetches
anything — which is also the ADR-011 §4 rule holding trivially, since fetching happens
only at the route level and the one route here has no data.

Stated in a file rather than by the folder's absence, because an absent `contracts/`
directory is indistinguishable from a forgotten one, and because `specs/README.md`'s
lane-contract diagram expects every feature to say what it froze.

## Who owns the surface this feature implies

ADR-012 requires the theme to arrive in the **bootstrap or auth response** and be written
to `:root` before first paint. That is an HTTP surface, and it is not frozen here.

| Surface | Owner | Why not here |
|---|---|---|
| The response that carries the tenant theme | `022-tenant-theming-settings`, extending whatever `004-auth-and-roles` establishes as the token/bootstrap response | There is no auth response yet. Freezing a shape against a response that does not exist freezes a guess, and a guessed contract is worse than an absent one because the frontend would build against it |
| Reading and writing the tenant's brand colour and sidebar preset | `022` | ADR-012's recommendation: build the architecture in the skeleton, defer the settings screen |
| The logo upload | `022` or later. Designed in `docs/sdd/design/settings-and-uploads.md` | Planned, not excluded — ADR-012 revised the original blanket exclusion |
| `GET /health` | `001-solution-skeleton`, `contracts/health-api.md` | Already frozen |
| Everything under `/api` | The feature that owns each endpoint | `docs/sdd/05-api-conventions.md` holds the inventory |

## What this feature does publish, and where it is written down

Two contracts exist here; neither is HTTP.

| Contract | Where | Frozen? |
|---|---|---|
| The props of `Button`, `Input`, and `Badge` | [`../frontend-spec.md`](../frontend-spec.md) | **Yes — treat it as frozen the way an API contract is.** `007` builds against these tables. A change goes through **Contract changes** in [`../plan.md`](../plan.md) first, exactly as an endpoint change would |
| The `Theme` object `applyTheme()` accepts | [`../FRONTEND-API-GUIDE.md`](../FRONTEND-API-GUIDE.md) | **No — provisional.** It is the shape `022`'s response must eventually produce, marked `PROVISIONAL` and hand-written from ADR-012. It is replaced by types generated from the OpenAPI document once that response exists |

## The rule that still applies even with no endpoint

`docs/sdd/05-api-conventions.md` and the constitution's principle IV are about the
**server**. One line of them nevertheless binds this feature, and it is the line that
gets forgotten in a UI-only change:

> Machine-readable values — `type`, the keys of `errors`, enum values, `TicketNumber`,
> `traceId` — are identical in every locale. Only human sentences are translated.

`Badge` consumes **enum values** — the six ticket statuses and four priorities. It maps
them to tokens by their untranslated value, and it never maps them by their displayed
label. A `Badge` keyed on a translated string would render neutral for every Arabic
user and nothing would fail, which is why `frontend-spec.md` specifies the map as
`Record<string, …>` over raw enum values and why AC-15 requires an unknown value to
render its raw text rather than a blank.

## Verification

| Claim | How it is checked |
|---|---|
| No endpoint was added | The generated OpenAPI document is byte-identical to the one after `005` |
| The frontend makes no request | `git grep -nE "fetch\(|axios|XMLHttpRequest" src/wasl-web/src` returns nothing |
| The props tables match what was built | `REV-006-01` reads `frontend-spec.md` against the component signatures; a difference is a defect in one of the two |
