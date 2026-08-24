# Frontend API Guide — Branding and theming

Everything the frontend lane needs to build `/settings/branding` **and** the pre-paint
theme path **without waiting for the backend**. Derived from
[`contracts/theming-api.md`](contracts/theming-api.md), which is frozen.

> Start now. Do not wait for `BE-022-05`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on **every** call
  here, the read included (spec Q-A)
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the response
  to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title` is
  translated, `type` is not
- `version` is an opaque base64 string. Keep it; the next `PUT` needs it. Never parse it
- Timestamps arrive UTC with a `Z`. Format for display client-side, in the active locale

## The two endpoints, plus one field on a third

| Call | Who | Purpose |
|---|---|---|
| `GET /api/settings/branding` | Any authenticated user | The theme on every load after the first, and the settings screen's read |
| `PUT /api/settings/branding` | Manager | The settings screen's write |
| `POST /api/auth/token` → `theme` | — | The theme on the first paint after sign-in, with no extra round trip |

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once the endpoints are real (ADR-011 decision 6),
and the swap is a deliberate task (`FE-022-01`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-022-01.
export type SidebarMode = 'Light' | 'Dark' | 'Brand';

export interface BrandingResponse {
  brandColor: string;        // #RRGGBB, UPPERCASE — normalised by the server
  onBrand: string;           // #FFFFFF or #0D2626 — computed by the server, do not recompute
  sidebarMode: SidebarMode;
  updatedAtUtc: string;      // ISO 8601, Z
  version: string;           // base64 rowversion — required by the next PUT
}

export interface UpdateBrandingRequest {
  brandColor: string;
  sidebarMode: SidebarMode;
  expectedVersion: string;
}

// POST /api/auth/token gains this. The object is field-for-field identical to the GET.
export interface TokenResponseTheme { theme: BrandingResponse }

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId: string;
  errors?: Record<string, string[]>;
}

// Extensions present ONLY on 400 errors/inaccessible-brand-color.
export interface InaccessibleBrandColorProblem extends ProblemDetails {
  refusedBy: 'text' | 'hover' | 'surface';
  bestContrastRatio: number;
  requiredContrastRatio: number;
  surfaceContrastRatio: number;
  requiredSurfaceContrastRatio: number;
}
```

`BrandingResponse` is one type for three places — the `GET`, the `PUT` response, and the
`theme` object on the auth response. That is not a convenience; the contract guarantees it
and AC-3 tests it. If the generated types ever produce three shapes, one of the three
endpoints has drifted.

### `GET /api/settings/branding`

```http
GET {{baseUrl}}/api/settings/branding
Authorization: Bearer <JWT>
```

| Code | `type` | What the UI does |
|---|---|---|
| `200` | — | Apply the theme (see below). On the settings screen, populate the form and keep `version` |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in |

**No `404` and no empty body.** The row is seeded, so there is no "not configured" branch
to write (AC-1). If you find yourself writing one, the endpoint is wrong, not the guide.

Response carries `Cache-Control: no-store`. Do not add a TanStack Query `staleTime` that
outlives a page load — a stale theme is the defect this feature exists to prevent.

### `PUT /api/settings/branding`

```http
PUT {{baseUrl}}/api/settings/branding
Authorization: Bearer <JWT>
Accept-Language: ar
Content-Type: application/json

{ "brandColor": "#2E7D32", "sidebarMode": "Brand", "expectedVersion": "AAAAAAAAB9E=" }
```

| Code | `type` | What the UI does |
|---|---|---|
| `200` | — | Apply the returned theme (**the returned one, not the typed one** — `brandColor` comes back uppercase and `onBrand` is the server's). Replace `version`. Toast. No reload |
| `400` | `errors/validation` | Attach each `errors[field]` message to that field. A typo, handled as a typo |
| `400` | `errors/inaccessible-brand-color` | The **refusal** state. Render the server's message plus the ratios from the extensions, in the `aria-live` verdict region. **Do not apply the colour.** Do not clear the field — the user is mid-edit |
| `401` | `errors/unauthenticated` | Redirect to sign-in. Not a form error |
| `403` | `errors/forbidden` | An Agent reached the endpoint. Render the forbidden state; do not offer a retry |
| `409` | `errors/concurrency-conflict` | "Someone else changed this" plus a Reload action that refetches and discards the local edit. **Never retry automatically** (ADR-006) |

```ts
if (res.status === 400 && problem.type.endsWith('/inaccessible-brand-color')) {
  const p = problem as InaccessibleBrandColorProblem;
  setVerdict({
    reason: p.refusedBy,                       // 'text' | 'hover' | 'surface'
    message: p.errors?.brandColor?.[0],         // already translated — render as received
    ratio: p.bestContrastRatio,                 // a number; format it locally
    required: p.requiredContrastRatio,
  });
}
```

`refusedBy` is the field to branch on when the UI needs to say *which* problem it is. The
sentence is already translated; the numbers are numbers, so they are formatted client-side
in the active locale. A server-composed `"4.02:1"` would embed one locale's number
formatting inside a translated string.

## Applying the theme — the part that is not a form

This is the requirement most likely to be built correctly and still be wrong. ADR-012:
the theme is written to `:root` **before first paint**. `design/theming.md`: *"`useEffect`
runs after paint. That is the flash."*

```html
<!-- index.html, in <head>, synchronous, BEFORE the bundle -->
<script>
  try {
    var t = JSON.parse(localStorage.getItem('wasl.theme') || 'null');
    if (t && t.brandColor && t.onBrand) {
      var r = document.documentElement.style;
      r.setProperty('--brand', t.brandColor);
      r.setProperty('--on-brand', t.onBrand);
      r.setProperty('--sidebar-mode', t.sidebarMode);
    }
  } catch (e) { /* no cache, private window, corrupt JSON — the default paints */ }
  performance.mark('theme-applied');
</script>
```

| Moment | Source of the theme | Flash? |
|---|---|---|
| First ever load, sign-in screen | Nothing cached — the product default paints | None. The sign-in screen is not branded (Q-A) |
| Immediately after sign-in | The `theme` object on the token response, applied before the app renders | None |
| Every later reload | The `localStorage` cache, applied by the script above | None (AC-18) |
| A reload after another Manager changed it | Cache first, then **one** correction from the `GET` | One frame, accepted and recorded (AC-19) |

Three rules that come out of that table:

1. **`performance.mark('theme-applied')` ships.** It is how AC-17 is verified — its
   `startTime` must be strictly less than the `first-contentful-paint` entry. Remove the
   mark and the criterion becomes unverifiable.
2. **The cache is never the authority.** Every server response overwrites it. It buys
   paint order and nothing else.
3. **The cache read never throws.** A private window or a corrupt value returns null and
   the default paints. A theme cache that can break the app before first paint is worse
   than the flash (A-4).

Write only `--brand` and `--on-brand`. **The ramp is not yours to write** — the five
derived tokens are `color-mix(in oklab, …)` declarations in the stylesheet and recompute
themselves the moment `--brand` changes (`006`). Setting them from JS would be a second
implementation of the ramp.

## Client-side validation — mirror, never authority

The Zod schema and `lib/theme/contrast.ts` mirror the server so the user is told sooner.
Every rule is enforced server-side; the client is not the authority (ADR-003).

```ts
const schema = z.object({
  brandColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, 'settings:branding.color.help'),
  sidebarMode: z.enum(['Light', 'Dark', 'Brand']),
  expectedVersion: z.string().min(1),
});
```

`contrast.ts` mirrors `Contrast.cs`: relative luminance, the two candidate foregrounds
`#FFFFFF` and `#0D2626`, the three checks at 4.5 / 4.5 / 3.0. It exists so the verdict
region updates while typing.

Four things the client deliberately does **not** do:

| Not done client-side | Why |
|---|---|
| Deciding what is stored | The server refuses. AC-23 proves it refuses even when the mirror is bypassed |
| Recomputing `onBrand` from a response | The server sent the value it validated against. A second answer can differ from the gated one |
| Blocking submit on a mirrored refusal | A client that silently blocks a request cannot be observed to be wrong. Let it submit; let the server answer |
| Suggesting a nearby acceptable colour | Not specified. Inventing it is this screen designing the palette feature ADR-012 refused (Q-F) |

`sidebarMode` is sent **case-sensitively**. `Light` is an enum value, not a label
(BR-8.7); `light` is a `400`. The translated words go through i18n keys and never touch
the wire.

## States — every one is required

| State | Behaviour | AC |
|---|---|---|
| Loading | Skeleton on the field, presets, and preview | — |
| Forbidden | An Agent who navigated directly. No form, so no request | AC-5 |
| Idle | Current values, Save disabled | — |
| Dirty | Save enabled; the preview retints locally | — |
| Predicting | The mirror's verdict, live, while typing | AC-23 |
| Submitting | Save disabled; one request per double-click | — |
| Refused | Server message + ratios, announced. Colour not applied | AC-8, AC-21 |
| Validation error | Message on the named field | AC-7, AC-14 |
| Conflict | Explanation plus Reload. No silent retry | AC-6 |
| Success | Theme applied once, cache rewritten, `version` replaced | AC-4, AC-18 |

There is no **empty** state: the row is always seeded. Recorded so the omission is
visibly a decision (`docs/sdd/design/screens/README.md`).

## Localization

| Item | Rule |
|---|---|
| Labels, preset names, helper text, the fixed-tokens notice | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| The refusal message, `title`, `detail` | Already translated on arrival (BR-8.6). Render as received; never re-translate or map |
| `refusedBy`, the four ratio numbers, `sidebarMode`, `brandColor`, `onBrand`, `type`, `traceId` | Identical in every locale (BR-8.7). Format the numbers locally; never translate the values |
| The hex value and the rendered ratio | `dir="ltr"` **explicitly**, not `dir="auto"` — see `frontend-spec.md`, Right-to-left. `#123456` has no strong directional character and mirrors under `auto` |
| Layout | CSS logical properties. `margin-inline-start`, never `margin-left` |

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/theming-api.md`](contracts/theming-api.md). A difference is a defect in one of
the two, and both are corrected — never one silently.

**One dependency to confirm before writing any of this** (`plan.md`, Dependencies):
`006-design-system` must have shipped `--brand`, `--on-brand`, the five derived tokens,
the three sidebar presets, and `--action-primary-bg: var(--brand)`. Today
`docs/sdd/design/tokens.css` points that token at `--navy-900`, a primitive
(`research.md` R-1). Without the rewiring the endpoints work perfectly and the interface
never retints — the feature passes its backend criteria and does nothing.

If the contract moves while you are building, it arrives as a **Contract changes** entry in
[`plan.md`](plan.md) and this guide is regenerated.
