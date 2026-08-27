import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/styles/tokens.css'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      /* ADR-011 §7: no `any` in a committed file. */
      '@typescript-eslint/no-explicit-any': 'error',

      /* ADR-011 §7: no barrel files. `index.ts(x)` cannot be told apart from a real
       * module by a filename rule, so the two real modules copied from the
       * blueprint were RENAMED (icons/icons.tsx, brand/Mark.tsx) rather than
       * exempted, and re-export-only files are caught here instead. */
      'no-restricted-exports': [
        'error',
        { restrictDefaultExports: { namespaceFrom: true, namedFrom: true } },
      ],
    },
  },

  /* --------------------------------------------------------------------------
   * BR-8.8 — no user-facing literal in a component
   * --------------------------------------------------------------------------
   * Every label, placeholder, helper, and error arrives as a prop and comes from
   * the translation catalogue. A literal sentence renders fine in English; the
   * Arabic pass finds it weeks later, once. This is the control — the written
   * rule is not one.
   * ------------------------------------------------------------------------ */
  {
    files: ['src/components/**/*.tsx', 'src/shell/**/*.tsx', 'src/features/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/\\S/]',
          message:
            'No user-facing literal in JSX (BR-8.8). Take the string as a prop, or resolve it through the catalogue — and add the key to both en and ar in the same commit.',
        },
      ],
    },
  },

  /* The icon set and the product mark are assets copied verbatim from
   * docs/sdd/design/. They carry no text, and reformatting them here would make
   * the copy no longer a copy. */
  {
    files: ['src/icons/**', 'src/brand/**'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  /* Build config and repository gates run in Node, not in a browser. */
  {
    files: ['*.config.{js,ts}', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
);
