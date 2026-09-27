import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/* ============================================================================
 * EVERY `var(--token)` NAMES A TOKEN THAT EXISTS — `022`
 * ============================================================================
 * WHY THIS EXISTS, AND IT IS NOT HYPOTHETICAL.
 *
 * `var(--does-not-exist)` is not an error. It resolves to nothing, the
 * declaration is dropped, and the element renders without that property. So a
 * misremembered token name produces a panel with no background, a border that
 * never draws, or text at the inherited colour — all of which look like a
 * styling opinion rather than a defect.
 *
 * `022` wrote FOUR of them into one stylesheet in one sitting:
 * `--state-danger-subtle`, `--state-danger-border`, `--state-warning-subtle`
 * and `--leading-relaxed`. Every one is a plausible name; none exists. The real
 * names are `--state-danger-bg`, `--state-warning-bg` and `--leading-ar-normal`.
 * The refusal panel shipped to a browser with no background and no border, and
 * `tsc`, `eslint` and 1359 vitest tests were all green.
 *
 * THREE MORE followed from the same habit — `--space-5`, `--type-title-lg` and
 * `--red-200` — in a scale that jumps 4 → 6 and names its sizes `--type-title-1`.
 *
 * NO RENDERED TEST CAN CATCH THIS. jsdom computes no custom properties, so a
 * `getComputedStyle` assertion returns the empty string for a correct token and
 * for a misspelled one alike. It has to be a source scan (`shellLayout.test.ts`
 * is here for the same reason).
 * ========================================================================= */

/* `process.cwd()` is the vitest root, the same anchor `shellLayout.test.ts`
 * uses. An `import.meta.url` pathname carries a leading slash before the drive
 * letter on Windows, so the first attempt resolved to `D:\src` and `readdir`
 * could not open it — the scan died at collection rather than reporting
 * anything, which is the loud half of `008`'s rule working. */
const SRC_DIR = resolve(process.cwd(), 'src');

/**
 * `var(--name)` with **no fallback** — the only form that can silently drop.
 *
 * **The comma is the whole rule, and getting it wrong nearly cost four correct
 * declarations.** The first version of this pattern matched any `var(--name`
 * and reported `--menu-max-block-size`, `--seg-shadow`, `--motion-fast` and
 * `--motion-ease` as defects. Every one of them is written
 * `var(--token, <fallback>)` on purpose: the property is published at runtime by
 * a component when it has something to say and is *deliberately* absent
 * otherwise, and `Dropdown.module.css` says so in a comment two lines above its
 * own use. A fallback is the CSS way to declare "this may not exist".
 *
 * `CLAUDE.md`: a guard that goes red on a legitimate case gets loosened
 * wholesale. This one is narrow instead — and the control below proves it still
 * catches a real offender.
 */
const REFERENCE = /var\(\s*(--[A-Za-z0-9-]+)\s*\)/g;

/** `  --name:` at the start of a declaration — the definition. */
const DEFINITION = /^\s*(--[A-Za-z0-9-]+)\s*:/gm;

/**
 * A custom property written from TypeScript, which is a definition too.
 *
 * **This half was missing on the first run and the guard reported eleven files.**
 * `--flyout-x`, `--flyout-y`, `--table-visible-rows` and `--menu-max-block-size`
 * are set by `element.style.setProperty(...)` at the moment a menu opens or a
 * table measures itself — they are runtime values, correctly absent from
 * `tokens.css`, and every one of those reports was a false positive.
 *
 * A guard that goes red on a legitimate case gets loosened wholesale, so this
 * is the narrow widening rather than an ignore list: the property still has to
 * be written *somewhere in this repository*, and a typo in either the CSS or
 * the TypeScript still leaves one side unmatched.
 */
const RUNTIME_DEFINITION = /setProperty\(\s*['"`](--[A-Za-z0-9-]+)['"`]/g;

/** `style={{ '--name': … }}` — the other way a component sets one. */
const INLINE_DEFINITION = /['"`](--[A-Za-z0-9-]+)['"`]\s*:/g;

function filesUnder(directory: string, extensions: string[]): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      found.push(...filesUnder(path, extensions));
      continue;
    }

    if (extensions.some((extension) => entry.endsWith(extension))) found.push(path);
  }

  return found;
}

/** Everything matched inside a comment is prose, and prose is not a reference. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function matches(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(new RegExp(pattern.source, pattern.flags))].map(
    (match) => match[1]!,
  );
}

const files = filesUnder(SRC_DIR, ['.css']);
const scripts = filesUnder(SRC_DIR, ['.ts', '.tsx']);

/* EVERY definition anywhere counts, not only the ones in tokens.css. A module
 * may define a component-scoped token and use it in the same file, which is
 * legitimate — `--sidebar-surface` is defined in tokens.css and consumed only by
 * the shell, and a future component token should not have to move house to be
 * allowed. */
const defined = new Set([
  ...files.flatMap((file) =>
    matches(stripComments(readFileSync(file, 'utf8')), DEFINITION),
  ),
  ...scripts.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [
      ...matches(source, RUNTIME_DEFINITION),
      ...matches(source, INLINE_DEFINITION),
    ];
  }),
]);

describe('every var(--token) reference resolves to a defined token', () => {
  it('finds the stylesheets and the token definitions at all', () => {
    // `008`'s rule: a scanner that found nothing must fail loudly rather than
    // report success over an empty set.
    expect(files.length).toBeGreaterThan(10);
    expect(defined.size).toBeGreaterThan(100);
    expect(defined.has('--brand')).toBe(true);
  });

  it.each(files.map((file) => [file.slice(SRC_DIR.length + 1), file]))(
    '%s',
    (_label, file) => {
      const css = stripComments(readFileSync(file, 'utf8'));

      const undefinedTokens = [...new Set(matches(css, REFERENCE))]
        .filter((token) => !defined.has(token))
        .sort();

      expect(
        undefinedTokens,
        `var() resolves to NOTHING for an unknown token — the declaration is `
          + `silently dropped and the element renders without it. Check the name `
          + `against styles/tokens.css.`,
      ).toEqual([]);
    },
  );

  /* THE CONTROL. Without it this file passes just as happily when the regex has
   * stopped matching anything — which is the failure mode `037` recorded for its
   * keyline scanner: a well-formed report about nothing. */
  it('recognises a misspelled token when one is present (control)', () => {
    const planted = `
      .thing {
        color: var(--state-danger-text);
        background: var(--state-danger-subtle);
        padding: var(--space-5);
        max-block-size: var(--never-defined, 100vh);
      }
    `;

    const found = [...new Set(matches(stripComments(planted), REFERENCE))]
      .filter((token) => !defined.has(token))
      .sort();

    /* Three discriminations in one assertion, and each was a real mistake:
     *   - `--state-danger-subtle` and `--space-5` ARE reported (both shipped),
     *   - `--state-danger-text` is NOT (it exists),
     *   - `--never-defined` is NOT, because it carries a fallback — the case
     *     that made the first version of this guard report four false
     *     positives against correct code. */
    expect(found).toEqual(['--space-5', '--state-danger-subtle']);
  });

  /* THE SECOND CONTROL, for the stripper. A token named only inside a comment
   * must not be reported — `027` had two guards go red on their own prose. */
  it('ignores a token named only in a comment (control)', () => {
    const planted = `
      /* This used to be var(--state-danger-subtle) before it was corrected. */
      .thing { color: var(--state-danger-text); }
    `;

    const found = [...new Set(matches(stripComments(planted), REFERENCE))]
      .filter((token) => !defined.has(token));

    expect(found).toEqual([]);
  });
});
