import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WORDMARK_AR, WORDMARK_LATIN } from '../../brand/wordmark';
import styles from './Login.module.css';

/* ============================================================================
 * BrandPanel — the channel mesh, with the physics
 * ============================================================================
 *
 * The neural-mesh background, the draggable hub and channel nodes, the channel
 * label under the pointer, and the subtitle that swaps to a channel's
 * description while you hold it. Built from `Wasl Login_last.html` — same
 * constants, same integrator, same thresholds — so it behaves like the reference
 * rather than merely resembling it.
 *
 * WHAT THE 025 VISUAL REFINEMENT ADDED. The nodes and the hub now ease OUT of
 * the hub on first paint instead of appearing at rest, they drift on a slow idle
 * sway, and hovering one names it. The aurora's rotation is CSS, not here.
 *
 * FOUR THINGS THE REFERENCE DOES NOT DO, EACH FOR A STATED REASON.
 *
 * 1. **`prefers-reduced-motion` is honoured.** DESIGN-BRIEF rule 18 caps motion
 *    and `023` carries the obligation. Under the query the loop never starts:
 *    one static frame is drawn at the rest positions, at full opacity and full
 *    scale, and dragging is disabled. A spring simulation is exactly the kind of
 *    continuous motion that query exists for, and this is the first surface in
 *    the product that has any.
 *
 *    The entrance needs care rather than deletion. It is computed from `time`,
 *    which only advances on an animated frame — so under the query `time` stays
 *    0 and the eased value would be 0 too, leaving five invisible nodes scaled
 *    to 62%. `ENTRANCE_DONE` is substituted instead. Same shape of mistake as
 *    the loader's dots in `023`, where gating the animation left the elements at
 *    their keyframe's `opacity: 0`.
 *
 * 2. **Nothing here is focusable, and the panel stays `aria-hidden`.** The
 *    reference gives every node a pointer handler and `cursor: grab`; `004`
 *    records an earlier version that also gave them `tabindex="0"`, so a
 *    keyboard user tabbed through five decorative nodes before reaching the
 *    email field. Pointer-draggable and keyboard-invisible are not in tension:
 *    these are `<div>`s with no `tabindex`, inside a hidden subtree. The label
 *    and the description swap are decorative for the same reason — a screen
 *    reader is never told about either, and the form loses nothing.
 *
 * 3. **The loop stops rather than idling.** The reference pauses on a hidden tab
 *    and off-screen; this does the same AND stops when the mesh itself is hidden.
 *    Below 780px the stylesheet drops the canvas and the nodes to a `display:
 *    none` band — the loop would otherwise keep integrating seven springs and
 *    forty-six particles into a zero-sized canvas, sixty times a second, to
 *    paint nothing. Cancelling the frame is what actually stops the work;
 *    `display: none` alone does not.
 *
 * 4. **The listeners and the canvas do not outlive the component.** This panel
 *    unmounts on every successful sign-in.
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

/** The gap between a node's top edge and the label above it. */
const LABEL_GAP = 7;

/** One frame's worth of time. FIXED, not measured: a real `dt` makes the
 *  entrance run at a different speed on a 144Hz screen than the reference's own
 *  reading of it, and the whole point of copying the constants is that the
 *  result matches. The cost of a dropped frame is a 16ms-slower entrance, which
 *  nobody can see. */
const FRAME_SECONDS = 0.016;

/* The entrance, from the reference. The hub leads; node `i` starts a beat later
 * and each is staggered behind the one before it, so the five unfold rather than
 * appearing together. */
const HUB_ENTRANCE_SECONDS = 0.55;
const NODE_ENTRANCE_DELAY = 0.18;
const NODE_ENTRANCE_STAGGER = 0.085;
const NODE_ENTRANCE_SECONDS = 0.8;

/** What the entrance is when there is no entrance — see reason 1 above. */
const ENTRANCE_DONE = 1;

/* Idle sway, in px. Small enough that the panel is never caught moving and only
 * looks different on returning to the screen. */
const HUB_SWAY_X = 4;
const HUB_SWAY_Y = 3.2;
const NODE_SWAY = 3.2;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Cubic ease-out — the reference's own. Fast out of the gate and a long
 *  settle, which is what makes the nodes look thrown rather than tweened. */
const easeOut = (progress: number) => 1 - (1 - progress) ** 3;

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
  /** Phase of the idle sway, so the five do not drift in lockstep. */
  ph: number;
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
  const labelRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Array<HTMLDivElement | null>>([]);

  /* The channel under the pointer. State rather than a DOM write, because it
   * selects rendered COPY and has to come from the catalogue on every language
   * change — the label and the subtitle both read from it. */
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
    /* True below 780px, where the stylesheet turns the mesh into a band. Set
     * from the CANVAS's computed display rather than from a width threshold, so
     * the number lives in one place — the container query — instead of being
     * duplicated here where it would drift the first time the breakpoint moved. */
    let meshHidden = false;
    let hub: Body = { x: 0, y: 0, vx: 0, vy: 0, hx: 0, hy: 0, ox: 0, oy: 0, ph: 0 };
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
      meshHidden = window.getComputedStyle(canvas!).display === 'none';
      if (meshHidden) return;

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
      hub = { x: cx, y: cy, vx: 0, vy: 0, hx: cx, hy: cy, ox: 0, oy: 0, ph: 0 };

      /* The sway phases are seeded from the same generator as the particle
       * field, and BEFORE it, so both are stable across resizes. */
      seed = 20260828;

      nodes = CHANNELS.map((channel) => {
        const radians = (channel.angle * Math.PI) / 180;
        const ox = Math.cos(radians) * r;
        const oy = Math.sin(radians) * r;
        return {
          x: cx + ox,
          y: cy + oy,
          vx: 0,
          vy: 0,
          hx: cx + ox,
          hy: cy + oy,
          ox,
          oy,
          ph: random() * 6.28,
        };
      });

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

    /* ---- The heartbeat ----------------------------------------------------
     * Every second or two a packet travels one spoke inward, the hub flares, and
     * a ring leaves it. It is the only motion on this panel that is not a
     * reaction to the pointer, and it is what stops a mesh nobody touches from
     * reading as a still image.
     *
     * THE ACCENT IS READ FROM THE TOKEN, not written here. Canvas takes a colour
     * string and a custom property is not one, so the value is resolved once from
     * the panel computed style — which keeps --teal-400 the single source and
     * means a token change reaches the canvas without a code change.
     * -------------------------------------------------------------------- */
    const accentChannels = ((): [number, number, number] => {
      const raw = getComputedStyle(panel!).getPropertyValue('--teal-400').trim();
      const match = /^#?([da-f]{2})([da-f]{2})([da-f]{2})$/i.exec(raw);
      /* The fallback is the token own value. If the property ever fails to
       * resolve, the panel keeps its accent instead of losing the pulse to a
       * transparent stroke nobody would think to look for. */
      if (match === null) return [111, 191, 176];
      return [
        parseInt(match[1]!, 16),
        parseInt(match[2]!, 16),
        parseInt(match[3]!, 16),
      ];
    })();
    const accent = (alpha: number) =>
      `rgba(${accentChannels[0]},${accentChannels[1]},${accentChannels[2]},${alpha})`;

    interface Pulse {
      node: Body;
      /** 0 at the node, 1 at the hub. */
      p: number;
    }
    interface Ring {
      /** Growth, not pixels — scaled at paint time. */
      r: number;
      a: number;
    }

    const pulses: Pulse[] = [];
    const rings: Ring[] = [];
    /* Seconds until the next packet. The first is late on purpose: the entrance
     * is still settling for the first second, and a pulse inside it reads as part
     * of the entrance rather than as the panel being alive. */
    let untilNextPulse = 1.9;
    let glow = 0;


    /* Which node the pointer is over, for positioning the label. A ref-like
     * local rather than the state above: the label's POSITION is written by the
     * loop from canvas coordinates, and routing that through a render would put
     * a React commit on every frame. The state carries the TEXT; this carries
     * the geometry. */
    let hovered: number | null = null;

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

    function bind(
      element: HTMLElement | null,
      body: () => Body,
      channelKey: string | null,
      index: number | null,
    ) {
      if (element === null) return;

      const onEnter = () => {
        element.dataset['hot'] = 'true';
        if (channelKey === null) return;
        hovered = index;
        setActiveChannel(channelKey);
        /* Under reduced motion there is no loop to place the label on its next
         * frame, so this is the only chance to place it. */
        if (reduceMotion) paint(false);
      };

      const onLeave = () => {
        if (dragging !== body()) delete element.dataset['hot'];
        if (channelKey === null) return;
        if (hovered === index) hovered = null;
        setActiveChannel(null);
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

    bind(hubRef.current, () => hub, null, null);
    nodeRefs.current.forEach((element, index) => {
      bind(element, () => nodes[index]!, CHANNELS[index]!.key, index);
    });

    /* ---- The loop ---------------------------------------------------------- */

    let frame = 0;
    let time = 0;

    /** Node `index`'s entrance progress, 0 → 1. `ENTRANCE_DONE` under reduced
     *  motion, because `time` never advances there and the eased value would be
     *  0 — see reason 1 in the header. Read from three places (the spring, the
     *  DOM write, the spoke's alpha), so it is one function rather than three
     *  copies of the same expression drifting apart. */
    function nodeEntrance(index: number) {
      if (reduceMotion) return ENTRANCE_DONE;
      return easeOut(
        clamp01(
          (time - NODE_ENTRANCE_DELAY - index * NODE_ENTRANCE_STAGGER) /
            NODE_ENTRANCE_SECONDS,
        ),
      );
    }

    function paint(animate: boolean) {
      if (meshHidden) return;
      if (width === 0 || height === 0) return;
      if (animate) time += FRAME_SECONDS;

      const hubEntrance = reduceMotion
        ? ENTRANCE_DONE
        : easeOut(clamp01(time / HUB_ENTRANCE_SECONDS));

      /* Multiplied into the sway, so turning motion off turns the drift off too
       * without a second branch further down. */
      const sway = reduceMotion ? 0 : 1;

      if (animate) {
        const { cx, cy } = restGeometry(width, height);

        /* THE HUB'S HOME DRIFTS, NOT THE HUB. Dragging still wins, and letting
         * go returns to a home that has moved a few pixels — which is what stops
         * the spring settling into a dead stop and makes the panel look alive
         * rather than paused. */
        hub.hx = cx + Math.sin(time * 0.45) * HUB_SWAY_X * sway;
        hub.hy = cy + Math.cos(time * 0.33) * HUB_SWAY_Y * sway;

        /* Driven hard toward the pointer while held, spring home otherwise.
         * `.42` is a stiff follow, not a slow lerp — it is what makes the body
         * feel attached to the cursor rather than trailing it. */
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

        nodes.forEach((node, index) => {
          /* THE RING OPENS. The offset is scaled by the entrance, so a node
           * starts on top of the hub and is carried out to its own angle.
           * Scaling the offset rather than tweening a position is what keeps
           * each spoke attached at both ends the whole way out. */
          const entrance = nodeEntrance(index);

          node.hx =
            hub.x + node.ox * entrance + Math.sin(time * 0.5 + node.ph) * NODE_SWAY * sway;
          node.hy =
            hub.y + node.oy * entrance + Math.cos(time * 0.42 + node.ph) * NODE_SWAY * sway;

          if (dragging === node) {
            node.vx = (pointerX - node.x) * 0.42;
            node.vy = (pointerY - node.y) * 0.42;
            /* Pulling a node tugs the hub a little — which is what makes the
             * five feel connected to it rather than orbiting independently. */
            hub.vx += (node.x - (hub.x + node.ox)) * 0.01;
            hub.vy += (node.y - (hub.y + node.oy)) * 0.01;
          } else {
            node.vx += (node.hx - node.x) * 0.075;
            node.vy += (node.hy - node.y) * 0.075;
            node.vx *= 0.78;
            node.vy *= 0.78;
          }
          node.x += node.vx;
          node.y += node.vy;
        });

        /* The heartbeat advances on the same fixed step as everything else in
         * this loop. The reference uses a real dt; this integrator does not, and
         * mixing the two would let the pulse drift against the springs on a slow
         * frame. */
        untilNextPulse -= FRAME_SECONDS;
        if (untilNextPulse <= 0) {
          untilNextPulse = 1.7 + random() * 1.6;
          const picked = nodes[Math.floor(random() * nodes.length)];
          if (picked !== undefined) pulses.push({ node: picked, p: 0 });
        }

        /* Backwards, because arriving packets are spliced out mid-iteration. */
        for (let i = pulses.length - 1; i >= 0; i -= 1) {
          const pulse = pulses[i]!;
          pulse.p += FRAME_SECONDS * 1.15;
          if (pulse.p >= 1) {
            rings.push({ r: 0, a: 1 });
            glow = 1;
            pulses.splice(i, 1);
          }
        }
        for (let i = rings.length - 1; i >= 0; i -= 1) {
          const ring = rings[i]!;
          ring.r += FRAME_SECONDS * 1.5;
          ring.a -= FRAME_SECONDS * 1.5;
          if (ring.a <= 0) rings.splice(i, 1);
        }
        glow = Math.max(0, glow - FRAME_SECONDS * 1.6);

        /* The flare is handed to CSS as ONE composed shadow layer rather than
         * written here as a whole box-shadow. The hub base layers stay in the
         * stylesheet with the rest of its surface; an inline box-shadow here
         * would have to restate them, and they would then live in two places and
         * drift. */
        if (hubRef.current) {
          hubRef.current.style.setProperty(
            '--glow-shadow',
            glow > 0.02
              ? `0 0 ${18 + glow * 30}px ${accent(glow * 0.38)}`
              : '0 0 0 transparent',
          );
        }
      }

      /* Position the DOM bodies. `transform`, never `left`/`top`: those two
       * trigger layout on every frame for seven elements. */
      nodes.forEach((node, index) => {
        const element = nodeRefs.current[index];
        if (!element) return;
        const entrance = nodeEntrance(index);

        /* OPACITY OUTRUNS THE SCALE — `* 1.7` — so a node is solid well before
         * it has finished arriving. Fading and moving at the same rate reads as
         * a dissolve; arriving already painted reads as a thing that was
         * thrown. */
        element.style.opacity = String(clamp01(entrance * 1.7));
        element.style.transform =
          `translate(${node.x - NODE / 2}px, ${node.y - NODE / 2}px) ` +
          `scale(${0.62 + 0.38 * entrance})`;
      });

      if (hubRef.current !== null) {
        hubRef.current.style.opacity = String(clamp01(hubEntrance * 1.6));
        hubRef.current.style.transform =
          `translate(${hub.x - HUB / 2}px, ${hub.y - HUB / 2}px) ` +
          `scale(${0.84 + 0.16 * hubEntrance})`;
      }
      if (haloRef.current !== null) {
        haloRef.current.style.transform = `translate(${hub.x}px, ${hub.y}px)`;
      }

      /* THE LABEL RIDES THE HOVERED NODE, and it is placed with a second
       * `translate(-50%, -100%)` rather than an arithmetic offset. That
       * percentage is resolved against the element's OWN box by the browser, so
       * the label stays centred above the node without this loop ever measuring
       * its width — which matters because the text changes with the channel AND
       * with the language, so a measured offset would be a frame stale every
       * time either changed. */
      if (labelRef.current !== null && hovered !== null) {
        const node = nodes[hovered];
        if (node !== undefined) {
          labelRef.current.style.transform =
            `translate(${node.x}px, ${node.y - NODE / 2 - LABEL_GAP}px) ` +
            `translate(-50%, -100%)`;
        }
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
       * stretch is the feedback that the link is under tension.
       *
       * Alpha is scaled by the entrance, or a spoke at full strength is drawn to
       * a node that has not left the hub yet — five hard lines to a single point,
       * which is the one frame of the entrance that looks broken. */
      const { r } = restGeometry(width, height);
      nodes.forEach((node, index) => {
        const entrance = nodeEntrance(index);
        const d = Math.hypot(node.x - hub.x, node.y - hub.y);
        const stretch = Math.min(1, Math.max(0, (d - r) / 70));
        context!.beginPath();
        context!.moveTo(hub.x, hub.y);
        context!.lineTo(node.x, node.y);
        context!.strokeStyle =
          `rgba(${168 + stretch * 40},${162 - stretch * 20},214,` +
          `${(0.3 + stretch * 0.34) * entrance})`;
        context!.lineWidth = 1.2 - stretch * 0.4;
        context!.stroke();
      });

      /* ---- The heartbeat, painted on top of the spokes it travels --------
       * save/restore around the only part of this paint that touches
       * globalAlpha. Leaving it set would tint every stroke on the NEXT frame,
       * because the context is reused rather than recreated — and the symptom
       * would be the whole mesh quietly fading, which reads as a rendering fault
       * rather than as a missing restore.
       * ------------------------------------------------------------------ */
      context!.save();

      for (const ring of rings) {
        context!.beginPath();
        context!.arc(hub.x, hub.y, 34 + ring.r * 54, 0, 6.283);
        context!.strokeStyle = accent(1);
        context!.globalAlpha = Math.max(0, ring.a) * 0.3;
        context!.lineWidth = 1.4;
        context!.stroke();
      }

      context!.globalAlpha = 1;

      for (const pulse of pulses) {
        /* Cubic ease-out: the packet leaves the node fast and settles into the
         * hub, which is what makes the arrival read as an arrival rather than as
         * a dot that stops. */
        const eased = 1 - (1 - pulse.p) ** 3;
        /* Four dots, each a step behind — a trail drawn as bodies rather than as
         * a blur, so it stays crisp at 1x like everything else here. */
        for (let k = 0; k < 4; k += 1) {
          const q = Math.max(0, eased - k * 0.045);
          const x = pulse.node.x + (hub.x - pulse.node.x) * q;
          const y = pulse.node.y + (hub.y - pulse.node.y) * q;
          context!.beginPath();
          context!.arc(x, y, 2.7 - k * 0.5, 0, 6.283);
          context!.fillStyle = accent(1);
          context!.globalAlpha = (1 - k * 0.24) * (1 - pulse.p * 0.25) * 0.9;
          context!.fill();
        }
      }

      context!.restore();
    }

    /* ---- Running, and not running ------------------------------------------
     * Three independent reasons to stop, one place that decides. Each was
     * measured or reasoned separately and they compose: a hidden tab, a panel
     * scrolled out of view, and a mesh the stylesheet has turned off.
     *
     * STOPPING MEANS CANCELLING THE FRAME, not skipping the work inside it. A
     * `if (paused) return` at the top of `step` still costs a callback per frame
     * forever, and it reads as stopped in the profiler until you look twice.
     * ---------------------------------------------------------------------- */

    let documentVisible = document.visibilityState === 'visible';
    let onScreen = true;

    function step() {
      paint(true);
      frame = requestAnimationFrame(step);
    }

    function sync() {
      const shouldRun = !reduceMotion && documentVisible && onScreen && !meshHidden;

      if (shouldRun && frame === 0) {
        frame = requestAnimationFrame(step);
      } else if (!shouldRun && frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }

    const onVisibilityChange = () => {
      documentVisible = document.visibilityState === 'visible';
      sync();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    /* `IntersectionObserver` is not in every environment this runs in — jsdom
     * has neither it nor a shim in `test/setup.ts`. Absent, the panel simply
     * behaves as though it is always on screen, which is the pre-refinement
     * behaviour and is correct rather than degraded: the other two reasons to
     * stop still apply. */
    let intersectionObserver: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry === undefined) return;
          onScreen = entry.isIntersecting;
          sync();
        },
        { threshold: 0.01 },
      );
      intersectionObserver.observe(panel);
    }

    if (reduceMotion) {
      /* One frame, at rest, at full opacity and full scale. No loop, no drag. */
      paint(false);
    } else {
      sync();
    }

    const resizeObserver = new ResizeObserver(() => {
      layout();
      /* `layout` is what re-reads `meshHidden`, so the decision has to be taken
       * after it — crossing the 780px breakpoint is the one thing that changes
       * whether the loop should be running at all. */
      sync();
      paint(false);
    });
    resizeObserver.observe(panel);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      panel.removeEventListener('pointermove', onPointerMove);
      panel.removeEventListener('pointerup', release);
      panel.removeEventListener('pointercancel', release);
      panel.removeEventListener('pointerleave', release);
      perElement.forEach((off) => off());
    };
  }, []);

  /* Two strings from one channel, and the split is the reference's: the LABEL
   * names the thing under the pointer, the SUBTITLE explains it. Both fall back
   * to the panel's own line when nothing is hovered — the label by rendering
   * nothing, since an empty pill would still paint its border. */
  const subtitle =
    activeChannel === null
      ? t('auth:panel.body')
      : t(`auth:panel.channel.${activeChannel}`);

  const channelLabel =
    activeChannel === null ? '' : t(`auth:panel.channelName.${activeChannel}`);

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
            {/* The accent dot. Its fill comes from the stylesheet so the value
                is the token and not a hex repeated inside a component — the same
                reason the canvas resolves `--teal-400` rather than carrying its
                own copy of it. */}
            <circle className={styles.hubDot} cx="17.6" cy="12" r="2.6" stroke="none" />
          </svg>
        </div>
      </div>

      {/* ALWAYS RENDERED, never conditionally: the loop writes its transform
          through a ref, and a ref that comes and goes is a ref the loop finds
          null on the frame it needs it. `data-visible` does the showing, and the
          empty string does the rest — no text, nothing to read. */}
      <div
        className={styles.tip}
        ref={labelRef}
        data-visible={activeChannel === null ? undefined : 'true'}
      >
        <bdi>{channelLabel}</bdi>
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
