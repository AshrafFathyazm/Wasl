import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * =============================================================================
 * ONE SCRIM, ONE ARRIVING EASING — `030` AC-3, asserted from the SOURCE
 * =============================================================================
 * A NEAR-MATCH IS A SECOND SCALE, NOT A REFINEMENT. `tokens.css` already writes
 * that rule down about a different pair, and `030` §3 rows 4 and 8 are the same
 * failure twice:
 *
 *   scrim   `10-shared-patterns.md` .45  ·  the (G) document .4   ·  shipped .34
 *   easing  `--ease-out` .22,.80,.30,1   ·  the (G) document .2,.7,.3,1
 *
 * Neither difference is visible in review. Both are legible in a diff only to
 * someone who already knows to look, and the vendored source document contains
 * BOTH losing values in plain sight — so the likeliest way they come back is
 * somebody "correcting" the code to match the document they were handed.
 *
 * Ruled 2026-09-05: the scrim is `--scrim` at 40%, the easing is `--ease-out`,
 * and everything else collapses into them. This file is what keeps that true.
 *
 * THE SCRIM'S RULED VALUE IS NOT THE ONE AC-3 NAMES. AC-3 was written on
 * 2026-08-31 and says `.45`, because that was the house document's value and the
 * source's `.4` was the challenger. The ruling went the other way, on evidence
 * AC-3's author did not have: `Sidebar.module.css` had been painting 40% since
 * the sidebar learned to collapse, so `.40` was never a fifth answer — it was
 * the one already in the product. Recorded here rather than edited into AC-3,
 * because the criterion was right about the SHAPE (one value, guarded by a test)
 * and the ruling only moved which value it is.
 *
 * WHY A SOURCE SCAN. jsdom paints nothing, so no rendered test can see a colour
 * or an easing curve at all. This is a claim about the code.
 */

const SRC = resolve(process.cwd(), 'src');

/** Every stylesheet and component under `src/`, excluding the previews. */
function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      /* `dev/` holds previews, which `027` established are not designs of record
         and are deleted rather than maintained. A near-match in one is still
         wrong, but it is not what this guard is protecting. */
      if (entry === 'dev') continue;
      sources(path, out);
      continue;
    }
    if (/\.(css|tsx|ts)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/** Comments stripped, both syntaxes. The paragraph above NAMES both losing
 *  values, and so do the notes in `tokens.css`, `SideSheet.module.css` and
 *  `feedback-layer.md` — a scan over raw text would fail on the prose that
 *  explains the rule. Third time this trap has been hit in this repository. */
const stripped = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FILES = sources(SRC).map((path) => ({
  name: relative(SRC, path).replace(/\\/g, '/'),
  raw: readFileSync(path, 'utf8'),
}));

const hits = (pattern: RegExp) =>
  FILES.filter(({ raw }) => pattern.test(stripped(raw))).map(({ name }) => name);

describe('030 AC-3 — the near-match values cannot come back', () => {
  it('scanned a real tree, and the comment stripper ran', () => {
    /* THE NEGATIVE CONTROL FOR THE SCANNER ITSELF. Without it every assertion
       below passes on an empty file list, which is exactly what a bad glob
       produces — and `002`'s AC-2 guard was green for three request shapes while
       measuring nothing. */
    expect(FILES.length).toBeGreaterThan(60);
    expect(FILES.map((f) => f.name)).toContain('styles/tokens.css');

    /* The stripper is doing work: this very file's own header names both losing
       values, and `tokens.css`'s note does too. If stripping silently stopped,
       the two assertions below would fail on prose rather than on code — a false
       positive that reads exactly like a real one.
     *
     * PROVEN ON A PHRASE, NOT ON `.45`. The first version asserted that `.45`
     * vanished from the stripped tokens, and it FAILED against correct code:
     * `--motion-loader-ease`, `--motion-loader-ease-sweep`, `--ease-in` and
     * `--leading-ar-heading` all legitimately contain `.45`. The digits are not
     * a scrim; a sentence is unambiguously prose. */
    const tokens = FILES.find((f) => f.name === 'styles/tokens.css');
    expect(tokens).toBeDefined();
    expect(tokens!.raw).toContain('`10-shared-patterns.md` wrote .45');
    expect(stripped(tokens!.raw)).not.toContain('`10-shared-patterns.md` wrote .45');
    /* And materially shorter, so the stripper is removing the whole comment
       rather than one matched phrase. */
    expect(stripped(tokens!.raw).length).toBeLessThan(tokens!.raw.length * 0.6);
  });

  it('holds exactly ONE scrim, and it is the token', () => {
    /* Any alpha in the 13,38,38 family that is not the token's own declaration.
       Written against the COLOUR rather than against the word "scrim", because
       the defect it catches is an inline `rgb(13 38 38 / 34%)` that nobody
       called a scrim — which is precisely what shipped in `SideSheet`. */
    const inline = FILES.filter(({ name, raw }) => {
      if (name === 'styles/tokens.css') return false;
      const text = stripped(raw);
      return /(?:background|background-color)\s*:\s*rgba?\(\s*13[\s,]/.test(text);
    }).map(({ name }) => name);

    expect(inline).toEqual([]);

    const declarations = FILES.filter(({ raw }) => /--scrim\s*:/.test(stripped(raw))).map(
      ({ name }) => name,
    );
    expect(declarations).toEqual(['styles/tokens.css']);
  });

  it('holds no copy of the source document’s easing', () => {
    /* `.2,.7,.3,1` in any spacing or zero-padding. `--ease-out` is
       `.22,.80,.30,1` and the two are indistinguishable on screen. */
    expect(hits(/cubic-bezier\(\s*0?\.2\s*,\s*0?\.7\s*,\s*0?\.3\s*,\s*1\s*\)/)).toEqual([]);
  });

  it('would CATCH both, which is what makes the two assertions above mean anything', () => {
    /* The guard proving itself against text it is handed rather than against the
       tree — a guard that has never been seen to fail has not been verified, and
       breaking the real files to check would leave the repository broken between
       two runs of this file. */
    const badScrim = 'x { background-color: rgba(13, 38, 38, 0.45); }';
    const badEase = '.p { animation: a 220ms cubic-bezier(0.2, 0.7, 0.3, 1); }';

    expect(
      /(?:background|background-color)\s*:\s*rgba?\(\s*13[\s,]/.test(stripped(badScrim)),
    ).toBe(true);
    expect(
      /cubic-bezier\(\s*0?\.2\s*,\s*0?\.7\s*,\s*0?\.3\s*,\s*1\s*\)/.test(stripped(badEase)),
    ).toBe(true);

    /* And it does NOT fire on the values that are correct — otherwise the guard
       would be un-satisfiable and the next person would delete it. */
    expect(
      /cubic-bezier\(\s*0?\.2\s*,\s*0?\.7\s*,\s*0?\.3\s*,\s*1\s*\)/.test(
        'cubic-bezier(0.22, 0.8, 0.3, 1)',
      ),
    ).toBe(false);
  });
});
