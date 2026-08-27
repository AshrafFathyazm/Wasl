import { forwardRef, useId } from 'react';

import { IconChevronDown } from '../../icons/icons';
import { cx } from '../../lib/cx';
import styles from './Select.module.css';

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectOption {
  /** The RAW wire value. Never a translated label — an enum value is an
   *  identifier (ADR-007 §3), and a select that submits its label submits
   *  something the server has never heard of. */
  value: string;
  /** Already translated by the caller. */
  label: string;
}

export interface SelectProps {
  id?: string | undefined;

  /** REQUIRED. See `labelHidden` for the only thing that is optional here. */
  label: string;

  /** Hides the label visually only; it stays in the accessibility tree. */
  labelHidden?: boolean | undefined;

  value: string;
  onChange: (value: string) => void;
  onBlur?: (() => void) | undefined;

  options: readonly SelectOption[];

  /** The empty option's text. Its value is always `''`, so "nothing chosen" is
   *  representable and the caller is never forced to invent a sentinel. */
  placeholder?: string | undefined;

  required?: boolean | undefined;
  helperText?: string | undefined;

  /** A string, not a boolean. Presence IS the error state, and it replaces the
   *  helper — the same contract `Input` has, because a form with two different
   *  error conventions is a form nobody can read at a glance. */
  error?: string | undefined;

  disabled?: boolean | undefined;
  size?: SelectSize | undefined;
}

const sizeClass: Record<SelectSize, 'sm' | 'md' | 'lg'> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
};

/**
 * Single-select only. Multi-select is not built and is not a flag away: it is a
 * different control with a different keyboard model and a different value type,
 * and its first real consumer is `015`'s filters.
 *
 * A native `<select>`, deliberately. It brings the platform's own open state,
 * keyboard model, and mobile picker — none of which a div can be given without a
 * listbox implementation, and all of which are what "open" actually means here.
 * The one thing taken away is its arrow, so ours can sit at the inline-end.
 */
/* `forwardRef` so React Hook Form can move focus to this control.
 *
 * Not decoration: `shouldFocusError` and `setFocus` both work by calling
 * `.focus()` on the ref a field registered. Without one, a failed submit leaves
 * the caret where it was and the user hunts for the message — measured, and it
 * is what AC-10 and AC-16 are about. The ref points at the CONTROL, never at the
 * wrapper, so `.focus()` lands somewhere focusable. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    id,
    label,
    labelHidden = false,
    value,
    onChange,
    onBlur,
    options,
    placeholder,
    required = false,
    helperText,
    error,
    disabled = false,
    size = 'md',
  },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const messageId = `${controlId}-message`;

  const hasError = error !== undefined && error !== '';
  const message = hasError ? error : helperText;
  const showingPlaceholder = value === '';

  return (
    <div className={styles.field}>
      <label
        className={cx(styles.label, labelHidden && 'sr-only')}
        htmlFor={controlId}
        data-required={required}
      >
        {label}
      </label>

      <span className={styles.anchor}>
        <select
          ref={ref}
          id={controlId}
          className={cx(
            styles.control,
            styles[sizeClass[size]],
            hasError && styles.invalid,
            showingPlaceholder && styles.placeholderShown,
          )}
          value={value}
          disabled={disabled}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={message === undefined ? undefined : messageId}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        >
          {/* Always rendered. Without it a required select silently submits its
              first real option, which is how a ticket gets a category nobody
              chose. */}
          <option value="" disabled={required}>
            {placeholder ?? ''}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Ours, at the inline-end, so it mirrors with the field. The native
            arrow is drawn at the physical right on every engine and does not. */}
        <span className={styles.chevron} aria-hidden="true">
          <IconChevronDown size={14} />
        </span>
      </span>

      {message === undefined ? null : (
        <span
          id={messageId}
          className={cx(styles.message, hasError && styles.messageError)}
        >
          {/* Bidi isolation: the container follows the interface so the message
              sits under the start of its own field; the text follows itself. */}
          <bdi>{message}</bdi>
        </span>
      )}
    </div>
  );
});
