/* ============================================================================
 * motion.mjs — `041` AC-13. Does `prefers-reduced-motion: reduce` remove the slide?
 * ============================================================================
 *   node e2e/motion.mjs
 *
 * Reads COMPUTED style, not source: the drawer's transition and the modal sheet's
 * animation, once with the preference on and once off. The "off" half is the
 * control — a check that only ever sees "none" proves nothing about the rule that
 * is supposed to have produced it.
 * ========================================================================= */
import { chromium } from 'playwright';

import { startDevServer } from './devServer.mjs';
import { installMockApi, seedSession, TICKET_ID } from './mockApi.mjs';

const server = await startDevServer(5192);
const browser = await chromium.launch();
const failures = [];

/** Every duration in a computed `transition-duration` list is at most a millisecond.
 *  `base.css` collapses motion to 0.00001s rather than `0s` under the preference, so
 *  an exact `0s` would fail a correct page. */
const instant = (list) => list.split(',').every((part) => parseFloat(part) <= 0.001);

async function measure(reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion,
  });
  await installMockApi(context);
  await seedSession(context, 'en');
  const page = await context.newPage();
  await page.goto(`${server.url}/tickets/${TICKET_ID}`, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Open menu' }).click();
  const drawer = await page
    .getByRole('dialog', { name: 'Main' })
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Take action' }).click();
  await page.getByRole('menuitem', { name: /Escalate/ }).click();
  const panel = await page
    .getByRole('dialog')
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);

  await context.close();
  return { drawer, panel };
}

try {
  const reduced = await measure('reduce');
  const normal = await measure('no-preference');

  if (!instant(reduced.drawer))
    failures.push(
      `reduced: drawer transition-duration is "${reduced.drawer}", expected ~0`,
    );
  if (reduced.panel !== 'none')
    failures.push(`reduced: modal animation-name is "${reduced.panel}", expected none`);
  /* the control: with the preference OFF the same elements DO move */
  if (instant(normal.drawer))
    failures.push(
      `control: drawer has no transition even without the preference ("${normal.drawer}")`,
    );
  if (normal.panel === 'none')
    failures.push('control: modal has no animation even without the preference');

  console.log(`reduced   drawer ${reduced.drawer} · modal ${reduced.panel}`);
  console.log(`no-pref   drawer ${normal.drawer} · modal ${normal.panel}`);
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  '✓ reduced motion removes the drawer slide and the modal sheet animation; both move without it.',
);
