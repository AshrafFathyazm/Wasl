# 022 — AI Notes

Per Constitution VI: what AI was used for, what was accepted, what was modified, what was
rejected and why, and how each accepted output was verified. No secrets and no production
data were placed in a prompt.

The failure mode being guarded against is specific: plausible output referencing rules,
files, or values that do not exist. In a specification that shows up as a cited identifier
that is not in the blueprint, or a number asserted with confidence and never checked.

---

## Specification

### What AI was used for

| Activity | Output |
|---|---|
| Reading the blueprint and locating what constrains this feature | The citation set in `spec.md`, Rules referenced |
| Deriving the contrast gate's boundaries from the formulas in `design/theming.md` | `research.md` R-2 and R-3, and the fixture in AC-11 |
| Drafting all nine artifacts in this folder | Every file here |

### Accepted as-is

| Output | Why it stood | How it was verified |
|---|---|---|
| The four hard parts as the spine of the spec | ADR-012 states them itself, in that order | Read against ADR-012 in full. Each maps to at least one AC — the map is in `checklists/requirements.md` |
| `char(7)` for `BrandColorHex` | `settings-and-uploads.md` specifies it, and ADR-013's `inet → varchar(45)` row gives the reasoning for ASCII-only machine values | The ADR-013 row was read, not recalled: *"IPv6 maximum textual length. ASCII, so `varchar` is correct here"* |
| The pre-paint `localStorage` read | Not invented here — `screens/02-app-shell.md` already restores the sidebar collapse state this way and says *"before first paint, like the theme"* | `grep` for the sentence; quoted in `research.md` R-5 |
| `errors/concurrency-conflict` and `errors/duplicate-customer`-style `type` naming | `05-api-conventions.md` lists the `409` types explicitly | Read from that file's Error contract section |

### Modified

| Draft | Change | Reason |
|---|---|---|
| A single "contrast check at 4.5:1" | Split into three checks — text, hover/active, surface — with `refusedBy` naming which one refused | The hover mix is lighter by construction, so a colour near the white-foreground boundary passes on its base and fails on hover. Nothing in the blueprint says to check the ramp members, and nothing says not to; the gate is worthless if the state a user spends half their time looking at is ungated (AC-13) |
| `varchar(10)` for `SidebarMode`, copied from `settings-and-uploads.md` | `nvarchar(10)` | That file predates ADR-013 (it also specifies `bytea`), and `001`'s convention table stores enums as strings via `HasConversion<string>()`, whose SQL Server default is `nvarchar`. Ten bytes on one row is not worth one anomalous column (`research.md` R-7) |
| "The theme ships in the bootstrap response" | Auth response **plus** a read endpoint **plus** a pre-paint cache, with the flash accounted for on each path | `grep -rn -i "bootstrap"` returns only three prose mentions and no endpoint anywhere in the blueprint. Writing "the bootstrap response" as though it existed would have been the exact failure mode this section guards against |
| A general "pale colours are the risky ones", taken from `design/theming.md`'s testing table | The four-verdict fixture, with the refusal band identified as **mid** luminance | Arithmetic (below). Pale colours exercise the *computed foreground*; mid-tone colours exercise the *refusal*. They are different tests and the second one is the one a naive fixture misses |
| A `bestContrastRatio` formatted as `"4.02:1"` | Numeric extensions, formatted client-side | A preformatted ratio puts one locale's number formatting inside a translated string. BR-8.7 keeps machine-readable values identical across locales; a number is one |

### Rejected

| Suggested | Rejected because |
|---|---|
| An `IThemeProvider` / `IBrandingRepository` abstraction | The constitution forbids an abstraction with one implementation and no second in prospect. `DbSet<T>` is already a repository |
| A `ThemePresets` table with seeded palettes | Full custom palettes are excluded by ADR-012. A table for the refused feature is the schema arriving before the decision is reversed |
| Storing the derived ramp alongside the brand colour so the client sets six variables | Two implementations of the ramp, one in C# and one in CSS, that must agree forever. `plan.md` records the full argument |
| Suggesting the nearest acceptable colour when one is refused | Not specified anywhere. It is a palette feature wearing a helpful hat, and Q-F names the real answer — a derived darkened action colour, owned by `006` |
| A dismissible warning instead of a refusal | ADR-012 is explicit: refuse, with an explanation. A dismissible warning becomes an unreadable product whose cause nobody remembers choosing |
| Making `GET /api/settings/branding` unauthenticated so the sign-in screen is branded | ADR-005 is Accepted and blanket. A planned design file's "Any" is not an amendment. Recorded as Q-A with the consequence accepted rather than the rule quietly bent |
| Adding logo columns now "since they are designed already" | `settings-and-uploads.md` puts the logo later than this feature. A `varbinary(max)` column nothing writes to is an invitation, and `001`'s no-speculative-index rule applies to columns for the same reason |
| Writing `docs/sdd/design/screens/012-settings-branding.md` as part of this specification pass | Out of this folder's boundary. It is `DOC-022-01`, executed during implementation and written against what was actually built |

### How the arithmetic was verified

`research.md` R-2 and R-3 contain hand-derived numbers, and hand-derived numbers are
exactly what an AI-assisted document gets confidently wrong. Three things were done about
it:

1. **The derivation is shown, not just the result** — the two inequalities and the
   luminance of `#0D2626` are in the file, so the arithmetic can be checked rather than
   trusted.
2. **Every fixture colour's verdict is stated with both ratios**, so a wrong luminance
   shows up as a verdict that does not match its own numbers.
3. **AC-9 makes the test recompute the band** and print it. `research.md` says in its own
   header that its figures are not the specification. If the implementation's boundaries
   differ from R-2's, the test is right and the research file is corrected — the numbers
   are a prediction, and `DOC-022-04` records the observed ones.

**Not yet verified, and named as such:** no code has been run. The formulas were
transcribed from `design/theming.md` and evaluated by hand; nothing in this folder has been
executed against a compiler, a database, or a browser. Every claim here is a specification
claim.

### Referenced APIs, packages, and values confirmed to exist

| Referenced | Confirmed by |
|---|---|
| `--navy-900: #1D174D`, `--Text-Primary: #0D2626`, `--border-focus: var(--blue-500)`, `--sidebar-width: 288px` | Read from `docs/sdd/design/tokens.css` |
| The absence of `--brand` and `--on-brand` | `grep -n -i "brand" docs/sdd/design/tokens.css` — only comments and `--action-primary-bg: var(--navy-900)` |
| `IAuditableCommand` and its architecture test | `specs/README.md` Phase 0 row for `003`, and `04-business-rules.md` BR-9 |
| `Testcontainers.MsSql`, `WebApplicationFactory`, `HasConversion<string>()`, `.IsRowVersion()` | ADR-013, the constitution's technology table, and `specs/001-solution-skeleton/data-model.md` |
| `sys.check_constraints` as the way to prove a constraint exists | `specs/001-solution-skeleton/spec.md` AC-12, which does the same thing for the same reason |
| The `Manager` policy and the two seeded roles | ADR-005 |
| `color-mix(in oklab, …)`, `color-scheme`, `performance.mark`, `first-contentful-paint` | Platform features named in ADR-012, `design/theming.md`, and `DESIGN-BRIEF.md` rule 16. Their **support** is assumption A-3 and `research.md` R-4, not a claim |

### Prompt hygiene

No connection string, signing key, password, token, or customer data was placed in a
prompt. The only values used were design tokens from `docs/sdd/design/tokens.css` and hex
colours chosen for the fixture, none of which is a secret.

---

## Implementation

---

## Testing
