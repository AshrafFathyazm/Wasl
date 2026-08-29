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
