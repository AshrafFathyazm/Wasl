import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { IconCheck, IconChevronDown, IconClose, IconSearch } from '../../icons/icons';
import { cx } from '../../lib/cx';
import { formatNumber, type Lang } from '../../lib/formatters';
import { Skeleton } from '../Loader/Skeleton';
import styles from './Dropdown.module.css';
import { useMenuSurface } from './useMenuSurface';

/* ============================================================================
 * Dropdown — `031`
 * ============================================================================
 * The Abyan Design System's Dropdown, built as the `component-inventory.md`
 * primitive named *Select*. NOT a ninth primitive: that row already required
 * "default, open, focus, disabled, error, empty option, multi-select" and named
 * "category, priority, channel, assignee, filters" as its consumers. This
 * finishes it. Eight before, eight after.
 *
 * IT REPLACES A NATIVE `<select>`, AND THAT IS A REVERSAL. `023` chose the
 * native element deliberately, for the platform's open state, keyboard model and
 * mobile picker. Ruled 2026-08-30 by the product owner. What the platform gave
 * free is now ours to hold up: the seven bindings below, the dismissal rules in
 * `useMenuSurface`, and the focus contract. What it buys is search inside the
 * menu, multi-select with chips, an option with an icon and a description, and
 * the `+N` counter — four things a native select cannot do and `015`, `027` and
 * the inventory's own multi-select row all require.
 *
 * WHAT WAS LOST IS THE MOBILE PICKER, and nothing here replaces it. A 36px
 * option row on a phone stays a 36px option row. Stated in the spec as a known
 * limitation rather than left to be discovered on the demo.
 *
 * ---------------------------------------------------------------------------
 * THE TRIGGER IS A `<div role="combobox">`, NOT A `<button>`
 * ---------------------------------------------------------------------------
 * The design document's ARIA snippet draws `<button role="combobox">`, and it
 * cannot be one here. The multi-select trigger contains chips, and each chip
 * carries a remove control; the clearable trigger carries a clear control.
 * Interactive content nested inside a `<button>` is invalid HTML, and browsers
 * resolve it by making the inner control unreachable — the × renders, and
 * clicking it activates the outer button instead. A focusable div with an
 * explicit key handler is the standard resolution and it is what the WAI-ARIA
 * combobox pattern actually describes.
 * ============================================================================ */

export type DropdownSize = 'sm' | 'md' | 'lg';

export interface DropdownOption {
  /** The RAW wire value. Never a translated label — an enum value is an
   *  identifier (ADR-007 §3), and a control that submits its label submits
   *  something the server has never heard of. */
  value: string;
  /** Already translated by the caller. */
  label: string;
  description?: string | undefined;
  icon?: ReactNode | undefined;
  disabled?: boolean | undefined;
}

interface DropdownCommonProps {
  id?: string | undefined;

  /** REQUIRED. `labelHidden` is the only thing optional about it. */
  label: string;
  labelHidden?: boolean | undefined;

  options: readonly DropdownOption[];

  placeholder?: string | undefined;
  helperText?: string | undefined;

  /** A string, not a boolean. Presence IS the error state and it replaces the
   *  helper — the contract `Input` and the old `Select` both have, because a
   *  form with two error conventions is a form nobody reads at a glance. */
  error?: string | undefined;

  required?: boolean | undefined;
  disabled?: boolean | undefined;
  readOnly?: boolean | undefined;
  loading?: boolean | undefined;
  clearable?: boolean | undefined;

  size?: DropdownSize | undefined;

  /** `'auto'` shows the search field above ten options — the document's rule. */
  searchable?: boolean | 'auto' | undefined;

  onBlur?: (() => void) | undefined;

  /** Renders a hidden input so a native form post carries the value. */
  name?: string | undefined;

  noOptionsText?: string | undefined;
  loadingText?: string | undefined;
}

interface DropdownSingleProps extends DropdownCommonProps {
  multiple?: false | undefined;
  value: string | null;
  onChange: (value: string | null, option: DropdownOption | null) => void;
}

interface DropdownMultiProps extends DropdownCommonProps {
  multiple: true;
  value: readonly string[];
  onChange: (value: readonly string[], option: DropdownOption) => void;
  /** Chips beyond this collapse into `+N`. */
  maxTagCount?: number | undefined;
}

export type DropdownProps = DropdownSingleProps | DropdownMultiProps;

/** The document's rule for `searchable: 'auto'`. */
const SEARCH_AUTO_THRESHOLD = 10;

/** Typeahead buffer lifetime — Abyan Dropdown §07, «مهلة 500ms». */
const TYPEAHEAD_RESET_MS = 500;

/* Two maps, not one. The trigger's size sets a FIELD height (39/47/51) and the
 * list's sets an OPTION height (32/36/44). One shared `.sm` class on both would
 * stretch every menu row to the height of a text field — and it would look
 * deliberate. */
const triggerSize: Record<DropdownSize, 'sm' | 'md' | 'lg'> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
};

const listSize: Record<DropdownSize, 'listSm' | 'listMd' | 'listLg'> = {
  sm: 'listSm',
  md: 'listMd',
  lg: 'listLg',
};

export const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(function Dropdown(
  props,
  ref,
) {
  const {
    id,
    label,
    labelHidden = false,
    options,
    placeholder,
    helperText,
    error,
    required = false,
    disabled = false,
    readOnly = false,
    loading = false,
    clearable = false,
    size = 'md',
    searchable = false,
    onBlur,
    name,
    noOptionsText,
    loadingText,
  } = props;

  const multiple = props.multiple === true;
  const maxTagCount = props.multiple === true ? (props.maxTagCount ?? 2) : 2;

  const { t, i18n } = useTranslation('common');
  const lang: Lang = i18n.language === 'ar' ? 'ar' : 'en';

  const generatedId = useId();
  const controlId = id ?? generatedId;
  const labelId = `${controlId}-label`;
  const menuId = `${controlId}-menu`;
  const messageId = `${controlId}-message`;
  const optionId = (index: number) => `${controlId}-opt-${String(index)}`;

  const surface = useMenuSurface();
  const { open, setOpen, closeAndFocusTrigger, triggerRef, menuRef, position } = surface;

  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const typeahead = useRef<{ buffer: string; at: number }>({ buffer: '', at: 0 });

  const hasError = error !== undefined && error !== '';
  const message = hasError ? error : helperText;

  /* Interaction is off for both, and they are NOT the same state. `disabled` is
   * "you may not"; `readOnly` is "there is nothing to change" — it keeps the
   * value legible, drops the caret, and stays out of the tab order's way by
   * announcing itself rather than by being unreachable. */
  const inert = disabled || readOnly;

  const selectedValues = useMemo<readonly string[]>(() => {
    if (props.multiple === true) return props.value;
    return props.value === null || props.value === '' ? [] : [props.value];
  }, [props]);

  const selectedOptions = useMemo(
    () => options.filter((option) => selectedValues.includes(option.value)),
    [options, selectedValues],
  );

  const showSearch =
    searchable === true ||
    (searchable === 'auto' && options.length > SEARCH_AUTO_THRESHOLD);

  const visibleOptions = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (term === '') return options;
    return options.filter((option) => option.label.toLocaleLowerCase().includes(term));
  }, [options, query]);

  /* ---- Highlight -------------------------------------------------------- */

  const firstEnabled = useCallback(
    (from: number, step: 1 | -1): number => {
      const count = visibleOptions.length;
      if (count === 0) return -1;
      for (let i = 0; i < count; i += 1) {
        const index = (from + step * i + count * count) % count;
        if (visibleOptions[index]?.disabled !== true) return index;
      }
      return -1;
    },
    [visibleOptions],
  );

  const moveHighlight = useCallback(
    (step: 1 | -1) => {
      setHighlight((current) => {
        const next = firstEnabled(current + step, step);
        return next === -1 ? current : next;
      });
    },
    [firstEnabled],
  );

  /* On open, land on the selected option — the document's rule («التمرير
   * التلقائي للخيار المختار ووضع التمييز عليه») — and on the first ENABLED one
   * when nothing is selected. A highlight sitting on a disabled row means Enter
   * does nothing and the control reads as broken. */
  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const selectedIndex = visibleOptions.findIndex((option) =>
      selectedValues.includes(option.value),
    );
    setHighlight(selectedIndex >= 0 ? selectedIndex : firstEnabled(0, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Filtering can strand the highlight past the end of a shorter list. */
  useEffect(() => {
    if (!open) return;
    if (highlight >= visibleOptions.length) setHighlight(firstEnabled(0, 1));
  }, [open, highlight, visibleOptions.length, firstEnabled]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  /* `position` is in the dependency list and it is the whole reason this works.
   *
   * The menu renders only once `useMenuSurface` has measured, so on the render
   * where `open` flips true the portal does not exist yet and `searchRef` is
   * null. With `[open, showSearch]` alone the effect fires exactly then, finds
   * nothing, and never runs again — the field appears and focus stays on the
   * trigger. Found by TEST-031-03, not by reading: the menu was on screen and
   * the search field was visibly there, so nothing looked wrong. */
  useEffect(() => {
    if (open && showSearch && position !== null) searchRef.current?.focus();
  }, [open, showSearch, position]);

  /* ---- Commit ----------------------------------------------------------- */

  const choose = useCallback(
    (option: DropdownOption) => {
      if (option.disabled === true) return;

      if (props.multiple === true) {
        const next = props.value.includes(option.value)
          ? props.value.filter((value) => value !== option.value)
          : [...props.value, option.value];
        props.onChange(next, option);
        /* The menu stays open. Doc §06: «لا تُغلق عند: اختيار خيار في multi». */
        return;
      }

      props.onChange(option.value, option);
      closeAndFocusTrigger();
    },
    [props, closeAndFocusTrigger],
  );

  const clear = useCallback(() => {
    if (props.multiple === true) {
      props.onChange([], { value: '', label: '' });
      return;
    }
    props.onChange(null, null);
  }, [props]);

  const removeValue = useCallback(
    (option: DropdownOption) => {
      if (props.multiple !== true) return;
      props.onChange(
        props.value.filter((value) => value !== option.value),
        option,
      );
    },
    [props],
  );

  /* ---- Keyboard --------------------------------------------------------- */

  const runTypeahead = useCallback(
    (key: string) => {
      const now = Date.now();
      const state = typeahead.current;
      state.buffer = now - state.at > TYPEAHEAD_RESET_MS ? key : state.buffer + key;
      state.at = now;

      const term = state.buffer.toLocaleLowerCase();
      const index = visibleOptions.findIndex(
        (option) =>
          option.disabled !== true && option.label.toLocaleLowerCase().startsWith(term),
      );
      if (index >= 0) setHighlight(index);
    },
    [visibleOptions],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (inert) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        else moveHighlight(1);
        return;

      case 'ArrowUp':
        event.preventDefault();
        if (!open) setOpen(true);
        else moveHighlight(-1);
        return;

      case 'Home':
        if (!open) return;
        event.preventDefault();
        setHighlight(firstEnabled(0, 1));
        return;

      case 'End':
        if (!open) return;
        event.preventDefault();
        setHighlight(firstEnabled(visibleOptions.length - 1, -1));
        return;

      case 'Enter': {
        if (!open) {
          event.preventDefault();
          setOpen(true);
          return;
        }
        const option = visibleOptions[highlight];
        if (option) {
          event.preventDefault();
          choose(option);
        }
        return;
      }

      case ' ': {
        /* Space types a space in the search field. Everywhere else it opens or
         * selects, per the document's `Enter / Space` row. */
        if (showSearch && open) return;
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        const option = visibleOptions[highlight];
        if (option) choose(option);
        return;
      }

      case 'Escape':
        if (!open) return;
        event.preventDefault();
        closeAndFocusTrigger();
        return;

      case 'Tab':
        /* Close, keep the value, and DO NOT preventDefault — the whole point of
         * this row is that focus moves on to the next control. */
        if (open) setOpen(false);
        return;

      case 'Backspace': {
        if (props.multiple !== true) return;
        if (query !== '') return;
        const last = selectedOptions[selectedOptions.length - 1];
        if (last) removeValue(last);
        return;
      }

      default:
        /* Typeahead. One printable character, no modifier — `Control+f` is the
         * browser's, and treating it as a search for "f" steals it. */
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          if (showSearch && open) return;
          if (!open) setOpen(true);
          runTypeahead(event.key);
        }
    }
  };

  /* ---- Render ----------------------------------------------------------- */

  const hiddenChipCount = Math.max(selectedOptions.length - maxTagCount, 0);
  const showClear =
    clearable && !inert && !loading && selectedOptions.length > 0;

  const triggerBody = (): ReactNode => {
    if (loading) {
      /* A SKELETON, NOT THE WORD "LOADING" (design/loaders.md §8 ①).
       *
       * The trigger has a stored value that has not resolved to a label yet, so
       * the honest shape is the label's own space held open. The word reads as
       * the selected option — a value called "Loading" — for as long as it is
       * on screen, which is exactly the moment a reader is trying to find out
       * what is selected.
       *
       * The accessible announcement is unaffected: aria-busy is on the trigger
       * and the menu region carries the live text. */
      return <Skeleton width="60%" height="8px" />;
    }

    if (props.multiple === true) {
      if (selectedOptions.length === 0) {
        return (
          <span className={styles.placeholder}>
            {placeholder ?? t('dropdown.placeholder')}
          </span>
        );
      }
      return (
        <span className={styles.chips}>
          {selectedOptions.slice(0, maxTagCount).map((option) => (
            <span key={option.value} className={styles.chip}>
              <bdi>{option.label}</bdi>
              {inert ? null : (
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={t('dropdown.remove', { label: option.label })}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeValue(option);
                  }}
                >
                  <IconClose size={12} />
                </button>
              )}
            </span>
          ))}
          {hiddenChipCount > 0 ? (
            <span
              className={styles.chipMore}
              /* The visible `+3` is a glyph; the announced string is a sentence.
               * BR-8.13 keeps the digits Latin in both locales. */
              aria-label={t('dropdown.moreSelected', {
                count: formatNumber(hiddenChipCount, lang),
              })}
            >
              {t('dropdown.more', { count: formatNumber(hiddenChipCount, lang) })}
            </span>
          ) : null}
        </span>
      );
    }

    const selected = selectedOptions[0];
    if (!selected) {
      return (
        <span className={styles.placeholder}>{placeholder ?? t('dropdown.placeholder')}</span>
      );
    }
    return (
      <span className={styles.value}>
        {selected.icon}
        <bdi>{selected.label}</bdi>
      </span>
    );
  };

  const menu =
    open && position !== null
      ? createPortal(
          <div
            ref={menuRef}
            className={cx(styles.menu, position.flipped && styles.menuFlipped)}
            style={{
              /* Physical, deliberately — see `MenuPosition`. The menu's width is
               * the trigger's, so one left edge aligns both directions. */
              top: position.insetBlockStart,
              left: position.insetInlineStartPx,
              width: position.inlineSize,
            }}
          >
            {showSearch ? (
              <div className={styles.search}>
                <IconSearch size={16} aria-hidden="true" />
                <input
                  ref={searchRef}
                  className={styles.searchInput}
                  type="text"
                  role="combobox"
                  aria-expanded
                  aria-controls={menuId}
                  aria-autocomplete="list"
                  aria-label={t('dropdown.search')}
                  aria-activedescendant={
                    visibleOptions.length > 0 ? optionId(highlight) : undefined
                  }
                  placeholder={t('dropdown.search')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onKeyDown}
                />
              </div>
            ) : null}

            {loading ? (
              /* THREE SKELETON ROWS AT THE OPTION'S OWN HEIGHT, not a spinner
               * centred in the menu (design/loaders.md §8 ②).
               *
               * A spinner in the middle of a menu makes the menu's height jump
               * when the options land — the one thing a menu must not do while
               * someone is reaching for it with a mouse. Rows at the option
               * height mean the surface is already the size it will be.
               *
               * aria-live is on the list region, so the count still announces
               * when it arrives; these rows are decorative by construction. */
              <ul
                className={cx(styles.list, styles[listSize[size]])}
                aria-label={loadingText ?? t('dropdown.loading')}
                aria-busy="true"
              >
                {[68, 44, 56].map((pct) => (
                  <li key={pct} className={cx(styles.option, styles.optionSkeleton)}>
                    <Skeleton width={`${pct}%`} height="9px" />
                  </li>
                ))}
              </ul>
            ) : visibleOptions.length === 0 ? (
              <div className={styles.menuState}>
                {noOptionsText ?? t('dropdown.noOptions')}
              </div>
            ) : (
              <ul
                id={menuId}
                className={cx(styles.list, styles[listSize[size]])}
                role="listbox"
                aria-label={label}
                aria-multiselectable={multiple || undefined}
              >
                {visibleOptions.map((option, index) => {
                  const isSelected = selectedValues.includes(option.value);
                  const isDisabled = option.disabled === true;
                  return (
                    <li
                      key={option.value}
                      id={optionId(index)}
                      ref={(node) => {
                        optionRefs.current[index] = node;
                      }}
                      className={cx(
                        styles.option,
                        index === highlight && styles.optionActive,
                        isSelected && styles.optionSelected,
                        isDisabled && styles.optionDisabled,
                      )}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={isDisabled || undefined}
                      /* `mousedown`, not `click`: `pointerdown` on the document
                       * would otherwise have to decide whether this counts as
                       * outside first, and the ordering is engine-dependent. */
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(option);
                      }}
                      onMouseEnter={() => {
                        if (!isDisabled) setHighlight(index);
                      }}
                    >
                      {multiple ? (
                        <span
                          className={cx(styles.box, isSelected && styles.boxChecked)}
                          aria-hidden="true"
                        >
                          {isSelected ? <IconCheck size={11} /> : null}
                        </span>
                      ) : null}

                      {option.icon}

                      <span className={styles.optionBody}>
                        <span className={styles.optionLabel}>
                          <bdi>{option.label}</bdi>
                        </span>
                        {option.description === undefined ? null : (
                          <span className={styles.optionDescription}>
                            <bdi>{option.description}</bdi>
                          </span>
                        )}
                      </span>

                      {!multiple && isSelected ? (
                        <IconCheck size={16} aria-hidden="true" />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={styles.field}>
      <span
        id={labelId}
        className={cx(styles.label, labelHidden && 'sr-only')}
        data-required={required}
      >
        {label}
      </span>

      <div className={styles.anchor}>
        <div
          /* Two refs on one node. `triggerRef` is the surface's — it measures
           * against this element and returns focus to it. The forwarded one is
           * React Hook Form's: `shouldFocusError` and `setFocus` call `.focus()`
           * on whatever a field registered, and a failed submit that focuses a
           * wrapper leaves the caret where it was while the user hunts for the
           * message. Both point at the CONTROL, which is why `tabIndex` is on
           * this element and not on a child. */
          ref={(node) => {
            triggerRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          id={controlId}
          className={cx(
            styles.trigger,
            styles[triggerSize[size]],
            hasError && styles.invalid,
            open && styles.triggerOpen,
            disabled && styles.triggerDisabled,
            readOnly && styles.triggerReadOnly,
          )}
          role="combobox"
          tabIndex={disabled ? -1 : 0}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? menuId : undefined}
          aria-labelledby={labelId}
          aria-activedescendant={
            open && !showSearch && visibleOptions.length > 0
              ? optionId(highlight)
              : undefined
          }
          aria-invalid={hasError || undefined}
          aria-required={required || undefined}
          aria-disabled={disabled || undefined}
          aria-readonly={readOnly || undefined}
          /* The CONTROL is busy, not the document. A reader who has just been
           * given this trigger's name needs to know the value under it may
           * still change. */
          aria-busy={loading || undefined}
          aria-describedby={message === undefined ? undefined : messageId}
          onClick={() => {
            if (inert || loading) return;
            setOpen(!open);
          }}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        >
          {triggerBody()}

          <span className={styles.adornments}>
            {showClear ? (
              <button
                type="button"
                className={styles.clear}
                aria-label={t('dropdown.clear')}
                onClick={(event) => {
                  event.stopPropagation();
                  clear();
                }}
              >
                <IconClose size={16} />
              </button>
            ) : null}

            {/* NO LOADER HERE. §8 ①: "the trigger is not openable — no
                spinner". The skeleton in the trigger body IS the state, and a
                second indicator beside it breaks the one-loader-per-field rule
                (§7) on the same control. The caret is simply withheld: there is
                nothing to open yet. */}
            {readOnly || loading ? null : (
              <span className={cx(styles.caret, open && styles.caretOpen)} aria-hidden="true">
                <IconChevronDown size={16} />
              </span>
            )}
          </span>
        </div>

        {/* Native form participation. `Dropdown` is controlled and every screen
            in this product submits through React Hook Form, so this is inert in
            practice — it exists so a plain `<form>` post is not silently missing
            the field. */}
        {name === undefined ? null : (
          <input type="hidden" name={name} value={selectedValues.join(',')} readOnly />
        )}
      </div>

      {message === undefined ? null : (
        <span id={messageId} className={cx(styles.message, hasError && styles.messageError)}>
          {/* Bidi isolation: the container follows the interface so the message
              sits under the start of its own field; the text follows itself. */}
          <bdi>{message}</bdi>
        </span>
      )}

      {menu}
    </div>
  );
});
