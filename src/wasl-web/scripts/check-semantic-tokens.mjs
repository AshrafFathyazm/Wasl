/* ============================================================================
 * check-semantic-tokens.mjs — `031`
 * ============================================================================
 * tokens.css states the rule and nothing enforced it:
 *
 *   "Rule: components consume SEMANTIC tokens only. The primitives exist so the
 *    semantics have something to point at."
 *
 * `023`'s risk table describes this gate as existing — "a script over
 * src/components/ and src/shell/, in CI" — and `031` looked for it before
 * asserting AC-3 and found nothing. `.stylelintrc.json` enforces the logical
 * property rule, eslint enforces the no-literal-string rule, and no tool read a
 * custom property. This is that script, written rather than cited.
 *
 * WHY THE RULE MATTERS AND WHY NOTHING CATCHES IT OTHERWISE: a component
 * reaching for `--navy-900` instead of `--brand` renders correctly forever and
 * fails the first time a tenant changes colour (ADR-012). A primitive token
 * passes every "no literal" check there is — it IS a token — so a linter looking
 * for hard-coded values sees nothing wrong.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES *NOT* COVER, MEASURED RATHER THAN ASSUMED
 * ---------------------------------------------------------------------------
 * Raw `rgb()` and `#hex` literals. There are five in the tree today —
 * `Input.module.css`, `Table.module.css`, `Anchored.module.css`, and
 * `Sidebar.module.css` twice — every one of them older than this feature and
 * owned by another. Widening the gate to fail on them would mean either fixing
 * four files this feature has no business in, or shipping a gate that is red on
 * the day it lands, which is a gate everybody learns to ignore.
 *
 * So the scope is stated rather than quietly narrowed: THIS SCRIPT CHECKS
 * PRIMITIVE COLOUR TOKENS AND NOTHING ELSE. The five literals are a real finding
 * and are recorded in `031`'s summary as work for whoever owns those files.
 * ============================================================================ */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/components', 'src/shell'];

/* Every primitive family declared above the `==== SEMANTIC ====` divider in
 * tokens.css. Not read out of the file at runtime on purpose: a gate that
 * derives its own rule from the thing it checks passes when the rule is
 * deleted. */
const PRIMITIVE = new RegExp(
  String.raw`var\(\s*--(` +
    [
      'Main-White-White',
      'Neutral-\\d+',
      'neutral-\\d+',
      'ink',
      'navy-\\d+',
      'purple-\\d+',
      'teal-\\d+',
      'blue-\\d+',
      'green-\\d+',
      'amber-\\d+',
      'red-\\d+',
      'icon-ink',
      'icon-dark',
    ].join('|') +
    String.raw`)\s*[,)]`,
  'g',
);

function cssFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...cssFiles(path));
    else if (entry.endsWith('.css')) out.push(path);
  }
  return out;
}

const violations = [];

for (const root of ROOTS) {
  for (const file of cssFiles(root)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      /* A commented line is prose about a token, not a use of one. The whole
       * point of these stylesheets is that they explain themselves, and a gate
       * that forbids naming `--navy-900` in a sentence forbids the explanation
       * of why it is not used. */
      const code = line.replace(/\/\*.*?\*\//g, '');
      if (code.trimStart().startsWith('*')) return;

      PRIMITIVE.lastIndex = 0;
      let match;
      while ((match = PRIMITIVE.exec(code)) !== null) {
        violations.push(`${file}:${String(index + 1)}  --${match[1]}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error(
    `\nPRIMITIVE TOKEN IN A COMPONENT — ${String(violations.length)} found.\n\n` +
      violations.map((v) => `  ${v}`).join('\n') +
      '\n\nComponents consume SEMANTIC tokens only (tokens.css, the rule at the top).\n' +
      'A primitive here renders correctly forever and breaks the first tenant\n' +
      'colour change. If no semantic name exists for what you mean, ADD ONE —\n' +
      'that gap is the finding, not this script.\n',
  );
  process.exit(1);
}

console.log(`check-semantic-tokens: clean across ${ROOTS.join(', ')}`);
