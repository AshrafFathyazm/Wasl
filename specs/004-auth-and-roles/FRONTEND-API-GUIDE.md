# Frontend API Guide — Auth

Everything the frontend lane needs to build `/login`, the shell, and the API client
**without waiting for the backend**. Derived from
[`contracts/auth-api.md`](contracts/auth-api.md), which is frozen.

> **Two halves.** The first is the one endpoint this feature owns. The second — *Every
> other request* — is the part every future feature's fetcher inherits, so it is written
> once here.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Content-Type:** `application/json`
- **Auth:** `Authorization: Bearer <accessToken>` on every call except
  `POST /api/auth/token` and `GET /health`
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the response
  to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title` is
  translated, `type` is not
- Timestamps arrive UTC with a `Z`. Format for display client-side, in the active locale

---

## Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once the endpoint is real (ADR-011 §6), and the
swap is a deliberate task (`FE-004-01`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-004-01.

export interface TokenRequest {
  email: string;
  password: string;
}

export type SupportRole = 'Agent' | 'Manager';
export type LanguageCode = 'en' | 'ar';

export interface SignedInUser {
  id: string;
  fullName: string;
  email: string;              // normalised: trimmed, lowercased by the server
  role: SupportRole;          // an ENUM VALUE, never a label. Translate via common:role.*
  preferredLanguage: LanguageCode;
}

export interface TokenResponse {
  accessToken: string;        // OPAQUE. Do not decode it — see below
  tokenType: 'Bearer';
  expiresAtUtc: string;       // ISO 8601, Z. Equals the token's exp
  user: SignedInUser;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId: string;
  errors?: Record<string, string[]>;   // 400 only. NEVER present on a 401
}
```

**`accessToken` is opaque.** Everything the UI needs is already in `expiresAtUtc` and
`user`. Decoding the JWT to read `role` or `sub` couples the client to claim names that are
a server-side detail, and points a JSON parser at attacker-influenced input for no benefit.
There is no case in this product where the client needs to open the token.

---

## `POST /api/auth/token`

The only endpoint this feature adds, and the only one that does not need a token.

```http
POST {{baseUrl}}/api/auth/token
Content-Type: application/json
Accept-Language: ar

{ "email": "manager@wasl.local", "password": "<the configured seed password>" }
```

There is **no `rememberMe` field.** The checkbox chooses where the client keeps the token;
the server issues the same token with the same lifetime either way.

### Responses, and what the UI does with each

| Code | `type` | What the UI does |
|---|---|---|
| `200` | — | Store `accessToken` per *remember me*, write `AuthContext` from `user`, call `i18n.changeLanguage(user.preferredLanguage)`, then navigate to `returnUrl` or `/tickets` |
| `400` | `errors/validation` | Attach each `errors[field]` message to that field. Reached only if the client's own Zod check was bypassed — which is a reason to render it properly, not to assume it cannot happen |
| `401` | `errors/unauthenticated` | Render `title` in the **single** error block above the submit. Set the danger border on both inputs, move focus to `email`. **Do not attach it to a field. Do not redirect.** |

```ts
const res = await fetch(`${baseUrl}/api/auth/token`, { /* … */ });

if (res.status === 401) {
  const problem: ProblemDetails = await res.json();
  setFormError(problem.title);         // one block, role="alert"
  emailRef.current?.focus();
  return;                              // NO redirect — we are already on /login
}
```

**The `401` body has no `errors` object and never will.** One body covers an unknown email,
a wrong password, and an inactive account, identical apart from `traceId`. A field-level
message would say which one, which is the enumeration the shape exists to prevent — so
there is nothing to attach to a field even if you wanted to.

### There is no rate limiting

The endpoint does not count attempts, delay, or lock out (ADR-005 names this as the most
serious gap in the product). **The client must not simulate one.** A client-side attempt
counter would be trivially bypassed, would make the gap look closed, and would lock out the
only user who is actually typing carefully.

### `expiresAtUtc`, and what to do at the end of it

The token lasts **8 hours**. There is no refresh and no revocation.

| Do | Do not |
|---|---|
| Treat any `401` from any request as the end of the session (below) | Poll `expiresAtUtc` and refresh — there is nothing to refresh against |
| Optionally warn near expiry | Silently re-issue. Nothing can |

A `401` can therefore arrive mid-task with unsaved form values on screen. That is a real
consequence of ADR-005 having no refresh token, and it is why the redirect preserves
`returnUrl` — the user lands back where they were, having lost only what they had typed.

---

## Every other request

Inherited by every fetcher in the product. `lib/apiClient.ts` implements it once.

### Attaching the token

```ts
headers.set('Authorization', `${tokenType} ${accessToken}`);
headers.set('Accept-Language', i18n.language);
```

Compose the scheme from `tokenType` rather than hard-coding `'Bearer '`. It is in the
response for that reason.

### `401` — the session is over

```json
{
  "type": "https://wasl.local/errors/unauthenticated",
  "title": "Authentication is required.",
  "status": 401,
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

Returned for a missing token, a malformed one, a bad signature, an expired one, a wrong
issuer or audience, and a token signed with the wrong algorithm. **The body never says
which**, deliberately — so there is nothing to branch on and one handler covers all of them.

```ts
if (res.status === 401 && !url.endsWith('/api/auth/token')) {
  clearToken();                                        // both storages
  navigate(`/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`);
}
```

**The `/api/auth/token` exclusion is the whole of AC-27.** Without it, a wrong password
redirects the user from `/login` to `/login`, the form error is discarded by the navigation,
and the screen appears to have done nothing. It is one condition and it is the difference
between a working sign-in screen and a mystery.

Clear **both** `localStorage` and `sessionStorage` (AC-28). The user may have signed in with
*remember me* on one occasion and off on another, and a stale token in the other bucket is
read at the next start-up and produces an immediate `401`.

Do not show a toast. The redirect is the message; a toast on a page that is unmounting is a
flash of text nobody reads.

### `403` — the role does not permit it

```json
{
  "type": "https://wasl.local/errors/forbidden",
  "title": "You do not have permission to perform this action.",
  "status": 403,
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

| Do | Do not |
|---|---|
| Render `title` inline, where the action was attempted (ADR-011 §5 — a `403` is information the user needs, not an unexpected failure) | Sign the user out. The session is perfectly valid |
| Stop | Retry. The answer will not change |
| Hide the control for a role that cannot use it, **as a courtesy** | Rely on hiding it. FR-4.3: the UI only hides what the server would reject anyway, and the server is the enforcement |

`user.role` from the sign-in response is what the UI reads to decide what to show. It is a
convenience for the interface, never a permission check.

**No endpoint in this feature can return `403`** — the `ManagerOnly` policy exists and its
consumers arrive with `011`, `016`, and `019`. The handler is written here so that the first
one does not have to invent it.

### `GET /health`

Anonymous, no token, no `Authorization` header. Not used by the application; documented so
nobody adds a bearer to it and then wonders why the probe changed.

---

## Where the token lives

| *Remember me* | Storage | Lifetime in the browser |
|---|---|---|
| Checked | `localStorage` | Until sign-out, or until the 8 hours expire |
| Unchecked | `sessionStorage` | Until the tab closes |

Both are readable by any script on the origin, so **the token is XSS-exposed by
construction** (`spec.md` Q-A, `research.md` R-9). That is a recorded trade-off, not an
oversight, and it puts two obligations on this lane:

- **No `dangerouslySetInnerHTML`, anywhere.** Every piece of user-supplied content is
  rendered as text (`testing/security-checklist.md`)
- **No token in a query string, a log, or an analytics call.** It goes in the header and
  nowhere else

`tokenStorage.ts` is the **only** module that touches web storage: one read, one write, one
clear. Everything else reads `AuthContext`. Two components reading storage independently is
how they come to disagree about whether the user is signed in.

The token is read from storage **once, at start-up**, before the first paint, so
`RequireAuth` and `RedirectIfSignedIn` both decide with a populated context. A guard that
decides after the first render shows the wrong screen for one frame — which is AC-25's
"never flashes".

---

## Client-side validation — mirror, never authority

```ts
const signInSchema = z.object({
  email:    z.string().trim().min(1, 'auth:error.emailRequired').email().max(320),
  password: z.string().min(1, 'auth:error.passwordRequired').max(256),
  //        ↑ NO .trim() — whitespace is part of a password
});
```

Both rules are enforced server-side; the client exists to tell the user sooner
(Principle III).

| Not done client-side | Why |
|---|---|
| Trimming or lowercasing `email` | The server owns the normalisation. Two implementations of one rule is how they diverge |
| Trimming `password` | A correct password with a trailing space would silently fail |
| Deciding whether the account exists, is active, or is the right role | Only the server can answer, and its answer is deliberately the same for all three |
| Counting failed attempts | See *There is no rate limiting* above |

Messages are **i18n keys, not sentences** — the catalogue resolves them, so a copy change is
one file (BR-8.8).

---

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/auth-api.md`](contracts/auth-api.md). A difference is a defect in one of the
two, and both are corrected — never one silently (`REV-004-02`).

If the contract moves while you are building, it arrives as a **Contract changes** entry in
[`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by the
frontend failing to compile is the failure this process exists to prevent.
