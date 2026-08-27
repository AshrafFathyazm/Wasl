/* ============================================================================
 * wordmark.ts — the bilingual wordmark
 * ============================================================================
 *
 * NOT IN THE TRANSLATION CATALOGUE, deliberately. A logo is a brand asset, not
 * copy: both scripts are present at once, in both locales, and neither replaces
 * the other when the language changes. Putting either in `common.json` would let
 * a translator "fix" the logo.
 *
 * `common:productName` still exists and is still used — for the accessible name
 * and the document title, which ARE per-locale.
 *
 * design/brand.md: the name means connection/link and receipt/voucher, and both
 * describe the product. It works in both scripts without transliteration damage.
 * ============================================================================ */

export const WORDMARK_AR = 'وصل';
export const WORDMARK_LATIN = 'WASL';
