/**
 * One name, one colour — everywhere in the product.
 *
 * **PROMOTED OUT OF `TicketDetailPage` by `035`**, unchanged, because the
 * customer screens need the same guarantee the ticket detail needed: *a person
 * must be the same colour everywhere*. Two implementations of that promise are
 * two implementations that can drift, and the drift would be invisible — one
 * screen's «منى العتيبي» simply teal and another's amber, with nothing failing.
 *
 * ---
 *
 * `027` tried the obvious hash first: sum the code units, modulo the buckets.
 * That was wrong for THIS alphabet. Arabic names are built from a small set of
 * letters, so their sums cluster, and two of the three seeded support users
 * landed in the same bucket at four buckets **and** at five —
 * «نورة السالم» and «منى العتيبي», measured against the running server.
 *
 * FNV-1a spreads them. Over ten real names from the seed:
 *
 * ```text
 * sum, 5 buckets   group sizes 4,3,1,1,1   <- clustered
 * FNV, 5 buckets   group sizes 3,2,2,2,1   <- as even as ten over five can be
 * ```
 *
 * **Ten names over five colours must collide** — that is arithmetic, not a
 * defect. `Math.imul` keeps the multiply in 32 bits, which is what makes the
 * result identical in every engine; without it the float multiply loses the low
 * bits and the same name can tint differently in two browsers.
 */
export function tint(key: string, buckets: number): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % buckets;
}

/**
 * The five avatar hues, as class-name suffixes.
 *
 * **NOT de-collided per region, and that is the deliberate half of the trade.**
 * A *tag* must differ from the tag beside it — a ticket's tags are one visible
 * set, so `027` walks the collision within the ticket. A *person* must be the
 * same colour everywhere: in a table row, in a side sheet's badge, on a profile
 * header, in a picker. That is what makes the colour a scanning aid ("منى's
 * circle") rather than decoration, and de-colliding within each region would
 * give one person two colours on one screen — worse than two people sharing one.
 */
export const AVATAR_BUCKETS = 5;

/** `0` to `AVATAR_BUCKETS - 1` for a display name. */
export function avatarBucket(name: string): number {
  return tint(name.trim(), AVATAR_BUCKETS);
}

/**
 * The first character of a name, as a grapheme rather than a code unit.
 *
 * `name[0]` is wrong for anything outside the BMP — an emoji or a rare
 * ideograph in a display name would render as half a surrogate pair. The
 * spread is what makes it a character.
 */
export function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? '';
}
