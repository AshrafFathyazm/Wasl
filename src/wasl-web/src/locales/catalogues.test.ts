import { describe, expect, it } from 'vitest';

import arAuth from './ar/auth.json';
import arCommon from './ar/common.json';
import arCustomers from './ar/customers.json';
import arDashboard from './ar/dashboard.json';
import arSettings from './ar/settings.json';
import arTickets from './ar/tickets.json';
import enAuth from './en/auth.json';
import enCommon from './en/common.json';
import enCustomers from './en/customers.json';
import enDashboard from './en/dashboard.json';
import enSettings from './en/settings.json';
import enTickets from './en/tickets.json';

/* ============================================================================
 * Catalogue parity — every namespace, both languages. `016`
 * ============================================================================
 * THE DEFINITION OF DONE HAS SAID "every new i18n key exists in `en` and `ar`"
 * SINCE `001`, AND NOTHING CHECKED THE LARGEST NAMESPACE.
 *
 * `020` wrote a parity guard for `dashboard` and `008`'s lane wrote one for
 * `customers`, each inside its own feature folder — correct for those features
 * and it left `tickets` (the biggest catalogue in the product, and the one four
 * features have appended to), `common`, `auth` and `settings` unguarded. `016`
 * found this while adding twenty-two keys and went looking for the test that
 * would have caught a missing Arabic one.
 *
 * A missing translation is invisible in the way that matters: i18next falls back
 * to English, so an Arabic screen renders a correct-looking English sentence and
 * nothing errors. It is the same failure mode as `002`'s message source
 * returning the key — well-formed and useless — except that this one reads as a
 * deliberate choice rather than as a bug.
 *
 * NAMESPACE-BY-NAMESPACE RATHER THAN ONE MERGED SET, so a failure names the file
 * to open. And the two per-feature guards are LEFT WHERE THEY ARE: they assert
 * things this file does not, and deleting a working test to avoid an overlap is
 * how coverage is lost.
 * ========================================================================= */

/** i18next's plural suffixes, as `Intl.PluralRules` produces them. */
const FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

const PLURAL_SUFFIX = new RegExp(`_(${FORMS.join('|')})$`);

/** Arabic pluralises at 0, 1, 2, 3–10, 11–99 and 100+ — all six. */
const ARABIC_FORMS = FORMS;

/** English has two, and `Intl.PluralRules` for `en` returns only these. */
const ENGLISH_FORMS = ['one', 'other'] as const;

/**
 * A catalogue as i18next resolves it: one flat map of dotted keys to strings.
 *
 * **BOTH SHAPES ARE IN USE AND BOTH ARE CORRECT.** `tickets`, `settings` and
 * `dashboard` are written as flat files with dotted keys; `common`, `auth` and
 * `customers` nest objects. i18next's default `keySeparator` is `.`, so
 * `{ nav: { main: "…" } }` and `{ "nav.main": "…" }` resolve identically and a
 * caller cannot tell which file it is reading from.
 *
 * The first version of this guard assumed flat and threw
 * `value.trim is not a function` on three of the six namespaces. Flattening is
 * the fix rather than converting the files: a mass reformat of three catalogues
 * to satisfy a test would be a large diff with no behaviour in it.
 */
const flatten = (source: unknown, prefix = ''): Record<string, string> => {
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;

    if (typeof value === 'string') {
      out[path] = value;
    } else if (value !== null && typeof value === 'object') {
      Object.assign(out, flatten(value, path));
    }
  }

  return out;
};

const NAMESPACES = [
  ['common', flatten(enCommon), flatten(arCommon)],
  ['auth', flatten(enAuth), flatten(arAuth)],
  ['tickets', flatten(enTickets), flatten(arTickets)],
  ['customers', flatten(enCustomers), flatten(arCustomers)],
  ['settings', flatten(enSettings), flatten(arSettings)],
  ['dashboard', flatten(enDashboard), flatten(arDashboard)],
] as const;

/** A key with its plural suffix removed, or the key itself. */
const base = (key: string) => key.replace(PLURAL_SUFFIX, '');

const isPlural = (key: string) => PLURAL_SUFFIX.test(key);

describe('the two catalogues', () => {
  /* THE NAMESPACE LIST IS WRITTEN OUT AND ASSERTED AGAINST `i18n.ts`'s COUNT.
     A file added to `locales/` and not added here would be unguarded, and this
     test would still be green — which is the shape of the gap it was written to
     close, arriving one level up. */
  it('covers every namespace the app registers', () => {
    expect(NAMESPACES).toHaveLength(6);
  });

  it.each(NAMESPACES)(
    '%s — every non-plural key exists in both languages',
    (_namespace, en, ar) => {
      const enPlain = Object.keys(en).filter((key) => !isPlural(key));
      const arPlain = Object.keys(ar).filter((key) => !isPlural(key));

      /* SORTED SETS BOTH WAYS. An English key with no Arabic is the defect that
         renders English on an Arabic screen; an Arabic key with no English is
         dead weight that survives because nothing reads it — and it is usually
         a key that was renamed on one side only. */
      expect(arPlain.filter((key) => !enPlain.includes(key)).sort()).toEqual([]);
      expect(enPlain.filter((key) => !arPlain.includes(key)).sort()).toEqual([]);
    },
  );

  it.each(NAMESPACES)(
    '%s — every counted noun exists in both languages',
    (_namespace, en, ar) => {
      const enBases = [...new Set(Object.keys(en).filter(isPlural).map(base))];
      const arBases = [...new Set(Object.keys(ar).filter(isPlural).map(base))];

      expect(arBases.filter((key) => !enBases.includes(key)).sort()).toEqual([]);
      expect(enBases.filter((key) => !arBases.includes(key)).sort()).toEqual([]);
    },
  );

  /* THE FORMS THEMSELVES, per language, because the two languages need different
     sets and a single key-equality check cannot express that. `dashboard`'s own
     guard asserts this for its namespace; this extends it to all six. */
  it.each(NAMESPACES)('%s — Arabic counted nouns have all six forms', (_ns, _en, ar) => {
    const keys = Object.keys(ar);
    const bases = [...new Set(keys.filter(isPlural).map(base))];

    const incomplete = bases.filter((prefix) =>
      ARABIC_FORMS.some((form) => !keys.includes(`${prefix}_${form}`)),
    );

    expect(incomplete).toEqual([]);
  });

  it.each(NAMESPACES)('%s — English counted nouns have both forms', (...args) => {
    const en = args[1];
    const keys = Object.keys(en);
    const bases = [...new Set(keys.filter(isPlural).map(base))];

    const incomplete = bases.filter((prefix) =>
      ENGLISH_FORMS.some((form) => !keys.includes(`${prefix}_${form}`)),
    );

    expect(incomplete).toEqual([]);
  });

  /* NO EMPTY STRING ANYWHERE. An empty value is worse than a missing key: a
     missing one falls back to English and shows something, an empty one renders
     nothing at all and looks like a layout bug. */
  it.each(NAMESPACES)('%s — no value is blank in either language', (_ns, en, ar) => {
    for (const catalogue of [en, ar]) {
      expect(
        Object.entries(catalogue)
          .filter(([, value]) => value.trim() === '')
          .map(([key]) => key),
      ).toEqual([]);
    }
  });

  /* EVERY INTERPOLATION IN THE ENGLISH SENTENCE APPEARS IN THE ARABIC ONE.
     ────────────────────────────────────────────────────────────────────────
     A translation that drops `{{name}}` is the defect this catches, and it is
     the one a key-parity test cannot see: the key is present, the sentence
     reads naturally, and the value the caller passed is silently gone. `016`'s
     own `detail.escalatedNote` carries two placeholders and would have been the
     first casualty.

     Names, not counts: swapping `{{from}}` for `{{current}}` passes a count.
     ────────────────────────────────────────────────────────────────────────
     PLURAL FORMS ARE EXEMPT, AND THE RUN IS WHAT ESTABLISHED THAT. The first
     version checked every key and reported `list.openCount_one`,
     `list.updatedAgo_one` and `list.updatedAgo_two` — where English is
     `"{{formatted}} open ticket"` and Arabic is `"تذكرة مفتوحة واحدة"`.

     The Arabic is correct and the English is correct. Spelling the number out
     in a specific plural form is idiomatic, and Arabic's dual makes it close to
     mandatory: «تذكرتان» IS "two tickets", so passing the digit as well would
     render "2 two tickets". A rule that forbids it is a rule that would have
     the translation changed to satisfy the test. */
  it.each(NAMESPACES)('%s — placeholders survive translation', (_ns, en, ar) => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{\{\s*([\w.]+)/g)].map((match) => match[1]!).sort();

    const mismatched = Object.entries(en)
      .filter(([key]) => !isPlural(key))
      .filter(([key]) => key in ar)
      .filter(
        ([key, value]) =>
          placeholders(value).join(',') !== placeholders(ar[key]!).join(','),
      )
      .map(([key]) => key);

    expect(mismatched).toEqual([]);
  });

  /* THE CONTROL FOR THE SCANNERS, and it is not optional: a `base()` that
     stopped stripping, or a placeholder regex that matched nothing, would make
     every assertion above pass over an empty set. `001` shipped an architecture
     test that was a false negative until somebody broke it on purpose. */
  it('the helpers recognise what they are supposed to', () => {
    expect(isPlural('new.priorTickets_other')).toBe(true);
    expect(isPlural('new.priorTickets')).toBe(false);
    expect(isPlural('detail.escalatedReason')).toBe(false);

    expect(base('new.priorTickets_two')).toBe('new.priorTickets');
    expect(base('detail.escalated')).toBe('detail.escalated');

    /* And the sets are not empty — every assertion above is over real keys. */
    expect(Object.keys(enTickets).length).toBeGreaterThan(100);
    expect(Object.keys(enTickets).filter(isPlural).length).toBeGreaterThan(0);
  });
});
