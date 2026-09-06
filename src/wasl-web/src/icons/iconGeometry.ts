/* ============================================================================
 * 037 · The measuring tool — TEST-037-01
 * ============================================================================
 *
 * `design/icons.md` states two signature rules, and Rule 2 is a 16-unit keyline
 * inside the 24 box. Nothing has ever checked it. When this tool was first run
 * against the set as it stood, EIGHT of thirty-nine icons were outside it and
 * the build was green — which is `001`'s false-negative architecture test in
 * another costume: a rule with no guard is a preference.
 *
 * This computes an icon's ink bounding box from its geometry, so the rule can
 * be a test.
 *
 * ---------------------------------------------------------------------------
 * THE FIRST VERSION OF THIS WAS WRONG, AND ITS OUTPUT WAS BELIEVED FOR A PASS.
 * ---------------------------------------------------------------------------
 *
 * It tokenised path arguments with a plain number regex. SVG elliptical-arc
 * FLAGS are single characters and may be glued to the number after them:
 *
 *     a2.5 2.5 0 003.5 6      is   rx=2.5 ry=2.5 rot=0 laf=0 sf=0 x=3.5 y=6
 *
 * A number regex reads `003.5` as ONE token, so the command yields five
 * arguments instead of seven and every coordinate after it lands in the wrong
 * slot. It reported `copy` beginning at x = 6 when it begins at x = 3.5, and it
 * missed two icons entirely. Nothing errored. The report was well-formed and
 * about nothing.
 *
 * Hence `readFlag()` below, and hence `CONTROLS` — four paths whose boxes are
 * known by hand, asserted before any real figure is read (AC-2). A measurement
 * that names the wrong thing is worse than no measurement, because it is
 * believed.
 *
 * Curves are exact, not approximated by their control hull: cubic and quadratic
 * extrema come from the derivative's roots, and arcs are converted to centre
 * parameterisation and sampled at one degree. A control hull would BOUND the
 * curve and so would never report a violation that is not there — but it
 * over-reports, and an over-reporting guard gets loosened.
 * ========================================================================= */

/** The house keyline: nothing outside 4 … 20 in the 24 box. `icons.md` Rule 2. */
export const KEYLINE = { min: 4, max: 20 } as const;

/** Arc sampling and float noise leave a few thousandths on a curve's extreme. */
export const KEYLINE_TOLERANCE = 0.05;

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface IconShapes {
  /** `[cx, cy, r]` per `<circle>`. */
  circles: Array<[number, number, number]>;
  /** `[x, y, width, height]` per `<rect>`. */
  rects: Array<[number, number, number, number]>;
  /** The `d` of every `<path>`. */
  paths: string[];
  /** Every literal `fill="…"` in the icon, in source order. */
  fills: string[];
  /** True when the `<svg>` carries `data-flip`. */
  flips: boolean;
  /** The `size = N` default from the destructured props. */
  defaultSize: number | null;
}

/* -- path tokenising ------------------------------------------------------ */

const NUMBER = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/;

class ArgReader {
  private i = 0;

  private readonly s: string;

  constructor(source: string) {
    this.s = source;
  }

  private skip(): void {
    while (this.i < this.s.length && /[\s,]/.test(this.s[this.i] ?? '')) this.i += 1;
  }

  done(): boolean {
    this.skip();
    return this.i >= this.s.length;
  }

  readNumber(): number {
    this.skip();
    const token = NUMBER.exec(this.s.slice(this.i))?.[0];
    if (token === undefined)
      throw new Error(`unparseable number at ${this.i} in "${this.s}"`);
    this.i += token.length;
    return Number.parseFloat(token);
  }

  /** ONE CHARACTER, and it is why the first version of this file was wrong. */
  readFlag(): 0 | 1 {
    this.skip();
    const c = this.s[this.i] ?? '';
    if (c !== '0' && c !== '1') throw new Error(`arc flag must be 0 or 1, found "${c}"`);
    this.i += 1;
    return c === '1' ? 1 : 0;
  }
}

/* -- curve extrema -------------------------------------------------------- */

/** The values a cubic takes at its endpoints and wherever its derivative is 0. */
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const ts = [0, 1];
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const r = Math.sqrt(disc);
      ts.push((-b + r) / (2 * a), (-b - r) / (2 * a));
    }
  }
  return ts
    .filter((t) => t >= 0 && t <= 1)
    .map((t) => {
      const u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    });
}

/** Endpoint parameterisation → centre parameterisation, sampled at 1°. */
function arcSamples(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: 0 | 1,
  sweep: 0 | 1,
  x2: number,
  y2: number,
): Array<[number, number]> {
  if (rxIn === 0 || ryIn === 0) return [[x2, y2]];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  const phi = (rotationDeg * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const k = Math.sqrt(lambda);
    rx *= k;
    ry *= k;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (coef * (rx * y1p)) / ry;
  const cyp = (coef * -(ry * x1p)) / rx;
  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
  const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    const a = Math.acos(Math.min(1, Math.max(-1, dot)));
    return ux * vy - uy * vx < 0 ? -a : a;
  };

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const theta1 = angle(1, 0, ux, uy);
  let sweepAngle = angle(ux, uy, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
  else if (sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI;

  const steps = Math.max(8, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 180)));
  const out: Array<[number, number]> = [];
  for (let k = 0; k <= steps; k += 1) {
    const t = theta1 + sweepAngle * (k / steps);
    out.push([
      cosP * rx * Math.cos(t) - sinP * ry * Math.sin(t) + cx,
      sinP * rx * Math.cos(t) + cosP * ry * Math.sin(t) + cy,
    ]);
  }
  return out;
}

/* -- the path walk -------------------------------------------------------- */

const COMMAND = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;

/**
 * Every point the pen reaches, plus every curve extreme.
 *
 * Throws on a path it cannot read. It does NOT return an empty list: a tool
 * that silently measures nothing passes every "must be inside the box"
 * assertion ever written — `008`'s query counter learned this and asserts its
 * own lower bound for the same reason.
 */
export function pathPoints(d: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let prevCtrlX: number | null = null;
  let prevCtrlY: number | null = null;
  let prevCmd = '';
  let m: RegExpExecArray | null;

  COMMAND.lastIndex = 0;
  while ((m = COMMAND.exec(d)) !== null) {
    const raw = m[1] ?? '';
    const cmd = raw.toUpperCase();
    const relative = raw !== cmd;
    const args = new ArgReader(m[2] ?? '');

    if (cmd === 'Z') {
      cx = startX;
      cy = startY;
      prevCmd = cmd;
      continue;
    }

    let first = true;
    while (!args.done()) {
      if (cmd === 'M' || cmd === 'L' || cmd === 'T') {
        const x = args.readNumber();
        const y = args.readNumber();
        cx = relative ? cx + x : x;
        cy = relative ? cy + y : y;
        if (cmd === 'M' && first) {
          startX = cx;
          startY = cy;
        }
        pts.push([cx, cy]);
        prevCtrlX = null;
        prevCtrlY = null;
      } else if (cmd === 'H') {
        const x = args.readNumber();
        cx = relative ? cx + x : x;
        pts.push([cx, cy]);
        prevCtrlX = null;
        prevCtrlY = null;
      } else if (cmd === 'V') {
        const y = args.readNumber();
        cy = relative ? cy + y : y;
        pts.push([cx, cy]);
        prevCtrlX = null;
        prevCtrlY = null;
      } else if (cmd === 'C' || cmd === 'S') {
        let x1: number;
        let y1: number;
        if (cmd === 'C') {
          const a = args.readNumber();
          const b = args.readNumber();
          x1 = relative ? cx + a : a;
          y1 = relative ? cy + b : b;
        } else {
          const reflect = prevCmd === 'C' || prevCmd === 'S';
          x1 = reflect && prevCtrlX !== null ? 2 * cx - prevCtrlX : cx;
          y1 = reflect && prevCtrlY !== null ? 2 * cy - prevCtrlY : cy;
        }
        const a2 = args.readNumber();
        const b2 = args.readNumber();
        const a3 = args.readNumber();
        const b3 = args.readNumber();
        const x2 = relative ? cx + a2 : a2;
        const y2 = relative ? cy + b2 : b2;
        const x3 = relative ? cx + a3 : a3;
        const y3 = relative ? cy + b3 : b3;
        for (const v of cubicExtrema(cx, x1, x2, x3)) pts.push([v, cy]);
        for (const v of cubicExtrema(cy, y1, y2, y3)) pts.push([cx, v]);
        pts.push([x3, y3]);
        prevCtrlX = x2;
        prevCtrlY = y2;
        cx = x3;
        cy = y3;
      } else if (cmd === 'Q') {
        const a = args.readNumber();
        const b = args.readNumber();
        const a2 = args.readNumber();
        const b2 = args.readNumber();
        const x1 = relative ? cx + a : a;
        const y1 = relative ? cy + b : b;
        const x2 = relative ? cx + a2 : a2;
        const y2 = relative ? cy + b2 : b2;
        for (const v of cubicExtrema(
          cx,
          cx + (2 / 3) * (x1 - cx),
          x2 + (2 / 3) * (x1 - x2),
          x2,
        ))
          pts.push([v, cy]);
        for (const v of cubicExtrema(
          cy,
          cy + (2 / 3) * (y1 - cy),
          y2 + (2 / 3) * (y1 - y2),
          y2,
        ))
          pts.push([cx, v]);
        pts.push([x2, y2]);
        prevCtrlX = x1;
        prevCtrlY = y1;
        cx = x2;
        cy = y2;
      } else if (cmd === 'A') {
        const rx = args.readNumber();
        const ry = args.readNumber();
        const rot = args.readNumber();
        const largeArc = args.readFlag();
        const sweep = args.readFlag();
        const a = args.readNumber();
        const b = args.readNumber();
        const x2 = relative ? cx + a : a;
        const y2 = relative ? cy + b : b;
        for (const p of arcSamples(cx, cy, rx, ry, rot, largeArc, sweep, x2, y2))
          pts.push(p);
        cx = x2;
        cy = y2;
        prevCtrlX = null;
        prevCtrlY = null;
      }
      first = false;
    }
    prevCmd = cmd;
  }

  if (pts.length === 0) throw new Error(`path produced no points: "${d}"`);
  return pts;
}

/** The ink box of one icon. Throws when the icon has no geometry at all. */
export function bboxOf(icon: Pick<IconShapes, 'circles' | 'rects' | 'paths'>): Box {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [cx, cy, r] of icon.circles) {
    xs.push(cx - r, cx + r);
    ys.push(cy - r, cy + r);
  }
  for (const [x, y, w, h] of icon.rects) {
    xs.push(x, x + w);
    ys.push(y, y + h);
  }
  for (const d of icon.paths) {
    for (const [x, y] of pathPoints(d)) {
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length === 0)
    throw new Error('icon has no circle, rect or path — nothing to measure');
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
}

/** How far outside the keyline an icon reaches. Negative means it is inside. */
export function overhang(box: Box): number {
  return Math.max(
    KEYLINE.min - box.x0,
    KEYLINE.min - box.y0,
    box.x1 - KEYLINE.max,
    box.y1 - KEYLINE.max,
  );
}

/* -- reading the module --------------------------------------------------- */

const EXPORT =
  /export const (Icon\w+)\s*=\s*\(\{([^}]*)\}\s*:\s*IconProps\)\s*=>\s*\(([\s\S]*?)\n\);/g;
const ATTR = (name: string) => new RegExp(`\\b${name}="([^"]+)"`);

function attrNumber(tag: string, name: string): number {
  const value = ATTR(name).exec(tag)?.[1];
  if (value === undefined) throw new Error(`<${tag.slice(1, 7)}…> has no ${name}`);
  return Number.parseFloat(value);
}

/**
 * Every `Icon*` component declared in a module source, with its geometry.
 *
 * Reads the SOURCE rather than rendering, because the box has to be measured
 * from the authored coordinates: a rendered `<svg>` in jsdom has no layout, so
 * `getBBox` is unavailable and `getBoundingClientRect` returns zeroes.
 */
export function extractIcons(source: string): Map<string, IconShapes> {
  const out = new Map<string, IconShapes>();
  let m: RegExpExecArray | null;
  EXPORT.lastIndex = 0;
  while ((m = EXPORT.exec(source)) !== null) {
    const name = m[1] ?? '';
    const props = m[2] ?? '';
    const body = m[3] ?? '';
    const sizeValue = /\bsize\s*=\s*(\d+(?:\.\d+)?)/.exec(props)?.[1];
    const icon: IconShapes = {
      circles: [],
      rects: [],
      paths: [],
      fills: [],
      flips: /\bdata-flip\b/.test(body),
      defaultSize: sizeValue === undefined ? null : Number.parseFloat(sizeValue),
    };
    for (const tag of body.match(/<circle[^>]*>/g) ?? [])
      icon.circles.push([
        attrNumber(tag, 'cx'),
        attrNumber(tag, 'cy'),
        attrNumber(tag, 'r'),
      ]);
    for (const tag of body.match(/<rect[^>]*>/g) ?? [])
      icon.rects.push([
        attrNumber(tag, 'x'),
        attrNumber(tag, 'y'),
        attrNumber(tag, 'width'),
        attrNumber(tag, 'height'),
      ]);
    for (const tag of body.match(/<path[^>]*>/g) ?? []) {
      const d = ATTR('d').exec(tag)?.[1];
      if (d === undefined) throw new Error(`${name} has a <path> with no d`);
      icon.paths.push(d);
    }
    for (const f of body.match(/\bfill="[^"]+"/g) ?? []) icon.fills.push(f.slice(6, -1));
    out.set(name, icon);
  }
  if (out.size === 0)
    throw new Error('no Icon* exports found — the extractor matched nothing');
  return out;
}

/* -- AC-2 · the controls -------------------------------------------------- */

/**
 * Four paths whose boxes are known by hand. These run FIRST in the keyline
 * test; if any fails, no figure the tool produces may be read.
 *
 * Control 2 is the one that matters: it is the exact shape the first version of
 * this file got wrong, and it went unnoticed because the wrong answer was
 * plausible.
 */
export const CONTROLS: Array<{ what: string; d: string; expect: Box }> = [
  {
    what: 'a full r8 circle at 12,12 drawn as two arcs',
    d: 'M4 12a8 8 0 1 1 16 0a8 8 0 1 1 -16 0',
    expect: { x0: 4, y0: 4, x1: 20, y1: 20 },
  },
  {
    what: 'compact arc flags — "a2.5 2.5 0 003.5 6" is seven arguments, not five',
    d: 'M15.5 8.5V6a2.5 2.5 0 00-2.5-2.5H6A2.5 2.5 0 003.5 6v7A2.5 2.5 0 006 15.5h2.5',
    expect: { x0: 3.5, y0: 3.5, x1: 15.5, y1: 15.5 },
  },
  {
    what: 'a plain box, absolute H and V',
    d: 'M4 4H20V20H4Z',
    expect: { x0: 4, y0: 4, x1: 20, y1: 20 },
  },
  {
    what: 'a cubic that bulges past both of its endpoints',
    d: 'M4 12C4 2 20 2 20 12',
    expect: { x0: 4, y0: 4.5, x1: 20, y1: 12 },
  },
];
