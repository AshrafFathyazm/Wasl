/* ============================================================================
 * audit.mjs — `041` §2.1. Measures, changes nothing.
 * ============================================================================
 *   node e2e/audit.mjs [label]        label defaults to "before"
 *
 * For each core route, width and language: horizontal overflow (document and the
 * elements that cause it), touch targets under 44px, form fields under 16px, and
 * a screenshot at 390 and 1024. Output: e2e/out/<label>/results.json and PNGs.
 * Not part of `npm test`; the committed check is `responsive.smoke.mjs`.
 * ========================================================================= */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startDevServer } from './devServer.mjs';
import { installMockApi, seedSession } from './mockApi.mjs';
import { CORE_ROUTES } from './routes.mjs';

const label = process.argv[2] ?? 'before';
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'out', label);
mkdirSync(out, { recursive: true });

const WIDTHS = [390, 768, 1024, 1440];
const LANGS = ['en', 'ar'];
const SHOT_WIDTHS = new Set([390, 1024]);

/** Runs in the page. */
function measure() {
  const vw = window.innerWidth;
  const doc = document.documentElement;
  const describe = (el) =>
    el.tagName.toLowerCase() +
    (el.id ? `#${el.id}` : '') +
    (typeof el.className === 'string' && el.className
      ? '.' + el.className.split(/\s+/).slice(0, 2).join('.')
      : '');

  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o !== 'visible') {
        const r = p.getBoundingClientRect();
        if (r.right <= vw + 1 && r.left >= -1) return true;
      }
    }
    return false;
  };

  const overflowing = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || s.position === 'fixed')
      continue;
    if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) {
      overflowing.push({
        el: describe(el),
        left: Math.round(r.left),
        right: Math.round(r.right),
      });
    }
  }

  const small = [];
  const targets = document.querySelectorAll(
    'button, a[href], [role="tab"], [role="menuitem"], [role="radio"], [role="switch"], input:not([type="hidden"]), textarea, [role="combobox"]',
  );
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') continue;
    /* an inline link inside running text is excluded (spec D) */
    if (el.tagName === 'A' && s.display === 'inline') continue;
    if (r.width < 44 || r.height < 44) {
      small.push({
        el: describe(el),
        w: Math.round(r.width),
        h: Math.round(r.height),
        text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24),
      });
    }
  }

  const smallFont = [];
  for (const el of document.querySelectorAll(
    'input:not([type="hidden"]), textarea, select',
  )) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) smallFont.push({ el: describe(el), fontSize: fs });
  }

  return {
    innerWidth: vw,
    scrollWidth: doc.scrollWidth,
    pageOverflow: doc.scrollWidth > vw,
    /* The shell scrolls INSIDE `main`, so the document never overflows even when the
       page does — the first audit reported zero overflow everywhere on a screen whose
       table was visibly clipped. */
    mainOverflow: (() => {
      const m = document.querySelector('main');
      return m ? m.scrollWidth - m.clientWidth : 0;
    })(),
    overflowing: overflowing.slice(0, 12),
    overflowCount: overflowing.length,
    smallTargets: small.length,
    smallTargetSample: small.slice(0, 8),
    smallFont: smallFont.length,
    smallFontSample: smallFont.slice(0, 4),
    dir: document.documentElement.dir,
  };
}

const server = await startDevServer();
const browser = await chromium.launch();
const results = [];

try {
  for (const lang of LANGS) {
    for (const route of CORE_ROUTES) {
      for (const width of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width, height: width <= 480 ? 844 : 900 },
          locale: lang === 'ar' ? 'ar-SA' : 'en-US',
          deviceScaleFactor: 1,
        });
        const { unhandled } = await installMockApi(context);
        await seedSession(context, lang, { signedIn: route.signedIn !== false });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

        await page.goto(server.url + route.path, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        const m = await page.evaluate(measure);
        results.push({
          route: route.key,
          width,
          lang,
          ...m,
          unhandled: [...new Set(unhandled)],
          errors,
        });

        if (SHOT_WIDTHS.has(width)) {
          await page.screenshot({
            path: resolve(out, `${route.key}.${width}.${lang}.png`),
          });
        }
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}

writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2));

const pad = (s, n) => String(s).padEnd(n);
console.log(
  pad('route', 15),
  pad('lang', 5),
  pad('w', 5),
  pad('overflow', 10),
  pad('culprits', 9),
  pad('small<44', 9),
  'font<16',
);
for (const r of results) {
  console.log(
    pad(r.route, 15),
    pad(r.lang, 5),
    pad(r.width, 5),
    pad(
      r.pageOverflow
        ? `YES +${r.scrollWidth - r.innerWidth}`
        : r.mainOverflow > 0
          ? `main +${r.mainOverflow}`
          : 'no',
      10,
    ),
    pad(r.overflowCount, 9),
    pad(r.smallTargets, 9),
    r.smallFont,
  );
}
const gaps = new Set(results.flatMap((r) => r.unhandled));
if (gaps.size > 0) console.log('\nUNMOCKED:', [...gaps].join(', '));
const errs = results.filter((r) => r.errors.length > 0);
if (errs.length > 0) console.log('\nPAGE ERRORS:', JSON.stringify(errs.slice(0, 3)));
