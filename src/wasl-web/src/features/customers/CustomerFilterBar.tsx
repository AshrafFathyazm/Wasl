import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button/Button';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { DateField } from '../../components/DateRangePicker/DateField';
import { Input } from '../../components/Input/Input';
import { IconClose, IconFilter, IconSearch } from '../../icons/icons';
import { formatNumber, type Lang } from '../../lib/formatters';

import styles from './CustomersList.module.css';
import {
  MAX_COMPANIES,
  createdRangeIsInverted,
  customerFacetCount,
  isFilteringCustomers,
  type CustomerFilterState,
} from './customerFilters';
import { customerKeys, getCustomerCompanies } from './customers.api';

/* ============================================================================
 * The directory's search box, filter panel and applied chips. `033` §10
 * ============================================================================
 * IT HOLDS NO LIST STATE. The filters come in as props and go out as one object,
 * so the URL stays the single source (ADR-011 §2) — the same division `015` made
 * for tickets.
 *
 * IT DOES FETCH ONE THING, and the exception is written rather than assumed: the
 * COMPANY VOCABULARY. ADR-011 §4 keeps fetching at the route so a screen cannot
 * become a request waterfall — and this query is not on the screen's critical
 * path at all. It runs only while the panel is open, it is keyed by its own
 * search term, and the list it fills is the panel's own content. Lifting it to
 * the page would make the page hold a debounced input's state for a control it
 * does not render.
 * ========================================================================= */

const COMPANY_DEBOUNCE_MS = 250;

export interface CustomerFilterBarProps {
  filters: CustomerFilterState;
  onChange: (next: CustomerFilterState) => void;
  lang: Lang;

  /** The page's title block and its primary action, rendered INSIDE this bar's
   *  first row.
   *
   *  THE HEADING RIDES IN THE BAR — the same division `026` made, and for the
   *  reason a screenshot showed here: with the toolbar on a row of its own, the
   *  search box sat under the title against the inline-end with the whole
   *  opposite half empty, and the two list screens stopped looking like one
   *  product. One flex row owns both ends. The PAGE still authors every word;
   *  this only owns where they sit. */
  heading?: ReactNode | undefined;
  actions?: ReactNode | undefined;
}

export function CustomerFilterBar({
  filters,
  onChange,
  lang,
  heading,
  actions,
}: CustomerFilterBarProps) {
  const { t } = useTranslation('customers');

  /* THE SEARCH BOX KEEPS A LOCAL DRAFT, and it is the one exception to
   * "the URL is the state" — forced, and `015` measured why: typing into the URL
   * pushes a history entry per keystroke and fires a request per keystroke. It
   * re-syncs on an incoming change, which is what makes the back button and
   * "clear" work rather than leaving a term on screen that the list is no longer
   * filtered by. */
  const [draft, setDraft] = useState(filters.search);
  useEffect(() => setDraft(filters.search), [filters.search]);

  const debounce = useRef<number | undefined>(undefined);
  const onSearch = (value: string) => {
    setDraft(value);
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      onChange({ ...filters, search: value.trim() });
    }, 300);
  };

  const [open, setOpen] = useState(false);
  const panelId = useId();

  /* THE PANEL EDITS A DRAFT AND «تطبيق» IS THE WRITE, which `026` established
   * after a panel that applied every click fired a request per checkbox and made
   * "I meant those three together" impossible to express. Snapshotted when the
   * panel OPENS, deliberately not kept in sync while it is open. */
  const [panel, setPanel] = useState({
    company: filters.company,
    noCompany: filters.noCompany,
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
  });

  const openPanel = () => {
    setPanel({
      company: filters.company,
      noCompany: filters.noCompany,
      createdFrom: filters.createdFrom,
      createdTo: filters.createdTo,
    });
    setOpen(true);
  };

  /* The company search, debounced — see the header note on why it lives here. */
  const [companyTerm, setCompanyTerm] = useState('');
  const [companyQuery, setCompanyQuery] = useState('');
  const companyDebounce = useRef<number | undefined>(undefined);

  const onCompanyTerm = (value: string) => {
    setCompanyTerm(value);
    window.clearTimeout(companyDebounce.current);
    companyDebounce.current = window.setTimeout(
      () => setCompanyQuery(value.trim()),
      COMPANY_DEBOUNCE_MS,
    );
  };

  const companies = useQuery({
    queryKey: customerKeys.companies(companyQuery),
    queryFn: ({ signal }) =>
      getCustomerCompanies(companyQuery ? { search: companyQuery } : {}, signal),
    enabled: open,
    staleTime: 60_000,
  });

  const offered = companies.data?.items ?? [];

  /* ALREADY-SELECTED NAMES STAY ON SCREEN even when the search term no longer
   * matches them — otherwise ticking Acme and then typing "gulf" makes the Acme
   * checkbox vanish while the filter is still applied, and the reader cannot
   * untick what they cannot see. */
  const shown = [...new Set([...panel.company, ...offered])];

  const toggleCompany = (name: string, on: boolean) => {
    const next = on
      ? [...new Set([...panel.company, name])].slice(0, MAX_COMPANIES)
      : panel.company.filter((value) => value !== name);
    setPanel((state) => ({ ...state, company: next }));
  };

  /* See the same call in `TicketFilterBar`: the panel refuses to build a range
     the endpoint refuses, and the endpoint stays the authority. */
  const draftRangeInverted = createdRangeIsInverted(panel.createdFrom, panel.createdTo);

  const apply = () => {
    onChange({ ...filters, ...panel });
    setOpen(false);
  };

  const clearAll = () => {
    setPanel({ company: [], noCompany: false, createdFrom: '', createdTo: '' });
  };

  /* ── the applied chips, derived from the FILTERS and never from the panel:
   * they describe what the list is showing, not what the panel is about to
   * write. Each one removes exactly itself. */
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...filters.company.map((name) => ({
      key: `company:${name}`,
      label: `${t('list.column.company')}: ${name}`,
      remove: () =>
        onChange({
          ...filters,
          company: filters.company.filter((value) => value !== name),
        }),
    })),
    ...(filters.noCompany
      ? [
          {
            key: 'noCompany',
            label: t('list.noCompany'),
            remove: () => onChange({ ...filters, noCompany: false }),
          },
        ]
      : []),
    ...(['createdFrom', 'createdTo'] as const).flatMap((key) =>
      filters[key] === ''
        ? []
        : [
            {
              key,
              /* dd/mm/yyyy — an ISO day in a chip is the wire format shown to a
                 person. */
              label: `${t(key === 'createdFrom' ? 'list.createdFrom' : 'list.createdTo')}: ${filters[
                key
              ]
                .split('-')
                .reverse()
                .join('/')}`,
              remove: () => onChange({ ...filters, [key]: '' }),
            },
          ],
    ),
  ];

  const facets = customerFacetCount(filters);

  return (
    <div className={styles.bar}>
      <div className={styles.headRow}>
        {heading === undefined ? null : <div className={styles.heading}>{heading}</div>}

        {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
      </div>

      {/* ROW 2 — the chips at the start, search and تصفية at the end. It is
          UNCONDITIONAL now: the toolbar is always on it, and it used to render
          only when a chip existed. */}
      <div className={styles.tabsRow}>
        {chips.length === 0 ? null : (
          <div className={styles.chips}>
            {chips.map((chip) => (
              <span key={chip.key} className={styles.chip} dir="auto">
                {chip.label}
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={t('list.removeFilter', { label: chip.label })}
                  onClick={chip.remove}
                >
                  <IconClose size={12} aria-hidden="true" />
                </button>
              </span>
            ))}

            {isFilteringCustomers(filters) ? (
              <button
                type="button"
                className={styles.clearAll}
                onClick={() =>
                  onChange({
                    search: '',
                    sort: filters.sort,
                    dir: filters.dir,
                    company: [],
                    noCompany: false,
                    createdFrom: '',
                    createdTo: '',
                  })
                }
              >
                {/* THE SORT SURVIVES. Clearing filters is about which rows exist;
                  the order they arrive in is a different question, and resetting
                  it would undo a click the reader made somewhere else. */}
                {t('list.clearFilters')}
              </button>
            ) : null}
          </div>
        )}

        <div className={styles.toolbar}>
          <div className={styles.searchField}>
            <IconSearch size={16} className={styles.searchIcon} aria-hidden="true" />
            <Input
              label={t('list.search')}
              labelHidden
              placeholder={t('list.searchPlaceholder')}
              value={draft}
              onChange={onSearch}
              /* `Input` accepts text | email | password — not `search`, checked in
               the primitive rather than assumed. The clear button beside it is
               this wrapper's own, which is what `search` would have given. */
            />
            {draft === '' ? null : (
              <button
                type="button"
                className={styles.searchClear}
                aria-label={t('list.clearSearch')}
                onClick={() => {
                  setDraft('');
                  window.clearTimeout(debounce.current);
                  onChange({ ...filters, search: '' });
                }}
              >
                <IconClose size={14} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className={styles.popWrap}>
            {/* THE PRIMITIVE, not a hand-rolled button — see the stylesheet's
              note where `.filterBtn` used to be. */}
            <Button
              buttonType="secondary-outline"
              text={t('list.filter')}
              iconStart={<IconFilter size={16} />}
              {...(facets === 0
                ? {}
                : {
                    iconEnd: (
                      <span className={styles.filterBadge}>
                        {formatNumber(facets, lang)}
                      </span>
                    ),
                  })}
              onClick={() => (open ? setOpen(false) : openPanel())}
              aria-expanded={open}
              aria-controls={panelId}
            />

            {open ? (
              <div
                className={styles.panel}
                id={panelId}
                role="dialog"
                aria-label={t('list.filter')}
              >
                <div className={styles.facet}>
                  <span className={styles.facetLabel}>{t('list.column.company')}</span>

                  <label className={styles.companySearch}>
                    <IconSearch size={14} aria-hidden="true" />
                    <input
                      type="text"
                      value={companyTerm}
                      onChange={(event) => onCompanyTerm(event.target.value)}
                      placeholder={t('list.companySearch')}
                      aria-label={t('list.companySearch')}
                    />
                  </label>

                  <div className={styles.companyList}>
                    {companies.isPending ? (
                      <p className={styles.facetNote}>{t('list.loading')}</p>
                    ) : shown.length === 0 ? (
                      <p className={styles.facetNote}>{t('list.noCompanies')}</p>
                    ) : (
                      shown.map((name) => (
                        <Checkbox
                          key={name}
                          label={name}
                          checked={panel.company.includes(name)}
                          onChange={(on) => toggleCompany(name, on)}
                        />
                      ))
                    )}

                    {/* OFFERED ONLY WHEN IT WOULD MATCH SOMETHING — the server
                      answers that with its own EXISTS, because a capped list
                      cannot tell you whether an absent name exists beyond it. */}
                    {companies.data?.hasUncompanied ? (
                      <Checkbox
                        label={t('list.noCompany')}
                        checked={panel.noCompany}
                        onChange={(on) =>
                          setPanel((state) => ({ ...state, noCompany: on }))
                        }
                      />
                    ) : null}
                  </div>
                </div>

                <div className={styles.facet}>
                  <span className={styles.facetLabel}>{t('list.column.created')}</span>
                  <div className={styles.dateRow}>
                    <DateField
                      lang={lang}
                      label={t('list.createdFrom')}
                      value={panel.createdFrom}
                      onChange={(iso) =>
                        setPanel((state) => ({ ...state, createdFrom: iso }))
                      }
                    />
                    <DateField
                      lang={lang}
                      label={t('list.createdTo')}
                      value={panel.createdTo}
                      onChange={(iso) =>
                        setPanel((state) => ({ ...state, createdTo: iso }))
                      }
                    />
                  </div>
                  {/* AN INVERTED RANGE IS AN EMPTY PAGE, not an error — `033` §5.4.
                    Said here so the reader knows the list is right and their
                    range is backwards, which `totalCount: 0` alone does not. */}
                  {panel.createdFrom !== '' &&
                  panel.createdTo !== '' &&
                  panel.createdTo < panel.createdFrom ? (
                    <p className={styles.facetNote}>{t('list.rangeInverted')}</p>
                  ) : null}
                </div>

                <div className={styles.panelFoot}>
                  <button type="button" className={styles.clearAll} onClick={clearAll}>
                    {t('list.clearAll')}
                  </button>
                  <Button
                    text={t('list.apply')}
                    disabled={draftRangeInverted}
                    onClick={apply}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
