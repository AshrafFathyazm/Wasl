import { mergeConfig } from 'vite';
import { defineConfig } from 'vitest/config';

import viteConfig from './vite.config';

/**
 * A SEPARATE FILE, merged onto the build config rather than written into it.
 *
 * `vite.config.ts` branches on `command === 'build'` to strip the dev-only
 * preview selectors. Under Vitest that branch is neither `build` nor `serve` in
 * any meaningful sense, and folding a `test` block in beside it would leave one
 * file answering two questions — what ships, and what is measured. Merging keeps
 * the build config readable and means the tests run against the same plugins,
 * aliases, and CSS handling the app does, not a second definition of them.
 */
export default mergeConfig(
  viteConfig({ command: 'serve', mode: 'test' }),
  defineConfig({
    test: {
      /* jsdom, not happy-dom: `dir`, `lang`, and bidi are the things this
       * screen gets wrong, and jsdom is the environment that models the DOM
       * closely enough for `document.dir` and `activeElement` to mean what they
       * mean in a browser. It is slower and that is the trade. */
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: true,

      /* The dev preview is a surface, not a unit. It is excluded so a preview
       * that stops compiling fails `tsc`, where it belongs, rather than
       * appearing as a phantom test failure. */
      include: ['src/**/*.test.{ts,tsx}'],

      /* NO WATCH IN CI. Vitest defaults to watch when it detects a TTY, and a
       * watching test run in CI is a job that never ends. */
      watch: false,

      /* 5s is Vitest's default and it is too short here. A single test types a
       * 55-character description one keypress at a time through userEvent, waits
       * out a 300ms debounce, and waits on two React Query state settles. It was
       * timing out at 5.0s while doing exactly what it was supposed to — a
       * failure that reads as a broken component and is not one. */
      testTimeout: 20_000,
    },
  }),
);
