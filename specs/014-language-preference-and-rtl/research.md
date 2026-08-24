# 014 — Research

Questions that had to be answered before the plan could be written, what was checked,
and what each one settled. Several were settled by reading the original artifacts and
finding that the answer they assumed no longer holds — those are the valuable ones.

---

## R-1 · Could `005-localization-core` have caught the middleware-ordering defect?

**The concern, from ADR-007 decision 4:** `UseRequestLocalization()` must be registered
**after** `UseAuthentication()`, or the claims-based culture provider finds no user,
returns null, and the system falls back to `Accept-Language` forever. ADR-007 calls this
"the single most likely defect in this piece of work" and says it fails quietly.

**Checked:** what a test in `005` could actually assert, given what exists at that point.

**Settled: no, and this is why `TEST-014-05` lives here.** In `005` no user has a stored
preference, because the column and the endpoint do not exist yet. A provider registered
before `UseAuthentication()` finds no user and falls through to `Accept-Language`; a
provider registered after finds a user with no preference and falls through to
`Accept-Language`. **The two configurations are indistinguishable.** Any test written in
`005` passes under both orderings.

The defect becomes observable for the first time on the first request made by a user who
has chosen Arabic while their browser says English — which is this feature, and nowhere
earlier.

**Consequence for the plan:** `BE-014-03` and `TEST-014-05` are marked not droppable, and
the plan says why rather than repeating ADR-007's warning.

---

## R-2 · Does the stored preference reach BR-8.4's resolution order in the same session?

**The concern:** the original plan states, correctly, that the token is not reissued and
"the claim catches up at the next token issue". It then says the client "applies the new
language immediately from its own state" — and stops there.

**Checked:** BR-8.4's order (`?culture=` → claim → `Accept-Language` → `en`) against
BR-8.5 (a stored preference outranks the header) and ADR-005 (no refresh-token flow).

**Settled: it does not, and the gap is invisible in review.** The claim still says `en`,
and the claim outranks the `Accept-Language: ar` the client now sends. So:

| Surface | Language after an in-session switch to Arabic |
|---|---|
| Labels, buttons, headings (`react-i18next`) | Arabic, immediately |
| `ProblemDetails.title`, `detail`, validation messages | **English, until the next sign-in** |

Nothing errors and nothing logs. A reviewer who checks the interface labels sees a
working feature; the mixed-language state only appears when someone triggers a server
error, in Arabic, in the same session.

**Options weighed:**

| Option | Cost |
|---|---|
| Reissue the token from `PUT /api/me/language` | Cleanest. Changes AC-5's `204` into a `200` carrying a token — a contract change other features cite, and it puts a token in a response body outside `/api/auth/token` |
| Read `PreferredLanguage` from the database per request | Correct and always fresh. It is the per-request read ADR-007 decision 4 exists to avoid |
| Client sends `?culture=<locale>` until the next token issue | No reissue, no read, no contract change. Uses the top of BR-8.4's order for exactly what a precedence rule is for. Puts `culture` in the request URL, and therefore in the TanStack Query key — which is arguably correct |
| Accept the lag | What the original artifacts did, without recording it |

**Settled:** `?culture=` as the working assumption (`FE-014-10`, AC-24), with the reissue
recorded as the alternative in `spec.md` Q-7 and as a pending entry under **Contract
changes** in `plan.md`. The one thing not on the table is leaving it unwritten.

---

## R-3 · `varchar(5)` or `nvarchar(5)` for a BCP-47 tag?

**The concern:** ADR-013 row 4 requires `nvarchar` for every column a human writes into,
because `varchar` returns `????` for Arabic. A language tag is ASCII, so the stated
reason does not apply and mechanical translation would be cargo cult.

**Checked:** what EF Core sends as a parameter type for a `string` property on SQL
Server, and whether this column is ever a predicate.

**Settled: `nvarchar(5)`, for reasons about the codebase rather than the data.** EF sends
`nvarchar` parameters, so a `varchar` column would be an implicit conversion — free here,
because nothing filters on this column, but it would be the only column in the schema
where that is true. One exception in a uniform schema is a question every future reader
has to re-answer.

**Rejected:** `char(2)`. It would forbid a future `pt-BR`-shaped tag for no gain, and
NFR-9 promises a third locale costs a resource file.

---

## R-4 · Does this feature have a migration at all?

**The concern:** the original plan names the migration `AddSupportUserPreferredLanguage`.
But `03-domain-model.md`'s physical shape shows `PreferredLanguage` inside the
`CREATE TABLE dbo.SupportUsers` statement, and `004-auth-and-roles` creates that table
because sign-in cannot work without it.

**Checked:** which feature owns `dbo.SupportUsers` (`004`), and what happens in each
case.

**Settled: unknown until `004` is built, and the task must handle both outcomes.** Either
is fine; both silent failures are not. If the column was never created, the endpoint
throws at runtime on the first write, and the exception names a column rather than a
feature. If it exists and a migration is written anyway, either the migration fails on a
clean database or EF generates an empty `Up()` nobody notices — and the feature is
recorded as having a migration it does not have.

**Consequence:** `BE-014-11` runs a `sys.columns` query **first** and is closed either by
a real migration or by a recorded no-op. The query is in `data-model.md`. Not `psql \d+`:
this is SQL Server, and ADR-013 supersedes ADR-001.

---

## R-5 · Is `ar-EG` → `ar` free, or does it need code?

**Checked:** .NET culture fallback and what `RequestLocalizationOptions` does with a
region tag it has not been given.

**Settled: free, provided the *neutral* culture is the one registered.** `ar-EG`'s parent
chain reaches `ar`, so a request for `ar-EG` or `ar-SA` resolves to the `ar` catalogue
with no per-region resource file (BR-8.2, AC-11).

The trap is registering `ar-SA` instead of `ar`: `ar-EG` would then **not** match, and it
would fall back to `en` while looking like a configuration that supports Arabic. Registering
the neutral culture is a one-word decision with a silent failure mode, so `AC-11` gets a
test rather than a comment.

---

## R-6 · Does an unsupported locale produce `400` anywhere?

**The concern:** BR-8.3 and FR-5.8 require `fr` to fall back to `en` with a success
status. That is easy to get wrong by adding validation that looks helpful.

**Checked:** what `RequestLocalizationOptions` does with an unmatched culture.

**Settled: nothing to build.** The framework falls through to `DefaultRequestCulture`
silently, which is exactly BR-8.3. `AC-12`'s test therefore exists to prove that nobody
*added* a `400` — it guards an absence, which is the kind of test that gets deleted as
pointless by someone who has not read this paragraph.

**One asymmetry that had to be decided:** `?culture=fr` and `Accept-Language: fr` fall
back; `PUT /api/me/language` with `"fr"` returns `400`. Requesting a locale is asking to
be understood; storing a preference is asserting a value, and asserting an unsupported
one is a client error. It is in the contract's behaviour table because it is the thing a
reader is most likely to file as a bug.

---

## R-7 · Do i18next plural suffixes give all six Arabic categories?

**Checked:** the suffix set i18next uses and where the category comes from.

**Settled: yes, via `Intl.PluralRules`, with the modern suffix names** — `_zero`, `_one`,
`_two`, `_few`, `_many`, `_other` (BR-8.14, ADR-007 §9). The older numeric form
(`key_0`, `key_1`, `key_2`) belongs to i18next's pre-v21 compatibility mode; mixing the
two produces keys that resolve in English and silently fall back in Arabic, which the
parity test **will not catch** because both catalogues would have matching wrong keys.

**Consequence:** `TEST-014-13` asserts rendered output at 0, 1, 2, 3, 11, and 100 rather
than asserting that keys exist. Those six values are one per category — the set exists so
that "the plural works" cannot be claimed from testing 1 and 5.

---

## R-8 · Does `Intl` give Latin digits under `ar` by default?

**Checked:** `Intl.NumberFormat('ar')` and `Intl.DateTimeFormat('ar')` output.

**Settled: no — the default is Arabic-Indic (`٠١٢٣`), which is correct Arabic typography
and wrong here** (ADR-007 §7). The locale string must be explicit:
`ar-u-ca-gregory-nu-latn`. The `-nu-latn` subtag is doing real work and the `-ca-gregory`
subtag guards against a runtime whose default calendar for `ar` is not Gregorian.

This is the failure mode where the code looks right — someone wrote `'ar'`, which is the
obvious thing — and a ticket number renders as `TCK-٢٠٢٦-٠٠٠٠٤٢`, unsearchable against
the stored value and unusable when read aloud. `TEST-014-14` asserts the digits, not the
locale string.

---

## R-9 · Why is Arabic clipped in the design system's typography?

**Checked:** `design/tokens.css` and blueprint `11-open-questions.md` Q-13. Line height
is **100%** and vertical trim is **cap height**, both read off layers rather than
inferred.

**Settled: the combination clips Arabic, and it presents as a font fault.** Arabic glyphs
descend well below the baseline (final ي ج ع) and carry marks above cap height (ث ض).
Cap-height trim removes the space those need, at every size, in every component.

What makes it dangerous is not the severity but the appearance: shaved tops and tails
read as a bad web-font load or a broken glyph fallback, not as a spacing token. A
reviewer who does not read Arabic has no reason to file it against CSS.

**Fix, already in `tokens.css` as values with nothing applying them:** `--leading-ar-*`
(1.3 / 1.75 / 1.45) instead of `--leading-*`, and **cap-height trim not applied to Arabic
at all** — there is no trim value that keeps both the marks and the descenders. Letter
spacing stays `0` for Arabic permanently; Arabic is cursive and positive tracking breaks
the joins.

**Consequence:** `FE-014-11`, verified by looking at every type size in Arabic rather
than by a test, and specified in `frontend-spec.md` rather than left to a stylesheet.

---

## R-10 · Which Arabic typeface, and was one ever chosen?

**Checked:** blueprint `11-open-questions.md` Q-15. The Arabic layer in the design
(`الصفحة 01`) reports its font as **IBM Plex Sans**.

**Settled: IBM Plex Sans contains no Arabic glyphs, so that layer is rendering through a
fallback — whatever typeface the machine happened to supply.** The Arabic in the designs
is very likely not a choice anybody made.

**Working assumption:** `IBM Plex Sans Arabic` — a separate family by the same designers,
open source, on Google Fonts, the obvious pairing. Set as `--font-ar`.

It is recorded as `spec.md` Q-6 rather than treated as inherited, because the Arabic face
is half the typography of a bilingual product and it is the half nobody reviews — the
reviewers read English. Inheriting an accidental fallback is worse than choosing, because
it looks settled.

---

## R-11 · Where does the key-parity test live now?

**The concern:** the original plan puts it in `tests/Wasl.Application.Tests`. Under
ADR-010 there is no `Wasl.Application` project and there are exactly two test projects.

**Checked:** where the `.resx` files are embedded after the ADR-010 restructure —
`Wasl.Api/Common/Localization/Resources/`.

**Settled: `tests/Wasl.Api.IntegrationTests/Localization/ResourceKeyParityTests.cs`.** It
needs no database and no server; it reads the embedded resource sets from the `Wasl.Api`
assembly and compares key sets in both directions. It lives in the integration project
because that is the project that references `Wasl.Api`, not because it integrates
anything.

The frontend half stays where it is, next to the catalogues it reads
(`src/wasl-web/src/lib/i18n/parity.test.ts`). Two parity tests, because there are two
catalogue systems and one test cannot see both (AC-20, NFR-8).

---

## R-12 · Does this endpoint need `expectedVersion`?

**Checked:** `05-api-conventions.md`'s concurrency section against ADR-006 as amended by
ADR-013. `SupportUsers` carries a `rowversion`.

**Settled: no.** The convention names endpoints that mutate a ticket or a customer; this
mutates neither, and the only writer of a person's own language preference is that
person. A `409` would be a conflict with oneself.

Recorded in the contract as a status code deliberately never returned, because a reader
who knows the convention will otherwise assume it was forgotten. If a user-administration
feature ever writes to `SupportUsers` from a second actor, it adds the token — and the
`rowversion` is already there, maintained by the database rather than incremented by
application code.

---

## R-13 · What does the audit obligation cost here?

**The concern:** the original artifacts predate ADR-008 entirely. No task carried an
audit obligation, and `NFR-10`'s architecture test fails the build when a state-changing
command does not implement `IAuditableCommand`.

**Checked:** BR-9's action-naming table, and BR-9.2 / BR-9.3 / BR-9.4 / BR-9.8 against
what this feature does.

**Settled: three obligations, one of them a negative.**

| Obligation | Rule | Note |
|---|---|---|
| `SetLanguageCommand` implements `IAuditableCommand`, action `User.LanguageChanged` | BR-9.1 | The name is already in BR-9's table. Nothing invented |
| The row is written by the pipeline behaviour in the same transaction, and is absent after a rollback | BR-9.3 | Structural, not remembered — which is the point of the behaviour |
| A `PUT` that changes nothing writes **no** row | BR-9.8 | The negative case. Rows recording that nothing happened are what make an audit log unreadable |
| A `401` writes `Auth.Unauthenticated` **outside** any transaction | BR-9.2, BR-9.4 | The opposite obligation to the row above, hence a separate test rather than a variation |

Nothing in `Changes` needs redaction (BR-9.7) — two language codes. Stated rather than
assumed, because "nothing sensitive here" is a conclusion, not an absence of thought.

---

## R-14 · Can the integration tests run without a real database?

**Checked:** what the tests in this feature actually assert.

**Settled: no.** `Testcontainers.MsSql`, never EF `InMemory`, for two specific reasons in
this feature rather than as a general rule:

- The column's `DEFAULT 'en'` is a database default. `InMemory` does not apply it, so
  every test would pass with the value silently null and the migration would be unproven.
- `TEST-014-17` asserts that the audit row is **absent** after a forced rollback. That
  needs a real transaction, which `InMemory` does not have.

The container image and its two non-obvious requirements are settled in
`001-solution-skeleton`'s `research.md` R-1 and are not re-litigated here.
