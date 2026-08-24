# 004 — AI Notes

Per Principle VI, this records what AI was used for, what was accepted, what was modified,
what was rejected and why, and how each accepted output was verified.

The sections below are per phase. **Implementation and Testing are empty headings, and they
stay empty until that work has actually been done.** An empty section is honest; a
pre-filled one is a false statement about work that has not happened.

No secret, no connection string, no signing key, no seed password, and no production data
was placed in any prompt. Nothing in this feature required one: the design is about claim
names, middleware order, and column types.

---

## Specification

### What AI was used for

| Use | Output |
|---|---|
| Reading the blueprint and extracting what this feature is bound by | ADR-005 in full, BR-6, FR-4, `01-login.md`, `02-app-shell.md`, `03-domain-model.md` § SupportUser, plus `05-api-conventions.md`, `09-definition-of-done.md`, ADR-007, ADR-008, ADR-010, ADR-011, ADR-013, and the security checklist |
| Drafting the nine artifacts in this folder | `spec.md`, `research.md`, `data-model.md`, `contracts/auth-api.md`, `plan.md`, `frontend-spec.md`, `FRONTEND-API-GUIDE.md`, `tasks.md`, `checklists/requirements.md` |
| Enumerating the ways a JWT configuration fails **silently** | The list behind AC-6, AC-7, AC-8, AC-9, AC-11, AC-21 |
| Cross-checking three blueprint documents against each other for the same entity | The six tensions in `checklists/requirements.md` |

### Accepted as-is

| Accepted | How it was verified |
|---|---|
| The four silent-failure mechanisms — inbound claim mapping, `RoleClaimType`, `ClockSkew`, and the HS256 minimum key length | Each is a documented property of `Microsoft.AspNetCore.Authentication.JwtBearer` / `Microsoft.IdentityModel.Tokens`, recorded in `research.md` R-2, R-3, R-7 with the specific setting and the specific consequence. **Not yet run** — each becomes a test (`TEST-004-06`, `-07`, `-08`, `-09`, `-11`) whose `Verified by` cell requires reverting the setting and watching the test go red. Until that has happened, these are claims from documentation, and this row says so |
| `PasswordHasher<T>` living in `Microsoft.Extensions.Identity.Core` rather than requiring ASP.NET Core Identity's schema | `research.md` R-1. **Package and type existence to be confirmed by `dotnet add package` and a compile** — that is `BE-004-03`'s first step, and if the type is not there the assumption A-4 is wrong and is corrected rather than worked around |
| Structuring the tasks, IDs, and columns after `001-solution-skeleton/tasks.md` | Compared row by row against that file. Agent and Skill strings copied verbatim from the table in `specs/README.md` |

### Modified

| Draft said | Changed to | Why |
|---|---|---|
| Protect endpoints with `.RequireAuthorization()` on an `/api` route group | `FallbackPolicy` plus an endpoint-inventory test | The group version fails silently: an endpoint mapped outside the group is public and returns `200`. Principle V — the safe state must be the default (`research.md` R-4) |
| Audit the `401`/`403` in a middleware that reads `Response.StatusCode` after `next()` | An `IAuthorizationMiddlewareResultHandler` | The middleware cannot distinguish an authorization denial from a `403` the application produced deliberately, and it runs after the response may have started (`research.md` R-5) |
| Give `IssueTokenCommand` `IAuditableCommand` and let the pipeline write the row | An `INonTransactionalRequest` marker and a direct write | A failed sign-in would roll its audit row back with the transaction — the exact outcome BR-9.4 exists to prevent (`research.md` R-6, `spec.md` Q-C) |
| Return `401` immediately when the email is unknown | Verify against a fixed dummy hash first | The early return is a timing oracle: an unknown email answers faster than a wrong password, which is the enumeration AC-4 forbids by shape |
| Store the token in `localStorage` | `localStorage` or `sessionStorage`, chosen by the *remember me* control the screen already has | It gives an existing control a meaning instead of leaving it decorative, and the difference is exactly what its label promises (`research.md` R-9) |
| Build the login panel as designed | The plain panel; the mesh, aurora, and physics deferred to Phase 6 | ADR-009. Building the heaviest surface in the product before the product exists is the documented way to lose a day |
| Ship the full three-state collapsing sidebar | Expanded and drawer only; collapsed, flyout, and tooltips to `010` | The collapsed state's hard part is the flyout for a group's children, and at this feature the nav has one item and no children |
| A `CHECK` constraint on `Role` and `PreferredLanguage` | No check; the guard is in the domain factory | `03-domain-model.md` § *No lookup tables* rejects exactly this, on the grounds that it implies a value could be added without code |
| A development default for the seed passwords | Fail fast, and document the two `user-secrets` commands | The security checklist forbids falling back to an insecure default. A "development default" is a committed credential with a different name (`research.md` R-8) |

### Rejected, with reasons

| Rejected | Why |
|---|---|
| Adopting ASP.NET Core Identity | The right answer for a real product and out of scope here, exactly as ADR-005 decided. Adopting it inside a feature plan would be amending an ADR by implementation |
| Hand-rolling PBKDF2 over `Rfc2898DeriveBytes` | A security primitive written by us, with our own iteration count, salt handling, and encoding — three things that can be wrong in ways no test here would catch |
| `JwtSecurityTokenHandler` for issuing tokens | It applies an outbound claim map that rewrites claim names on the way out — the same surprise as R-2 in the other direction |
| An `httpOnly` cookie instead of a bearer token | Closes the XSS read, and contradicts ADR-005. It brings CSRF handling and a `SameSite` decision that no requirement asks for (`research.md` R-9) |
| Re-reading the user row on every request to close the deactivation gap | A database query per request, which is precisely what ADR-007 §4 put `PreferredLanguage` in the token to avoid. The gap is stated instead (`spec.md` Q-F) |
| A client-side failed-attempt counter to make login look rate-limited | Trivially bypassed, makes an open gap look closed, and locks out the one user who is typing carefully. Written into `FRONTEND-API-GUIDE.md` as a *do not* |
| Adding a Manager-only endpoint now so the `403` test has a target | Production surface with no consumer, which would then have to be found and deleted. The test host registers one instead (`research.md` R-11) |
| A third test project for `Wasl.Api` unit tests | ADR-010 fixed the project count; a third project to satisfy a naming preference is ceremony |
| Silently correcting the blueprint's `nvarchar`/`varchar` inconsistency on `PasswordHash`, and its ER diagram omissions | Both are reported upward (`research.md` R-13, R-14) and the DDL is followed. Fixing a blueprint inside a feature folder is how two documents come to disagree with nobody knowing |
| Deciding tension 1 and tension 2 unilaterally | Both change `003`, which is not this folder's to change. Recorded as open questions with working assumptions and flagged as needing a human **before `003` starts** |

### What has **not** been verified, and is therefore not claimed

- No code exists. Every "verified by" in `tasks.md` is a future command, not a past
  observation.
- The package and type existence in `research.md` R-1 comes from documentation and is
  confirmed by a compile in `BE-004-03`.
- The four silent failures in R-2, R-3, and R-7 come from documented framework behaviour
  and are confirmed by the deliberate-break step in each test's `Verified by` cell.
- Docker is not running on this machine (`001/research.md` R-8), so nothing that needs a
  container has been executed here.

---

## Implementation

---

## Testing
