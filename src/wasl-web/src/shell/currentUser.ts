/* ============================================================================
 * currentUser.ts — a PLACEHOLDER
 * ============================================================================
 *
 * TODO — 004-auth-and-roles. This is the one file the shell reads identity from,
 * so replacing it with the auth response is one import, not a sweep.
 *
 * Nothing is fetched and nothing is stored. Sign out has nothing to clear, so it
 * returns to `/` rather than pretending to end a session that never began. The
 * README records the development token as a stated limitation, not a security
 * design (ADR-005).
 * ============================================================================ */

/* CASED AS THE SERVER CASES THEM — `Agent`, `Manager` (BR-2, BR-6).
 *
 * They were lowercase until the ADR-011 §6 gate flagged this declaration, which
 * is the first thing that gate caught. The compiler cannot see the difference:
 * `'manager'` type-checks against `'manager'` everywhere in this app, right up
 * to the first request that sends it — where the server rejects a role it does
 * not have, and the screen looks correct in every test that never left the
 * client. Documented values, not guessed ones; `004` replaces this file, and it
 * will not have to correct the casing on the way through. */
export type UserRole = 'Agent' | 'Manager';

export interface CurrentUser {
  name: string;
  email: string;
  role: UserRole;
}

export const CURRENT_USER: CurrentUser = {
  name: 'Sara Al-Otaibi',
  email: 'sara.alotaibi@example.com',
  role: 'Manager',
};

/** Initials for the avatar. Derived from the name rather than stored, so a name
 *  change cannot leave the two disagreeing. Grapheme-safe enough for the two
 *  scripts in scope; a name in a script where this is wrong is a real bug and
 *  belongs to `004`. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('');
}
