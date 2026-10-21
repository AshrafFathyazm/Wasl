/* ============================================================================
 * breakpoints.ts — `041`. The ONE place the product's widths are named.
 * ============================================================================
 * Before this there were eight different `@media` widths across eight
 * stylesheets (480, 700, 700, 768, 900, 900, 980, 1100) and two more hard-coded
 * in `useSidebarState`, each chosen locally and none agreeing. They are retired
 * into the four below; the two that stay are listed in `LEGACY_WIDTHS` with the
 * reason, and `breakpoints.guard.test.ts` fails on any other.
 *
 * VIEWPORT BREAKPOINTS DECIDE THE SHELL ONLY — drawer or sidebar, header
 * controls, and "table or cards", which is a property of the screen the reader
 * holds. PAGE-INTERNAL LAYOUT (a detail page's two columns, the new-ticket form
 * beside its routing panel, the dashboard's pairs) answers to the width of the
 * CONTENT AREA through `@container`, because at 1024 the full sidebar leaves
 * about 780px and "two columns at lg" would be cramped (`041` §8.A).
 *
 * CSS CANNOT READ A VARIABLE INSIDE `@media` OR `@container`, so a stylesheet
 * spells the number and tags the rule with a `bp: md` comment.
 * The guard is what keeps the two spellings from drifting apart.
 * ========================================================================= */

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/**
 * Widths of the CONTENT AREA (the `main` region's own box) at which a page
 * changes layout. Measured from the audit, not guessed — see `specs/041-…/audit.md`.
 *
 *   split     a detail page / form with a side panel goes two-column
 *   wide      a dashboard row puts two cards side by side
 *   kpi       the KPI row goes from 2 to 4 up
 */
export const CONTAINER_WIDTHS = {
  login: 780,
  split: 880,
  wide: 760,
  kpi: 1000,
  /** A phone-width content area: rows that stack instead of staying on one line. */
  compact: 520,
  /** A table is a table from here; below it the rows are cards. Measured on the element, in TS. */
  table: 760,
} as const;

/**
 * Widths that predate this file and were NOT migrated, each with the reason. The
 * guard accepts exactly these and fails if an entry no longer appears in any
 * stylesheet — a stale exemption is a hole the next width walks through.
 */
export const LEGACY_WIDTHS: Record<string, string> = {
  /* Each belongs to a screen `041` Phase 2 owns; the entry is deleted with the
     migration, and the guard fails if it outlives it. */
  '480': 'ToastHost — a toast becomes a bottom sheet in Phase 2 (dialogs as sheets)',
};

export const ALLOWED_WIDTHS: ReadonlySet<number> = new Set([
  ...Object.values(BREAKPOINTS),
  ...Object.values(CONTAINER_WIDTHS),
  ...Object.keys(LEGACY_WIDTHS).map(Number),
]);
