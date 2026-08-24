# Frontend API Guide — Localization

Everything the frontend lane needs in order to negotiate a language with the server,
derived from [`contracts/localization-contract.md`](contracts/localization-contract.md),
which is frozen.

This feature adds **no endpoint**. What it adds is two headers that every call in this
product from here on will carry, and one rule about which field to branch on. Read it once
and every later guide gets shorter.

> Start now. Nothing here waits on a backend endpoint, because there is no new endpoint.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
  except `POST /api/auth/token` and `GET /health`
- **Locale out:** `Accept-Language: en` or `ar`, on **every** request, set in one place
- **Locale in:** read `Content-Language` to learn which locale was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title`
  is translated, `type` is not
- Timestamps arrive UTC with a `Z`. Format them client-side, through `formatters.ts`,
  never with an inline `toLocaleString`

## Sending the locale

One place, in `src/lib/api/client.ts`. Not per call, and not per feature.

```http
GET {{baseUrl}}/api/tickets HTTP/1.1
Authorization: Bearer <JWT>
Accept-Language: ar
```

`?culture=ar` also works and outranks everything (BR-8.4). It exists for manual testing
and for sharing a link in a known language — **not** as the application's mechanism. If a
screen ever needs to append `?culture=`, the header wiring is broken.

## Reading the locale back

Every response carries `Content-Language`, naming the locale **applied**, not the one
requested.

| Requested | `Content-Language` | Why |
|---|---|---|
| `ar` | `ar` | Supported |
| `ar-EG` | `ar` | Region resolves to language (BR-8.2). The value is always neutral |
| `fr` | `en` | Unsupported → English, with a `200`. Not an error (BR-8.3) |
| nothing | `en` or `ar` | The JWT claim may have decided it, and it outranks the header (BR-8.5) |

**The last row is the one that surprises people.** A user whose stored preference is
Arabic gets Arabic error messages even when the client sends `Accept-Language: en`. That
is BR-8.5 working as specified, not a bug — and it is why `Content-Language` exists.

```ts
// dev-only. Falling back is legitimate (BR-8.3), so this is never a user-facing error.
if (import.meta.env.DEV) {
  const applied = res.headers.get('content-language');
  if (applied && applied !== requestedLocale) {
    console.warn(`Requested ${requestedLocale}, server applied ${applied}.`);
  }
}
```

Do **not** switch the interface locale to whatever the server replied with. It would flip
the UI out from under a user mid-session because one endpoint answered in English, and the
interface locale is a client concern that `014` turns into a stored preference
(`research.md` R-15).

## Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document (ADR-011 decision 6), and the swap is a
deliberate task, not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists.

/** The only two locales. A third is a resource file plus config (NFR-9), not a code change. */
export type Locale = 'en' | 'ar';

export type Direction = 'ltr' | 'rtl';

/** PROVISIONAL — the shape 002 freezes. Repeated here because every response in this
 *  guide is one of these, and because `type` is the field you branch on. */
export interface ProblemDetails {
  type: string;                          // NEVER localized. Branch on this
  title: string;                         // localized
  status: number;
  detail?: string;                       // localized
  instance?: string;
  traceId: string;                       // NEVER localized. Matches the server log
  errors?: Record<string, string[]>;     // KEYS never localized; VALUES are
}

/** What the api client resolves for every call, success or failure. */
export interface LocalizedResponse<T> {
  data: T;
  /** From Content-Language. The locale the server actually applied. */
  appliedLocale: Locale;
}
```

`Locale` is a union of two literals **on purpose**, even though NFR-9 says a third locale
needs no code change. On the server the supported list is configuration; on the client the
catalogues are bundled at build time, so a third locale is a build anyway — and a union
makes `setLocale('de')` a compile error today rather than a blank screen later.

## Every response, and what the UI does with it

| Code | `Content-Language` | What the UI does |
|---|---|---|
| `200` / `201` / `204` | present | Render. Server-authored strings in the body are **already translated** — render them as received |
| `400` | present | Attach each `errors[field]` message to that field. The **keys** are request field names and are stable across locales, so the attachment logic is locale-independent |
| `401` | present | Session expired or absent. Redirect to sign-in. `title` is already in the user's language — which matters most here, because the user who cannot read English is exactly the one being told to sign in again |
| `403` | present | Inline message, not a banner. `title` is translated; the permission decision is not locale-dependent |
| `404` | present | Inline empty/not-found state |
| `409` | present | Inline, on the field the server named. Branch on `type` to tell a duplicate from a stale version from a forbidden transition — **never** on `title` |
| `500` | present | Generic error state, plus `traceId` shown or copyable. `traceId` is identical in every locale, which is the only reason it is worth showing |

**A missing `Content-Language` on any response is a defect in the server**, not something
the client works around. It means the localization middleware did not run for that path —
which is exactly what AC-11 and AC-12 exist to catch.

## Client-side rules — mirror, never authority

There is nothing to validate in this feature, so the usual mirror table has one row and
several bans instead.

| Rule | Client | Server |
|---|---|---|
| Which locale applies to a request | Sends its active locale as a hint | **Authority.** BR-8.4's four levels, and the JWT claim can override the header (BR-8.5) |

Four things the client deliberately does **not** do:

| Not done client-side | Why |
|---|---|
| Re-translate or map a server message | It arrives translated (BR-8.6). Mapping it would put the same sentence in two catalogues, which is how they diverge |
| Translate a `type`, an `errors` key, an enum value, a `TicketNumber`, or a `traceId` | They are identifiers (BR-8.7). The whole contract rests on them being byte-identical in every locale |
| Decide that `fr` is an error | The server answers `200` in English (BR-8.3). A client that treated that as a failure would break FR-5.8 |
| Format an identifier | `TicketNumber` is a string and renders as one. Passing it through a number formatter is how Arabic-Indic digits get in (AC-27) |

## Rendering rules that come from this contract

| Item | Rule | AC |
|---|---|---|
| Server messages | Render as received. Do not re-key, do not title-case, do not append punctuation | — |
| Direction | `dir` and `lang` on `<html>`, once, from the active locale | AC-20 |
| User content | `dir="auto"` on every element rendering it — use `UserText` | AC-30 |
| Dates and numbers | Through `formatters.ts` only. Arabic is `ar-u-ca-gregory-nu-latn`: Gregorian, **Latin digits** | AC-25, AC-26 |
| Counts | Plural keys, all six Arabic categories. `t('x') + n` is a **build failure** | AC-21, AC-23 |
| Any user-facing string | A key. A literal in JSX is a **build failure** | AC-22 |
| Layout | CSS logical properties. `margin-left` is a **build failure** | AC-24 |

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/localization-contract.md`](contracts/localization-contract.md).
`Content-Language` is a response header on **every** operation, so its absence from the
generated document is itself a finding — in one of the two, and both get corrected, never
one silently.

If the contract moves while you are building, it arrives as a **Contract changes** entry in
[`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by the
frontend failing to compile is the failure this process exists to prevent.
