// Wasl icon set — OUR ADDITIONS
// 24 box · 16-unit keyline · stroke 1.5 · round caps and joins · corner radius 2
//
// Kept in a SEPARATE FILE from icons.tsx on purpose. icons.tsx is a byte-for-byte
// copy of docs/sdd/design/icons/index.tsx, and a copy stops being a copy the
// moment something is added to it — a drift check over the twenty inherited
// icons would then fail forever, or would have to be weakened to allow additions
// and stop catching real drift.
//
// WHY THESE TWO EXIST. `design/screens/02-app-shell.md` specifies the user
// popover's Settings and Sign out rows as "icon + label", and the inherited set
// has neither a gear nor an exit glyph — twenty icons, and not one of them.
// DESIGN-BRIEF rule 3 says stop and say so rather than invent; it was said, and
// the product owner's answer was to draw them to the same rules. So they are
// labelled (D) — ours — and not passed off as inherited.
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
