# Brand — name and mark

## Name: Wasl · وصل

**وصل** carries two meanings, and both describe the product:

- **connection / link** — what the CRM does between a team and its customers
- **receipt / voucher** — what a ticket is

A name that means the thing twice is rare, and it can be explained in one sentence.
That is the difference between a name that looks chosen and one that looks picked.

It also works in both scripts without transliteration damage: four Latin letters, three
Arabic. It sits in the same register as the house products.

### Rejected, with reasons

| Candidate | Meaning | Why not |
|---|---|---|
| سند · Sanad | support, backing | Direct and dignified, but also means a deed or promissory note in financial contexts — an unwanted second reading in a product that shows money |
| أثر · Athar | trace, track | Ties nicely to the audit trail and timeline, but abstract; it names a feature rather than the product |
| رد · Radd | reply | Short and punchy, but three Latin letters reads as unfinished |
| Relay | passing a message along, and a handover | Works internationally, but has no Arabic layer at all in a bilingual product |

### Before committing

**Availability has not been checked and cannot be checked from here.** Verify the
domain and search the trademark register before the name goes anywhere public. A name
is cheap to change today and expensive after it is in a repository, a database, and a
walkthrough.

## Mark — "Converge"

**Three threads arriving at one point.** Assets in `design/brand/`.

```text
mark.svg        stroke 2.0    — 24px and above
mark-small.svg  stroke 2.7    — 20px and below
mark-icon.svg   stroke 1.5    — inline beside 1.5px icons
Mark.tsx        Mark · MarkSmall · MarkTile
```

### Why this one

It draws the product's sentence: *every conversation, in one place*. The threads arrive
and terminate in a single filled node.

It is also **directional, not symmetric** — the eye reads it left to right as movement
rather than as a shape. That is what keeps it from resolving into something else, which
is the failure mode the two earlier attempts hit.

And it mirrors correctly under RTL: the threads arrive from the inline-start, which in
Arabic is the right. Correct by construction, no second asset.

### Two variants, and why

| Variant | Stroke | Node | Threads | Use |
|---|---|---|---|---|
| `Mark` | 2.0 | r 2.6 | full | 24px and above |
| `MarkSmall` | 2.7 | r 3.2 | shortened | 20px and below |

The small variant is **not a scaled copy**. At 20px the threads crowd the node, so they
are shortened and the node is enlarged. Removing detail as size drops is part of drawing
a mark, not a compromise.

### The mark is not an icon

Same construction — 24 box, round terminals, radius 2 — different weight. The mark is
usually reversed out of navy, and **a reversed stroke reads lighter than the same weight
in positive**, so it is drawn heavier. `mark-icon.svg` at 1.5 exists only for placing it
inline among the icon set.

### Two rejected iterations, and the rule they produced

Both looked fine at 48px and failed at 20. Recording them because the failures rhyme.

| Attempt | Failed as |
|---|---|
| Two arcs and a bar | The standard **"insert hyperlink"** glyph. Conceptually right, visually indistinguishable from a toolbar icon |
| Four then five spokes around a centre | A **star**. Changing four to five treated the symptom — the cause was radial symmetry itself, and every count reads as a star |

> **Judge a mark at 20px first, and ask "what does this look like?" before "is this good?"**
>
> A mark that resembles something else — a star, a link icon, an existing symbol — is a
> mark that is spent, however good it looks at 48px. 20px is where it actually lives:
> the favicon, the collapsed sidebar, the avatar fallback.

The second lesson: **when a mark reads as the wrong thing, change the construction, not
the count.** Four spokes to five moved it closer to a star, not further away.

### Lockups

| Lockup | Use |
|---|---|
| Tile + name + descriptor | Sidebar header, login |
| Tile alone | Collapsed sidebar, favicon, avatar fallback |
| Mark in navy + wordmark, no tile | Documents, light backgrounds, print |

Arabic lockup mirrors: the tile moves to the inline-start of the Arabic text, which under
RTL puts it on the right. That is `flex` order, not a separate asset.

**The descriptor is not part of the mark.** "Customer support" / "دعم العملاء" is
optional and dropped below roughly 120px of lockup width.

### Clear space and minimum size

- Clear space on all sides: the height of the tile's corner radius × 2.
- Minimum tile: 20px. Below that, use the mark alone with a detail removed.
- The mark is never stretched, re-coloured outside navy and white, or given a shadow.

## Applying it

| Place | Asset | Size |
|---|---|---|
| Login card | `MarkTile` | 38 |
| Sidebar header | `MarkTile` | 32 |
| Sidebar collapsed | `MarkSmall` on tile | 24 |
| Favicon | `mark-small.svg` on navy | 32, 16 |
| Avatar fallback for the organisation | `MarkTile` | 32 |
| Inline in body copy | `mark-icon.svg` | 18 |

The mark is one of the four hand-drawn assets in `design/icons.md`, and the one worth
spending real time on — every other icon is inherited and adjusted.

---

## The system beyond the mark

Five extensions, all derived from the same three-threads-to-a-node geometry. Nothing new
is invented — a mark that only appears as a logo is not an identity.

### 1 · Pattern

The mark tiled at 72px on a half-step offset, 10–16% opacity, in navy on light or white
on navy.

Use: email headers, empty backgrounds, print, the signed-out screen.
**Never behind body text** — a pattern under prose lowers contrast, and the contrast
budget belongs to the words.

### 2 · Loader

Three dots travelling to a node, **1.4s**, `cubic-bezier(.45,0,.35,1)`, with the node
pulsing as each arrives and a ring marking the absorption.

This replaces the spinner everywhere. **The loader appears far more often than the logo
does** — it is the most-seen brand asset in any product, and shipping a default spinner
wastes it.

```css
@keyframes converge {
  0%        { transform: translateX(0)                             scale(.7); opacity: 0 }
  16%       { transform: translateX(calc( 5px * var(--ld-dir, 1))) scale(1);  opacity: 1 }
  70%       { transform: translateX(calc(30px * var(--ld-dir, 1))) scale(1);  opacity: 1 }
  86%, 100% { transform: translateX(calc(36px * var(--ld-dir, 1))) scale(.3); opacity: 0 }
}
```

Under `prefers-reduced-motion`, the three dots and the node render statically.

**This is Converge Pro, and it replaced the original in `029`.** The original faded the
dots out at 12 / 78 / 92 over 1.45s; this one absorbs them by scale at 16 / 70 / 86 over
1.4s, pulses the node 1.22× rather than 1.32×, and adds the absorption ring. The reason
for each of the five changes is in `design/loaders.md` §1 — and so are the **eight other
shapes** built from this same geometry, with the rule for which one goes where.

`Loader.module.css` copies these percentages verbatim, and `keyframeParity.test.ts`
asserts that it still does. The two drifting apart is otherwise silent: the file says
VERBATIM in capitals, and a reader who trusts that comment would "restore" whichever one
they met second.

### 3 · Empty-state vocabulary

Nodes and threads, never stock illustrations of people. **Each state is a different
failure of connection**, so the drawing carries the meaning rather than decorating it.

| State | Drawing |
|---|---|
| Nothing yet | Threads dashed and fading; the node an empty outline |
| No matches | Threads curve away and miss the node |
| Error | Threads broken mid-run; the node dimmed |

One vocabulary means a new empty state costs minutes, and it is impossible for it to
look like it came from somewhere else.

### 4 · The accent has a job

Teal had been appearing as a dot with no defined role. **Two colours with no rule is how
a palette drifts.**

| Colour | Role |
|---|---|
| Navy `#1D174D` | Primary. Actions, the mark, the chrome |
| Teal `#4A9E96` | Accent. The node when reversed, live indicators, the pattern highlight |
| Green `#2E7D32` | Status only. Never branding |

> **Teal never carries state; green never carries brand.**
>
> Teal marks presence — the thing is alive. Green marks outcome — the thing succeeded.
> Confusing them is how "resolved" and "online" end up looking the same, and once they
> do, neither means anything.

**In a loader this has exactly one consequence.** Every loader is `currentcolor` over the
brand navy. Teal appears in **one** shape — Satellites, the one that means *waiting on an
external party* — where it says the connection is alive, not that anything succeeded.
Green never appears in a loader at all: a wait has no outcome yet. `design/loaders.md` §6.

### 5 · Product language

What the product calls things is identity, and in a bilingual product it is identity
twice. The glossary settles each term once so the same concept cannot acquire three
names across screens, emails, and documentation.

| Concept | English | العربية | Never |
|---|---|---|---|
| The record | Ticket | تذكرة | Case · Issue · Request |
| The person | Customer | عميل | Client · User · Contact |
| The staff member | Agent | موظف الدعم | Operator · Rep |
| The feed | Timeline | السجل | Activity · Log · History |
| Raising priority | Escalate | تصعيد | Flag · Urgent · Prioritise |
| The origin | Channel | قناة | Source · Medium |

The **Never** column matters more than the other two. Terms drift by synonym, not by
someone deciding to rename something, and the drift is invisible until a translator or a
new joiner asks which one is right.

## Which treatment, where

Eight treatments, one geometry. **Each changes exactly one variable** — weight,
container, colour, or orientation. None changes the geometry, which is why all eight
read as the same mark.

Change two variables at once and it stops being a treatment and becomes a second mark.
A library of marks is not a system; it is tidy chaos.

| Treatment | File | Use |
|---|---|---|
| **A · Open stroke** | `mark.svg` · `Mark` | **The default.** Everywhere, 24px and up |
| **A small** | `mark-small.svg` · `MarkSmall` | 20px and below. Shorter threads, larger node |
| **B · Heavy** | `mark-heavy.svg` · `MarkHeavy` | Embroidery, engraving, print below 10mm — where a thin stroke disappears into thread or ink |
| **C · Duotone** | `mark-duotone.svg` · `MarkDuotone` | **Reversed contexts.** Teal node, per the accent rule |
| **D · Outlined tile** | `MarkTile shape="outline"` | Documents, invoices, light print |
| **E · Circle** | `MarkTile shape="circle"` | Organisation avatar, social profile |
| **F · Vertical** | `mark-vertical.svg` · `MarkVertical` | Stacked lockups only. Threads rise into the node |
| **G · Two-thread** | `mark-two-thread.svg` · `MarkTwoThread` | **16px favicon only.** The third thread is removed deliberately — at 16px three threads merge into a block |
| **H · App icon** | Gradient tile + `MarkDuotone` | Home-screen icon only. The one place extra depth is allowed |

### Slot assignments

| Slot | Treatment |
|---|---|
| Favicon 32 | A on a navy squircle |
| Favicon 16 | **G** on a navy squircle |
| Sidebar header | A on a 26px tile, with lockup C |
| Sidebar collapsed | A small, 24px tile |
| Login hub (reversed) | **C** — teal node |
| Login card | A on a 38px tile |
| Organisation avatar | E |
| Email footer | A in ink, no tile |
| Home-screen icon | H |

**Favicon 32 and favicon 16 are not the same drawing.** That is not an inconsistency —
it is the rule that came out of the star failure: *a mark that keeps every detail at
every size is unreadable at the smallest one.*

## Arabic lockup

Arabic primary, Latin secondary beneath — the structure the house brand uses. Layout **C**
is the system lockup: mark to the inline-start, `وصل` above `WASL`.

Tagline: **كل المحادثات، مكان واحد**. Optional, and dropped below roughly 120px of
lockup width.

**The Arabic wordmark still has to be drawn.** What exists is `وصل` typeset in IBM Plex
Sans Arabic — a word in a font, not a wordmark. Custom letterforms are what make the
difference: the counters, the terminals, the tooth of the ص. A few hours for someone who
letters Arabic, and not something to typeset a way out of.

Until then the typeset form is usable and is labelled as provisional.
