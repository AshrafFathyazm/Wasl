import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from '../../locales/ar/dashboard.json';
import en from '../../locales/en/dashboard.json';

/*
 * `020`. Three source scans, for three defects that a rendered test cannot see.
 *
 * THE FIRST IS THE ONE THAT ALREADY HAPPENED. `base.css` rule 17 fills
 * `button:not([class])` with the primary button's navy, `!important`, as a
 * dark-mode safety net for unstyled controls — so the three range buttons
 * rendered identical and the pressed state was invisible. 1148 green tests said
 * nothing, because jsdom computes no cascade. `026` and `032` were bitten by the
 * same rule; this is the third time, and a scan is the only guard that sees it.
 *
 * EACH SCAN CARRIES A CONTROL that proves the scanner ran, because a scanner that
 * matched nothing would satisfy every "found no offenders" assertion ever
 * written — `001`'s architecture test shipped as a false negative for exactly
 * that reason.
 */

const FEATURE = resolve(__dirname);

function sourceFiles(): { name: string; text: string }[] {
  return readdirSync(FEATURE)
    .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
    .map((name) => ({ name, text: readFileSync(join(FEATURE, name), 'utf8') }));
}

/**
 * Strips comments before scanning.
 *
 * `027`'s absence guard went red on the comment EXPLAINING the thing it forbids,
 * and its sibling went red on the word `useTranslation`. A scanner that reads
 * prose is a scanner that fails on its own documentation.
 */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('every control in this feature carries a class', () => {
  it('has no <button> without a className — base.css rule 17 would fill it navy', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const code = withoutComments(file.text);

      /* Every `<button` and the attributes up to the closing `>` of the opening
       * tag. A button whose opening tag never mentions `className` is one
       * `base.css` will paint. */
      for (const match of code.matchAll(/<button\b[^>]*>/g)) {
        if (!match[0].includes('className')) {
          offenders.push(`${file.name}: ${match[0].replace(/\s+/g, ' ').slice(0, 80)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('CONTROL — the scan finds a classless button when one is put in front of it', () => {
    /* Proves the regex matches the shape it claims to. Without this the
     * assertion above passes on a scanner that reads no files at all. */
    const planted = withoutComments(`
      // a commented <button type="button"> must NOT count
      const x = <button type="button" onClick={f}>go</button>;
      const y = <button className={styles.ok} type="button">fine</button>;
    `);

    const found = [...planted.matchAll(/<button\b[^>]*>/g)].filter(
      (match) => !match[0].includes('className'),
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.[0]).toContain('onClick');
  });
});

describe('a localDate never goes through new Date()', () => {
  it('constructs no Date anywhere in the feature except the formatter module', () => {
    /* `new Date("2026-08-10")` parses as UTC midnight, so a browser west of the
     * organisation's timezone renders the day before and the whole chart shifts
     * one column with nothing throwing. `dashboardFormat.ts` splits the string by
     * hand and is the only module allowed to reason about dates at all — and it
     * contains no `new Date` either, which is what makes this scan absolute
     * rather than an exception list. */
    const offenders = sourceFiles()
      .filter((file) => /new Date\s*\(/.test(withoutComments(file.text)))
      .map((file) => file.name);

    expect(offenders).toEqual([]);
  });

  it('CONTROL — the scan finds a Date construction when one is put in front of it', () => {
    const planted = withoutComments(`
      /* new Date("2026-08-10") in a comment must NOT count */
      const d = new Date(localDate);
    `);

    expect(/new Date\s*\(/.test(planted)).toBe(true);
  });
});

describe('the catalogues are the same shape in both languages', () => {
  /** A key's base name, with i18next's plural suffix removed. */
  function base(key: string): string {
    return key.replace(/_(zero|one|two|few|many|other)$/, '');
  }

  const enBases = new Set(Object.keys(en).map(base));
  const arBases = new Set(Object.keys(ar).map(base));

  it('has every English key in Arabic and every Arabic key in English', () => {
    /* Compared on the BASE name rather than the full key, because Arabic
     * legitimately carries six plural forms where English carries two — asserting
     * key-for-key equality would forbid the CLDR set the product needs. */
    expect([...enBases].filter((key) => !arBases.has(key))).toEqual([]);
    expect([...arBases].filter((key) => !enBases.has(key))).toEqual([]);
  });

  it('gives every Arabic counted noun all six CLDR forms', () => {
    /* FE-020-10. Arabic pluralises at 0, 1, 2, 3-10, 11-99 and 100+, and
     * i18next resolves those through Intl.PluralRules — a missing `_two` renders
     * the `_other` form, which is grammatically wrong and invisible in English. */
    const arKeys = Object.keys(ar);
    const plural = [...new Set(arKeys.filter((key) => /_(zero|one|two|few|many|other)$/.test(key)).map(base))];

    expect(plural.length).toBeGreaterThan(0);

    const incomplete = plural.filter((prefix) =>
      ['zero', 'one', 'two', 'few', 'many', 'other'].some(
        (form) => !arKeys.includes(`${prefix}_${form}`),
      ),
    );

    expect(incomplete).toEqual([]);
  });

  it('leaves no key resolving to an empty string in either language', () => {
    /* An empty value renders nothing and looks like a layout bug rather than a
     * missing translation. */
    const blank = [
      ...Object.entries(en).filter(([, value]) => String(value).trim() === ''),
      ...Object.entries(ar).filter(([, value]) => String(value).trim() === ''),
    ].map(([key]) => key);

    expect(blank).toEqual([]);
  });
});

describe('trend sentiment is declared per metric, never inferred from the sign', () => {
  /**
   * The banned shape, `020b` AC-13's other half.
   *
   * `TrendArrow.test.tsx` proves the tone FOLLOWS the declaration by flipping it.
   * This proves nobody re-derived it somewhere else: a second renderer with
   * `delta > 0 ? 'bad' : 'good'` in it would disagree with the first silently, and
   * would be right for half the metrics and wrong for the other half.
   */
  const inference =
    /\b(delta|diff|change|trend)\w*\s*[<>]\s*0\s*\?|[<>]\s*0\s*\?\s*['"](bad|worse|good|better|danger|success)/i;

  it('has no delta-sign-to-sentiment expression anywhere in the feature', () => {
    const offenders = sourceFiles()
      .filter((file) => inference.test(withoutComments(file.text)))
      .map((file) => file.name);

    expect(offenders).toEqual([]);
  });

  it('CONTROL — the scan finds the banned shape when one is put in front of it', () => {
    /* Both spellings the rule is written against, and a comment containing it must
     * NOT count — the stripper runs first. */
    expect(inference.test(withoutComments("const tone = delta > 0 ? 'bad' : 'good';"))).toBe(true);
    expect(inference.test(withoutComments("const t = change < 0 ? 'good' : 'bad';"))).toBe(true);
    expect(inference.test(withoutComments("/* delta > 0 ? 'bad' : 'good' in prose */"))).toBe(false);
  });

  it('AC-11 — the trend glyphs are NOT in `037`s flip set', () => {
    /* ▲ and ▼ encode an increase and a decrease. They point along the VERTICAL
     * axis, which the direction of the text does not touch — so they must not
     * carry `data-flip`, and an Arabic reader must see the same arrow an English
     * one does. */
    const arrow = readFileSync(join(FEATURE, 'TrendArrow.tsx'), 'utf8');

    expect(withoutComments(arrow)).toContain('▲');
    expect(withoutComments(arrow)).not.toContain('data-flip');
  });
});

describe('no colour is hard-coded in the feature', () => {
  it('has no hex literal in the stylesheet — tokens.css owns every value', () => {
    /* `CLAUDE.md`: semantic design tokens only. The dashboard's twelve chart
     * values are declared in tokens.css, seven of them aliasing a primitive that
     * already held the canvas's exact value. */
    const css = withoutComments(readFileSync(join(FEATURE, 'Dashboard.module.css'), 'utf8'));

    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });

  it('CONTROL — the scan finds a hex when one is put in front of it', () => {
    expect(withoutComments('.x { color: #ffd79a; }').match(/#[0-9a-fA-F]{3,8}\b/g)).toEqual([
      '#ffd79a',
    ]);
  });
});
