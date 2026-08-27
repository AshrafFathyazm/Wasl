#!/usr/bin/env node
/* ============================================================================
 * check-locale-parity.mjs — BR-8.11
 * ============================================================================
 *
 * A key present in one catalogue and missing from the other FAILS THE BUILD.
 *
 * Runtime already falls back to English (BR-8.12), and that is the problem this
 * script exists for: the fallback means a missing Arabic key renders a plausible
 * English sentence that looks deliberate. Nothing throws, nothing logs, and the
 * defect is found by a user. The fallback is the safety net; this is the control.
 *
 * A plain script rather than a test runner, deliberately: it needs no Vitest, no
 * jsdom, and no transform, so it costs one `node` invocation in CI and cannot be
 * skipped by a test filter.
 *
 * PLURAL SUFFIXES ARE NOT A PARITY VIOLATION. English has two CLDR categories and
 * Arabic has six, so `count_one` in `en` legitimately becomes `count_zero`,
 * `_one`, `_two`, `_few`, `_many`, `_other` in `ar` (ADR-007 §9). Comparing those
 * literally would fail on correct translations and train everyone to ignore this
 * script — so suffixes are stripped and the BASE key is what must match.
 * ============================================================================ */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCALES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'locales',
);
const REFERENCE = 'en';

/** CLDR plural categories, plus i18next's ordinal marker. */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other|ordinal)$/;

function readLanguages() {
  return readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readNamespaces(language) {
  return readdirSync(join(LOCALES_DIR, language))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
    .sort();
}

/** Every leaf path, dot-joined, with any plural suffix stripped. */
function flatten(value, prefix = '', into = new Set()) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, into);
    }
  } else if (prefix) {
    into.add(prefix.replace(PLURAL_SUFFIX, ''));
  }
  return into;
}

function loadKeys(language, namespace) {
  const file = join(LOCALES_DIR, language, `${namespace}.json`);
  return flatten(JSON.parse(readFileSync(file, 'utf8')));
}

const problems = [];
const languages = readLanguages();

if (!languages.includes(REFERENCE)) {
  problems.push(`No '${REFERENCE}' catalogue directory under src/locales.`);
}

const referenceNamespaces = languages.includes(REFERENCE)
  ? readNamespaces(REFERENCE)
  : [];
let comparedKeys = 0;

for (const language of languages) {
  if (language === REFERENCE) continue;

  const namespaces = readNamespaces(language);

  for (const namespace of referenceNamespaces) {
    if (!namespaces.includes(namespace)) {
      problems.push(`${language}: namespace '${namespace}' is missing entirely.`);
    }
  }
  for (const namespace of namespaces) {
    if (!referenceNamespaces.includes(namespace)) {
      problems.push(
        `${language}: namespace '${namespace}' has no '${REFERENCE}' counterpart.`,
      );
    }
  }

  for (const namespace of referenceNamespaces.filter((n) => namespaces.includes(n))) {
    const reference = loadKeys(REFERENCE, namespace);
    const translated = loadKeys(language, namespace);
    comparedKeys += reference.size;

    for (const key of reference) {
      if (!translated.has(key)) {
        problems.push(
          `${language}/${namespace}.json: missing '${key}' (present in ${REFERENCE}).`,
        );
      }
    }
    for (const key of translated) {
      if (!reference.has(key)) {
        problems.push(
          `${language}/${namespace}.json: '${key}' has no ${REFERENCE} counterpart.`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`\nLocale parity FAILED — ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nEvery key exists in every language, in the same commit (BR-8.11).\n');
  process.exit(1);
}

console.log(
  `Locale parity OK — ${languages.join(', ')} · ${referenceNamespaces.length} namespaces · ${comparedKeys} keys compared.`,
);
