# ADR-005 — Authentication and authorization

**Status:** Accepted · **Implements:** FR-4, BR-6

## Context

The requirements define two roles with genuinely different permissions: only a
Manager may reassign or escalate (BR-6). Those rules cannot be demonstrated without
an authenticated user carrying a role, and enforcing them only in the UI would make
them decorative.

Meanwhile, full identity management — registration, password reset, email
confirmation, refresh-token rotation, lockout — is a project of its own and is not
what the CRM requirements are about.

## Decision

**Minimal but real JWT bearer authentication.**

- Two `SupportUser` records seeded at startup: one `Agent`, one `Manager`.
- `POST /api/auth/token` exchanges email and password for a signed JWT containing
  `sub`, `email`, and `role`.
- Passwords hashed with ASP.NET Core `PasswordHasher<T>` (PBKDF2). No plaintext, even
  for seeded accounts.
- Every endpoint except `/health` and `/api/auth/token` requires a valid token.
- Role-only rules are ASP.NET Core authorization policies at the API boundary.
- Data-dependent rules ("is this user the assignee?") are enforced in the application
  layer, which is the only place with the data.
- The signing key comes from configuration — user secrets locally, environment
  variables elsewhere. It is never in source control.

## Reasoning

"Real, small, and honest about its limits" beats both alternatives. A fake auth
header would make every authorization test meaningless, since the tests would prove
only that a string was read. A full identity system would consume the time budget of
two feature stories to satisfy a requirement that says two roles must be enforced.

Seeding users rather than building registration is the specific corner cut, and it is
recorded here rather than discovered.

## What is deliberately not built

| Not built | Consequence if this went to production |
|---|---|
| Registration and user management | Users can only be added by changing the seed |
| Refresh tokens | The token expires and the user logs in again |
| Password reset | An administrator would have to reseed |
| Token revocation | A stolen token is valid until it expires — mitigated only by a short lifetime |
| Lockout and rate limiting on login | Brute force is possible; this is the most serious gap |
| Email confirmation, MFA | Not applicable to seeded internal accounts |

Token lifetime is set to 8 hours: long enough for a working day, short enough to
limit the revocation gap. This is the mitigation for having no revocation, and it is
a weak one — stated plainly rather than dressed up.

## Alternatives considered

### ASP.NET Core Identity

Rejected for scope, not for quality. It is the correct answer for a real product and
brings password policy, lockout, and token management for free. It also brings a
sizeable schema and a configuration surface that would dominate the build. If this
project continued, adopting Identity would be the first infrastructure task.

### An external provider (Auth0, Entra ID, Keycloak)

Rejected. It requires an account, network access, and tenant configuration, none of
which can be assumed at review time, and it would make the application impossible to
run offline from a clean clone.

### A trusted `X-User-Role` header

Rejected. It is trivially forgeable, which means every authorization test would pass
while proving nothing. Untestable security is worse than absent security, because it
looks like it works.

## Consequences

- Authorization rules are genuinely testable: an integration test can request a
  token as an Agent, call the escalate endpoint, and assert `403`.
- Adding a user requires a code change and a redeploy.
- The gaps above are listed in the README's limitations section, not hidden.
