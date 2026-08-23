# Security Checklist

Reviewed per story in `review.md`, and in full before delivery. Scoped to what this
application actually exposes — an internal API with two roles and one database.

## Secrets and configuration

- [ ] No connection string, signing key, password, or token in source control
- [ ] Local configuration uses user secrets or environment variables
- [ ] `appsettings.json` contains no real value for any secret
- [ ] `.gitignore` covers `appsettings.Development.json`, `.env`, and `*.user`
- [ ] The application fails fast at startup if a required secret is missing, rather
      than falling back to an insecure default

## Authentication

- [ ] Every endpoint except `/health` and `/api/auth/token` requires a valid token
- [ ] Tokens are signed and the signature is verified, including the algorithm
- [ ] Token lifetime is bounded (ADR-005)
- [ ] Passwords are hashed with a purpose-built hasher, never stored or logged in
      plaintext, and never returned by any endpoint
- [ ] A failed login does not reveal whether the email exists

## Authorization

- [ ] Every rule in the BR-6 matrix is enforced server-side
- [ ] The UI hiding a control is never the only enforcement
- [ ] Each `403` case has an integration test that calls with the wrong role
- [ ] Data-dependent checks load the data before deciding, not after acting

## Input handling

- [ ] Every input is validated at the boundary before reaching the domain
- [ ] All queries are parameterised — EF Core LINQ, or explicitly parameterised raw SQL
- [ ] No string concatenation into SQL anywhere
- [ ] Search input containing `%`, `_`, or quotes is treated as literal text
- [ ] Request body size is limited
- [ ] String lengths are bounded at both the DTO and the column

## Output and error handling

- [ ] No stack trace, exception type, SQL, or file path reaches the client
- [ ] `500` responses carry only a `traceId`
- [ ] Errors are specific enough to act on and vague enough not to enumerate
- [ ] Responses expose only the fields the caller needs; domain entities are never
      serialised directly

## Logging

- [ ] No password, token, or authorization header is logged
- [ ] Customer contact details are not written to logs at information level
- [ ] Every request carries a correlation id that matches the `traceId` in errors
- [ ] Failed authentication and authorization attempts are logged, without the
      credential

## Data

- [ ] Database constraints back every invariant that matters, not just application code
- [ ] Cascade deletes are deliberate: comments and history cascade with the ticket;
      customers with tickets are restricted
- [ ] No hard delete of anything auditable
- [ ] `TicketHistory` is never updated or deleted by application code

## Frontend

- [ ] The token is not stored anywhere a stray script could read it casually, and the
      chosen storage and its trade-off are recorded
- [ ] No secret is embedded in the client bundle
- [ ] User-supplied content is rendered as text; `dangerouslySetInnerHTML` is not used
- [ ] CORS allows only the known origins

## Audit

- [ ] Append-only enforced by database grant, not by convention (BR-9.5)
- [ ] No credential, token, or signing key reaches the table (BR-9.7)
- [ ] Change diffs are redacted for sensitive fields
- [ ] Reading the audit log is restricted to Managers and is itself audited (BR-9.11)
- [ ] Failed sign-ins are recorded with the attempted email but never the password
- [ ] The table is recognised as a personal-data store — customer contact details appear
      in change diffs, so access control and retention apply to it
- [ ] `IpAddress` and `UserAgent` collection is a deliberate choice, recorded, not an
      accident of what was easy to capture

## Localization

- [ ] User content is rendered as text in both directions; `dir="auto"` is not a
      substitute for escaping, and neither is a `dir` attribute an excuse for `dangerouslySetInnerHTML`
- [ ] Translated strings are treated as data, not as markup — no HTML in a catalogue
      value that is then rendered unescaped
- [ ] A translation value cannot inject a script through interpolation
- [ ] The locale parameter is validated against the supported list and never used to
      build a file path
- [ ] Error messages carry the same amount of information in both languages; a
      translation must not accidentally disclose more than its English source

## Dependencies

- [ ] Every added package has a stated reason
- [ ] `dotnet list package --vulnerable` and `npm audit` were run and the output recorded
- [ ] No package was added on an AI suggestion without confirming it exists, is
      maintained, and is the package that was actually meant

## Known accepted risks

Stated rather than hidden. Each is a decision, and each has an owner in the ADRs.

| Risk | Why accepted | Where recorded |
|---|---|---|
| No token revocation | Short token lifetime; no session store in scope | ADR-005 |
| No rate limiting on login | Out of scope for an internal MVP; the most serious gap | ADR-005 |
| Users are seeded, not managed | Registration is out of scope | ADR-005 |
| No audit log for customer changes | Only tickets require an audit trail per NFR-5 | `01-product-spec.md` |
