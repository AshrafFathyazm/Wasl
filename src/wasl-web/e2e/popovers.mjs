/* ============================================================================
 * popovers.mjs — `041` AC-11. Do the menus stay inside the viewport?
 * ============================================================================
 *   node e2e/popovers.mjs [width]        default 360
 *
 * Opens every menu on the ticket page and the new-ticket form at a phone width,
 * in English and Arabic, and measures what appeared: the elements that became
 * visible and are positioned out of flow (`absolute` / `fixed`) and large enough to
 * be a panel. Each must lie inside `[0, innerWidth]` on the inline axis. Exit 1
 * with every offender listed.
 * ========================================================================= */
import { chromium } from 'playwright';

import { startDevServer } from './devServer.mjs';
import { installMockApi, seedSession, TICKET_ID } from './mockApi.mjs';

const width = Number(process.argv[2] ?? 360);
const LABELS = {
  en: { actions: 'Take action', template: /Insert a template/, tag: /Add a tag/, details: /^Details/, assign: /^Assign$|Change assignee/, internal: 'Internal note', category: /Category/ },
  ar: { actions: 'اتخاذ إجراء', template: /إدراج قالب/, tag: /إضافة وسم|وسم/, details: /^التفاصيل/, assign: /^إسناد$|تغيير المُسنَد|تغيير/, internal: 'ملاحظة داخلية', category: /التصنيف/ },
};

/** Runs in the page: every visible, out-of-flow, panel-sized element. */
function panels() {
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    if (s.position !== 'absolute' && s.position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 60) continue;
    if (r.width >= window.innerWidth - 1 && r.left <= 1) continue; /* a full-width backdrop or sheet */
    out.push({ key: `${el.tagName}.${String(el.className).slice(0, 40)}`, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
  }
  return out;
}

const server = await startDevServer(5195);
const browser = await chromium.launch();
const failures = [];
let opened = 0;

try {
  for (const lang of ['en', 'ar']) {
    const L = LABELS[lang];
    const context = await browser.newContext({ viewport: { width, height: 800 }, locale: lang === 'ar' ? 'ar-SA' : 'en-US' });
    await installMockApi(context);
    await seedSession(context, lang);
    const page = await context.newPage();
    page.setDefaultTimeout(4000);

    const check = async (name, open) => {
      const before = new Set((await page.evaluate(panels)).map((p) => p.key + p.left));
      try {
        await open();
      } catch (error) {
        failures.push(`${lang} ${name}: could not open — ${String(error).replace(/\s+/g, ' ').slice(0, 420)}`);
        return;
      }
      await page.waitForTimeout(250);
      const fresh = (await page.evaluate(panels)).filter((p) => !before.has(p.key + p.left));
      opened += 1;
      if (fresh.length === 0) failures.push(`${lang} ${name}: nothing appeared (selector drift?)`);
      for (const p of fresh) {
        if (p.left < -1 || p.right > width + 1) failures.push(`${lang} ${name}: ${p.key} spans ${p.left}..${p.right} in a ${width}px viewport`);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    };

    await page.goto(`${server.url}/tickets/${TICKET_ID}`, { waitUntil: 'networkidle' });
    await check('take-action menu', () => page.getByRole('button', { name: L.actions }).click());
    await check('status menu', () => page.locator('button[aria-haspopup="menu"]').first().click());
    await check('template menu', async () => {
      await page.getByRole('button', { name: L.internal }).click().catch(() => {});
      await page.getByRole('button', { name: L.template }).click();
    });
    await check('tag picker', () => page.getByRole('button', { name: L.tag }).first().click());
    await check('assignee panel', async () => {
      await page.getByRole('button', { name: L.details }).click();
      await page.getByRole('button', { name: L.assign }).first().click();
    });

    await page.goto(`${server.url}/tickets/new`, { waitUntil: 'networkidle' });
    await check('category dropdown', () => page.getByRole('combobox', { name: L.category }).click());

    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s), ${opened} menus opened at ${width}px:\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\n✓ ${opened} menus opened at ${width}px, en + ar — all inside the viewport.`);
