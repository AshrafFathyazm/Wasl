# Delivery Log

A running, dated record of what was actually delivered. This is the honest history of
the project: commitments made, work completed, work cut, and rework required.

It exists for two reasons. Internally, it makes the difference between planned and
actual visible while there is still time to react. Externally, it is the evidence for
anything that asks what was delivered and at what cost.

## Session log

| Date | Session focus | Committed | Delivered | Cut or deferred | Rework | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |

## Story completion record

| Story | Specified | Planned | Implemented | Reviewed | Done | Elapsed |
|---|---|---|---|---|---|---|
| US-001 | | | | | | |
| US-002 | | | | | | |
| US-005 | | | | | | |
| US-006 | | | | | | |
| US-007 | | | | | | |
| US-008 | | | | | | |
| US-010 | | | | | |
| US-014 | | | | | | |

## Rework register

Rework is not a failure to hide; it is the most useful signal in the log. Each entry
records what had to be redone and what would have prevented it.

| Date | What was reworked | Root cause | What would have prevented it |
|---|---|---|---|
| | | | |

## Estimate accuracy

Recorded per story so that later estimates improve within the same project.

| Story | Estimated | Actual | Variance | Why |
|---|---|---|---|---|
| | | | | |

## Scope decisions

Every decision to cut, defer, or add scope, with the reason and the moment it was
made. A cut recorded at the time it happened is a planning decision; the same cut
noticed at the end is an incomplete feature.

| Date | Decision | Reason |
|---|---|---|
| | Deferred US-011, US-012, US-013 out of Release 1 | See `08-board.md` — no live provider in scope, and channel is a field rather than a feature |
| | Added localization to core scope; infrastructure moved into the walking skeleton | Retrofitting i18n costs far more than building with it. See `decisions/ADR-007-localization.md` |
| | Added US-014 to Release 1 and named US-006 as the first thing to cut if time runs short | Release 1 grew from seven stories to eight; the cut line moved rather than the estimate being ignored |
| | Confirmed React; closed Q-4 and Q-12 | The Angular argument from ADR-009 is understood and the trade is accepted: if an Angular component library exists, none of it is reusable and all eight primitives are rebuilt. Recorded in ADR-003 rather than left implicit |
| | Proposed ADR-011: React architecture — no global store, URL as state container, feature folders, fetching only at route level | Server state belongs to TanStack Query; the client state that remains is small enough that a store would have nothing to hold |
| | Proposed ADR-010: vertical slices over a thin domain core, amending ADR-002's four-project layout | With the system fully specified, the coupling between features turned out to be near zero, which is what layering protects against. Flagged the convention risk explicitly — a conventional structure understood beats an optimal one defended weakly |
| | Broke the build into seven phases, each ending in something demonstrable | Ordered by cost-of-delay rather than by ease. The rule that resolves the cross-cutting tension: add a concern when there is exactly one consumer — zero is speculative, seven is a retrofit, one is free |
| | Specified sidebar collapse as three states with a flyout for the nested item | Collapse is usually treated as binary, which leaves nested children unreachable and drops the sidebar entirely on mobile. Also recorded the width-animation exception rather than breaking rule 19 silently |
| | Added US-016 Dashboard to Release 2 with a full screen spec | Fifth scope addition, and off the critical demo path. The design principle is recorded: lead with what needs action, not with totals — the test being whether a changing number causes someone to behave differently |
| | Approved eight mark treatments with a slot assignment for each | Each changes exactly one variable — weight, container, colour, or orientation — never the geometry. Two variables at once produces a second mark, and a library of marks is not a system |
| | Extended the identity beyond the mark: pattern, converge loader, empty-state vocabulary, accent role, and a bilingual product glossary | A mark that only appears as a logo is not an identity. All five derive from the same geometry, so nothing new is invented. The loader matters most — it is seen far more often than the logo |
| | Gave teal a defined role: presence, never state; green stays status, never brand | Two colours with no rule is how a palette drifts, and confusing "resolved" with "online" makes both meaningless |
| | Replaced the ray burst with an interactive neural mesh and desaturated the whole panel | Rays were decoration pointing at a centre; the mesh is the idea. The palette had drifted to near-neon violet — high saturation everywhere with glow on everything is what reads as machine-generated, and the fix was subtraction |
| | Chose a contact shadow at the seam over a hard edge or a blend | A gradient between `#12121F` and white produces a dead grey band that exists nowhere else in the system, and lets the panel's noise bleed into the calm half. Rule recorded in `design/DESIGN-BRIEF.md` 21 |
| | Removed the login card; form sits directly on white | An elevated card on a dark background was separating the form from nothing, and cost a shadow, a radius, and a border |
| | Settled the mark as **Converge** — three threads arriving at one node — after two rejected iterations | Both earlier attempts looked right at 48px and failed at 20: one was the standard hyperlink glyph, the other read as a star. Rule recorded: judge a mark at 20px and ask what it resembles before asking whether it is good. Second lesson: when a mark reads as the wrong thing, change the construction, not the count |
| | Rebuilt the login screen spec around the channel network, with a separately designed mobile layout | Mobile was initially a scaled desktop: nodes overlapped into a cross and the headline was hidden. Recorded as a rule — a design that is shrunk breaks; a design is re-laid-out |
| | Named the product **Wasl · وصل** and drew three candidate marks | وصل means both "connection" and "receipt" — the two things the product is. Availability not verified; must be checked before the name goes anywhere public. See `design/brand.md` |
| | Wrote `design/motion.md`: expressive motion confined to login and empty states, 300ms ceiling everywhere else | A marketing site and a working tool have opposite motion requirements. Motion that impresses on visit one is friction on visit four hundred |
| | Reversed the logo-upload exclusion in ADR-012; schema, endpoints, and validation designed in `design/settings-and-uploads.md` | The original reasoning generalised from ticket attachments, which is a different risk profile. Images stored as `bytea` — the right call for three small images, the wrong one at scale, with the migration path recorded |
| | Proposed ADR-012: tenant theming — architecture in the skeleton, settings screen deferred to Release 2 | The token structure already supports it; the hard parts are the derived ramp, the computed foreground, and keeping status colours out of the themeable set. Fourth scope addition — the settings screen is the part to decline |
| | Wrote a full spec per screen in `design/screens/` — ten files covering every element, action, and state | A Figma frame shows one state; a screen has five or six, and the skipped ones are always empty, error, forbidden, and conflict. These bind each element to a token and each action to an endpoint with its failure paths |
| | **Dropped the aperture rule after seeing it at 18px.** Signature is now corner radius 2 plus a tighter 16-unit keyline — felt, not seen | At 18px an interrupted contour reads as a rendering defect or a disabled state, taxes the eye across a dense set, and can collide with meaning (an open padlock is not a closed one). Rule learned: if a signature is visible enough to be noticed as a choice, it is too visible for a functional icon. Full reasoning in `design/icons.md` |
| | Built the 20-icon set with the signature applied; three flagged as needing optical refinement by hand | Drawing the full set exposed that rule 2 was unenforceable on a third of it — open-form icons have no contour to open. The rule now carries an explicit exception clause |
| | Added a two-rule icon signature — corner radius 2 derived from the UI radius ratio, plus one open aperture at a consistent edge | Distinguishes the set without changing any metaphor. Two levers exactly: one is too subtle, three becomes a different set and costs recognition |
| | Decided against a bespoke icon set: open-source stroke set at 1.5px, with only the product mark and three domain icons drawn by hand | Icons in a support tool are read, not admired — novelty costs recognition. Consistency of weight and grid is what reads as "ours". A full set is days against a one-day timebox and earns nothing in the rubric. See `design/icons.md` |
| | Shell preview caught the same dark-mode control defect one screen later, plus a missing `dir="auto"` on table cells | The rule had already been written down and was still missed. Both are now specified as lint rules in CI rather than as prose — a written rule is not a control |
| | Login preview caught a dark-mode rendering defect: native form controls inheriting the host's appearance, producing black inputs and an invisible button | Added rules 16 and 17 to `design/DESIGN-BRIEF.md` — `color-scheme: light` on the root, and every native control's colours set explicitly. First concrete return on the Phase 3b preview gate |
| | Consolidated `design/tokens.css` from all sources: full palette with four complete state pairs, typography, 8pt grid, shell geometry, Button API, and every primitive's geometry | Token extraction closed. What remains are decisions to confirm (Q-15), not measurements to take |
| | Content-area export added an accent purple family, a universal 1.5px icon stroke, and a 4.5px field radius that contradicts the 8px measured from screenshots | The radius disagreement is left visible rather than averaged: `--field-radius` carries the measured value, `--radius-md` keeps 8px, and one more inspected component settles it |
| | Corrected the shell geometry from layer inspect: sidebar 288px not 226 or 320, header 68px not 60 | Both wrong numbers came from measuring a rendering rather than reading a layer — the exact failure mode `design/figma-workflow.md` warns about, caught here on our own work |
| | Typography, spacing, and colour token names resolved from Figma layer inspect | IBM Plex Sans, 400/700, 8pt grid, `Text/Primary` and `Neutral/800` matching the extracted values. Corrects the earlier reading that colour was not systematised — it is, in Variables rather than Styles |
| | Recorded that 100% line height plus cap-height trim clips Arabic, and decided per-locale leading rather than inheriting it | The source has no answer to inherit, and the defect presents as a font rendering fault rather than a missing token, so it would survive review. See `design/tokens.css` note 2 |
| | Type scale captured from the Figma Text styles panel; family, Arabic face, and spacing scale still open | Sizes and weights are exact. Two findings came with it: every style uses `Auto` line height, which is wrong for Arabic, and colour is not in Styles in any usable form. Both recorded in `11-open-questions.md` Q-13 |
| | Figma extraction blocked — seat rate limit, plus the connector requiring an active canvas selection | Typography and spacing stay as labelled placeholders. A prioritised call order is in `design/figma-extraction-plan.md` so a limited budget is not spent on low-value nodes |
| | Added a preview-before-build gate as Phase 3b of the execution workflow | A rendered preview costs minutes; changing a screen that already has tests, translation keys, and query wiring costs hours. See `design/preview-first-workflow.md` |
| | Resolved the Figma-versus-shipped-app conflict in favour of the shipped app for geometry and layout, keeping the export for exact colour values | The shipped product is what people recognise, and the Figma file is marked "To be completed". Every token in `design/tokens.css` is labelled with its source |
| | Extracted colours, radii, and control heights from the All Requests export into `design/tokens.css`; typography left as a labelled placeholder | Text in the export is outlined to paths, so no font information survived. A plausible guess would look deliberate and be wrong — see `11-open-questions.md` Q-13 |
| | Adopted the existing design system at token and primitive level only, timeboxed to one day; screens are not copied | Tokens carry no domain assumptions and most of the visual resemblance. Copying screens from a different domain imports assumptions this CRM does not share. See `decisions/ADR-009-design-system-source.md` |
| | Added an `AuditLog` table distinct from `TicketHistory`; write path in the skeleton, read endpoint deferred to US-015 | `TicketHistory` cascades with its ticket and covers no auth events, so it is a product feature rather than an audit trail. See `decisions/ADR-008-audit-log.md` |
