import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button/Button';
import { Dropdown } from '../../components/Dropdown/Dropdown';
import { Input } from '../../components/Input/Input';
import { IconClose, IconFilter, IconSearch } from '../../icons/icons';
import {
  COMMUNICATION_CHANNELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
} from '../../lib/api-types.provisional';
import { cx } from '../../lib/cx';

import styles from './TicketFilterBar.module.css';
import {
  activeFilterCount,
  STATUS_VALUES,
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

  /** Rendered on the *All* tab. Absent while the first page is loading. */
  totalCount?: number | undefined;
}

export function TicketFilterBar({ filters, onChange, totalCount }: TicketFilterBarProps) {
  const { t } = useTranslation('tickets');
  const { t: tc } = useTranslation('common');
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();

  const [draft, setDraft] = useDebounced(filters.search, 300, (search) =>
    onChange({ ...filters, search }),
  );

  const active = activeFilterCount(filters);

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

  const options = (values: readonly string[], prefix: string) =>
    values.map((value) => ({ value, label: t(`${prefix}.${value}`) }));

  return (
    <div className={styles.bar}>
      {/* One tablist, and the roles are real: these are tabs by behaviour, so a
          screen reader is told so. `aria-selected` rather than a class is what
          announces which one is active. */}
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
            {/* The dot carries the status colour and nothing else, so it is
                aria-hidden: the label beside it already says which status. */}
            <span
              className={cx(styles.dot, styles[`dot${status}`])}
              aria-hidden="true"
            />
            {t(`status.${status}`)}
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        {/* `Input` carries NO icon props — checked, not assumed — so the glyph
            and the clear button are the wrapper's, positioned with logical
            insets so they swap sides in Arabic without a second rule. Both are
            aria-hidden or labelled: the icon says nothing the placeholder does
            not, and the clear button is a real button with a name. */}
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
          text={active > 0 ? `${t('list.filter')} (${active})` : t('list.filter')}
          iconStart={<IconFilter size={16} />}
          onClick={() => setPanelOpen((open) => !open)}
          aria-expanded={panelOpen}
          aria-controls={panelId}
        />

        {active > 0 ? (
          <button
            type="button"
            className={styles.clear}
            onClick={() =>
              onChange({
                status: [],
                priority: [],
                category: [],
                channel: [],
                assignee: '',
                escalated: undefined,
                /* The SEARCH SURVIVES Clear all, deliberately. It is a question
                   the reader typed, not a facet they ticked — clearing it with
                   the facets would throw away the thing they are most likely
                   still looking for, and the box has its own clear. */
                search: filters.search,
              })
            }
          >
            {t('list.clearFilters')}
          </button>
        ) : null}
      </div>

      {panelOpen ? (
        <div className={styles.panel} id={panelId}>
          <Dropdown
            multiple
            label={t('list.column.status')}
            options={options(STATUS_VALUES, 'status')}
            value={filters.status}
            onChange={(status) => onChange({ ...filters, status })}
            placeholder={t('list.anyValue')}
            size="md"
          />

          <Dropdown
            multiple
            label={t('list.column.priority')}
            options={options(TICKET_PRIORITIES, 'priority')}
            value={filters.priority}
            onChange={(priority) => onChange({ ...filters, priority })}
            placeholder={t('list.anyValue')}
            size="md"
          />

          <Dropdown
            multiple
            label={t('field.category')}
            options={options(TICKET_CATEGORIES, 'category')}
            value={filters.category}
            onChange={(category) => onChange({ ...filters, category })}
            placeholder={t('list.anyValue')}
            size="md"
          />

          <Dropdown
            multiple
            label={t('list.column.channel')}
            options={options(COMMUNICATION_CHANNELS, 'channel')}
            value={filters.channel}
            onChange={(channel) => onChange({ ...filters, channel })}
            placeholder={t('list.anyValue')}
            size="md"
          />

          {/* Assignee is single-select and its two special values are NOT ids.
              `me` is resolved from the token by the server, so this control
              never sends the signed-in user's own id — a client that did would
              be one URL edit away from reading somebody else's queue. */}
          <Dropdown
            label={t('list.column.assignee')}
            options={[
              { value: 'me', label: t('list.assignedToMe') },
              { value: 'unassigned', label: t('list.unassigned') },
            ]}
            value={filters.assignee || null}
            onChange={(assignee) => onChange({ ...filters, assignee: assignee ?? '' })}
            placeholder={t('list.anyValue')}
            clearable
            size="md"
          />

          {/* THREE STATES, and a checkbox only has two — so this is a select.
              Absent means "any" and `false` means "not escalated"; a checkbox
              would collapse the first two and make every unfiltered list a
              request for non-escalated tickets. */}
          <Dropdown
            label={t('list.escalatedFilter')}
            options={[
              { value: 'true', label: t('list.escalatedOnly') },
              { value: 'false', label: t('list.notEscalated') },
            ]}
            value={filters.escalated === undefined ? null : String(filters.escalated)}
            onChange={(value) =>
              onChange({
                ...filters,
                escalated: value === null ? undefined : value === 'true',
              })
            }
            placeholder={t('list.anyValue')}
            clearable
            size="md"
          />
        </div>
      ) : null}
    </div>
  );
}
