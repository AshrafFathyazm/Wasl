# `005b` — Language Preference (backend half)

**Phase:** 0 · Foundation · **Story:** US-014 · **Status:** Specified, awaiting review

`PUT /api/me/language`, and nothing a user looks at. The switcher screen is the frontend lane's,
as a separate row — which is the split the product owner asked for before this could start.

---

## Measured first, and it moves the numbering

### The contract is already frozen, and it belongs to `014`

`PUT /api/me/language` is fully specified in
**`specs/014-language-preference-and-rtl/contracts/me-language-api.md`** — request shape, the
`204`, both failure codes, and one behaviour note sharp enough to quote:

> **`Content-Language` on this response names the locale that was applied to *this* request**,
> which is the one you were using before the switch. A client that reads it to confirm the switch
> will conclude it failed. This is the single most confusing thing about this endpoint and it is
> behaviour, not a defect.

`005`'s own contract defers the endpoint to `014` by name.

**So `005b` is a number the product owner gave this work on 2026-08-29, and the artefacts call it
`014`.** That is Q-A, and it needs settling before a folder full of files points the wrong way.

### The column and the claim already exist

`004` shipped `SupportUser.PreferredLanguage` (`nvarchar(5)`, `IsRequired`), mints it into the
token as `preferred_language`, and `005` reads it through `PreferredLanguageCultureProvider`.
Measured: the seeded Manager's token carries `"preferred_language":"ar"`.

**There is no migration in this feature.** The column is there, the claim is there, and the
provider that reads it is there. What is missing is the one endpoint that lets a user change it.

### `SupportUser` has no mutator

Every property is `private set` and there is no method that changes one. So this feature adds
exactly one: a domain method that validates and assigns. It is the first mutation `SupportUser`
has ever had.

---

## In scope

- `PUT /api/me/language`, exactly as the frozen contract describes: `{ "language": "ar" }`,
  `204 No Content`, `400` on anything else, `401` with no token
- A `ChangeLanguage` method on `SupportUser` — the entity's first mutator
- `ChangeMyLanguageCommand` · handler · validator, as one folder under `Features/`
- An audit row. It is a state-changing command, so BR-9 applies without exception
- The `NotBuiltYet` entries in `002c`'s contract comparison deleted for whatever this builds —
  **the test fails until they are**, which is how that list stays honest

## Out of scope

| Excluded | Where it lives |
|---|---|
| **The switcher screen** | The frontend lane, as its own row. This is the split |
| `GET /api/locales` | Named in `005`'s contract as *"two locales, both known at build time"* and deferred there. Still deferred, and it stays in `002c`'s `NotBuiltYet` with its reason |
| The Arabic walk of every screen | `014`'s deliverable, and it needs the switcher first |
| Any change to how a culture is resolved | `005`. This feature writes the value that `005`'s provider already reads |
| A migration | There is nothing to migrate. `004` shipped the column |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | `ICurrentUser.UserId` identifies the row to update, and no path parameter is needed | The contract says so explicitly: *"`me` is the subject of the bearer token; there is no path parameter, and no user can set another user's preference"* |
| A-2 | Changing the stored preference does **not** change the current request's culture | It cannot: the culture was resolved before the handler ran, from the claim that was current then. The contract calls this out, and AC-6 asserts it rather than treating it as an accident |
| A-3 | The **token** still carries the old language until the next sign-in | A token is signed and immutable. So the preference takes effect on the next token, not on the next request — see Q-B, because a user who switches and sees no change has met a real behaviour with no explanation |
| A-4 | `RowVersion` exists on `SupportUser`, so optimistic concurrency is available if wanted | It does. Whether this endpoint uses it is Q-C |

## Open questions

| # | Question | Working assumption |
|---|---|---|
| **Q-A** | **This work is called `005b` by the product owner and `014` by the frozen contract.** Which number owns the endpoint? | **Assume `005b` for the folder and leave the contract where it is**, with a line in both pointing at the other. Moving a frozen contract file between features is worse than a cross-reference. **But the board now has both names for overlapping work, and that needs a person to settle** |
| **Q-B** | The stored preference does not affect the current token, so a user who switches sees no change until they sign in again. Does this feature do something about that? | **Assume not, and say so loudly.** The alternatives are re-issuing a token on a language change (a write endpoint that returns credentials — a surprising and security-relevant shape) or reading the preference from the database on every request (a query per request to replace a claim). **Both are larger decisions than this endpoint.** What this feature owes is that the limitation is written where the frontend lane will read it, not discovered on a screen |
| **Q-C** | Does `PUT /api/me/language` take `expectedVersion`? Every other `PUT` in this API does | **Assume NO.** The others guard a shared resource two people can edit; this one writes a single scalar to the caller's own row, and a lost update means the user's last click wins — which is what the user wanted. **Requiring a version here would be consistency for its own sake**, and the frozen contract's request shape has one field |
| **Q-D** | What audit action name? | **`User.LanguageChanged`** — already in BR-9's list in `docs/sdd/04-business-rules.md`, so this is reading the blueprint rather than inventing |

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `PUT /api/me/language` with `{"language":"ar"}` returns `204` with no body, and the caller's row holds `ar` |
| AC-2 | The next token issued for that user carries `"preferred_language":"ar"` — **asserted end to end**, because the column and the claim being in step is the whole point of storing it |
| AC-3 | `en` and `ar` are accepted. `ar-SA`, `AR`, `fr`, `""`, and a missing field are each `400 errors/validation` naming `language` — **a region tag is a `400` here even though `Accept-Language: ar-SA` resolves to `ar` on a read**, because a stored preference with no catalogue behind it is a stored lie |
| AC-4 | No token is `401`. A valid token whose subject row is missing or inactive is **also `401`**, per the contract — not `404`, which would be an enumeration oracle |
| AC-5 | One `User.LanguageChanged` audit row per successful change, in the same transaction (BR-9.4), naming the actor |
| AC-6 | **The `204` carries `Content-Language` naming the locale applied to *this* request — the one before the switch.** Asserted, with the reason in the test, because it is the single most confusing thing about this endpoint and a future reader will otherwise file it as a defect |
| AC-7 | A user cannot change another user's preference. There is no path parameter and no field that names a user — asserted against the request shape, not just by reading the route |
| AC-8 | `002c`'s `NotBuiltYet` no longer lists `PUT /api/me/language`, and `OpenApiContractTests` passes — which it will not until the entry is deleted |
| AC-9 | Setting the same language twice is `204` both times. Not a `409`: a preference is not a state machine |

## Edge cases

| Case | Expected |
|---|---|
| A user switches to `ar` and keeps browsing | Every response stays in the **old** language until a new token is issued. A-3 and Q-B — recorded, not hidden |
| The row was deleted between token issue and this call | `401`, per the contract |
| `{"language":null}` | `400`, same as missing |
| `{"language":"ar","userId":"…"}` | The extra field is ignored by binding. AC-7 is about the shape offering no such field, not about defending against one |
| Two tabs switch to different languages | Last write wins. Q-C, deliberate |
| An inactive user with a still-valid token | `401`. The same answer as no row, so the two are indistinguishable |

## Rules referenced

- **FR-5.5** — the choice follows the user across devices
- **BR-8.1** — two locales, `en` and `ar`
- **BR-9.4, BR-9.2** — the audit row commits with the change
- **`004`** — the column, the claim, and `ICurrentUser`
- **`005`** — `PreferredLanguageCultureProvider`, which reads what this writes
- **`014`'s frozen contract** — `me-language-api.md`, which this implements verbatim
- **`002c`** — the `NotBuiltYet` entry that must be deleted, and the test that enforces it
