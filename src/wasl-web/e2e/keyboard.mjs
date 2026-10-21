/* ============================================================================
 * keyboard.mjs — `041` AC-8 / AC-9. Is Send still reachable with the keyboard up?
 * ============================================================================
 *   node e2e/keyboard.mjs
 *
 * A phone's on-screen keyboard is, to the page, a viewport that suddenly lost half
 * its height. This does exactly that — 390 x 420 instead of 390 x 844 — focuses the
 * field, and asks two questions about the button that matters:
 *
 *   1. is it INSIDE the visible viewport, and
 *   2. is it what a thumb would actually HIT there (`elementFromPoint`) — not
 *      something drawn over it?
 *
 * NOT the real thing: no `visualViewport`, no iOS, no layout shift from a real IME.
 * It proves the layout holds when the box shrinks, which is the part this product
 * controls (`100dvh` shell, sticky action row). It does not prove a real keyboard.
 * ========================================================================= */
import { chromium } from 'playwright';

import { startDevServer } from './devServer.mjs';
import { installMockApi, seedSession, TICKET_ID } from './mockApi.mjs';

const server = await startDevServer(5191);
const browser = await chromium.launch();
const failures = [];

async function reachable(page, locator, what) {
  const box = await locator.boundingBox();
  if (!box) {
    failures.push(`${what}: not rendered`);
    return;
  }
  const vh = page.viewportSize().height;
  if (box.y < 0 || box.y + box.height > vh + 1) {
    failures.push(
      `${what}: spans ${Math.round(box.y)}..${Math.round(box.y + box.height)} in a ${vh}px viewport`,
    );
    return;
  }
  const hit = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top === el || el.contains(top);
  });
  if (!hit) failures.push(`${what}: something is drawn over it`);
}

try {
  for (const lang of ['en', 'ar']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 420 },
      locale: lang === 'ar' ? 'ar-SA' : 'en-US',
    });
    await installMockApi(context);
    await seedSession(context, lang);
    const page = await context.newPage();

    /* The composer: focus the field, then the action row must be on screen. */
    await page.goto(`${server.url}/tickets/${TICKET_ID}`, { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: lang === 'ar' ? 'ملاحظة داخلية' : 'Internal note' })
      .click();
    const field = page.getByRole('textbox').first();
    await field.click();
    await field.fill(lang === 'ar' ? 'نص' : 'text');
    await page.waitForTimeout(300);
    await reachable(
      page,
      page.getByRole('button', { name: lang === 'ar' ? 'إضافة الملاحظة' : 'Add note' }),
      `${lang} composer Send`,
    );

    /* The new-ticket footer: Create must stay on screen while a field has focus. */
    await page.goto(`${server.url}/tickets/new`, { waitUntil: 'networkidle' });
    await page.getByRole('textbox').first().click();
    await page.waitForTimeout(300);
    await reachable(
      page,
      page.getByRole('button', {
        name: lang === 'ar' ? 'إنشاء التذكرة' : 'Create ticket',
      }),
      `${lang} new-ticket Create`,
    );

    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  '✓ with the viewport cut to 420px high, the composer’s Send and the new-ticket Create are on screen and hittable, en + ar.',
);
