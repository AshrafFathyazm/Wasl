import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WORDMARK_AR, WORDMARK_LATIN } from '../../brand/wordmark';
import styles from './Login.module.css';

/* ============================================================================
 * BrandPanel — the channel mesh, with the physics
 * ============================================================================
 *
 * The neural-mesh background, the draggable hub and channel nodes, and the
 * subtitle that swaps to a channel's description while you hold it. Built from
 * `wasl_login_final_with_brand.html` — same constants, same integrator, same
 * thresholds — so it behaves like the reference rather than merely resembling it.
 *
 * THREE THINGS THE REFERENCE DOES NOT DO, EACH FOR A STATED REASON.
 *
 * 1. **`prefers-reduced-motion` is honoured.** DESIGN-BRIEF rule 18 caps motion
 *    and `023` carries the obligation. Under the query the loop never starts:
 *    one static frame is drawn at the rest positions and dragging is disabled.
 *    A spring simulation is exactly the kind of continuous motion that query
 *    exists for, and this is the first surface in the product that has any.
 *
 * 2. **Nothing here is focusable, and the panel stays `aria-hidden`.** The
 *    reference gives every node a pointer handler and `cursor: grab`; `004`
 *    records an earlier version that also gave them `tabindex="0"`, so a
 *    keyboard user tabbed through five decorative nodes before reaching the
 *    email field. Pointer-draggable and keyboard-invisible are not in tension:
 *    these are `<div>`s with no `tabindex`, inside a hidden subtree. The
 *    description swap is decorative for the same reason — a screen reader is
 *    never told about it, and the form loses nothing.
 *
 * 3. **The loop stops when the tab is hidden.** `requestAnimationFrame` already
 *    throttles in a background tab, but the listeners and the canvas stay live
 *    across an unmount without the cleanup below — and this component unmounts
 *    on every successful sign-in.
 *
 * COORDINATES ARE FLUID, THE REFERENCE'S WERE NOT. It runs at a fixed 490×540
 * and scales the whole frame. This panel is a flex column of unknown size, so
 * the rest positions are derived from the measured box on every resize, keeping
 * the reference's proportions: the hub sits at 36.3% of the height (196/540) and
 * the ring radius tracks the smaller dimension.
 * ============================================================================ */

/** The five channels, at the reference's own angles. `-90` is straight up. */
const CHANNELS = [
  {
    key: 'email',
    angle: -90,
    path: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="m4.8 7.5 7.2 5 7.2-5"/>',
  },
  {
    key: 'whatsapp',
    angle: -18,
    path: '<path d="M4 20l1.2-4A8 8 0 1 1 8 18.8L4 20Z"/><path d="M9.5 9.8c0 2.9 2.2 5.1 5 5.3"/>',
  },
  {
    key: 'livechat',
    angle: 54,
    path: '<path d="M20 14.5a2 2 0 0 1-2 2h-4l-4 3.5v-3.5H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7Z"/>',
  },
  {
    key: 'sms',
    angle: 126,
    path: '<rect x="6.5" y="3" width="11" height="18" rx="2"/><path d="M10.5 18h3"/>',
  },
  {
    key: 'webform',
    angle: 198,
    path: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M7.5 9h9M7.5 12.5h9M7.5 16h5"/>',
  },
] as const;

const SEPARATOR = '·';
/** `WASL` reads as a shout inside a lowercase chip; the lockup keeps the caps. */
const WORDMARK_LATIN_TITLE =
  WORDMARK_LATIN.charAt(0) + WORDMARK_LATIN.slice(1).toLowerCase();

const NODE = 54;
const HUB = 74;
const PARTICLE_COUNT = 46;

/** Rest geometry, derived from the measured panel. Proportions are the
 *  reference's: 196/540 down, and a radius that tracks the smaller dimension. */
function restGeometry(width: number, height: number) {
  return {
    cx: width / 2,
    cy: height * 0.363,
    r: Math.min(width, height) * 0.26,
  };
}

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Home — where the spring pulls back to. */
  hx: number;
  hy: number;
  /** Offset from the hub, for the nodes only. */
  ox: number;
  oy: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hx: number;
  hy: number;
  /** Phase and speed of the idle drift, and the dot's radius. */
  ph: number;
  sp: number;
  r: number;
}

export function BrandPanel() {
  const { t } = useTranslation();

  const panelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Array<HTMLDivElement | null>>([]);

  /* The subtitle. State rather than a DOM write, because it is rendered copy and
   * has to come from the catalogue on every language change. */
  const [activeChannel, setActiveChannel] = useState<string | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const canvas = canvasRef.current;
    if (panel === null || canvas === null) return undefined;

    const context = canvas.getContext('2d');
    if (context === null) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let hub: Body = { x: 0, y: 0, vx: 0, vy: 0, hx: 0, hy: 0, ox: 0, oy: 0 };
    let nodes: Body[] = [];
    let particles: Particle[] = [];

    /* Deterministic pseudo-random, seeded. `Math.random()` would re-scatter the
     * field on every resize, so dragging the window would visibly reshuffle the
     * background — and it would make a screenshot impossible to compare. */
    let seed = 20260828;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    function layout() {
      const rect = panel!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (width === 0 || height === 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const { cx, cy, r } = restGeometry(width, height);
      hub = { x: cx, y: cy, vx: 0, vy: 0, hx: cx, hy: cy, ox: 0, oy: 0 };

      nodes = CHANNELS.map((channel) => {
        const radians = (channel.angle * Math.PI) / 180;
        const ox = Math.cos(radians) * r;
        const oy = Math.sin(radians) * r;
        return { x: cx + ox, y: cy + oy, vx: 0, vy: 0, hx: cx + ox, hy: cy + oy, ox, oy };
      });

      seed = 20260828;
      particles = Array.from({ length: PARTICLE_COUNT }, () => {
        const x = random() * width;
        const y = random() * height * 0.76;
        return {
          x,
          y,
          vx: 0,
          vy: 0,
          hx: x,
          hy: y,
          ph: random() * 6.28,
          sp: 0.22 + random() * 0.4,
          r: 0.6 + random() * 0.9,
        };
      });
    }

    /* ---- Dragging ---------------------------------------------------------- */

    let dragging: Body | null = null;
    let pointerX = 0;
    let pointerY = 0;

    const trackPointer = (event: PointerEvent) => {
      const rect = panel!.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (dragging !== null) trackPointer(event);
    };

    const release = () => {
      dragging = null;
    };

    if (!reduceMotion) {
      panel.addEventListener('pointermove', onPointerMove);
      panel.addEventListener('pointerup', release);
      panel.addEventListener('pointercancel', release);
      panel.addEventListener('pointerleave', release);
    }

    const perElement: Array<() => void> = [];

    function bind(element: HTMLElement | null, body: () => Body, channelKey: string | null) {
      if (element === null) return;

      const onEnter = () => {
        element.dataset['hot'] = 'true';
        if (channelKey !== null) setActiveChannel(channelKey);
      };
      const onLeave = () => {
        if (dragging !== body()) delete element.dataset['hot'];
        if (channelKey !== null) setActiveChannel(null);
      };
      const onDown = (event: PointerEvent) => {
        if (reduceMotion) return;
        event.preventDefault();
        dragging = body();
        trackPointer(event);
        element.setPointerCapture(event.pointerId);
      };

      element.addEventListener('pointerenter', onEnter);
      element.addEventListener('pointerleave', onLeave);
      element.addEventListener('pointerdown', onDown);

      perElement.push(() => {
        element.removeEventListener('pointerenter', onEnter);
        element.removeEventListener('pointerleave', onLeave);
        element.removeEventListener('pointerdown', onDown);
      });
    }

    layout();

    bind(hubRef.current, () => hub, null);
    nodeRefs.current.forEach((element, index) => {
      bind(element, () => nodes[index]!, CHANNELS[index]!.key);
    });

    /* ---- The loop ---------------------------------------------------------- */

    let frame = 0;
    let time = 0;

    function paint(animate: boolean) {
      if (width === 0 || height === 0) return;
      if (animate) time += 0.016;

      if (animate) {
        /* The hub: driven hard toward the pointer while held, spring home
         * otherwise. `.42` is a stiff follow, not a slow lerp — it is what makes
         * the node feel attached to the cursor rather than trailing it. */
        if (dragging === hub) {
          hub.vx = (pointerX - hub.x) * 0.42;
          hub.vy = (pointerY - hub.y) * 0.42;
        } else {
          hub.vx += (hub.hx - hub.x) * 0.055;
          hub.vy += (hub.hy - hub.y) * 0.055;
          hub.vx *= 0.8;
          hub.vy *= 0.8;
        }
        hub.x += hub.vx;
        hub.y += hub.vy;

        for (const node of nodes) {
          if (dragging === node) {
            node.vx = (pointerX - node.x) * 0.42;
            node.vy = (pointerY - node.y) * 0.42;
            /* Pulling a node tugs the hub a little — which is what makes the
             * five feel connected to it rather than orbiting independently. */
            hub.vx += (node.x - (hub.x + node.ox)) * 0.01;
            hub.vy += (node.y - (hub.y + node.oy)) * 0.01;
          } else {
            node.vx += (hub.x + node.ox - node.x) * 0.075;
            node.vy += (hub.y + node.oy - node.y) * 0.075;
            node.vx *= 0.78;
            node.vy *= 0.78;
          }
          node.x += node.vx;
          node.y += node.vy;
        }
      }

      /* Position the DOM bodies. `transform`, never `left`/`top`: those two
       * trigger layout on every frame for seven elements. */
      nodes.forEach((node, index) => {
        const element = nodeRefs.current[index];
        if (element) {
          element.style.transform = `translate(${node.x - NODE / 2}px, ${node.y - NODE / 2}px)`;
        }
      });
      if (hubRef.current) {
        hubRef.current.style.transform = `translate(${hub.x - HUB / 2}px, ${hub.y - HUB / 2}px)`;
      }
      if (haloRef.current) {
        haloRef.current.style.transform = `translate(${hub.x}px, ${hub.y}px)`;
      }

      /* ---- Canvas ---- */
      const dx = hub.x - hub.hx;
      const dy = hub.y - hub.hy;
      context!.clearRect(0, 0, width, height);

      if (animate) {
        for (const p of particles) {
          /* A Gaussian falloff around the hub's HOME, so dragging the hub warps
           * the field near it and leaves the far corners alone. */
          const distance = Math.hypot(p.hx - hub.hx, p.hy - hub.hy);
          const falloff = Math.exp(-(distance * distance) / (2 * 150 * 150));
          const baseX = p.hx + Math.sin(time * p.sp + p.ph) * 5;
          const baseY = p.hy + Math.cos(time * p.sp * 0.8 + p.ph) * 5;
          p.vx += (baseX + dx * falloff * 0.8 - p.x) * 0.06;
          p.vy += (baseY + dy * falloff * 0.8 - p.y) * 0.06;
          p.vx *= 0.86;
          p.vy *= 0.86;
          p.x += p.vx;
          p.y += p.vy;
        }
      }

      /* Particle-to-particle links. O(n²) over 46 bodies is ~1035 distance
       * checks a frame — cheap, and the reason the count is 46 and not 400. */
      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const a = particles[i]!;
          const b = particles[j]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 88) {
            context!.beginPath();
            context!.moveTo(a.x, a.y);
            context!.lineTo(b.x, b.y);
            context!.strokeStyle = `rgba(160,158,196,${0.13 * (1 - d / 88)})`;
            context!.lineWidth = 0.7;
            context!.stroke();
          }
        }
      }

      for (const p of particles) {
        const d = Math.hypot(p.x - hub.x, p.y - hub.y);
        if (d < 145) {
          context!.beginPath();
          context!.moveTo(p.x, p.y);
          context!.lineTo(hub.x, hub.y);
          context!.strokeStyle = `rgba(168,162,214,${0.15 * (1 - d / 145)})`;
          context!.lineWidth = 0.7;
          context!.stroke();
        }
        context!.beginPath();
        context!.arc(p.x, p.y, p.r, 0, 6.283);
        context!.fillStyle = 'rgba(180,178,212,.32)';
        context!.fill();
      }

      /* The five spokes. They warm and thin as a node is pulled away — the
       * stretch is the feedback that the link is under tension. */
      const { r } = restGeometry(width, height);
      for (const node of nodes) {
        const d = Math.hypot(node.x - hub.x, node.y - hub.y);
        const stretch = Math.min(1, Math.max(0, (d - r) / 70));
        context!.beginPath();
        context!.moveTo(hub.x, hub.y);
        context!.lineTo(node.x, node.y);
        context!.strokeStyle = `rgba(${168 + stretch * 40},${162 - stretch * 20},214,${0.3 + stretch * 0.34})`;
        context!.lineWidth = 1.2 - stretch * 0.4;
        context!.stroke();
      }
    }

    function step() {
      paint(true);
      frame = requestAnimationFrame(step);
    }

    if (reduceMotion) {
      /* One frame, at rest. No loop, no drag. */
      paint(false);
    } else {
      frame = requestAnimationFrame(step);
    }

    const observer = new ResizeObserver(() => {
      layout();
      paint(false);
    });
    observer.observe(panel);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      panel.removeEventListener('pointermove', onPointerMove);
      panel.removeEventListener('pointerup', release);
      panel.removeEventListener('pointercancel', release);
      panel.removeEventListener('pointerleave', release);
      perElement.forEach((off) => off());
    };
  }, []);

  const subtitle =
    activeChannel === null
      ? t('auth:panel.body')
      : t(`auth:panel.channel.${activeChannel}`);

  return (
    <div className={styles.panel} ref={panelRef} aria-hidden="true">
      <div className={styles.aurora} />

      {/* The halo rides the hub, under the mesh. */}
      <div className={styles.halo} ref={haloRef} />

      <canvas className={styles.mesh} ref={canvasRef} />

      <div className={styles.layer}>
        {CHANNELS.map((channel, index) => (
          <div
            key={channel.key}
            className={styles.node}
            ref={(element) => {
              nodeRefs.current[index] = element;
            }}
            /* No `tabindex`, and the whole subtree is `aria-hidden`. Draggable
               with a pointer, invisible to a keyboard and to a screen reader. */
            dangerouslySetInnerHTML={{
              __html: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${channel.path}</svg>`,
            }}
          />
        ))}

        <div className={styles.hub} ref={hubRef}>
          {/* The mark, at the hub. Does not mirror under RTL. */}
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.5 6.5h3.5c2.6 0 4.2 1.8 5.6 4.2M3.5 12h8.6M3.5 17.5h3.5c2.6 0 4.2-1.8 5.6-4.2" />
            <circle cx="17.6" cy="12" r="2.6" fill="#6FBFB0" stroke="none" />
          </svg>
        </div>
      </div>

      <div className={styles.vignette} />
      <div className={styles.grain} />
      <div className={styles.scrim} />

      <div className={styles.panelText}>
        <span className={styles.panelChip}>
          <span className={styles.chipDot} />
          <span className={styles.chipAr}>{WORDMARK_AR}</span>
          {/* A separator between the two halves of the MARK, not copy. Built as an
              expression for the same reason `Input`s counter is: the BR-8.8 rule
              forbids a literal in JSX and is right to, but a middot is identical
              in both languages and putting it in a catalogue would invite
              someone to translate it. */}
          <span>{SEPARATOR}</span>
          <span>{WORDMARK_LATIN_TITLE}</span>
        </span>

        <p className={styles.panelHeadline}>{t('auth:panel.headline')}</p>

        {/* `min-height` in the stylesheet, not here: the line swaps to a longer
            sentence on hover and the block must not jump when it does. */}
        <p className={styles.panelBody}>{subtitle}</p>
      </div>
    </div>
  );
}
