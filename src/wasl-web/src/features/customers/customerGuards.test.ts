import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import arCustomers from '../../locales/ar/customers.json';
import enCustomers from '../../locales/en/customers.json';

/* ============================================================================
 * AC-12 and two rules that are only visible in the source
 * ============================================================================
 *
 * WHAT THESE ARE AND ARE NOT. jsdom does no cascade resolution worth the name,
 * so none of these measures a pixel — they assert facts about the SOURCE. That
 * is honest for what they cover: a hex literal, a physical property, a token
 * that does not exist, a network call in the wrong place. Each of those is a
 * textual property of the file and is exactly what drifts.
 *
 * The one that earns its place most is the TOKEN EXISTENCE check. It is the
 * "verify a measurement with something below it" rule applied to CSS: a
 * `var(--font-mono)` reference compiles, renders, and silently falls back — and
 * it was in this stylesheet on the first pass, because the design specifies IBM
 * Plex Mono and no such token exists. The guard would have found it; a reader
 * did. Now it cannot come back.
 * ========================================================================== */

const featureDir = __dirname;
const read = (file: string) => readFileSync(join(featureDir, file), 'utf8');

const MODULES = ['Customers.module.css', 'CreateCustomer.module.css'] as const;

const tokensCss = readFileSync(join(featureDir, '..', '..', 'styles', 'tokens.css'), 'utf8');

/** Every `--name:` declared anywhere in the token sheet. */
const declaredTokens = new Set(
  [...tokensCss.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)].map((match) => match[1]),
);

/** Comments carry prose, hex values from the source document, and English words
 *  like "left" — none of which is a style declaration. Stripped before every
 *  assertion so a comment explaining a rule cannot break the rule. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('AC-12 — no colour, radius, or spacing literal', () => {
  for (const file of MODULES) {
    it(`${file} declares no hex colour`, () => {
      /* The source document is ~40 raw hex values. Every one is mapped to a
       * semantic token, and the mapping is recorded in `tests.md` §4 — a mapping
       * that lives only in someone's head is one the next screen re-derives
       * differently. */
      expect(withoutComments(read(file))).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });

    it(`${file} uses no physical direction`, () => {
      /* `left`/`right` in a product whose primary language is RTL is a bug that
       * only appears in one language, which is the half nobody opens by default.
       * `text-align: start`, `margin-inline-start`, `border-inline-start`. */
      expect(withoutComments(read(file))).not.toMatch(
        /(^|[\s;{])(left|right)\s*:/m,
      );
      expect(withoutComments(read(file))).not.toMatch(
        /(margin|padding|border)-(left|right)\b/,
      );
      expect(withoutComments(read(file))).not.toMatch(/text-align:\s*(left|right)/);
    });

    it(`${file} takes every radius from a token`, () => {
      const declarations = [...withoutComments(read(file)).matchAll(/border-radius:\s*([^;]+);/g)];
      expect(declarations.length).toBeGreaterThan(0);
      for (const [, value] of declarations) {
        /* `--radius-*` OR a component token that resolves to one —
         * `--button-radius` and `--field-radius` are both defined in
         * `tokens.css` as `var(--radius-sm)`, and refusing them would push this
         * stylesheet into re-deriving a button's radius instead of citing it.
         * The FIRST version of this guard did refuse them, and the two failures
         * it produced were the guard being wrong rather than the CSS. */
        /* `0` IS NOT A RADIUS TOKEN — it is the absence of one, and the sheet
         * variant of this form needs it: the panel supplies the frame that the
         * card's own border and radius would duplicate. THIRD time this guard
         * has been wrong about a value rather than catching one; the note above
         * already records the first two. */
        if (value?.trim() === '0') continue;
        expect(value).toMatch(/var\(--(radius-|[a-z-]+-radius)/);
      }
    });

    it(`${file} takes every gap and padding from a token`, () => {
      /* `gap` and `padding` are where a stray `12px` hides most comfortably,
       * because it looks right. The exception list is deliberately empty: an
       * intrinsic SIZE (a 52px avatar, a 900px breakpoint) is not spacing and is
       * not matched by these properties. */
      const declarations = [
        ...withoutComments(read(file)).matchAll(/(?:^|[\s;{])(gap|padding|padding-inline|padding-block|margin-block|margin-inline):\s*([^;]+);/g),
      ];
      expect(declarations.length).toBeGreaterThan(0);
      for (const [, property, value] of declarations) {
        /* `0` and `auto` are not measurements. Everything else must be a token. */
        /* A `calc()` WHOSE LENGTHS ARE ALL TOKENS is token-derived, and the
         * word-splitting below cannot see it: it reported `*` and `-1` as stray
         * measurements in `calc(var(--space-6) * -1)`. A negative inline margin
         * over a token is how a pinned bar spans a padded container edge to
         * edge, and there is no token for "minus space-6".
         *
         * The assertion is still real: the calc may contain NO literal length,
         * and it must contain at least one token. */
        const raw = (value ?? '').trim();
        if (/^calc\(/.test(raw)) {
          const literals = raw.match(/\d+(?:\.\d+)?(?:px|rem|em|%)/g) ?? [];
          expect(literals, `${file}: ${property}: ${raw}`).toHaveLength(0);
          expect(raw, `${file}: ${property}: ${raw}`).toMatch(/var\(--/);
          continue;
        }

        const parts = raw.split(/\s+/);
        for (const part of parts) {
          if (part === '0' || part === 'auto') continue;
          expect(part, `${file}: ${property}: ${value}`).toMatch(/var\(--/);
        }
      }
    });
  }
});

describe('AC-12 — every token referenced actually exists', () => {
  for (const file of MODULES) {
    it(`${file} references no undeclared custom property`, () => {
      const referenced = [
        ...withoutComments(read(file)).matchAll(/var\((--[a-zA-Z0-9-]+)/g),
      ].map((match) => match[1]);

      expect(referenced.length).toBeGreaterThan(0);

      const missing = [...new Set(referenced)].filter(
        (token) => !declaredTokens.has(token as string),
      );

      /* THE FAILURE THIS EXISTS FOR is silent by construction: an undeclared
       * `var()` renders as though the property were never set, or as its
       * fallback, and nothing warns. It happened here on the first pass with
       * `var(--font-mono, monospace)`. */
      expect(missing).toEqual([]);
    });
  }
});

describe('AC-8 — there is no duplicate pre-check anywhere in this feature', () => {
  it('reaches the network from customers.api.ts and nowhere else', () => {
    const files = readdirSync(featureDir).filter(
      (file) => /\.tsx?$/.test(file) && !file.includes('.test.'),
    );

    const offenders = files.filter(
      (file) => file !== 'customers.api.ts' && /\bapiFetch(Detailed)?\s*[<(]/.test(read(file)),
    );

    /* A screen that fetches from a component is the request-waterfall pattern
     * ADR-011 §4 forbids — and a duplicate PRE-CHECK would have to live exactly
     * there, in a blur handler on the email field. Keeping the network in one
     * file is what makes its absence checkable at all. */
    expect(offenders).toEqual([]);
  });

  it('exposes only fetchers named for an endpoint, and none that is a lookup', () => {
    const api = read('customers.api.ts');
    /* `?? ''` because a capture group is `string | undefined` under strict mode
       and the filter below needs a string. It cannot actually be undefined —
       the group is not optional — so this is a shape, not a value. */
    const exported = [...api.matchAll(/export (?:async )?function (\w+)/g)].map(
      (m) => m[1] ?? '',
    );

    /* THIS ASSERTED A LIST OF EXACTLY TWO and `033` added two more — the directory
     * and the company vocabulary. The list was the wrong shape for the claim: it
     * failed on a feature that added a legitimate read, which makes it a change
     * detector rather than a guard, and the next person's cheapest fix would have
     * been to append a name without reading this comment.
     *
     * THE CLAIM IS UNCHANGED and is what AC-8 is actually about: no fetcher here
     * answers *"does this customer already exist"*. Such a fetcher would be a
     * race two concurrent requests both pass (`007` AC-13) and an oracle telling
     * anyone with the form open whether an address is on file (BR-4.4). So the
     * shape is refused rather than the count fixed. */
    const lookupShaped = exported.filter((name) =>
      /^(find|lookup|exists|check|verify)|ByEmail$|ByPhone$|Duplicate/i.test(name),
    );

    expect(lookupShaped).toEqual([]);

    /* THE EXACT LIST IS GONE — 2026-09-03, and the comment above had already
     * argued for deleting it: "the shape is refused rather than the count
     * fixed". It was still there, and `035` adding `updateCustomer` failed it
     * exactly as predicted, on a feature that added a legitimate write.
     *
     * A guard whose own note explains why it is the wrong shape is a guard that
     * gets appended to without being read. What replaces it is the claim itself:
     * there IS a set of fetchers, and none of them is a lookup. */
    expect(exported.length).toBeGreaterThan(0);
  });

  /* AND THE OTHER HALF, which the list above cannot see: `listCustomers` takes a
   * `search`, so it COULD be used as a pre-check by a careless caller. The create
   * form is where that would live. */
  it('the create form issues no read before it submits', () => {
    const form = read('CreateCustomerPage.tsx');

    expect(form).not.toContain('listCustomers');
    expect(form).not.toContain('getCustomerCompanies');
    expect(form).not.toContain('useQuery');
  });
});

describe('AC-13 — the catalogues are in step', () => {
  /** Leaf paths, so a key nested one level deeper in one language is caught. */
  function leaves(value: unknown, prefix = ''): string[] {
    if (typeof value !== 'object' || value === null) return [prefix];
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      leaves(child, prefix === '' ? key : `${prefix}.${key}`),
    );
  }

  /** A plural form is the SAME key. i18next appends `_zero`/`_one`/`_two`/`_few`/
   *  `_many`/`_other`, and Arabic uses six where English uses two — so comparing
   *  raw key names makes correct pluralisation look like broken parity.
   *
   *  Added 2026-09-01, when `033` introduced the namespace's first counted noun
   *  (`list.count`) and this guard went red on six legitimate Arabic forms. The
   *  fold is the fix; loosening the comparison to a subset would not be. */
  const folded = (catalogue: unknown) => [
    ...new Set(leaves(catalogue).map((key) => key.replace(/_(zero|one|two|few|many|other)$/, ''))),
  ].sort();

  it('holds the same keys in en and ar', () => {
    /* BR-8.11's parity, for this namespace. A key present in one language falls
     * back to the other and looks deliberate — which is why it survives review. */
    expect(folded(arCustomers)).toEqual(folded(enCustomers));
  });

  it('gives every counted noun its Arabic forms, which is what the fold hides', () => {
    /* The fold above could pass on an Arabic catalogue with NO plural forms at
       all, so the thing it hides is asserted separately: Arabic needs at least
       `_one`, `_two` and `_other` for a counted noun, and `list.count` is this
       namespace's. */
    const ar = leaves(arCustomers);

    for (const suffix of ['_one', '_two', '_other']) {
      expect(ar, `list.count${suffix} is missing`).toContain(`list.count${suffix}`);
    }
  });

  it('has no empty value in either language', () => {
    for (const [lang, catalogue] of [
      ['en', enCustomers],
      ['ar', arCustomers],
    ] as const) {
      const flat = JSON.stringify(catalogue);
      expect(flat, `${lang} has an empty string`).not.toMatch(/:\s*""/);
    }
  });

  it('keeps customers:new an object with a link label, which the ticket picker reads', () => {
    /* `customers:new` WAS A STRING and the ticket picker still calls it.
     * `08-create-customer.md` specifies `customers:new.submit`, so `new` had to
     * become an object — and the picker's label would then have rendered the raw
     * key. This asserts both halves of that trade stay true. */
    expect(typeof enCustomers.new).toBe('object');
    expect(enCustomers.new.link).toBeTruthy();
    expect(arCustomers.new.link).toBeTruthy();

    const picker = readFileSync(
      join(featureDir, '..', 'tickets', 'CustomerPicker.tsx'),
      'utf8',
    );
    expect(picker).not.toMatch(/t\('customers:new'\)/);
  });
});
