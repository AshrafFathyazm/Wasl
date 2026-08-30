# `005b-language-preference` — summary

**Delivered 2026-08-30. Backend half only, by the split.** 533 tests, 0 warnings, 12 new.

## What was built

| # | What | Where |
|---|---|---|
| 1 | `SupportUser.ChangeLanguage` — the entity's **first mutator** | `Wasl.Domain/Users` |
| 2 | `ChangeMyLanguageCommand` · handler · validator | `Application/Features/Users/ChangeMyLanguage` |
| 3 | `PUT /api/me/language` | `Wasl.Api/Controllers/MeController.cs` |
| 4 | Two catalogue keys in both languages | `Api/Common/Localization` |
| 5 | The `NotBuiltYet` entry deleted from `002c`'s comparison | integration tests |

**No migration.** `004` shipped the column, the claim, and `ICurrentUser`; `005` shipped the
provider that reads the claim. What was missing was the one endpoint that lets a user change it.

## The one thing worth reading

**A user who switches language sees no change until they sign in again.**

The token is signed and immutable, so it carries the old `preferred_language` until the next one
is issued. And the `204` confirming the switch carries `Content-Language` naming the *old*
language, because the culture was resolved from the claim that was current when the request
arrived — long before the handler ran.

The frozen contract calls that *"the single most confusing thing about this endpoint"* and says
plainly it is behaviour rather than a defect. It is now asserted by AC-6, with the reason inside
the test, and repeated in `MeController`'s remarks — because the next person to meet it will be
reading the controller, not the contract.

**Changing it means either re-issuing credentials from a write endpoint — a surprising and
security-relevant shape — or reading the preference from the database on every request instead of
from a claim.** Both are larger decisions than this endpoint. Neither was taken, and the limit is
written where the frontend lane will read it rather than discovered on a screen.

## Deviations

| # | Spec says | Built | Reason |
|---|---|---|---|
| D-1 | — | the supported list is checked in **both** the entity and the validator | Not duplication: the validator answers a request with a `400` naming the field, the entity refuses to construct an invalid state at all. `007` made the same call for `Customer`, and a rule that exists only at the edge is a rule the next caller does not have |
| D-2 | — | the handler queries through `IApplicationDbContext.FirstOrDefaultAsync`, not EF's extension | `Wasl.Application` cannot see `Microsoft.EntityFrameworkCore` and the architecture test **failed the build** on the first attempt. `009` declared that helper for exactly this |

## Known limitations

- **The new language takes effect on the next token, not the next request.** Above.
- **The switcher screen is not built.** Frontend lane, separate row — the split.
- **`GET /api/locales` is still deferred**, and still named in `002c`'s `NotBuiltYet`.
- **Two more unreviewed Arabic strings**, joining the sixty-five. Q-8.

## Numbering, and a conflict that is still open

**This work is called `005b` by the product owner and `014` by the frozen contract.**
`PUT /api/me/language` is fully specified in
`specs/014-language-preference-and-rtl/contracts/me-language-api.md`, and `005`'s own contract
defers the endpoint to `014` by name.

Built under the working assumption stated in the spec — **the folder is `005b`, the contract stays
where it is, and each points at the other** — because moving a frozen contract between features is
worse than a cross-reference. **The board now carries both names for overlapping work, and that
still needs settling.** It is recorded rather than quietly resolved.
