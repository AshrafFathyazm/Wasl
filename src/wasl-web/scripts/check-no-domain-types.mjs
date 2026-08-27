#!/usr/bin/env node
/* ============================================================================
 * check-no-domain-types.mjs — ADR-011 §6, made enforceable
 * ============================================================================
 *
 * THE RULE: domain types are generated from OpenAPI, never hand-written. Until
 * generation lands, exactly ONE file may declare them —
 * `src/lib/api-types.provisional.ts` — and every type in it carries the comment
 * that says so.
 *
 * WHY A SCRIPT AND NOT A CONVENTION. The rule is easy to hold for a week and
 * impossible to hold across two lanes and six features. The failure is silent
 * in the worst way: a second hand-written `TicketStatus` somewhere compiles,
 * renders, and disagrees with the server on one member — and the screen that
 * uses it looks finished. `009`'s spec §11 records the `'SMS'` case, where a
 * single wrong enum member produced a `400` that reads as a BACKEND defect.
 *
 * TWO RULES, because a hand-written domain type arrives in two shapes:
 *
 *   R1  a declaration NAMED after a domain resource   `interface TicketSummary`
 *   R2  a string-literal union that IS a contract enum `type X = 'New'|'Open'`
 *
 * R2 matches case-INSENSITIVELY on purpose. `'agent' | 'manager'` is not a
 * typo the compiler can see — it is the contract's `Agent | Manager` with the
 * casing quietly changed, and that is precisely the defect that survives review.
 *
 * THE ENUM VALUES ARE READ FROM THE PROVISIONAL FILE, never restated here. A
 * gate that keeps its own copy of the list is a second place for the list to be
 * wrong, and it would be the place nobody looks.
 * ============================================================================ */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const PROVISIONAL = 'src/lib/api-types.provisional.ts';

/* --------------------------------------------------------------------------
 * The allowlist. Every entry needs a REASON and an OWNER, or it is just the
 * rule being switched off one file at a time.
 * -------------------------------------------------------------------------- */
const ALLOWED = [
  {
    file: PROVISIONAL,
    reason:
      'The one file the rule exists to permit. Deleted when OpenAPI generation lands.',
    owner: 'FE-009-05',
  },
  {
    file: 'src/lib/api.ts',
    names: ['ProblemDetails'],
    reason:
      'RFC 7807, not a domain resource: one envelope shared by every endpoint, frozen by ' +
      '002-error-contract rather than provisional. Moving it into the provisional file would ' +
      'schedule it for deletion, and it is not going anywhere.',
    owner: '002-error-contract',
  },
  {
    file: 'src/shell/currentUser.ts',
    names: ['UserRole'],
    reason:
      'A PLACEHOLDER, and this gate found it: the shell needs a role before 004-auth-and-roles ' +
      'exists, and there is no frozen auth contract to write it from. The values follow BR-2 and ' +
      'BR-6 — Agent, Manager — which are documented, not guessed. 004 replaces this file.',
    owner: '004-auth-and-roles',
  },
];

/* R1's vocabulary: the resources in docs/sdd. A UI type named after one of them
 * is still a UI type, so the suffixes below are exempt — `CustomerPickerProps`
 * describes a component, not a customer. */
const DOMAIN_PREFIX =
  /^(Ticket|Customer|Interaction|AuditEntry|User|Paged|Communication|Problem)/;
const UI_SUFFIX =
  /(Props|State|FormValues|Parsed|Options|Ref|Handler|Handlers|Context|Provider)$/;

/* A DECLARATION, not a mention.
 *
 * The first version of this pattern stopped at the name and reported
 * `src/features/tickets/CreateTicketPage.tsx:17  type CustomerListItem` — which
 * is a line inside `import { …, type CustomerListItem } from …`. An inline type
 * import is the CORRECT use of the provisional file, so the gate's first output
 * was an accusation against the one call site doing it right.
 *
 * Requiring what FOLLOWS the name is what separates the two: a declaration is
 * followed by `=`, `{`, or `extends`; an import specifier is followed by a comma
 * or a closing brace. Import lines are skipped outright as well, because two
 * independent reasons to reject a line is what makes a check hold when one of
 * them turns out to be wrong. */
const DECLARATION =
  /^\s*(?:export\s+)?(?:declare\s+)?(interface|type)\s+([A-Za-z0-9_]+)\s*(?:<[^=;]*>)?\s*(?:=|\{|extends\b)/;
const LITERAL_UNION =
  /^\s*(?:export\s+)?type\s+([A-Za-z0-9_]+)\s*=\s*((?:'[^']*'\s*\|\s*)+'[^']*')/;

/** Every value in every `as const` list in the provisional file, lowercased. */
function contractEnumValues() {
  const source = readFileSync(join(ROOT, PROVISIONAL), 'utf8');
  const values = new Set();
  for (const block of source.matchAll(/=\s*\[([^\]]*)\]\s*as const/g)) {
    for (const literal of block[1].matchAll(/'([^']+)'/g)) {
      values.add(literal[1].toLowerCase());
    }
  }
  if (values.size === 0) {
    /* Fail loudly rather than pass vacuously. An empty set makes R2 match
     * nothing and the gate reports success while checking nothing — the exact
     * shape of a measurement tool that lies. */
    throw new Error(
      `No 'as const' enum values found in ${PROVISIONAL}. The gate cannot run.`,
    );
  }
  return values;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.tsx?$/.test(entry)) {
      yield full;
    }
  }
}

function allowanceFor(file, name) {
  return ALLOWED.find(
    (entry) =>
      entry.file === file && (entry.names === undefined || entry.names.includes(name)),
  );
}

const enumValues = contractEnumValues();
const violations = [];

/* THE GATE'S OWN CHECK. `DECLARATION` is a regex over lines, so it can stop
 * matching — a reformat, a generic spanning two lines — and a regex that matches
 * nothing reports a clean tree. This counts the domain declarations in the one
 * file that is REQUIRED to have them; if that count collapses, the gate is
 * broken and says so instead of passing. */
let provisionalDeclarations = 0;

for (const absolute of walk(SRC)) {
  const file = relative(ROOT, absolute).split(sep).join('/');
  const lines = readFileSync(absolute, 'utf8').split('\n');

  /* Import specifiers are not declarations. An import statement runs until its
   * `from`, so the whole span is skipped rather than the first line only. */
  let inImport = false;

  lines.forEach((line, index) => {
    if (inImport) {
      if (/\bfrom\b|;\s*$/.test(line)) inImport = false;
      return;
    }
    if (/^\s*import\b/.test(line)) {
      if (!/\bfrom\b|;\s*$/.test(line)) inImport = true;
      return;
    }

    const declaration = DECLARATION.exec(line);
    if (declaration && file === PROVISIONAL && DOMAIN_PREFIX.test(declaration[2])) {
      provisionalDeclarations += 1;
    }
    if (declaration) {
      const name = declaration[2];
      if (
        DOMAIN_PREFIX.test(name) &&
        !UI_SUFFIX.test(name) &&
        !allowanceFor(file, name)
      ) {
        violations.push({
          file,
          line: index + 1,
          rule: 'R1',
          detail: `\`${declaration[1]} ${name}\` is named after a domain resource.`,
        });
      }
    }

    const union = LITERAL_UNION.exec(line);
    if (union) {
      const members = [...union[2].matchAll(/'([^']*)'/g)].map((m) => m[1].toLowerCase());
      if (
        members.every((member) => enumValues.has(member)) &&
        !allowanceFor(file, union[1])
      ) {
        violations.push({
          file,
          line: index + 1,
          rule: 'R2',
          detail: `\`type ${union[1]}\` restates a contract enum (${members.join(', ')}).`,
        });
      }
    }
  });
}

const MIN_PROVISIONAL_DECLARATIONS = 5;
if (provisionalDeclarations < MIN_PROVISIONAL_DECLARATIONS) {
  console.error(
    `\n✗ THE GATE IS BROKEN, not the tree.` +
      `\n  Found ${provisionalDeclarations} domain declaration(s) in ${PROVISIONAL};` +
      ` expected at least ${MIN_PROVISIONAL_DECLARATIONS}.` +
      `\n  The DECLARATION pattern has stopped matching, so a clean result here would mean nothing.\n`,
  );
  process.exit(1);
}

if (violations.length === 0) {
  console.log(`✓ no hand-written domain types outside ${PROVISIONAL}`);
  process.exit(0);
}

console.error(`\n✗ ADR-011 §6 — ${violations.length} hand-written domain type(s):\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.detail}`);
}
console.error(
  `\nDomain types belong in ${PROVISIONAL}, written from the frozen contract.` +
    `\nIf the contract is silent, ask the backend lane — do not guess a shape.` +
    `\nA deliberate exception goes in this script's ALLOWED list with a reason and an owner.\n`,
);
process.exit(1);
