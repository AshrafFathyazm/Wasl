# Screen Specs

One file per screen. Each names every element, every action, and every state — bound to
a token, an icon, an endpoint, and an acceptance criterion.

## Why written rather than drawn

A Figma frame shows what a screen looks like in one state. A screen has five or six, and
the ones that get skipped are always the same: empty, error, forbidden, and conflict.

These specs cover behaviour and appearance together, which is what the person building
the screen actually needs. They are also diffable, greppable, and reviewable in a pull
request.

**They do not replace a preview.** Phase 3b still applies: render the screen before
building it (`design/preview-first-workflow.md`). The spec says what goes on it; the
preview shows whether it works at 18px in two directions.

## Inventory

| # | Screen | Route | Stories |
|---|---|---|---|
| 01 | Login | `/login` | Auth, US-014 |
| 02 | App shell | — | All |
| 03 | Tickets list | `/tickets` | US-006 |
| 04 | Ticket detail | `/tickets/:id` | US-005, 007, 008, 010 |
| 05 | Create ticket | `/tickets/new` | US-005 |
| 06 | Customers list | `/customers` | US-002 |
| 07 | Customer profile | `/customers/:id` | US-002, US-004 |
| 08 | Create customer | `/customers/new` | US-001 |
| 09 | Settings — Localization | `/settings/localization` | US-014 |
| 10 | Shared patterns | — | Modals, toasts, drawers, states |
| 11 | Dashboard | `/dashboard` | US-016 |

## Template

```markdown
# Screen — <name>
Route · Story · Who can reach it

## Purpose            one sentence
## Layout             ASCII regions
## Elements           region · element · component · tokens · icon · i18n key
## Actions            trigger · guard · request · success · failure
## States             loading · empty · error · forbidden · conflict
## RTL                what mirrors and what does not
## Not on this screen deliberate exclusions
```

## Rules that apply to every screen

- Every string has an i18n key in both catalogues. No literals.
- Every screen handles loading, error, and empty. Absence is a defect, not a gap.
- Every interactive element is keyboard reachable with a visible focus ring.
- Every element rendering user content carries `dir="auto"`.
- Colours, spacing, and radius come from `design/tokens.css`. No literals.
- Icons come from `design/icons/`. Nothing is drawn inline in a screen.
