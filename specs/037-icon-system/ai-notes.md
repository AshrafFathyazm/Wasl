# 037 — AI notes

## Agents dispatched

**None.** `tasks.md`'s Agent column would be empty for every row, so no `tasks.md` was
written: the work is one lane, one session, and inventing agent names to fill a table
would make the record worse, not better. Recorded here rather than left to inference.

## What was generated rather than typed, and how it was checked

The 73 icons' path data was **not hand-transcribed**. Transcribing 63 sets of coordinates
by hand and then applying a scale factor to each is exactly the kind of task that produces
a defect nobody can see — a wrong digit in a path is a slightly wrong glyph, not an error.

Instead:

1. The document's geometry was entered once as data, in a scratchpad file.
2. A transform applied N-1 (scale about (12,12)) and N-3 (fills → strokes) mechanically.
3. **The output was re-measured, not trusted.** Every emitted icon's bbox was recomputed
   *from the emitted markup* and checked against the keyline — `74 emitted, 0 outside`.
   Measuring the *input* would have proved only that the intent was right.
4. `iconKeyline.test.ts` then does the same check permanently, on the committed file, so
   the generator is a one-time tool and the test is the standing guard. The generator is
   not in the repository; the coordinates and the check are.

**The generator itself is not evidence.** The evidence is the committed file passing a test
that has been seen to fail (`tests.md` §4).

## The accepted output that was wrong

The first bbox tool mis-tokenised SVG arc flags and produced a well-formed report about
nothing — it named `copy` as starting at x = 6 when it starts at 3.5, and missed `trash`
and `bell` entirely. It was believed for one pass.

It was caught by writing controls whose answers were known by hand, not by re-reading the
code. That is the only reason the four controls in `iconGeometry.ts` exist, and why they
run *before* any real figure is read (AC-2).

**Everything accepted here was run.** The keyline figures, the scale factors, the arc
centres, the negative controls, and the 18px rendering are all observed output recorded in
`tests.md`. Nothing in that file is asserted from memory.

## The one judgement a tool could not make

Q-6 — does an r2 ring at 18px stay a ring — was answered by **rasterising at the real size
and magnifying the raster ×10**, not by scaling the SVG. Scaling the vector re-renders it
and answers a different question; the arithmetic (a 1.9px hole) agreed with what was seen.
`icons.md` says optical judgement cannot be computed, and this is the nearest thing to
computing it honestly: measure the pixels that actually ship.
