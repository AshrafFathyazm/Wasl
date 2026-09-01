// Wasl icon set — OUR ADDITIONS
// 24 box · 16-unit keyline · stroke 1.5 · round caps and joins · corner radius 2
//
// Kept in a SEPARATE FILE from icons.tsx on purpose. icons.tsx is a byte-for-byte
// copy of docs/sdd/design/icons/index.tsx, and a copy stops being a copy the
// moment something is added to it — a drift check over the twenty inherited
// icons would then fail forever, or would have to be weakened to allow additions
// and stop catching real drift.
//
// WHY THIS FILE EXISTS. `design/screens/02-app-shell.md` specifies the user
// popover's Settings and Sign out rows as "icon + label", and the inherited set
// has neither a gear nor an exit glyph — twenty icons, and not one of them.
// DESIGN-BRIEF rule 3 says stop and say so rather than invent; it was said, and
// the product owner's answer was to draw them to the same rules. So they are
// labelled (D) — ours — and not passed off as inherited. Each addition since
// carries the same label and the same reason in its own comment.
//
// `base` is duplicated from icons.tsx rather than exported from it, for the same
// reason the file is separate: exporting it would mean editing the copy.

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/**
 * (D) Settings — a gear.
 *
 * THE FIRST ATTEMPT READ AS A SUN, and the cause was not tooth length: it was the
 * GAP. A sun is a disc with rays standing off it; a gear is a body with teeth on
 * its rim. The first version had one circle and teeth floating 2.6 units away
 * from it, which is a sun exactly.
 *
 * Two concentric circles — body and bore — with eight teeth touching the rim.
 * The bore is what makes it mechanical, and the teeth start where the body ends,
 * so there is nothing for the eye to read as a ray.
 *
 * Body r 5.6 · bore r 2.2 · teeth 5.6 → 7.4, so the glyph spans 4.6–19.4 and
 * stays inside the set's 16-unit keyline.
 */
export const IconSettings = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="5.6" />
    <circle cx="12" cy="12" r="2.2" />
    <path d="M12 6.4V4.6M12 17.6v1.8M6.4 12H4.6M17.6 12h1.8M14.96 9.04l2.27-2.27M9.04 14.96l-2.27 2.27M9.04 9.04L6.77 6.77M14.96 14.96l2.27 2.27" />
  </svg>
);

/** (D) Sign out — the frame stays, the arrow leaves it. DIRECTIONAL: it mirrors
 *  under RTL, and the mirroring is the consumer's, exactly as `design/icons.md`
 *  assigns it. See the `.signOut` rule in Sidebar.module.css. */
export const IconSignOut = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M14.4 7.6V6a2 2 0 0 0-2-2H6.6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5.8a2 2 0 0 0 2-2v-1.6" />
    <path d="M19.4 12h-8.8m0 0 2.6-2.6M10.6 12l2.6 2.6" />
  </svg>
);

/**
 * (D) Eye / Eye-off — the password reveal toggle. Added by `025`.
 *
 * WHY THESE EXIST. The product owner asked for a show/hide control on the
 * password field. The inherited set has no eye, and neither does the login
 * reference — so this is not a glyph that was missed in extraction, it is one
 * the product does not have. DESIGN-BRIEF rule 3 says say so rather than invent
 * silently; it is said here, and they are labelled (D).
 *
 * THE ALMOND IS TWO MIRRORED ARCS, not an ellipse. An ellipse reads as a rugby
 * ball at 16px because its curvature is constant; an eye is pointed at the
 * corners and flat across the lid, which only two arcs give.
 *
 * The keyline is 16 wide and 10 tall, so the glyph optically matches the 16-unit
 * square the rest of the set sits in — a full-width eye looks larger than every
 * icon beside it even when the box is identical.
 */
export const IconEye = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size)} {...props}>
    <path d="M4 12s3.2-5 8-5 8 5 8 5-3.2 5-8 5-8-5-8-5z" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

/**
 * (D) Eye-off — the same eye with a slash.
 *
 * THE SLASH RUNS CORNER TO CORNER AND IS PHYSICAL, not logical. It is a glyph,
 * not a layout: a struck-through eye is struck the same way in Arabic, and
 * mirroring it under RTL would make the two states differ by direction rather
 * than by meaning (ADR-007 §6 names this exception).
 */
export const IconEyeOff = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size)} {...props}>
    <path d="M4 12s3.2-5 8-5c1.2 0 2.3.3 3.2.8M20 12s-3.2 5-8 5c-1.2 0-2.3-.3-3.2-.8" />
    <path d="M9.9 9.9a2.5 2.5 0 003.5 3.5" />
    <path d="M4.5 19.5l15-15" />
  </svg>
);

/**
 * (D) Globe — the language switch, added by the `025` visual refinement.
 *
 * WHY IT EXISTS. The login reference puts a globe before the two-letter language
 * code, and neither the inherited twenty nor the two above have one. DESIGN-BRIEF
 * rule 3 again: said, not invented silently, and labelled (D).
 *
 * DRAWN TO THE SET'S KEYLINE, NOT THE REFERENCE'S. The reference uses `r="9"`,
 * which spans 3–21 and is a full unit wider on each side than every icon beside
 * it — at 13px that reads as a bigger glyph rather than as a globe. `r="8"` spans
 * 4–20, the set's 16-unit keyline.
 *
 * The latitudes are CHORDS OF THAT CIRCLE, computed rather than eyeballed:
 * at y = 9.4 the half-chord is √(8² − 2.6²) = 7.57, so the line runs 4.4 → 19.6
 * and touches the rim instead of stopping short of it or crossing it.
 *
 * The meridian is two arcs at `rx = 10`, giving a 4-unit bulge. The reference's
 * proportion (15 over an 18-unit span) scaled to 16 would give 2.6, which
 * disappears at 13px — a globe with no visible meridian is a struck-through
 * circle.
 *
 * NOT DIRECTIONAL. A globe is a glyph, not a layout, so it does not mirror under
 * RTL — ADR-007 §6, the same exception the eye-off slash takes.
 */
export const IconGlobe = ({ size = 13, ...props }: IconProps) => (
  <svg {...base(size)} {...props}>
    <circle cx="12" cy="12" r="8" />
    <path d="M4.4 9.4h15.2M4.4 14.6h15.2" />
    <path d="M12 4a10 10 0 0 1 0 16a10 10 0 0 1 0-16" />
  </svg>
);

/**
 * (D) Copy — two overlapping sheets, added by `032`.
 *
 * The inherited twenty have no copy glyph, and `032`'s design puts one beside
 * three values on the customer profile. Drawn to the same rules rather than
 * borrowed from another set, per DESIGN-BRIEF rule 3.
 *
 * The FRONT sheet is a closed rounded rect; the BACK one is an open path that
 * stops where the front sheet covers it. Drawing two closed rects instead reads
 * as a window with a pane, because the hidden edges are still there — the eye
 * finds the crossing lines before it finds the depth.
 *
 * NOT DIRECTIONAL. Two stacked sheets have no handedness to mirror: flipping it
 * under RTL would move the shadow to the other side of a shape that has no
 * light source. ADR-007 §6.
 */
export const IconCopy = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A3.5 3.5 0 0 0 3 6.5v6A2.5 2.5 0 0 0 5.5 15" />
  </svg>
);

/**
 * (D) Retry — an arc that does not close, with the head at the opening.
 *
 * A full circle with an arrowhead reads as a status ring; the 40° gap is what
 * makes it an action. The head sits at the END of the stroke rather than beside
 * it, so the glyph reads as motion rather than as a circle wearing a tick.
 *
 * NOT DIRECTIONAL, deliberately, and this one is the tempting exception: a
 * rotation has a direction, so mirroring it under RTL would reverse the
 * direction of a physical action nobody performs. `design/icons.md` mirrors
 * glyphs that point ALONG the reading axis; a rotation points around one.
 */
export const IconRetry = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v4h-4" />
  </svg>
);

/**
 * (D) Alert — a circle, a stem, and a detached dot.
 *
 * The dot is DETACHED from the stem by 1.5 units and that gap is the glyph. A
 * continuous stroke from 8 to 17 is an exclamation mark drawn by accident; the
 * break is what a reader recognises at 16px, before they can resolve either
 * shape.
 *
 * A circle rather than the design's triangle, and the two are not
 * interchangeable: `032` uses this on a request that FAILED, where the triangle
 * is reserved for a refusal the user can act on — a conflict, a stale record.
 * Same set, two meanings, and the shape is what carries the difference.
 */
export const IconAlert = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5" />
    <path d="M12 16v.5" />
  </svg>
);

/**
 * (D) Reassign — one line, two heads, on the diagonal.
 *
 * The inherited `IconAssign` is a person with a mark beside them: that is
 * ASSIGN, the act of naming someone. The design's row menu draws REASSIGN, which
 * is a move from one holder to another, and it draws it as a two-headed diagonal
 * arrow — no person in it at all, because the subject is the ticket rather than
 * the people.
 *
 * The diagonal runs 6.4 → 17.6 on both axes, so the glyph fills the 16-unit
 * keyline corner to corner. The heads are 4.4 long, which reads at 16px; at 3.2
 * they collapse into the shaft and the whole thing becomes a slash.
 *
 * NOT DIRECTIONAL. Both ends carry a head, so there is no direction for RTL to
 * mirror — which is the point of the shape.
 */
export const IconReassign = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M17.6 6.4 6.4 17.6" />
    <path d="M17.6 10.8V6.4h-4.4" />
    <path d="M6.4 13.2v4.4h4.4" />
  </svg>
);

/**
 * (D) Escalate — a plain arrow, straight up.
 *
 * `IconEscalate` in the inherited set is an arrow inside a rounded square, which
 * is the *escalation action on a card*; the menu row wants the bare direction.
 * Up is not a metaphor here — every escalation surface in this product reads
 * "raise", and the arrow is the shortest way to say it.
 *
 * NOT DIRECTIONAL, and it is the clearest case: the axis is vertical, so RTL has
 * nothing to flip. ADR-007 §6.
 */
export const IconArrowUp = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 19.6V4.4" />
    <path d="M6.6 9.8 12 4.4l5.4 5.4" />
  </svg>
);

/**
 * (D) Close — a circle with a cross inside it.
 *
 * `IconClosed` is a padlock: that is CLOSED as a state on a badge. This is the
 * destructive ACTION, and the design gives it a circled cross — the same glyph
 * every confirm-dialog in the world uses for "stop this". Keeping the two
 * separate matters on the ticket list, where the padlock already appears in the
 * status column: one row would then carry the same mark for "it is closed" and
 * for "close it".
 *
 * The cross spans 9 → 15 inside an r-8 circle, so its ends stop 1.5 units short
 * of the rim. Touching the rim turns the glyph into a filled-looking knot at
 * 16px.
 */
export const IconCircleX = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </svg>
);

/**
 * (D) Arrow right — a transition, from one value to another.
 *
 * The v3 ticket-detail canvas leads every status-change row with it, and the
 * inherited set has no plain arrow: `IconReassign` is two curved arrows (a
 * swap), `IconSort` is a pair of chevrons, and `IconArrowUp` is this glyph's
 * vertical sibling and means escalation.
 *
 * IT IS NOT MIRRORED IN RTL, deliberately. A reading-direction glyph (a back
 * chevron, a "next" arrow) must flip; this one is a diagram of "from → to", and
 * the canvas draws it pointing right in an Arabic screen. Flipping it would make
 * an Arabic reader see «من جديدة ← إلى مفتوحة» pointing back at the value it
 * came from.
 */
export const IconArrowRight = ({ size = 20, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
);

/**
 * (D) Edit — a pencil.
 *
 * The canvas's assignee row ends in one. The inherited set has `IconReassign`,
 * which was standing in for it and says the wrong thing: two arrows mean "swap
 * these two", and this control opens a picker.
 */
export const IconEdit = ({ size = 20, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M4 20h4l10-10-4-4L4 16v4z" />
    <path d="M14 6l4 4" />
  </svg>
);
