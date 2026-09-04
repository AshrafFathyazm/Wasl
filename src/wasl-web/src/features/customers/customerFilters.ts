import type { CustomerListParams, CustomerSort, SortDirection } from './customers.api';

/* ============================================================================
 * The URL is the filter state. `033` §10, ADR-011 §2.
 * ============================================================================
 * Read on every render, never mirrored — which is what makes a filtered link
 * render filtered on arrival with nothing to hydrate, and what makes the back
 * button work without a subscription. `015` established the shape for tickets
 * and this is the same one; a second pattern for the same job is how two screens
 * end up disagreeing about what `?page=` means.
 *
 * EVERY VALUE IS VALIDATED ON THE WAY IN. A hand-typed `?sort=email` must not
 * reach the request — the server answers `400` and the screen would show an
 * error for a URL the reader can see and cannot fix. A stale link degrades to a
 * wider list instead.
 * ========================================================================= */

export interface CustomerFilterState {
  search: string;

  /** `''` means "the server's default", which is `fullName` ascending. */
  sort: CustomerSort | '';
  dir: SortDirection | '';

  /** EXACT company names. The server clamps to twenty; so does `withFilters`,
   *  because a URL carrying fifty is a URL the server silently truncates. */
  company: readonly string[];
  noCompany: boolean;

  /** ISO days, or `''`. */
  createdFrom: string;
  createdTo: string;
}

export const NO_CUSTOMER_FILTERS: CustomerFilterState = {
  search: '',
  sort: '',
  dir: '',
  company: [],
  noCompany: false,
  createdFrom: '',
  createdTo: '',
};

/** The server's two, read from the same place the request is built from. */
const SORTS: readonly CustomerSort[] = ['fullName', 'createdAtUtc'];
const DIRS: readonly SortDirection[] = ['asc', 'desc'];

/** BR-7.2's clamp, mirrored so the URL cannot promise more than the server takes. */
export const MAX_COMPANIES = 20;

/**
 * An ISO day the server will accept, or `''`.
 *
 * **Validated by ROUND TRIP rather than by a regex.** `2026-02-31` matches every
 * shape a pattern can express and is not a day; `new Date` rolls it forward to
 * March, so comparing the formatted result to the input is what rejects it.
 */
function knownIsoDay(raw: string | null): string {
  if (raw === null || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10) === raw ? raw : '';
}

/**
 * Both created bounds, with an INVERTED PAIR DROPPED.
 *
 * Each bound survives validation on its own, so nothing here caught the pair —
 * and the server refuses it: `400`, `errors.createdTo`. That refusal is right
 * (a range that ends before it starts is a contradiction, not an empty window)
 * and it must never reach a reader, because it arrives as an error pane over a
 * list that was working. Measured 2026-09-03 before this function existed:
 * `?createdFrom=2026-09-01&createdTo=2026-08-01` on /tickets rendered
 * «تعذّر تحميل القائمة» with the server's developer-facing detail underneath.
 *
 * Dropping BOTH is deliberate. Keeping one would silently filter by a bound the
 * reader did not choose; dropping the pair applies the policy this file already
 * states for every other unreadable value — the link degrades to a wider list.
 */
function readCreatedRange(params: URLSearchParams): { from: string; to: string } {
  const from = knownIsoDay(params.get('createdFrom'));
  const to = knownIsoDay(params.get('createdTo'));
  return from !== '' && to !== '' && to < from ? { from: '', to: '' } : { from, to };
}

/** True when a draft range cannot be applied — the panels disable «تطبيق» on it,
 *  which is what stops the picker building a request the server refuses. */
export function createdRangeIsInverted(from: string, to: string): boolean {
  return from !== '' && to !== '' && to < from;
}

export function readCustomerFilters(params: URLSearchParams): CustomerFilterState {
  const created = readCreatedRange(params);
  const sort = params.get('sort');
  const dir = params.get('dir');

  return {
    search: params.get('search')?.trim() ?? '',
    sort: SORTS.includes(sort as CustomerSort) ? (sort as CustomerSort) : '',
    dir: DIRS.includes(dir as SortDirection) ? (dir as SortDirection) : '',

    /* De-duplicated and clamped here as well as on the server: two identical
     * values in the URL would spend a clamp slot on nothing. */
    company: [...new Set(params.getAll('company').map((v) => v.trim()).filter(Boolean))].slice(
      0,
      MAX_COMPANIES,
    ),
    noCompany: params.get('noCompany') === 'true',
    createdFrom: created.from,
    createdTo: created.to,
  };
}

/**
 * The next URL for a filter change.
 *
 * **The page is reset and `pageSize` is kept**, which `015` measured the reason
 * for: page 5 of an unfiltered list is rarely page 5 of a filtered one, so
 * keeping it turns *filter to Acme* into an empty table with a pager reading
 * 5 of 1 — and the empty table then says *nothing matches*, so the FILTER looks
 * broken rather than the pager.
 */
export function withCustomerFilters(
  params: URLSearchParams,
  next: CustomerFilterState,
): URLSearchParams {
  const out = new URLSearchParams();

  const pageSize = params.get('pageSize');
  if (pageSize) out.set('pageSize', pageSize);

  if (next.search) out.set('search', next.search);
  if (next.sort) out.set('sort', next.sort);
  if (next.dir) out.set('dir', next.dir);
  for (const company of next.company.slice(0, MAX_COMPANIES)) out.append('company', company);
  if (next.noCompany) out.set('noCompany', 'true');
  if (next.createdFrom) out.set('createdFrom', next.createdFrom);
  if (next.createdTo) out.set('createdTo', next.createdTo);

  return out;
}

/**
 * Whether the reader has narrowed the list.
 *
 * **The SORT is not a filter.** Ordering changes which row is first, never which
 * rows exist — so a sorted-but-unfiltered empty list is "no customers yet", not
 * "no matches", and offering to clear a sort would not bring a row back.
 */
export function isFilteringCustomers(state: CustomerFilterState): boolean {
  return (
    state.search !== '' ||
    state.company.length > 0 ||
    state.noCompany ||
    state.createdFrom !== '' ||
    state.createdTo !== ''
  );
}

/** What the filter badge counts: facets the reader ticked, not the search box
 *  beside it and not the sort. */
export function customerFacetCount(state: CustomerFilterState): number {
  return (
    state.company.length +
    (state.noCompany ? 1 : 0) +
    (state.createdFrom ? 1 : 0) +
    (state.createdTo ? 1 : 0)
  );
}

/** The request. One place, so the query key and the fetch cannot disagree. */
export function toCustomerListParams(
  state: CustomerFilterState,
  page: number,
  pageSize: number,
): CustomerListParams {
  return {
    page,
    pageSize,
    ...(state.search ? { search: state.search } : {}),
    ...(state.sort ? { sort: state.sort } : {}),
    ...(state.dir ? { dir: state.dir } : {}),
    ...(state.company.length > 0 ? { company: state.company } : {}),
    ...(state.noCompany ? { noCompany: true } : {}),
    ...(state.createdFrom ? { createdFrom: state.createdFrom } : {}),
    ...(state.createdTo ? { createdTo: state.createdTo } : {}),
  };
}
