import { cx } from '../../lib/cx';
import { tint } from '../../lib/tint';
import styles from './Avatar.module.css';

/* ============================================================================
 * Avatar — `039`
 * ============================================================================
 * The tinted initials circle, moved out of `TicketDetailPage.tsx` so the ticket
 * list's assignee menu and the detail rail's assignee panel can be ONE
 * component. It was already used in three places on the detail screen; this
 * makes it five across two screens without a second copy.
 *
 * Nothing about its behaviour changed in the move. That is a claim with a test
 * behind it — `AssigneePanel.test.tsx` asserts the tint class for a fixed name,
 * so a silently different hash or a lost stylesheet goes red rather than
 * repainting somebody.
 * ========================================================================= */

/* FIVE, and they are NOT de-collided the way tags are. `027`'s trade-off,
 * unchanged and worth keeping in front of whoever edits this next:
 *
 *   A TAG must differ from the tag beside it — a ticket's tags are one visible
 *   set, so the walk runs within the ticket.
 *
 *   A PERSON must be the same colour everywhere — in the rail, on every comment
 *   they wrote, and in both pickers. That is what makes the colour a scanning
 *   aid ("منى's circle") rather than decoration. De-colliding within each region
 *   would give the same person two colours on one screen, which is worse than
 *   two people sharing one.
 *
 * So: a better hash rather than a walk, and two people CAN still match. With
 * three seeded agents they do not (measured); with ten they must. */
export const AVATAR_TINT = [styles.av0, styles.av1, styles.av2, styles.av3, styles.av4];

/** First letters of the first two words. Grapheme-aware — `[...part][0]` rather
 *  than `part[0]`, because a surrogate pair sliced by index is half a character
 *  and renders as a replacement glyph. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('');
}

export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <span
      /* THE TINT IS THE PERSON'S, not the row's. Keyed on the name rather than
         the id because a comment's actor carries a name and, on a customer's
         reply, no id at all. */
      className={cx(styles.avatar, AVATAR_TINT[tint(name, AVATAR_TINT.length)])}
      style={{ inlineSize: size, blockSize: size }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
