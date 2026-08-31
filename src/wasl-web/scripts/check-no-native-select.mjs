/* ============================================================================
 * check-no-native-select.mjs — `031`, AC-1
 * ============================================================================
 * `031` replaced the native `<select>` with `Dropdown` everywhere and deleted
 * `components/Select/`. Deleting a component does not stop the next screen
 * reaching for `<select>` — it is one of the few controls a developer can
 * summon out of thin air without an import, which is exactly how the raw
 * `<select>` in `TicketListPage`'s footer got there while a `Select` primitive
 * sat one directory away.
 *
 * So the rule is enforced rather than remembered. A gate, not a diff review:
 * AC-1 says asserted, and "we looked at the pull request" is not an assertion.
 *
 * `src/dev/` is deliberately OUT of scope. Previews are drawings, they never
 * ship — routes.tsx strips them from the production bundle — and one of them
 * draws a native control on purpose to explain why the real screen does not.
 * ============================================================================ */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/components', 'src/features', 'src/shell'];

/* `<select` followed by whitespace, `>` or `/` — so the word "selected", a
 * `selectOptions` helper, and a CSS class called `select` are not hits. */
const NATIVE_SELECT = /<select[\s>/]/g;

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

const violations = [];

for (const root of ROOTS) {
  for (const file of sourceFiles(root)) {
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        /* Prose is not code, and this gate's FIRST RUN proved it needs saying:
         * it reported two violations, and both were sentences explaining that
         * the native element had been removed. A gate that fails on its own
         * changelog is a gate somebody disables.
         *
         * Backticked spans go first — `<select>` inside a comment is the exact
         * shape both false positives had — then comment lines. */
        const code = line
          .replace(/`[^`]*`/g, '')
          .replace(/\/\*.*?\*\//g, '')
          .replace(/\/\/.*$/, '');
        if (/^\s*(\*|\/\*|\{\/\*)/.test(code)) return;

        NATIVE_SELECT.lastIndex = 0;
        if (NATIVE_SELECT.test(code)) violations.push(`${file}:${String(index + 1)}`);
      });
  }
}

if (violations.length > 0) {
  console.error(
    `\nNATIVE <select> FOUND — ${String(violations.length)}.\n\n` +
      violations.map((v) => `  ${v}`).join('\n') +
      '\n\nUse `components/Dropdown/Dropdown`. The native element was removed by\n' +
      '`031` on a product-owner ruling; a second one reintroduces two controls\n' +
      'that look alike and behave differently.\n',
  );
  process.exit(1);
}

console.log(`check-no-native-select: clean across ${ROOTS.join(', ')}`);
