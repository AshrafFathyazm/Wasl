import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import { IconClose, IconFilter, IconSearch } from '../../icons/icons';
import {
  COMMUNICATION_CHANNELS,
  TICKET_PRIORITIES,
} from '../../lib/api-types.provisional';
import { cx } from '../../lib/cx';
import { formatNumber, type Lang } from '../../lib/formatters';

import styles from './TicketFilterBar.module.css';
import {
  activeFilterCount,
  TAB_STATUSES,
  type FilterState,
} from './ticketFilters';

/* ---------------------------------------------------------------------------
 * `015` frontend half — the tabs, the search box, and the filter panel.
 *
 * The design is `docs/sdd/design/screens/03-tickets-list.md`: a tab strip, a
 * search input with a 300ms debounce, and a Filters button. Nothing here holds
 * filter state — every control calls `onChange` with the whole next
 * `FilterState`, and the PAGE writes it to the URL (ADR-011 §2, AC-14). A
 * local copy would drift the moment somebody used the back button.
 *
 * The one exception is the search text, and it has to be: see `useDebounced`.
 * ------------------------------------------------------------------------- */

/**
 * The search box is the only control that keeps its own value, and the reason is
 * the debounce rather than convenience.
 *
 * Typing straight into the URL would push a history entry per keystroke — a back
 * button that walks letter by letter — and fire a request per keystroke. So the
 * input is local and the URL is written 300ms after the last one.
 *
 * **It re-syncs when the incoming value changes**, which is what makes the back
 * button and *Clear all* work: without that effect the box would keep showing a
 * term the list is no longer filtered by, and the reader would believe the
 * search is broken.
 */
function useDebounced(
  value: string,
  delayMs: number,
  onSettled: (next: string) => void,
): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value);
  const settled = useRef(value);
  const callback = useRef(onSettled);

  callback.current = onSettled;

  useEffect(() => {
    if (value !== settled.current) {
      settled.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => {
    if (draft === settled.current) return;

    const timer = setTimeout(() => {
      settled.current = draft;
      callback.current(draft);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [draft, delayMs]);

  return [draft, setDraft];
}

export interface TicketFilterBarProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;

  /** The page's own title block, rendered INSIDE this component's first row.
   *  The frames put the search box and the filter button on the same line as
   *  the heading — one flex row owns both ends, and the alternative is two
   *  components coordinating a baseline through the stylesheet. The page still
   *  owns what the heading says; this only owns where it sits. */
  heading?: ReactNode | undefined;

  /** Rendered on the *All* tab. Absent while the counts are still landing. */
  totalCount?: number | undefined;

  /** One count per status, keyed on the WIRE value. Absent entries render no
   *  number rather than a zero — a chip reading 0 while its count is in flight
   *  says something false about the queue. The page fetches these; this
   *  component never asks for anything (ADR-011 §4). */
  statusCounts?: Record<string, number | undefined> | undefined;
}

export function TicketFilterBar({
  filters,
  onChange,
  totalCount,
  statusCounts,
  heading,
}: TicketFilterBarProps) {
  const { t, i18n } = useTranslation('tickets');
  const { t: tc } = useTranslation('common');
  /* BR-8.13 — the badge is a count, so its digits stay Latin in both languages. */
  const lang: Lang = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();

  const [draft, setDraft] = useDebounced(filters.search, 300, (search) =>
    onChange({ ...filters, search }),
  );

  const active = activeFilterCount(filters);

  /* THE PANEL EDITS A DRAFT, and تطبيق is what writes it. The old panel applied
   * every click immediately, which fired a request per chip and made "I meant
   * those three together" impossible to express. The draft is snapshotted when
   * the panel OPENS — deliberately not kept in sync while it is open, so an
   * applied chip removed from the strip outside does not yank a value out of a
   * form mid-edit. */
  const [panelDraft, setPanelDraft] = useState<{
    priority: readonly string[];
    channel: readonly string[];
  }>({ priority: filters.priority, channel: filters.channel });

  useEffect(() => {
    if (panelOpen) {
      setPanelDraft({ priority: filters.priority, channel: filters.channel });
    }
    /* filters is read at the moment of opening, not subscribed to. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen]);

  const toggleDraft = (key: 'priority' | 'channel', value: string) =>
    setPanelDraft((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((v) => v !== value)
        : [...current[key], value],
    }));

  /* The tabs write ONLY status, and they write it as a single value rather than
   * adding to whatever the panel selected. A tab is a "show me this" shortcut;
   * if it appended, clicking Open after choosing Resolved in the panel would
   * silently mean "Open OR Resolved" and the tab strip would show two things
   * selected with no way to tell which click did what. */
  const isTab = (status: string) =>
    filters.status.length === 1 && filters.status[0] === status;

  const allSelected = filters.status.length === 0;

  const setStatus = (status: string | null) =>
    onChange({ ...filters, status: status === null ? [] : [status] });

  /* ==========================================================================
   * The applied-filter chips
   * ==========================================================================
   * Derived from `filters` on every render — there is no second copy of the
   * filter state to fall out of step with the URL, which is the whole reason
   * `readFilters` exists.
   *
   * `remove` writes the same shape `onChange` always takes, so a chip's × is
   * the same operation as clearing a value in the panel and the URL ends up
   * identical either way.
   * ======================================================================== */
  const group = (
    values: readonly string[],
    label: string,
    prefix: string,
    write: (next: readonly string[]) => FilterState,
  ) =>
    values.map((value) => ({
      key: `${label}:${value}`,
      label: `${label}: ${t(`${prefix}.${value}`)}`,
      remove: () => onChange(write(values.filter((v) => v !== value))),
    }));

  const appliedChips: Array<{ key: string; label: string; remove: () => void }> = [
    ...group(filters.status, t('list.column.status'), 'status', (status) => ({
      ...filters,
      status,
    })),
    ...group(filters.priority, t('list.column.priority'), 'priority', (priority) => ({
      ...filters,
      priority,
    })),
    ...group(filters.category, t('list.column.category'), 'category', (category) => ({
      ...filters,
      category,
    })),
    ...group(filters.channel, t('list.column.channel'), 'channel', (channel) => ({
      ...filters,
      channel,
    })),
    ...(filters.assignee === ''
      ? []
      : [
          {
            key: 'assignee',
            label: `${t('list.column.assignee')}: ${
              filters.assignee === 'me'
                ? t('list.assignedToMe')
                : filters.assignee === 'unassigned'
                  ? t('list.unassigned')
                  : filters.assignee
            }`,
            remove: () => onChange({ ...filters, assignee: '' }),
          },
        ]),
    ...(filters.escalated === undefined
      ? []
      : [
          {
            key: 'escalated',
            label: `${t('list.escalatedFilter')}: ${
              filters.escalated ? t('list.escalatedOnly') : t('list.notEscalated')
            }`,
            remove: () => onChange({ ...filters, escalated: undefined }),
          },
        ]),
  ];

  return (
    <div className={styles.bar}>
      {/* ======================================================================
          ROW 1 — the heading at the start, search and تصفية at the end.
          The frames put them on ONE line; two stacked rows was the wrong shape.
          ====================================================================== */}
      <div className={styles.headRow}>
        {heading === undefined ? null : <div className={styles.heading}>{heading}</div>}

        <div className={styles.toolbar}>
          <div className={styles.searchField}>
            <IconSearch size={16} className={styles.searchIcon} aria-hidden="true" />
            <Input
              label={t('list.search')}
              labelHidden
              placeholder={t('list.search')}
              value={draft}
              onChange={setDraft}
            />
            {draft ? (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setDraft('')}
                aria-label={tc('dismiss')}
              >
                <IconClose size={14} />
              </button>
            ) : null}
          </div>

          <Button
            buttonType="secondary-outline"
            /* THE COUNT IS A BADGE, NOT PART OF THE LABEL — the accessible name
               stays "Filter" whether three filters are on or none, and the number
               sits in a filled circle as the frames draw it. */
            text={t('list.filter')}
            iconStart={<IconFilter size={16} />}
            {...(active > 0
              ? {
                  iconEnd: (
                    <span className={styles.filterBadge}>
                      {formatNumber(active, lang)}
                    </span>
                  ),
                }
              : {})}
            onClick={() => setPanelOpen((open) => !open)}
            aria-expanded={panelOpen}
            aria-controls={panelId}
          />

          {/* ==================================================================
              THE PANEL — the frames' shape: chips, a date range, مسح الكل,
              and تطبيق. What it REPLACED is worth recording: six multi-select
              dropdowns, applied on every click.

              WHAT IS DELIBERATELY NOT HERE ANY MORE: category, assignee and
              escalated. The frames' panel carries priority, channel and the
              date range only. All three remain real filters — the URL reads
              them, the applied-chip strip shows and removes them — the panel
              just no longer offers controls for them. Removing capability from
              a surface is a design decision the product owner made by frame,
              recorded here rather than resolved silently.
              ================================================================== */}
          {panelOpen ? (
            <div className={styles.panel} id={panelId}>
              <fieldset className={styles.facet}>
                <legend className={styles.facetLabel}>
                  {t('list.column.priority')}
                </legend>
                <div className={styles.facetChips}>
                  {TICKET_PRIORITIES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={cx(
                        styles.facetChip,
                        panelDraft.priority.includes(value) && styles.facetChipOn,
                      )}
                      /* A toggle, and it says so — a chip that only LOOKS
                         pressed is silent to anyone not looking at it. */
                      aria-pressed={panelDraft.priority.includes(value)}
                      onClick={() => toggleDraft('priority', value)}
                    >
                      {t(`priority.${value}`)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className={styles.facet}>
                <legend className={styles.facetLabel}>
                  {t('list.column.channel')}
                </legend>
                <div className={styles.facetChips}>
                  {COMMUNICATION_CHANNELS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={cx(
                        styles.facetChip,
                        panelDraft.channel.includes(value) && styles.facetChipOn,
                      )}
                      aria-pressed={panelDraft.channel.includes(value)}
                      onClick={() => toggleDraft('channel', value)}
                    >
                      {t(`channel.${value}`)}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* DRAWN AND DISABLED, the escalate-menu-item precedent: the
                  frames draw a created-date range and GET /api/tickets accepts
                  no createdFrom/createdTo — measured against the controller,
                  which binds status, priority, category, channel, assignee,
                  escalated, search and nothing else. Wiring these to a
                  client-side filter would lie about the data (it can only see
                  the page it has), so they are inert with the reason attached
                  until 015's backend grows the parameters. */}
              <div className={styles.dates}>
                <Input
                  label={t('list.createdFrom')}
                  value={''}
                  onChange={() => {}}
                  placeholder={t('list.datePlaceholder')}
                  disabled
                  helperText={t('list.dateUnavailable')}
                />
                <Input
                  label={t('list.createdTo')}
                  value={''}
                  onChange={() => {}}
                  placeholder={t('list.datePlaceholder')}
                  disabled
                />
              </div>

              <div className={styles.panelFooter}>
                <button
                  type="button"
                  className={styles.clearAll}
                  onClick={() => {
                    /* CLEARS AND APPLIES IN ONE PRESS — a clear that still
                       needs تطبيق is a clear that looks broken. The SEARCH
                       survives: it is a question the reader typed, not a facet
                       they ticked, and the box has its own ×. */
                    setPanelDraft({ priority: [], channel: [] });
                    onChange({
                      status: [],
                      priority: [],
                      category: [],
                      channel: [],
                      assignee: '',
                      escalated: undefined,
                      search: filters.search,
                      /* Dates are facets and مسح الكل clears facets. */
                      createdFrom: '',
                      createdTo: '',
                    });
                  }}
                >
                  {t('list.clearAll')}
                </button>

                <Button
                  text={t('list.apply')}
                  onClick={() => {
                    onChange({
                      ...filters,
                      priority: panelDraft.priority,
                      channel: panelDraft.channel,
                    });
                    setPanelOpen(false);
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ======================================================================
          ROW 2 — the carved track, with the applied chips BESIDE it. The frames
          put an applied filter at the track's inline-end, not on a row of its
          own: the strip and what is applied to it are one thought.
          ====================================================================== */}
      <div className={styles.tabsRow}>
        <div className={styles.tabs} role="tablist" aria-label={t('list.tableLabel')}>
          <button
            type="button"
            role="tab"
            aria-selected={allSelected}
            className={cx(styles.tab, allSelected && styles.tabActive)}
            onClick={() => setStatus(null)}
          >
            {t('list.all')}
            {totalCount === undefined ? null : (
              <span className={styles.count}>{totalCount}</span>
            )}
          </button>

          {TAB_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={isTab(status)}
              className={cx(styles.tab, isTab(status) && styles.tabActive)}
              onClick={() => setStatus(isTab(status) ? null : status)}
            >
              <span
                className={cx(styles.dot, styles[`dot${status}`])}
                aria-hidden="true"
              />
              {t(`status.${status}`)}
              {statusCounts?.[status] === undefined ? null : (
                <span className={styles.count}>{statusCounts[status]}</span>
              )}
            </button>
          ))}
        </div>

        {appliedChips.length === 0 ? null : (
          <div className={styles.applied}>
            {appliedChips.map((chip) => (
              <span key={chip.key} className={styles.appliedChip}>
                {chip.label}
                <button
                  type="button"
                  className={styles.appliedRemove}
                  aria-label={tc('dropdown.remove', { label: chip.label })}
                  onClick={chip.remove}
                >
                  <IconClose size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
