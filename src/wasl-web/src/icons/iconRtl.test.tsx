import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IconArrowRight, IconEscalate, IconSignOut } from './icons';
import { extractIcons } from './iconGeometry';

/* ============================================================================
 * 037 · AC-8 and AC-9 — mirroring is one rule, and the list is data
 * ============================================================================
 *
 * Before 037 an icon mirrored under RTL because its consumer wrote a CSS rule
 * for it, and exactly ONE consumer ever did: `.signOut .rowIcon`. Nineteen
 * icons needed the same and went without, which is invisible in review — an
 * arrow pointing out of an Arabic screen reads as a rendering bug rather than
 * as a missing rule, so nobody files it.
 *
 * Now the icon carries `data-flip` and `styles/base.css` holds the only rule.
 * The list below is the icon document's own, transcribed, so the module and the
 * document cannot drift apart quietly.
 * ========================================================================= */

/**
 * The document's §10 footer, verbatim, mapped to export names:
 *
 *   chevron · edit · external · chat · sms · live chat · call · attachment
 *   escalate · assign · note · tag · tasks · handoff · submit · track
 *   key · audit · refresh · reopen
 */
const DOCUMENT_FLIP_LIST = [
  'IconChevron', // chevron
  'IconEdit', // edit
  'IconExternal', // external
  'IconComment', // chat
  'IconSms', // sms
  'IconLivechat', // live chat
  'IconCall', // call
  'IconAttachment', // attachment
  'IconEscalate', // escalate
  'IconAssign', // assign
  'IconNote', // note
  'IconTag', // tag
  'IconTasks', // tasks
  'IconHandoff', // handoff
  'IconSubmit', // submit
  'IconTrack', // track
  'IconKey', // key
  'IconAudit', // audit
  'IconRetry', // refresh
  'IconReopen', // reopen
] as const;

/**
 * (D) icons that mirror. The document cannot speak to these — it does not
 * contain them — so they are listed separately rather than folded into its
 * list, and each needs its own reason.
 *
 * Three qualify. `IconSignOut` is an arrow leaving a frame, and it already
 * mirrored before 037 through `Sidebar.module.css`. `IconSortAsc` and
 * `IconSortDesc` put their bars to the reading side of the arrow, and that side
 * is what flips — the product owner's instruction names exactly these two and
 * excludes the symmetric `IconSort` and `IconClose` beside them in the same
 * menu.
 *
 * The rest are symmetric, vertical, or deliberately unmirrored with the reason
 * in their own comment — `IconArrowRight` is the interesting one: it points
 * along the reading axis and still does not flip, because it diagrams a
 * transition rather than a direction.
 */
const RETAINED_FLIP_LIST = [
  'IconSignOut',
  'IconSortAsc',
  'IconSortDesc',
  'IconAddCustomer',
  'IconCustomerProfile',
] as const;

const MODULE_PATH = join(__dirname, 'icons.tsx');
const icons = extractIcons(readFileSync(MODULE_PATH, 'utf8'));

/* -- AC-8 ----------------------------------------------------------------- */

describe('AC-8 — the flip set is exactly the documented one', () => {
  const declared = [...icons].filter(([, icon]) => icon.flips).map(([name]) => name);
  const expected = [...DOCUMENT_FLIP_LIST, ...RETAINED_FLIP_LIST];

  it('flips the document’s twenty, and one of ours, and nothing else', () => {
    expect([...declared].sort()).toEqual([...expected].sort());
  });

  it('names twenty in the document’s own list', () => {
    expect(DOCUMENT_FLIP_LIST).toHaveLength(20);
  });

  it.each(expected)('%s exists in the module', (name) => {
    expect(icons.has(name), `${name} is on the flip list but not declared`).toBe(true);
  });
});

/* -- AC-9 ----------------------------------------------------------------- */

/* jsdom resolves attribute selectors from a stylesheet it has been given, so
 * the real rule is injected from the real file rather than restated here. If
 * base.css stops carrying it, this goes red. */
function withBaseCss(): () => void {
  const style = document.createElement('style');
  style.textContent = readFileSync(join(__dirname, '..', 'styles', 'base.css'), 'utf8');
  document.head.append(style);
  return () => style.remove();
}

describe('AC-9 — the rule actually mirrors, and only the flipped ones', () => {
  it('turns a flipped icon under dir=rtl and leaves an unflipped one alone', () => {
    const cleanup = withBaseCss();
    try {
      const { container } = render(
        <div dir="rtl">
          <IconEscalate data-testid="flipped" />
          <IconArrowRight data-testid="not-flipped" />
        </div>,
      );
      const flipped = container.querySelector('[data-testid="flipped"]');
      const plain = container.querySelector('[data-testid="not-flipped"]');

      expect(flipped?.hasAttribute('data-flip')).toBe(true);
      expect(plain?.hasAttribute('data-flip')).toBe(false);
      expect(getComputedStyle(flipped as Element).transform).toBe('scaleX(-1)');
      expect(getComputedStyle(plain as Element).transform).not.toBe('scaleX(-1)');
    } finally {
      cleanup();
    }
  });

  it('does not mirror under dir=ltr', () => {
    const cleanup = withBaseCss();
    try {
      const { container } = render(
        <div dir="ltr">
          <IconSignOut data-testid="ltr" />
        </div>,
      );
      const icon = container.querySelector('[data-testid="ltr"]');
      expect(getComputedStyle(icon as Element).transform).not.toBe('scaleX(-1)');
    } finally {
      cleanup();
    }
  });

  /* THE PAIRED SOURCE SCAN, and it is not optional.
   *
   * `shellLayout.test.ts` exists because an inline `style={{ position:
   * 'relative' }}` beat a stylesheet that said `sticky`, and no rendered test
   * in jsdom could see the cascade being lost. The same shape is available
   * here: a consumer that sets its own `transform` on an icon wins over
   * `[dir='rtl'] [data-flip]` at equal specificity by source order, or beats it
   * outright from an inline style, and the icon silently stops mirroring.
   *
   * `.signOut .rowIcon` in `Sidebar.module.css` was exactly such a rule until
   * 037 removed it. */
  it('leaves no consumer setting its own transform on an icon', () => {
    const stylesheets = (function walk(dir: string, acc: string[] = []): string[] {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, acc);
        else if (entry.name.endsWith('.module.css')) acc.push(full);
      }
      return acc;
    })(join(__dirname, '..'));

    expect(
      stylesheets.length,
      'found no stylesheets — the scan measured nothing',
    ).toBeGreaterThan(5);

    const offenders: string[] = [];
    for (const file of stylesheets) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const block of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const [, selector = '', body = ''] = block;
        if (!/\bicon\b/i.test(selector)) continue;
        if (/(^|[\s;])transform\s*:/.test(body))
          offenders.push(`${relative(join(__dirname, '..'), file)} — ${selector.trim()}`);
      }
    }
    expect(
      offenders,
      `icon transforms outside base.css: ${offenders.join(' | ')}`,
    ).toEqual([]);
  });
});
