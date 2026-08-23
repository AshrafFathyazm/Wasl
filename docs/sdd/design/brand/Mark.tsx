// Wasl mark — "Converge". Three threads arriving at one node.
// One geometry, several treatments. Each treatment changes exactly ONE variable —
// weight, container, colour, or orientation — and never the geometry.
// Usage table: design/brand.md

import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number, sw: number) => ({
  width: size, height: size, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: sw,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

const threads = (
  <path d="M3.5 6.5h3.5c2.6 0 4.2 1.8 5.6 4.2M3.5 12h8.6M3.5 17.5h3.5c2.6 0 4.2-1.8 5.6-4.2" />
);

/** A — the system default. Everywhere, 24px and above. */
export const Mark = ({ size = 24, ...p }: P) => (
  <svg {...base(size, 2)} {...p}>
    {threads}
    <circle cx="17.6" cy="12" r="2.6" fill="currentColor" stroke="none" />
  </svg>
);

/** A small — 20px and below. Shorter threads, larger node. Not a scaled copy. */
export const MarkSmall = ({ size = 20, ...p }: P) => (
  <svg {...base(size, 2.7)} {...p}>
    <path d="M3.5 6.5h3c2.6 0 4.2 1.8 5.6 4.2M3.5 12h8.6M3.5 17.5h3c2.6 0 4.2-1.8 5.6-4.2" />
    <circle cx="17.8" cy="12" r="3.2" fill="currentColor" stroke="none" />
  </svg>
);

/** B — heavy. Embroidery, engraving, print below 10mm. */
export const MarkHeavy = ({ size = 24, ...p }: P) => (
  <svg {...base(size, 3.2)} {...p}>
    <path d="M4 6.5h2.6c2.6 0 4.2 1.8 5.4 4M4 12h7.6M4 17.5h2.6c2.6 0 4.2-1.8 5.4-4" />
    <circle cx="18" cy="12" r="3.8" fill="currentColor" stroke="none" />
  </svg>
);

/** C — duotone. Teal node. Reversed contexts only (accent rule, design/brand.md). */
export const MarkDuotone = ({ size = 24, ...p }: P) => (
  <svg {...base(size, 2)} {...p}>
    {threads}
    <circle cx="17.6" cy="12" r="2.6" fill="var(--teal-400, #6FBFB0)" stroke="none" />
  </svg>
);

/** G — two-thread. 16px favicon only. The third thread is removed deliberately. */
export const MarkTwoThread = ({ size = 16, ...p }: P) => (
  <svg {...base(size, 3.4)} {...p}>
    <path d="M4 7.5h3c2.4 0 3.8 1.6 5 3.4M4 16.5h3c2.4 0 3.8-1.6 5-3.4" />
    <circle cx="17" cy="12" r="4" fill="currentColor" stroke="none" />
  </svg>
);

/** F — vertical. Stacked lockups only. Threads rise into the node. */
export const MarkVertical = ({ size = 24, ...p }: P) => (
  <svg {...base(size, 2)} {...p}>
    <g transform="rotate(-90 12 12)">
      {threads}
      <circle cx="17.6" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </g>
  </svg>
);

type TileProps = {
  size?: number;
  shape?: 'squircle' | 'circle' | 'outline';
  accentNode?: boolean;
};

/** The mark on its container. The standard unit for a lockup. */
export const MarkTile = ({ size = 32, shape = 'squircle', accentNode = false }: TileProps) => {
  const radius = shape === 'circle' ? '50%' : size <= 24 ? 5 : size <= 40 ? 8 : 12;
  const outline = shape === 'outline';
  const Glyph = size <= 20 ? MarkSmall : accentNode ? MarkDuotone : Mark;
  return (
    <span
      style={{
        width: size, height: size, borderRadius: radius,
        background: outline ? 'transparent' : 'var(--action-primary-bg)',
        border: outline ? '1.5px solid var(--action-primary-bg)' : 'none',
        color: outline ? 'var(--action-primary-bg)' : 'var(--action-primary-text)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Glyph size={Math.round(size * (size <= 20 ? 0.6 : 0.55))} />
    </span>
  );
};
