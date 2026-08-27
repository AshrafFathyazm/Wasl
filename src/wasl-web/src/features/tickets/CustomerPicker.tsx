import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import { Loader } from '../../components/Loader/Loader';
import { IconAdd, IconCustomer, IconSearch } from '../../icons/icons';
import type { CustomerListItem } from '../../lib/api-types.provisional';
import { cx } from '../../lib/cx';
import styles from './CreateTicket.module.css';

/* ============================================================================
 * CustomerPicker — a FEATURE COMPONENT (ADR-011 §4)
 * ============================================================================
 * IT DOES NOT FETCH. Results and handlers arrive as props; the route owns the
 * query. The picker looking up its own customers is the request-waterfall
 * pattern the rule exists to prevent, and it is the tempting shape here because
 * the search *feels* local to the picker.
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

  error?: string | undefined;
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
  error,
}: CustomerPickerProps) {
  const { t } = useTranslation();
  const listId = useId();
  const [activeIndex, setActiveIndex] = useState(0);

  if (selected) {
    return (
      <div className={styles.selected}>
        <IconCustomer size={18} />
        <span className={styles.selectedBody}>
          {/* Bidi isolation: the block follows the interface, the name follows
              itself. A customer name may be Arabic inside an English interface
              and the reverse (ADR-007 §8). */}
          <span className={styles.selectedName}>
            <bdi>{selected.fullName}</bdi>
          </span>
          <span className={styles.selectedMeta} title={selected.email ?? undefined}>
            <bdi>{selected.email ?? ''}</bdi>
          </span>
        </span>
        <Button
          buttonType="secondary-outline"
          text={t('tickets:new.changeCustomer')}
          onClick={onClear}
        />
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
    <div onKeyDown={onKeyDown}>
      <div className={styles.searchRow}>
        <div className={styles.searchField}>
          <Input
            /* The visible label IS the placeholder, per the screen spec — so the
               real label is hidden visually and kept for assistive technology. A
               placeholder disappears the moment the user types, and on a search
               field that means someone listening loses the field's name halfway
               through using it. */
            label={t('tickets:new.customerSection')}
            labelHidden
            placeholder={t('tickets:new.findCustomer')}
            value={term}
            onChange={onTermChange}
            error={error}
            inputMode="text"
          />
          <span
            className={styles.searchSpinner}
            /* Inside the field, not over the page: the rest of the form stays
               readable while a search runs. */
            aria-hidden={!isSearching}
          >
            {isSearching ? <Loader size="sm" /> : <IconSearch size={16} />}
          </span>
        </div>

        {/* `007` is not built (spec Q-3). Visibly unavailable with the reason,
            never a link to nowhere. */}
        <Button
          buttonType="secondary-outline"
          text={t('customers:new')}
          iconStart={<IconAdd size={16} />}
          disabled
        />
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
              <span className={styles.resultName}>
                <bdi>{customer.fullName}</bdi>
              </span>
              <span className={styles.resultMeta}>
                <bdi>{[customer.email, customer.phone].filter(Boolean).join(' · ')}</bdi>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {showEmpty ? (
        <div className={styles.empty}>
          <IconSearch size={16} />
          <span>{t('tickets:new.noMatches')}</span>
          <span className={styles.linkDisabled}>{t('customers:new')}</span>
          <span>{t('tickets:new.newCustomerUnavailable')}</span>
        </div>
      ) : null}
    </div>
  );
}
