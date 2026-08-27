/**
 * Join class names, dropping anything falsy.
 *
 * Exists for one reason: `noUncheckedIndexedAccess` is on, and Vite types a CSS
 * Module as an index signature — so `styles.primary` is `string | undefined`, not
 * `string`. Every component would otherwise carry a non-null assertion per class,
 * which is the assertion becoming a habit. One filter instead.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
