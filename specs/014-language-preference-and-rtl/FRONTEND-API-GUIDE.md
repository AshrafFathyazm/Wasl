# Frontend API Guide — Language Preference (US-014)

Everything the frontend lane needs to build `/settings/localization` and the login-screen
switcher **without waiting for the backend**. Derived from
[`contracts/me-language-api.md`](contracts/me-language-api.md), which is frozen.

> Start now. Do not wait for `BE-014-04`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Locale:** send `Accept-Language: ar` or `en` on every request. Read
  `Content-Language` on the response to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** —
  `title` is translated, `type` is not
- Timestamps arrive UTC with a `Z`. Format for display client-side, in the active locale

## The one endpoint

`PUT /api/me/language` — body `{ "language": "en" | "ar" }`, success `204`.

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once the endpoint is real (ADR-011 decision
6), and the swap is a deliberate task (`FE-014-12`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-014-12.
export type SupportedLanguage = 'en' | 'ar';

export interface SetLanguageRequest {
  language: SupportedLanguage;
}

// 204 No Content — there is no response body type. Do not invent one.

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

Keep `SupportedLanguage` as a union rather than `string`. The endpoint rejects anything
else, and a union means the compiler rejects it first.

### Request

```http
PUT {{baseUrl}}/api/me/language
Authorization: Bearer <JWT>
Accept-Language: en
Content-Type: application/json

{ "language": "ar" }
```

### Responses, and what the UI does with each

| Code | `type` | What the UI does |
|---|---|---|
| `204` | — | Keep the optimistic selection, switch `i18n` + `dir` + `lang`, show the confirmation toast. **Ignore `Content-Language` on this response** — it names the locale you just left |
| `400` | `errors/validation` | Should be unreachable from a two-option radio group; if it happens, **revert the selection** and show `errors.language[0]` above the group. A selection left ahead of the server is worse than an error message |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in; this is not a form error. Keep the chosen locale in `localStorage` so the login screen comes up in it |

There is no `403`, no `404`, and no `409` on this endpoint. The reasons are in the
contract; the consequence for you is that there are no branches for them, and adding
speculative ones would be dead code the next reader has to evaluate.

```ts
const mutation = useMutation({
  mutationFn: (language: SupportedLanguage) => setLanguage(language),
  onMutate: (language) => {
    const previous = i18n.language as SupportedLanguage;
    applyLocale(language);            // optimistic: dir, lang, catalogue
    return { previous };
  },
  onError: (_e, _language, ctx) => {
    if (ctx) applyLocale(ctx.previous);   // revert — see the 400 row above
  },
});
```

## The one thing that will confuse you

**After a successful switch, server-authored messages keep arriving in the previous
language until the next sign-in.**

The stored preference travels in the `preferred_language` JWT claim, the claim outranks
`Accept-Language` (BR-8.5), and the token is not reissued (ADR-005 builds no refresh
flow). So `Accept-Language: ar` on your next request loses to a claim that still says
`en`.

The client closes that gap by sending `?culture=<locale>` — the top of BR-8.4's order —
on every request for the rest of the session:

```ts
// FE-014-10. Set after an in-session switch; cleared when a new token is issued.
let sessionCultureOverride: SupportedLanguage | null = null;

client.interceptors.request.use((config) => {
  config.headers['Accept-Language'] = i18n.language;
  if (sessionCultureOverride) {
    config.params = { ...config.params, culture: sessionCultureOverride };
  }
  return config;
});
```

Two consequences worth knowing before you wire it:

| Consequence | What to do |
|---|---|
| `culture` becomes part of the request URL, so it becomes part of the TanStack Query key | That is correct, not a bug — a cached Arabic response should not be served to an English render |
| The override must be cleared on sign-in | Otherwise it outranks the fresh claim forever, and a preference changed on another device is silently ignored on this one |

## Client-side rules — mirror, never authority

| Rule mirrored | Server is the authority because |
|---|---|
| Only `en` and `ar` are offered | `SupportedLanguages` in the domain is the list. A third locale (NFR-9) appears in the API's `400` message before it appears in your radio group |
| Lowercase tags only | The endpoint rejects `AR` and `ar-SA`. The client never uppercases, never appends a region, and never "helpfully" normalises — two normalisers is how they diverge |
| The choice persists across devices | `localStorage` is the signed-out fallback. On sign-in the **server value wins and overwrites local** — the deliberate choice outranks the device |

Three things the client deliberately does **not** do:

| Not done client-side | Why |
|---|---|
| Translate server messages | They arrive already translated (BR-8.6). Re-translating puts the same sentence in two catalogues, and they drift |
| Translate `type`, `errors` keys, enum values, `TicketNumber`, `traceId` | They are identifiers (BR-8.7). Translating an enum value breaks every filter |
| Decide whether a locale is supported | Send it; the `400` is the answer |

## States — all of them are required

| State | Behaviour | AC |
|---|---|---|
| Idle | Current language selected, both rows interactive | — |
| Saving | The chosen row shows a spinner; both rows non-interactive | AC-5 |
| Success | Locale applied, toast confirms, no navigation | AC-2, AC-5 |
| Error | Selection **reverts**, message above the group | AC-6 |
| Already this language | Row shows selected; clicking is a no-op and sends **no request** | — |
| Unauthenticated | Redirect to sign-in, keeping the chosen locale locally | AC-7 |

There is no empty state and no forbidden state on this screen. Both absences are
decisions, recorded in [`frontend-spec.md`](frontend-spec.md) — absence of a state is a
defect, not a gap (`docs/sdd/design/screens/README.md`).

## Localization

| Item | Rule |
|---|---|
| Labels, section titles, the preview caption, the toast | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| The language names themselves | **Never translated.** `English` and `العربية`, identical in both catalogues. Someone who cannot read the current interface must still find their own language |
| Validation messages from the server | Already translated on arrival. Render them; do not map them |
| `dir` and `lang` | Set together on the document root, once (ADR-007 §6). Every element rendering user content carries `dir="auto"` |
| Layout | CSS logical properties. `margin-inline-start`, never `margin-left` |
| Numbers and dates in the preview | `ar-u-ca-gregory-nu-latn`. `Intl.NumberFormat('ar')` alone returns Arabic-Indic digits, which is the wrong default here (BR-8.13) |

Screen spec, element by element, with tokens and geometry:
[`docs/sdd/design/screens/09-settings-localization.md`](../../docs/sdd/design/screens/09-settings-localization.md).
Login-screen switcher:
[`docs/sdd/design/screens/01-login.md`](../../docs/sdd/design/screens/01-login.md).

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/me-language-api.md`](contracts/me-language-api.md) (`REV-014-03`). A
difference is a defect in one of the two, and both are corrected — never one silently.

If the contract moves while you are building, it arrives as a **Contract changes** entry
in [`plan.md`](plan.md) and this guide is regenerated. One change is already pending an
answer to `spec.md` Q-7: if a reissued token replaces `?culture=`, this endpoint becomes
`200` with a token body and `FE-014-10` disappears. A contract change discovered by the
frontend failing to compile is the failure this process exists to prevent.
