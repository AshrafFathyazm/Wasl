/* One-off screenshot: node e2e/shot.mjs <path> <width> <lang> [drawer] [height] */
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { startDevServer } from './devServer.mjs';
import { installMockApi, seedSession } from './mockApi.mjs';

const [path = '/', width = '390', lang = 'en', extraArg = '', height] =
  process.argv.slice(2);
const extra = extraArg === '-' ? '' : extraArg;
const out = resolve(dirname(fileURLToPath(import.meta.url)), 'out', 'shots');
mkdirSync(out, { recursive: true });
const server = await startDevServer(5198);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: Number(width), height: Number(height ?? 844) },
    locale: lang === 'ar' ? 'ar-SA' : 'en-US',
  });
  await installMockApi(context);
  await seedSession(context, lang, { signedIn: path !== '/login' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
  await page.goto(server.url + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  if (extra === 'drawer') {
    await page.getByRole('button', { name: /open menu|فتح القائمة/i }).click();
    await page.waitForTimeout(450);
  }
  const name = `${path.replace(/[^a-z0-9]+/gi, '_')}.${width}.${lang}${extra ? '.' + extra : ''}.png`;
  await page.screenshot({ path: resolve(out, name) });
  console.log(resolve(out, name));
} finally {
  await browser.close();
  await server.close();
}
