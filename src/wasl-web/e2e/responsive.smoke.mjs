/* ============================================================================
 * responsive.smoke.mjs — `041` AC-1 (subset) and the navigation check
 * ============================================================================
 *   npm run test:e2e
 *
 * Each core route at 390 and 1280, in English and Arabic, against the MOCK API
 * (`mockApi.mjs`) — no SQL Server, no secrets, no seeded database. Asserts:
 *
 *   1. the DOCUMENT does not scroll sideways (`scrollWidth <= innerWidth`), AND
 *      neither does `main`. The shell scrolls INSIDE `main`, so the document alone
 *      reported "no overflow" on a screen whose table was visibly clipped — the
 *      first audit's blind spot, which is why the second assertion exists.
 *   2. the main navigation is reachable: visible at 1280; at 390 the hamburger opens
 *      the drawer and the Tickets link is inside it and visible.
 *   3. nothing threw on the page, and no request went unanswered by the mock (a new
 *      endpoint with no fixture would otherwise render an empty state that looks
 *      fine).
 *
 * Exit code 1 on any failure, with every failure listed — not just the first.
 * Not part of `vitest run`: it needs a browser. See `e2e/README.md`.
 * ========================================================================= */
import { chromium } from 'playwright';

import { startDevServer } from './devServer.mjs';
import { installMockApi, seedSession } from './mockApi.mjs';
import { CORE_ROUTES } from './routes.mjs';

const WIDTHS = [390, 1280];
const LANGS = ['en', 'ar'];

const server = await startDevServer(5197);
const browser = await chromium.launch();
const failures = [];
let checked = 0;

try {
  for (const lang of LANGS) {
    for (const route of CORE_ROUTES) {
      for (const width of WIDTHS) {
        const where = `${route.key} @${width} ${lang}`;
        const context = await browser.newContext({
          viewport: { width, height: width <= 480 ? 844 : 900 },
          locale: lang === 'ar' ? 'ar-SA' : 'en-US',
        });
        const { unhandled } = await installMockApi(context);
        await seedSession(context, lang, { signedIn: route.signedIn !== false });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error).slice(0, 160)));

        await page.goto(server.url + route.path, { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        checked += 1;

        /* 1 — no sideways scroll, in the document OR the shell's own scroller. */
        const m = await page.evaluate(() => {
          const main = document.querySelector('main');
          return {
            doc: document.documentElement.scrollWidth - window.innerWidth,
            main: main ? main.scrollWidth - main.clientWidth : 0,
          };
        });
        if (m.doc > 0)
          failures.push(`${where}: the document scrolls sideways by ${m.doc}px`);
        if (m.main > 0) failures.push(`${where}: <main> scrolls sideways by ${m.main}px`);

        /* 2 — the navigation is reachable (not on the login screen, which has none). */
        if (route.signedIn !== false) {
          if (width >= 1024) {
            const link = page.getByRole('link', {
              name: lang === 'ar' ? 'العملاء' : 'Customers',
            });
            if (!(await link.first().isVisible()))
              failures.push(`${where}: sidebar link not visible`);
          } else {
            await page
              .getByRole('button', { name: lang === 'ar' ? 'فتح القائمة' : 'Open menu' })
              .click();
            await page.waitForTimeout(350);
            const link = page
              .getByRole('dialog')
              .getByRole('link', { name: lang === 'ar' ? 'العملاء' : 'Customers' });
            if (!(await link.isVisible()))
              failures.push(`${where}: drawer link not visible after opening`);
          }
        }

        /* 3 — quiet. */
        if (errors.length > 0) failures.push(`${where}: page error — ${errors[0]}`);
        const gaps = [...new Set(unhandled)];
        if (gaps.length > 0)
          failures.push(`${where}: unmocked request — ${gaps.join(', ')}`);

        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s) in ${checked} page loads:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(
  `\n✓ ${checked} page loads — no sideways scroll, navigation reachable, no unmocked requests.`,
);
