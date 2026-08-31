import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/* ============================================================================
 * The loader system's structural guards — 029
 * ============================================================================
 *
 * SOURCE TESTS, DELIBERATELY, and the reason is jsdom. Every rule below is
 * about a `@media` block or a `@keyframes` body, and jsdom evaluates neither:
 * `getComputedStyle` in a jsdom test reports the same values whether or not
 * `prefers-reduced-motion` is set, because no media query is ever matched. A
 * DOM test asserting "the animation is off" would pass on a file with no
 * reduce block at all — a green test over the exact defect it was written for.
 *
 * So these read the stylesheet. That is weaker than a browser and it is
 * stronger than a test that cannot fail.
 * ============================================================================ */

/* fileURLToPath, not `new URL(...).pathname`. On Windows the latter yields
 * `/D:/Projects/...` — a leading slash before the drive letter — and `join`
 * then resolves it to `D:\src\components\...`, which is almost right and does
 * not exist. Measured: the first run of this file failed with an ENOENT for a
 * path that read correctly at a glance. */
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..');
const REPO = join(SRC, '..', '..', '..');

const loaderCss = readFileSync(join(HERE, 'Loader.module.css'), 'utf8');
const skeletonCss = readFileSync(join(HERE, 'Skeleton.module.css'), 'utf8');
const brandMd = readFileSync(join(REPO, 'docs', 'sdd', 'design', 'brand.md'), 'utf8');

/* COMMENTS ARE STRIPPED BEFORE ANY OF THIS PARSES.
 *
 * Both of the following read CSS with a regex, and prose is indistinguishable
 * from code to a regex. The first run of this file proved it twice: the AC-3
 * scan lost `.sweep` because the comment above it was swallowed into the
 * selector match, and the AC-12 scan reported Table as declaring
 * `@keyframes table-pulse` — from a comment saying that it no longer does.
 *
 * Two false readings in one run, one of them a false PASS and one a false
 * FAIL. Exactly the failure mode 12-delivery-log warns about: a measurement
 * that names the wrong thing is worse than no measurement, because it is
 * believed. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Pull one `@media (...)` block's body out of a stylesheet. */
function mediaBlock(css: string, condition: string): string {
  const start = css.indexOf(`@media (${condition})`);
  expect(start, `no @media (${condition}) block`).toBeGreaterThan(-1);

  let depth = 0;
  let i = css.indexOf('{', start);
  const bodyStart = i + 1;
  for (; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(bodyStart, i);
    }
  }
  throw new Error(`unterminated @media (${condition})`);
}

/** Every selector that heads a rule in a block of CSS. */
function selectorsIn(source: string): string[] {
  const css = stripComments(source);
  return [...css.matchAll(/(^|\})\s*([^{}@]+?)\s*\{/g)]
    .flatMap((m) => (m[2] ?? '').split(','))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('/*'));
}

describe('AC-2 — brand.md §2 and Loader.module.css do not drift', () => {
  /* THE FILE CLAIMS "VERBATIM" IN CAPITALS AND HAD NO TEST BEHIND IT.
   *
   * That claim shipped in `006` and stayed true only because nobody edited
   * either side. `029` changed both, which is exactly the moment the claim was
   * most likely to become false — so it is asserted now rather than trusted.
   *
   * The percentages are the assertion, not the whole text: the stylesheet
   * writes the travel through tokens and the document writes it in pixels, and
   * forcing those two to be byte-identical would mean the document could never
   * carry a readable number. The SHAPE of the arrival is what must not move. */
  const stops = (css: string) =>
    [...css.matchAll(/(\d+)%/g)].map((m) => Number(m[1])).join(',');

  it('the converge keyframe stops are identical in both files', () => {
    const docBlock = brandMd.slice(
      brandMd.indexOf('@keyframes converge'),
      brandMd.indexOf('```', brandMd.indexOf('@keyframes converge')),
    );
    const cssBlock = loaderCss.slice(
      loaderCss.indexOf('@keyframes converge'),
      loaderCss.indexOf('\n}', loaderCss.indexOf('@keyframes converge')),
    );

    expect(docBlock).toContain('16%');
    expect(stops(cssBlock)).toBe(stops(docBlock));
  });

  it('the travel distances are identical in both files', () => {
    const docBlock = brandMd.slice(
      brandMd.indexOf('@keyframes converge'),
      brandMd.indexOf('```', brandMd.indexOf('@keyframes converge')),
    );
    /* The document writes 5 / 30 / 36 as literals; the stylesheet writes them
     * as tokens. Compare the token VALUES, which is the same claim. */
    const tokens = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
    const value = (name: string) =>
      new RegExp(`--${name}:\\s*([0-9.]+)px`).exec(tokens)?.[1];

    expect(docBlock).toContain(`${value('loader-travel-in')}px`);
    expect(docBlock).toContain(`${value('loader-travel')}px`);
    expect(docBlock).toContain(`${value('loader-travel-over')}px`);
  });
});

describe('AC-3 — every animated shape has an explicit static frame', () => {
  /* Gating the animation is NOT enough, and this is the guard for it. A dot
   * declares `opacity: 0` at rest; without a `reduce` rule it does not stop
   * moving, it DISAPPEARS — for exactly the people who cannot ask for the
   * motion back.
   *
   * The exemptions are the shapes that are already fully visible at rest. Each
   * carries its reason here, and the last assertion in this block is what stops
   * the list quietly growing to cover a real omission. */
  const EXEMPT: Record<string, string> = {
    '.node':
      'a filled circle with no opacity or transform in its rest state — it is ' +
      'painted whether or not the pulse runs',
    '.markNode':
      'a filled circle. mark-node only scales it, so at rest it is the mark’s ' +
      'own node at full size',
    '.satOrbitOuter':
      'a positioning wrapper with no paint of its own; its DOT is given a ' +
      'resting position in the reduce block instead',
    '.satOrbitInner': 'as .satOrbitOuter',
  };

  const animated = new Set(selectorsIn(mediaBlock(loaderCss, 'prefers-reduced-motion: no-preference')));
  const still = new Set(
    selectorsIn(mediaBlock(loaderCss, 'prefers-reduced-motion: reduce')).map((s) =>
      /* `.dot:nth-child(1)` in the reduce block satisfies `.dot` above it. */
      s.replace(/:nth-child\([^)]*\)/g, '').trim(),
    ),
  );

  it.each([...animated])('%s is given a resting state', (selector) => {
    const base = selector.replace(/:nth-child\([^)]*\)/g, '').trim();
    const covered = still.has(base) || EXEMPT[base] !== undefined;
    expect(covered, `${selector} animates but has no reduce rule and no exemption`).toBe(
      true,
    );
  });

  it('every exemption is used — the list cannot rot', () => {
    for (const selector of Object.keys(EXEMPT)) {
      expect(animated.has(selector), `${selector} is exempted but never animated`).toBe(
        true,
      );
    }
  });

  it('the skeleton declares its resting opacity too', () => {
    expect(mediaBlock(skeletonCss, 'prefers-reduced-motion: reduce')).toContain(
      'opacity: 1',
    );
  });
});

describe('AC-4 / AC-5 — direction', () => {
  it('every physical travel carries an explicit sign', () => {
    /* A `translateX` with a bare length is the defect: it does not flip under
     * rtl, so the shape travels away from its node and still animates. */
    const bare = [...loaderCss.matchAll(/translateX\(\s*(-?[\d.]+(?:px|%))\s*\)/g)].map(
      (m) => m[0],
    );
    expect(bare, 'translateX without var(--ld-dir)').toEqual([]);
  });

  it('the mark and the brand pulse never mirror', () => {
    /* THE ASSERTION IS BOTH HALVES AT ONCE. "The mark does not mirror" is
     * satisfied by a file that mirrors nothing, which would be a different and
     * equally wrong build — so the abstract shapes are asserted to mirror in
     * the same test. */
    const markRules = loaderCss.slice(
      loaderCss.indexOf('==== 2 · Mark'),
      loaderCss.indexOf('==== 4 · Path'),
    );
    expect(markRules).not.toContain('--ld-dir');
    expect(markRules).not.toContain('scaleX');

    expect(loaderCss).toContain('scaleX(var(--ld-dir, 1))'); // path
    expect(loaderCss).toContain('var(--ld-origin, left)'); // chain
  });

  it('--ld-dir is defined for both directions, at the token layer', () => {
    const tokens = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
    expect(tokens).toContain('--ld-dir: 1');
    expect(tokens).toMatch(/\[dir='rtl'\][^}]*--ld-dir:\s*-1/s);
  });
});

describe('AC-9 — no raw colour or duration in the loader stylesheets', () => {
  /* PARTIALLY MET, AND THE LIMIT IS STATED IN summary.md. Colour and duration
   * are fully tokenised and asserted here. PER-SHAPE GEOMETRY IS NOT: `.mark`
   * is 70×44, `.orbit` is 28×28, and each of those numbers belongs to exactly
   * one shape and appears once. Twenty tokens with one consumer each is a token
   * layer that documents nothing. */
  it.each([
    ['Loader.module.css', loaderCss],
    ['Skeleton.module.css', skeletonCss],
  ])('%s names no colour literal', (_name, css) => {
    const hex = [...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0]);
    const fn = [...css.matchAll(/\b(?:rgba?|hsla?)\(/g)].map((m) => m[0]);
    expect([...hex, ...fn]).toEqual([]);
  });

  it('every animation duration comes from a motion token', () => {
    const durations = [...loaderCss.matchAll(/animation:\s*[\w-]+\s+([^\s;]+)/g)].map(
      (m) => m[1] ?? '',
    );
    expect(durations.length).toBeGreaterThan(8);
    for (const d of durations) {
      expect(d, `raw duration ${d}`).toMatch(/^var\(--motion-loader-/);
    }
  });
});

describe('AC-12 — no shipped component declares its own waiting animation', () => {
  /* THE SCOPE IS THE SHIPPED SURFACE — components, shell, features — which is
   * the same scope the BR-8.8 literal-string rule uses.
   *
   * `src/dev` is excluded and that is not a loophole: those files are stripped
   * from the production bundle by `import.meta.env.DEV`, and two of them
   * currently DO carry waiting keyframes of their own, including a `shimmer`
   * that design/loaders.md forbids by name. They belong to `026` and `027` and
   * are recorded in 029/summary.md as follow-up rather than rewritten from
   * this lane. Narrowing the scope with the exclusion named is honest; letting
   * the test cover them and marking it skipped would not be. */
  const WAITING = /@keyframes\s+[\w-]*(pulse|skel|shimmer|spin|sweep|load|dash|converge|orbit)/i;
  const OWNER = join('components', 'Loader');

  function cssFilesUnder(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return cssFilesUnder(full);
      return entry.name.endsWith('.css') ? [full] : [];
    });
  }

  const files = ['components', 'shell', 'features']
    .flatMap((d) => cssFilesUnder(join(SRC, d)))
    .filter((f) => !f.includes(OWNER));

  it('finds the files it claims to scan', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it.each(files)('%s declares no waiting keyframes', (file) => {
    const css = stripComments(readFileSync(file, 'utf8'));
    const found = [...css.matchAll(new RegExp(WAITING, 'gi'))].map((m) => m[0]);
    expect(found, `${relative(SRC, file)} should use components/Loader`).toEqual([]);
  });
});
