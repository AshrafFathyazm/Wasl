import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/* ============================================================================
 * 037 · AC-10 — every export is used, or is named here with a reason
 * ============================================================================
 *
 * `002c`'s contract comparison in miniature. It runs in BOTH directions:
 *
 *   - an export nothing renders must be named below, individually;
 *   - a name below that something DOES render must be removed from the list.
 *
 * The second half is the one that keeps the list honest. A list that only ever
 * grows becomes a place to put things, and then it stops meaning anything —
 * which is how `002c` found two endpoints in the frozen contracts that nobody
 * had counted.
 *
 * The set is the deliverable here: the product owner supplied a 63-icon system
 * and 037 built it, so the unconsumed half is expected and is not dead code
 * waiting to be pruned. It is a roadmap the module carries, in the shape `027`
 * established — draw the unbuilt action, do not draw the unbuilt DATA. An icon
 * is neither; it promises nothing until a screen renders it.
 * ========================================================================= */

const ICONS_DIR = __dirname;
const SRC = join(ICONS_DIR, '..');

/**
 * Exports with no consumer, each with the feature that will bring one — or an
 * explicit "no feature", which is a different and more useful statement than
 * silence.
 */
const NOT_YET_CONSUMED: Record<string, string> = {
  /* Interface primitives the document supplies and no screen has reached for.
   *
   * TWO HAVE COME OFF THIS LIST BY BEING RENDERED, which is what the second
   * half of this test is for: `IconSort` on 2026-09-06 (the table header's
   * sort menu) and `IconChevron` the same day (`038`'s «‹ التذاكر» back link —
   * the horizontal chevron the list of 33 downward call sites never wanted).
   * Neither removal was noticed by a person; the guard went red and named the
   * icon. */
  IconTrash: 'no feature — nothing in the product deletes anything yet',
  IconDownload: 'no feature — no export exists (020 dashboard may want it)',
  IconUpload: 'out of scope — attachments, 00-project-context.md',
  IconExternal: 'no feature — no outbound link in any screen today',

  /* §02, the primary family. */
  IconMobile:
    'no feature — the handset lost its channel slot to the document’s sms bubble',
  IconAttachment: 'out of scope — attachments, 00-project-context.md',

  /* §05. `027` drew escalate, merge and extend-due as INERT rows with no client
   * fetcher at all, deliberately; these are the glyphs those rows will take. */
  IconStatus: 'no feature — the status column renders a text pill (026)',
  /* `IconHistory` came off on 2026-09-06 — `038`'s «previous tickets» line marks
     a customer's Resolved/Closed history on the create screen. Third icon to
     come off this list in two days, and none of the three was noticed by a
     person: the guard went red and named it each time. */
  IconReopen: 'no feature — BR-1 makes Closed terminal; there is no reopen',
  IconCompany: 'no feature — Customer has no organisation field (007)',
  IconNote: 'no feature — 013 comments are internal/public, not "notes"',
  IconTag: '034 built tags; 027 renders them as tinted chips with no glyph',
  IconCustomers: 'no feature — the nav uses IconCustomer, singular',

  /* §06 channels. `021` is specified and not built — CLAUDE.md's decision
   * table says so, and says the row claiming otherwise was false. */
  IconCall: '021-communication-provider-abstraction — specified, not built',

  /* §07, the agent desk. None of it exists. */
  IconTasks: '020-dashboard',
  IconBell: 'no feature — notifications are not in the product',
  IconQuickReply: 'no feature — canned responses are not in the product',
  IconMention: '027 recorded @mentions as ABSENT, with the reason',
  IconHandoff: 'no feature — shift handover is not in the product',

  /* §08, knowledge base and customer portal. There is no such module at all,
   * and the document draws eight icons for it. */
  IconArticle: 'no feature — no knowledge base',
  IconFaq: 'no feature — no knowledge base',
  IconSolution: 'no feature — no knowledge base',
  IconGuide: 'no feature — no knowledge base',
  IconPortal: 'no feature — no customer portal',
  IconSubmit: 'no feature — no customer portal',
  IconTrack: 'no feature — no customer portal',
  IconRating: 'no feature — no satisfaction survey',

  /* §09, security and platform. */
  IconShield: 'no feature — no security screen',
  IconKey: 'no feature — no API-key or credential screen',
  IconAudit: '019-audit-log-access — dbo.AuditLog is written (003) and has no reader',
  IconRole: 'no feature — 004 seeds roles; nothing administers them',
  IconDepartment: 'no feature — SupportUser has no department',
  IconBranding: '022-tenant-theming-settings — ADR-012, accepted in part',
  /* (D) glyphs the DOCUMENT's own icons displaced on 2026-09-05, when the row
   * and action menus were moved onto the document's vocabulary. Kept, not
   * deleted: 037 Q-2 rules IconReassign a different act from the document's
   * handoff, and IconArrowUp is the bare primitive the branded swoosh is not. */
  IconArrowUp:
    "no feature — the document's escalate swoosh took every place this stood in for",
  IconReassign: "no feature — the row menu uses the document's assign now; see 037 Q-2",
};

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const moduleSource = readFileSync(join(ICONS_DIR, 'icons.tsx'), 'utf8');
const exported = [...moduleSource.matchAll(/^export const (Icon\w+)/gm)].map(
  (m) => m[1] as string,
);

/* Consumers are every source file OUTSIDE the icons folder. A test importing an
 * icon does not make a screen render it, and every test that does so lives in
 * here — so excluding the folder excludes the module and its four guards at
 * once. */
const consumerFiles = walk(SRC).filter((f) => !f.startsWith(ICONS_DIR));
const consumerSources = consumerFiles.map((f) => readFileSync(f, 'utf8'));

const consumed = new Set(
  exported.filter((name) =>
    consumerSources.some((s) => new RegExp(`\\b${name}\\b`).test(s)),
  ),
);

describe('AC-10 — the coverage list is exact in both directions', () => {
  it('measured something — consumers and exports were both found', () => {
    expect(consumerFiles.length, 'no consumer files were read').toBeGreaterThan(50);
    expect(exported.length, 'no exports were found').toBeGreaterThanOrEqual(70);
    expect(
      consumed.size,
      'not one export was found in use — the scan is broken',
    ).toBeGreaterThan(20);
  });

  it('names every unconsumed export', () => {
    const unlisted = exported.filter((n) => !consumed.has(n) && !(n in NOT_YET_CONSUMED));
    expect(
      unlisted,
      `these have no consumer and no entry in NOT_YET_CONSUMED: ${unlisted.join(', ')}`,
    ).toEqual([]);
  });

  /* The half that stops the list becoming a dumping ground. */
  it('lists nothing that is actually consumed', () => {
    const stale = Object.keys(NOT_YET_CONSUMED).filter((n) => consumed.has(n));
    expect(
      stale,
      `these are rendered somewhere and must come off the list: ${stale.join(', ')}`,
    ).toEqual([]);
  });

  it('lists nothing that is not exported at all', () => {
    const ghosts = Object.keys(NOT_YET_CONSUMED).filter((n) => !exported.includes(n));
    expect(ghosts, `listed but not declared: ${ghosts.join(', ')}`).toEqual([]);
  });

  it('gives every listed icon a non-empty reason', () => {
    const blank = Object.entries(NOT_YET_CONSUMED)
      .filter(([, reason]) => reason.trim().length < 10)
      .map(([name]) => name);
    expect(blank).toEqual([]);
  });
});
