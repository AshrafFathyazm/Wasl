import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import { Loader } from '../../components/Loader/Loader';
import { IconAddCustomer, IconCircleInfo, IconSearch } from '../../icons/icons';
import type { CustomerListItem } from '../../lib/api-types.provisional';
import { cx } from '../../lib/cx';
import { useDeferredBusy } from '../../lib/useDeferredBusy';
import styles from './CreateTicket.module.css';

/* ============================================================================
 * CustomerPicker — a FEATURE COMPONENT (ADR-011 §4)
 * ============================================================================
 * IT DOES NOT FETCH. Results and handlers arrive as props; the route owns the
 * query. The picker looking up its own customers is the request-waterfall
 * pattern the rule exists to prevent, and it is the tempting shape here because
 * the search *feels* local to the picker.
 *
 * ---------------------------------------------------------------------------
 * WHAT `038` CHANGED, AND WHAT IT KEPT
 * ---------------------------------------------------------------------------
 * Changed — a result row and the selected card both show COMPANY now
 * (`companyName` was already on `CustomerListItem`, so no contract moved), and
 * «عميل جديد» is a live control instead of a disabled one with a stale reason.
 *
 * Kept — the whole keyboard model. Arrows move, Enter selects, Escape clears,
 * and the handler stays on the WRAPPER rather than on the input or the list, so
 * the caret never leaves the field while someone arrows through results.
 * `024` wrote that down; nothing about this redesign changes it.
 *
 * THE DISABLED BUTTON'S REASON HAD BEEN FALSE SINCE `032`. It read "`007` is not
 * built" while `007` was delivered and `/customers/new` had existed for three
 * features; `032` recorded that it did not act on it. That is the same shape as
 * `037`'s `icons-added.tsx`, whose stated reason for existing was also already
 * untrue — a comment explaining a limitation outlives the limitation, and
 * nobody re-reads it because it looks like it was checked.
 * ============================================================================ */

export const SEARCH_MIN_CHARS = 2;

interface CustomerPickerProps {
  /** The debounced term is the route's; this is what the user is typing. */
  term: string;
  onTermChange: (term: string) => void;

  results: readonly CustomerListItem[];
  isSearching: boolean;
  /** True once a search has actually run for the current term. Without it the
   *  empty state flashes before the first request resolves. */
  hasSearched: boolean;

  selected: CustomerListItem | null;
  onSelect: (customer: CustomerListItem) => void;
  onClear: () => void;

  /** Opens the create-customer sheet. The ROUTE owns the sheet — this component
   *  neither renders it nor knows it is a sheet. */
  onNewCustomer: () => void;

  error?: string | undefined;

  /** The route focuses this on a failed submit (AC-19). A ref would not survive
   *  the component swapping between the search field and the selected card, so
   *  the id is the handle and `document.getElementById` is the lookup. */
  inputId: string;
}

/** The avatar glyph. The first CHARACTER of the name, which is what the design
 *  draws — not initials of every word, which would be two letters of Arabic
 *  jammed together and unreadable at 32px. */
function initial(name: string): string {
  return [...name.trim()][0] ?? '';
}

export function CustomerPicker({
  term,
  onTermChange,
  results,
  isSearching,
  hasSearched,
  selected,
  onSelect,
  onClear,
  onNewCustomer,
  error,
  inputId,
}: CustomerPickerProps) {
  const { t } = useTranslation();
  const listId = useId();
  /* The 150ms appear delay and the 400ms floor, from one place. */
  const { visible: showSearching } = useDeferredBusy(isSearching);
  const [activeIndex, setActiveIndex] = useState(0);

  const header = (
    <div className={styles.customerHead}>
      <span className={styles.fieldLabel}>
        {t('tickets:new.customerSection')}
        <span className={styles.required} aria-hidden="true">
          {'*'}
        </span>
      </span>
      {/* `secondary-outline`, not the mock-up's borderless text link.
          `ButtonType` is `primary | secondary-outline | danger` and adding a
          fourth variant to a frozen primitive for one call site is a change
          every screen inherits — ADR-011 §3 promotes on the second consumer,
          with a written reason, and there is one consumer. The outline is a
          little heavier than the mock-up draws; that is the trade, and it is
          recorded rather than resolved by growing the component. */}
      <Button
        buttonType="secondary-outline"
        text={t('tickets:new.newCustomer')}
        iconStart={<IconAddCustomer size={16} />}
        onClick={onNewCustomer}
      />
    </div>
  );

  if (selected) {
    return (
      <div className={styles.customerSection}>
        {header}

        <div className={styles.selected}>
          <span className={styles.avatar} aria-hidden="true">
            {initial(selected.fullName)}
          </span>
          <span className={styles.selectedBody}>
            {/* Bidi isolation: the block follows the interface, the name follows
                itself. A customer name may be Arabic inside an English interface
                and the reverse (ADR-007 §8). */}
            <span className={styles.selectedName}>
              <bdi>{selected.fullName}</bdi>
            </span>
            <span className={styles.selectedMeta}>
              {selected.email === null ? null : (
                <bdi className={styles.selectedEmail}>{selected.email}</bdi>
              )}
              {/* THE SEPARATOR BELONGS TO THE COMPANY, not between two spans
                  that may each be absent. Rendered independently it becomes a
                  leading dot on a customer with no email — AC-9's case, and the
                  reason that criterion names it. */}
              {selected.companyName === null ? null : (
                <>
                  {selected.email === null ? null : (
                    <span className={styles.metaDot} aria-hidden="true" />
                  )}
                  <bdi>{selected.companyName}</bdi>
                </>
              )}
            </span>
          </span>
          <Button
            buttonType="secondary-outline"
            text={t('tickets:new.changeCustomer')}
            onClick={onClear}
          />
        </div>
      </div>
    );
  }

  const showResults = results.length > 0;
  const showEmpty =
    hasSearched &&
    !isSearching &&
    results.length === 0 &&
    term.trim().length >= SEARCH_MIN_CHARS;

  /* Arrow keys move, Enter selects, Escape clears the term. A list that only
   * responds to clicks is a div wearing a listbox's clothes — `009`'s
   * accessibility table asks for the real thing. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!showResults) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      const picked = results[activeIndex];
      if (picked) {
        event.preventDefault();
        onSelect(picked);
      }
    } else if (event.key === 'Escape') {
      onTermChange('');
    }
  };

  return (
    /* The handler sits on this wrapper, NOT on the input and not on the list.
     *
     * React events bubble, so a keydown in the input reaches it — and the input
     * keeps focus while the user arrows through results, which is what makes the
     * list usable without losing the caret. Putting it on the <ul> would require
     * the list to be focusable, which would move focus out of the field on the
     * first arrow key.
     *
     * It also avoids adding an `onKeyDown` prop to `Input`, whose props table is
     * frozen by `023`. */
    <div className={styles.customerSection} onKeyDown={onKeyDown}>
      {header}

      <div className={styles.searchField}>
        <Input
          id={inputId}
          /* The visible label is the section heading above, so the field's own
             label is hidden visually and kept for assistive technology. A
             placeholder disappears the moment the user types, and on a search
             field that means someone listening loses the field's name halfway
             through using it. */
          label={t('tickets:new.customerSection')}
          labelHidden
          placeholder={t('tickets:new.searchPlaceholder')}
          value={term}
          onChange={onTermChange}
          error={error}
          inputMode="text"
        />
        <span
          className={styles.searchSpinner}
          /* Inside the field, not over the page: the rest of the form stays
             readable while a search runs. */
          aria-hidden={!showSearching}
        >
          {/* BARS, not converge (029). design/loaders.md §7 gives debounced
              search this shape for one reason: three 2px bars occupy the
              search icon's own footprint, so the field does not reflow when
              the icon is replaced. Converge is 52px of travel and would push
              the input's text as it appeared and again as it left.

              Gated, so a search answering in 90ms paints nothing at all. */}
          {showSearching ? (
            <Loader variant="bars" size="sm" />
          ) : (
            <IconSearch size={16} />
          )}
        </span>
      </div>

      {showResults ? (
        <ul
          id={listId}
          className={styles.results}
          role="listbox"
          aria-label={t('tickets:new.findCustomer')}
        >
          {results.map((customer, index) => (
            <li
              key={customer.id}
              role="option"
              aria-selected={index === activeIndex}
              className={cx(styles.result, index === activeIndex && styles.resultActive)}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(customer)}
            >
              <span className={styles.avatar} aria-hidden="true">
                {initial(customer.fullName)}
              </span>
              <span className={styles.resultBody}>
                <span className={styles.resultName}>
                  <bdi>{customer.fullName}</bdi>
                </span>
                <span className={styles.resultMeta}>
                  <bdi>{customer.email ?? customer.phone ?? ''}</bdi>
                </span>
              </span>
              {/* Absent, not empty — a private individual has no company, and a
                  blank cell at the row's end reads as data that failed to
                  load. */}
              {customer.companyName === null ? null : (
                <span className={styles.resultCompany}>
                  <bdi>{customer.companyName}</bdi>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {showEmpty ? (
        <div className={styles.empty}>
          <IconCircleInfo size={16} aria-hidden="true" />
          <span>{t('tickets:new.noMatchesHint')}</span>
        </div>
      ) : null}
    </div>
  );
}
