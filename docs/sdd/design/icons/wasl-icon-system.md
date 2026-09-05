# Wasl Icon System — the source geometry

**Origin:** `Wasl Icon System_last.dc.html`, supplied by the product owner 2026-09-05.
**Vendored by:** `037-icon-system`, DOC-037-01.

---

## Read this before treating this file as the document

**This is not the document. It is the half of the document that could be transcribed
faithfully, and the boundary is stated rather than blurred.**

The HTML reached the implementing session as a conversation attachment, never as a file on
disk, and its Arabic prose arrived **mis-decoded** — UTF-8 bytes read as Latin-1, so
`وصل` came through as `ÙˆØµÙ„`. Writing that out would have put corrupted Arabic into the
repository under a filename that claims to be the source, which is worse than not having
it: a corrupted copy is still a copy people will read and cite.

What IS intact, byte for byte, is everything in the document that is ASCII — the §10
source listing of every path, the node list, the RTL flip list, and the numeric rules.
That is what this file carries, and it is the part `037` actually built from.

**`037` AC-13 is therefore recorded PARTIALLY MET.** The original HTML still needs to be
committed here by the product owner, who has the uncorrupted file. Until it is, the Arabic
rationale for each icon — which is real content, and is the part that explains *why* a
glyph is drawn the way it is — exists only in the product owner's copy.

---

## The document's own rules

| Concern | The document |
|---|---|
| `viewBox` | `0 0 24 24` always; nominal display 16px |
| Keyline | 20 units — a 2-unit safe area inside the 24 box |
| `stroke-width` | `1.5` at 24 and 20 · **`1.75` at 16**, to compensate optically |
| `stroke` / `fill` | strokes are `currentColor` with `fill: none`; **the node alone is `fill: currentColor`** |
| Terminals | `round` caps and joins |
| Grid | coordinates on multiples of 0.5; horizontals on 7 / 12 / 17 |
| Node radius | `2.1` in the brand mark, `1.6 – 2.0` elsewhere. Flat, no gradient, no shadow |
| Direction | symmetric icons never mirror; directional ones take `scaleX(-1)` in RTL — **except the mark** |
| Sizes | three only: 24 · 20 · 16. A fourth size means the container is wrong, not the icon |

### What the house does with these — `037` §1, R-1

The product owner ruled **house rules win**. Three of the rows above are NOT adopted:

| Document | Wasl, after `037` |
|---|---|
| 20-unit keyline | **16**, per `icons.md` Rule 2. Each icon scaled about (12,12) by `s = min(1, 8/R)` |
| `1.75` at 16px | **`1.5` at every size**, per `icons.md` |
| Node filled | **stroked** — `icons.md` forbids fills, so the node is a ring |
| 24 / 20 / 16 | default stays **18**; the three sizes are advisory |

---

## The node — 7 of 63

`mark` · `chat` · `escalate` · `settings` · `assign` · `merge` · `track`

Five further icons carry a filled circle the document does **not** call a node, and the
distinction matters because it is about meaning, not drawing: `more` (three dots),
`status` (a centred core), `info` and `faq` (the bang's dot), `livechat` (a presence dot,
`teal-600` in colour). Twelve filled shapes in total; `037` strokes all twelve.

---

## RTL — the document's flip list, verbatim

```text
chevron · edit · external · chat · sms · live chat · call · attachment
escalate · assign · note · tag · tasks · handoff · submit · track
key · audit · refresh · reopen
NEVER flip mark. symmetric icons need no flip.
```

Twenty names. `iconRtl.test.tsx` holds this list as a literal and compares it to the
module.

---

## The geometry — the document's §10, transcribed

```text
/* every icon: viewBox="0 0 24 24"  fill="none"  stroke="currentColor"
   stroke-width="1.5" (1.75 at 16px)  stroke-linecap="round"  stroke-linejoin="round"
   node = a separate <circle fill="currentColor">, never stroked        */

mark        M3.5 7h4.5c5 0 6 2.5 8.5 5
            M3.5 12h13
            M3.5 17h4.5c5 0 6-2.5 8.5-5          node 19,12 r2.1
search      circle 10.5,10.5 r6.25 · M15 15l5 5
filter      M4 7h16 · M6.5 12h11 · M9.5 17h5
calendar    rect 3.25,5 17.5×15.75 rx2.25 · M8 3v4M16 3v4 · M3.25 10h17.5
mail        rect 3,5.75 18×12.5 rx2.25 · M3.75 7L12 12.75 20.25 7
chat        rect 3.5,4.5 17×11.5 rx2.5 · M8.5 16v4L13 16   node 12,10.25 r1.6
mobile      rect 7,2.5 10×19 rx2.25 · M10.25 18.5h3.5
attachment  M16 8.5v7.5a4 4 0 01-8 0V7a2.5 2.5 0 015 0v9a1 1 0 01-2 0V8.5
escalate    M4 17h4.5c5.5 0 7-5.5 8.7-9.6
            M4 12h6c4 0 5.5-2.5 7.2-4.4            node 19,7 r1.9
user        circle 12,8.25 r3.9 · M5 20.5c0-4 3.1-6.6 7-6.6s7 2.6 7 6.6
settings    M4 7h16M4 12h16M4 17h16
            nodes 15.5,7 · 8.5,12 · 13.5,17   all r2
refresh     M20 12a8 8 0 11-2.35-5.65 · M20.25 4.5v3.9h-3.9

/* —— 04 · UI primitives ————————————————————————————————————— */
close       M6.5 6.5l11 11M17.5 6.5l-11 11
plus        M12 4.5v15M4.5 12h15
check       M4.5 12.5l4.75 4.75L19.5 7
chevron     M8.5 5l7 7-7 7
more        3 filled circles r1.5 at 6,12 · 12,12 · 18,12
edit        M15.5 5.5l3 3L9 18H6v-3z · M14 7l3 3
copy        rect 8.5,8.5 12×12 rx2.25
            M15.5 8.5V6a2.5 2.5 0 00-2.5-2.5H6A2.5 2.5 0 003.5 6v7A2.5 2.5 0 006 15.5h2.5
trash       M4.5 7h15 · M9.5 7V5A1.5 1.5 0 0111 3.5h2A1.5 1.5 0 0114.5 5v2
            M6.5 7l.9 12.1a1.5 1.5 0 001.5 1.4h6.2a1.5 1.5 0 001.5-1.4L17.5 7
download    M12 4v11 · M7.5 11l4.5 4.5L16.5 11 · M4.5 20h15
upload      M12 15.5V4.5 · M7.5 9L12 4.5 16.5 9 · M4.5 20h15
external    M13 4.5h6.5V11 · M19.5 4.5L11 13
            M17 14.5V18a1.5 1.5 0 01-1.5 1.5H6A1.5 1.5 0 014.5 18V8.5A1.5 1.5 0 016 7h3.5
eye         M2.5 12s3.8-6 9.5-6 9.5 6 9.5 6-3.8 6-9.5 6-9.5-6-9.5-6z · circle 12,12 r2.6
info        circle 12,12 r8.5 · M12 11v5.5 · dot 12,8 r1.15
sort        M7 5v14M4 16l3 3 3-3 · M17 19V5M14 8l3-3 3 3

/* —— 05 · tickets & customers ——————————————————————————————— */
ticket      rect 3,6 18×12 rx2.25 · M8.5 6v2M8.5 11v2M8.5 16v2
priority    M7 12l5-5 5 5 · M7 17l5-5 5 5
status      circle 12,12 r8 · filled circle 12,12 r2.75  (centred, not a node)
assign      circle 7,8 r3.2 · M2 19.5c0-3.2 2.2-5.5 5-5.5s5 2.3 5 5.5
            M14.5 12h3.2                           node 20,12 r1.7
history     circle 12,12 r8 · M12 7.5V12l3.5 2.2
merge       M3.5 6h4c5 0 6.5 3 9 6
            M3.5 18h4c5 0 6.5-3 9-6                node 19,12 r1.9
resolve     circle 12,12 r8 · M8 12.3l2.8 2.8 5.4-5.6
reopen      M4 12a8 8 0 103.4-6.5 · M3.75 4.8v3.7h3.7   (counter-clockwise)
company     M4.5 20.5V6.6a1 1 0 01.7-1L11 4a1 1 0 011.3 1v15.5
            M12.3 10.6l6.5 2a1 1 0 01.7 1v6.9 · M3 20.5h18
            M7 9.5v1.6M7 14v1.6M15.6 15.2v1.6 · M9.3 20.5v-3.2h2.6v3.2
note        M4.5 5A1.5 1.5 0 016 3.5h8L19.5 9v10a1.5 1.5 0 01-1.5 1.5H6A1.5 1.5 0 014.5 19z
            M14 3.5V9h5.5 · M8.5 13h7M8.5 16.5h4
tag         M20.5 12.5l-8 8a1.6 1.6 0 01-2.3 0l-6.7-6.7a1.6 1.6 0 01-.5-1.1V5a1.6 1.6 0 011.6-1.6h7.7c.4 0 .8.2 1.1.5l7.1 7.1a1.6 1.6 0 010 2.5z
            circle 8.5,8.5 r1.4  (stroked hole, not a node)
customers   circle 9,8.5 r3.4 · M2.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2
            M16.5 7.2a2.8 2.8 0 010 5.6 · M17.5 14.2c2.3.5 4 2.5 4 5.3

/* —— 06 · channels —————————————————————————————————————————— */
sms         rect 3.5,4.5 17×11.5 rx2.5 · M8.5 16v4L13 16 · M8 9h8M8 12.5h5
web form    rect 4,3 16×18 rx2.25 · M8 8h8M8 12h8 · M8 16.2l1.8 1.8L13 15.5
call        M6.5 4.5h3l1.5 4-2 1.5a11 11 0 005 5l1.5-2 4 1.5v3a1.5 1.5 0 01-1.6 1.5C10.5 18.6 5.4 13.5 5 6.1A1.5 1.5 0 016.5 4.5z
live chat   rect 3,5.5 15×10.5 rx2.5 · M7.5 16v3.8L11.5 16
            presence dot 19.5,5 r2.1  (teal-600 in colour, NOT a node)

/* —— 07 · agent desk ———————————————————————————————————————— */
dashboard   4 rects 7.5×7.5 rx1.5 at 3.5,3.5 · 13,3.5 · 3.5,13 · 13,13
tasks       M4 7l2.2 2.2L10 5.5 · M13 7.5h7 · M4 16l2.2 2.2L10 14.5 · M13 16.5h7
bell        M18 16.5H6l1.4-2.3V10a4.6 4.6 0 019.2 0v4.2z · M10.3 19.5a2 2 0 003.4 0
quick reply M13.5 3.5L6 13.5h4.5L10.5 20.5 18 10.5h-4.5z
mention     circle 12,12 r3.4 · M15.4 8.6v5.1a2.1 2.1 0 004.2 0V12a7.6 7.6 0 10-3 6
handoff     M4 9h13l-3-3 · M20 15H7l3 3

/* —— 08 · knowledge base & portal ——————————————————————————— */
article     M12 5.6v13.9   (spine)
            M12 5.6C10 4.1 7.6 3.7 5.2 4.3a1 1 0 00-.7 1v12.4a1 1 0 001.2 1c2-.4 4.5 0 6.3 1.4
            M12 5.6c2-1.5 4.4-1.9 6.8-1.3a1 1 0 01.7 1v12.4a1 1 0 01-1.2 1c-2-.4-4.5 0-6.3 1.4
faq         circle 12,12 r8.5 · M9.6 9.4A2.5 2.5 0 0114.4 10c0 1.7-2.4 2-2.4 3.6
            dot 12,16.6 r1.15
solution    M9.6 15.6a5.5 5.5 0 114.8 0 · M9.5 15.6h5v1.9a2.5 2.5 0 01-5 0z
            M10.5 20.5h3
guide       M8.5 6.5h11M8.5 12h11M8.5 17.5h11
            stroked circles r1.3 at 4.5,6.5 · 4.5,12 · 4.5,17.5
portal      M3.5 11L12 4l8.5 7 · M6 10v9.5h12V10 · M10.5 19.5v-5h3v5
submit      M20.5 3.5L3.5 10.5l6.5 2.5 2.5 6.5z · M20.5 3.5L10 13
track       M4 17h3.5c5.5 0 5-9 9.6-9 · stroked circle 4,17 r1.5
                                                   node 19.5,8 r1.9
rating      M12 3.8l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17.2l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z

/* —— 09 · security & platform ———————————————————————————————— */
shield      M12 3.5l7.5 2.8v5.4c0 4.4-3 8-7.5 9.3-4.5-1.3-7.5-4.9-7.5-9.3V6.3z
key         circle 15,9 r3.5 · M12.5 11.5L4.5 19.5V21H7v-2h2v-2h1.5z
audit       M4.5 6.5h12M4.5 11h7 · circle 15.5,15.5 r5 · M15.5 13v2.5l1.8 1.2
role        circle 11,8 r3.4 · M3.5 20c0-3.6 3.1-6.2 7-6.2.6 0 1.2.1 1.7.2
            M14 17.5l2 2 4-4
language    circle 12,12 r8.5 · M3.5 12h17
            M12 3.5c2.8 3 2.8 14 0 17 · M12 3.5c-2.8 3-2.8 14 0 17
department  rect 9,3 6×5 rx1.25 · M12 8v3.5 · M6 11.5h12 · M6 11.5v2M18 11.5v2
            rect 3,13.5 6×5 rx1.25 · rect 15,13.5 6×5 rx1.25
branding    circle 12,12 r8.5 · stroked circles r1.5 at 9,9.5 · 15,9.5 · 12,15
```

---

## The document's own "do not" panel

Transcribed from meaning, since the Arabic could not be transcribed from bytes. Where a
rule was overridden, the ruling is named.

| Do not | Status in Wasl |
|---|---|
| Put a node on every icon — four of twelve carry one; on all of them it stops being a signature | Moot. `037` ships **no** filled node at all (R-1) |
| Scale `stroke-width` with the icon — grid units, not pixels; never `vector-effect: non-scaling-stroke` | **Adopted**, and strengthened: 1.5 at every size |
| Put vendor logos in the set — WhatsApp, Telegram and the rest are registered marks; use neutral `chat`, real logos only on the integrations page | **OVERRIDDEN for `IconWhatsapp` only**, ruled 2026-09-05, `037` Q-1. The channel column must tell channels apart. The trademark point is flagged, not resolved |
| Mirror the mark in RTL — directional icons flip, the mark never | **Adopted.** The mark is not in the icon module at all (`src/brand/Mark.tsx`) |
| Use colour inside an icon — `currentColor` only | **Adopted**, including the `livechat` presence dot the document itself colours `teal-600` |
| Ship an icon with no hit area — a 16px icon needs ≥32px on desktop, 44px on touch | Consumers' concern; unchanged by `037` |

---

## Where this went

`src/wasl-web/src/icons/icons.tsx` — one module, 73 exports: 62 from the geometry above
(`mark` excluded, it is the brand), and 11 labelled (D) that this document has no
counterpart for. Four guards in the same folder, each broken on purpose once and the red
run recorded in `specs/037-icon-system/tests.md`.
