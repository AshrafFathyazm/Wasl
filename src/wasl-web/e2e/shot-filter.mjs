/* One-off: the tickets filter panel open at 390, for a visual check. */
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDevServer } from './devServer.mjs';
import { installMockApi, seedSession } from './mockApi.mjs';

const lang = process.argv[2] ?? 'en';
const out = resolve(dirname(fileURLToPath(import.meta.url)), 'out', 'shots');
const server = await startDevServer(5196);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: lang === 'ar' ? 'ar-SA' : 'en-US' });
  await installMockApi(context);
  await seedSession(context, lang);
  const page = await context.newPage();
  await page.goto(server.url + '/tickets', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: lang === 'ar' ? /تصفية/ : /^Filter/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, `filter.390.${lang}.png`) });
  await page.keyboard.press('Escape');
  console.log('open after Esc:', await page.getByText(lang === 'ar' ? 'مسح الكل' : 'Clear all').isVisible().catch(() => false));
} finally {
  await browser.close();
  await server.close();
}
