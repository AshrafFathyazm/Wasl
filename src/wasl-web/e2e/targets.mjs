/* ============================================================================
 * targets.mjs — `041` AC-10. Which controls are under 44x44, grouped by kind?
 * ============================================================================
 *   node e2e/targets.mjs [width] [--strict]      default 390
 *
 * Lists every interactive element (button, tab, toggle, row action, pager
 * button, form control — NOT an inline text link in running text, spec §8.D)
 * smaller than 44x44, and every text field under 16px, grouped by CSS class so
 * a fix to one rule clears a whole family. `--strict` exits 1 if any remain.
 * ========================================================================= */
import { chromium } from 'playwright';

import { startDevServer } from './devServer.mjs';
import { installMockApi, seedSession } from './mockApi.mjs';
import { ALL_ROUTES } from './routes.mjs';

const width = Number(
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 390,
);
const strict = process.argv.includes('--strict');

/** In the page. */
function scan() {
  const out = { small: [], font: [] };
  const name = (el) =>
    el.tagName.toLowerCase() +
    (typeof el.className === 'string' && el.className
      ? '.' + el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')
      : '');
  const targets = document.querySelectorAll(
    'button, a[href], [role="tab"], [role="menuitem"], [role="radio"], [role="switch"], [role="combobox"], input:not([type="hidden"]), textarea, select, summary',
  );
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (
      r.width === 0 ||
      r.height === 0 ||
      s.visibility === 'hidden' ||
      s.display === 'none'
    )
      continue;
    /* an inline link in running text is exempt */
    if (el.tagName === 'A' && s.display === 'inline') continue;
    /* a visually-hidden input whose label is the target (checkbox/radio inside a label) */
    if (
      el.tagName === 'INPUT' &&
      (el.type === 'checkbox' || el.type === 'radio') &&
      (el.labels?.[0] ?? el.closest('label'))
    ) {
      const l = (el.labels?.[0] ?? el.closest('label')).getBoundingClientRect();
      if (l.width >= 44 && l.height >= 44) continue;
    }
    /* A STRETCHED LINK: its `::after` covers the nearest positioned ancestor, so the
       thing a thumb hits is the card, not the 24px of text. */
    const after = getComputedStyle(el, '::after');
    if (el.tagName === 'A' && after.content !== 'none' && after.position === 'absolute') {
      const host = el.closest('article, li, [class*="card"]');
      const h = host?.getBoundingClientRect();
      if (h && h.width >= 44 && h.height >= 44) continue;
    }
    if (r.width < 44 || r.height < 44) {
      out.small.push({
        key: name(el),
        w: Math.round(r.width),
        h: Math.round(r.height),
        label: (el.getAttribute('aria-label') ?? el.textContent ?? '')
          .trim()
          .slice(0, 28),
      });
    }
  }
  for (const el of document.querySelectorAll(
    'input:not([type="hidden"], [type="checkbox"], [type="radio"]), textarea, select',
  )) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) out.font.push({ key: name(el), fs });
  }
  return out;
}

const server = await startDevServer(5193);
const browser = await chromium.launch();
const groups = new Map();
const fonts = new Map();
let total = 0;

try {
  for (const route of ALL_ROUTES) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await installMockApi(context);
    await seedSession(context, 'en', { signedIn: route.signedIn !== false });
    const page = await context.newPage();
    await page.goto(server.url + route.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);
    const { small, font } = await page.evaluate(scan);
    for (const item of small) {
      total += 1;
      const g = groups.get(item.key) ?? { n: 0, routes: new Set(), sample: item };
      g.n += 1;
      g.routes.add(route.key);
      groups.set(item.key, g);
    }
    for (const item of font) {
      const g = fonts.get(item.key) ?? { n: 0, routes: new Set(), fs: item.fs };
      g.n += 1;
      g.routes.add(route.key);
      fonts.set(item.key, g);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

const rows = [...groups.entries()].sort((a, b) => b[1].n - a[1].n);
console.log(`\n${total} controls under 44x44 at ${width}px, in ${rows.length} kinds:\n`);
for (const [key, g] of rows) {
  console.log(
    `${String(g.n).padStart(4)}  ${key.padEnd(46)} ${g.sample.w}x${g.sample.h}  "${g.sample.label}"  [${[...g.routes].slice(0, 4).join(', ')}]`,
  );
}
console.log(
  `\nText fields under 16px: ${[...fonts.values()].reduce((n, g) => n + g.n, 0)}`,
);
for (const [key, g] of fonts)
  console.log(
    `${String(g.n).padStart(4)}  ${key.padEnd(46)} ${g.fs}px  [${[...g.routes].slice(0, 4).join(', ')}]`,
  );

if (strict && (total > 0 || fonts.size > 0)) process.exit(1);
