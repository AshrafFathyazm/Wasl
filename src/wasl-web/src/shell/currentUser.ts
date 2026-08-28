/* ============================================================================
 * currentUser.ts — the shell's identity seam
 * ============================================================================
 *
 * `023` wrote this as a placeholder holding one hard-coded person, and said the
 * reason plainly: it is the ONE file the shell reads identity from, so replacing
 * it with the auth response is one import rather than a sweep.
 *
 * `025` did that. There is no `CURRENT_USER` any more — the fabricated
 * `Sara Al-Otaibi` is gone from the bundle entirely, which is AC-025-01 and is
 * verified by grepping `dist/`, not by reading this file.
 *
 * `UserRole` MOVED rather than being re-declared. It now lives in
 * `lib/api-types.provisional.ts` as `SupportRole`, because it is a contract enum
 * and that file is the only one permitted to declare one (ADR-011 §6). `023`
 * recorded that the gate caught this cased lowercase and that the compiler could
 * not have; a second copy here would be a second chance to make that mistake.
 * ============================================================================ */

export type { SupportRole as UserRole } from '../lib/api-types.provisional';

/**
 * Initials for the avatar. Derived from the name rather than stored, so a name
 * change cannot leave the two disagreeing.
 *
 * `[...part][0]`, not `part[0]`: string indexing returns a UTF-16 code unit, so
 * a name beginning with a character outside the BMP yields half a surrogate pair
 * and renders as a replacement glyph. Spreading iterates by code point.
 *
 * Grapheme-safe enough for the two scripts in scope. A name in a script where
 * this is wrong — one using combining marks that must not be split — is a real
 * bug, and it is still unfixed here: `Intl.Segmenter` is the tool, and it has no
 * consumer that needs it yet.
 */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('');
}
