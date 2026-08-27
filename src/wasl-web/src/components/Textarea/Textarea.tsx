import { forwardRef, useId } from 'react';

import { cx } from '../../lib/cx';
import styles from './Textarea.module.css';

export interface TextareaProps {
  id?: string | undefined;

  /** REQUIRED. `labelHidden` hides its paint, never its existence. */
  label: string;
  labelHidden?: boolean | undefined;

  value: string;
  onChange: (value: string) => void;
  onBlur?: (() => void) | undefined;

  required?: boolean | undefined;
  placeholder?: string | undefined;
  helperText?: string | undefined;

  /** Presence IS the error state, and it replaces the helper — the same
   *  contract `Input` and `Select` have. A form with two error conventions is a
   *  form nobody can read at a glance. */
  error?: string | undefined;

  disabled?: boolean | undefined;

  /** Not a `size`. A textarea's height is rows plus content, which is exactly
   *  why this is a separate primitive rather than a flag on `Input`. */
  rows?: number | undefined;

  /** The native attribute, and the counter's ceiling. NOT a validator — the
   *  schema mirrors the rule and the server owns it. */
  maxLength?: number | undefined;

  /** Show the counter from this length onward. Absent means never.
   *  `05-create-ticket.md` puts it at 3800 of 4000: a counter that is always on
   *  is noise for every input that is nowhere near the limit, and noise is what
   *  makes people stop reading the one that matters. */
  counterFrom?: number | undefined;
}

/* `forwardRef` so React Hook Form can move focus to this control.
 *
 * Not decoration: `shouldFocusError` and `setFocus` both work by calling
 * `.focus()` on the ref a field registered. Without one, a failed submit leaves
 * the caret where it was and the user hunts for the message — measured, and it
 * is what AC-10 and AC-16 are about. The ref points at the CONTROL, never at the
 * wrapper, so `.focus()` lands somewhere focusable. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    id,
    label,
    labelHidden = false,
    value,
    onChange,
    onBlur,
    required = false,
    placeholder,
    helperText,
    error,
    disabled = false,
    rows = 5,
    maxLength,
    counterFrom,
  },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const messageId = `${controlId}-message`;
  const counterId = `${controlId}-counter`;

  const hasError = error !== undefined && error !== '';
  const message = hasError ? error : helperText;

  const length = value.length;

  /* Built as an expression rather than left as JSX text, and the reason is not
   * to dodge the lint rule — it is that this is NOT copy. It is two numbers and
   * a separator: the digits are Latin in both locales (ADR-007 §7) and the
   * slash has no locale variant. If a locale ever wants "186 of 200", that IS
   * copy and moves to the catalogue as an interpolated key. */
  const counterText = `${length} / ${maxLength ?? ''}`;
  const showCounter =
    maxLength !== undefined && counterFrom !== undefined && length >= counterFrom;

  /* The counter is in `aria-describedby` ONLY WHILE IT IS SHOWN. A describedby
   * pointing at an element that is not rendered resolves to nothing, and the
   * field then has a description that silently says less than it claims. */
  const describedBy = [
    message === undefined ? null : messageId,
    showCounter ? counterId : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field}>
      <label
        className={cx(styles.label, labelHidden && 'sr-only')}
        htmlFor={controlId}
        data-required={required}
      >
        {label}
      </label>

      <textarea
        ref={ref}
        id={controlId}
        className={cx(styles.control, hasError && styles.invalid)}
        /* ALWAYS. An Arabic description typed into an English form is normal,
         * and without this its full stop lands at the wrong end and reads as a
         * typo (ADR-007 §8). */
        dir="auto"
        value={value}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />

      {message === undefined && !showCounter ? null : (
        <span className={styles.footer}>
          {message === undefined ? (
            <span />
          ) : (
            <span
              id={messageId}
              className={cx(styles.message, hasError && styles.messageError)}
            >
              {/* Bidi isolation: the container follows the interface so the
                  message sits under the start of its own field; the text follows
                  itself. */}
              <bdi>{message}</bdi>
            </span>
          )}

          {showCounter && maxLength !== undefined ? (
            <span
              id={counterId}
              className={cx(styles.counter, length >= maxLength && styles.counterNear)}
              /* polite, never assertive: it must not interrupt someone typing.
               * It is chatty by nature, which is why it appears only near the
               * limit rather than from the first keystroke. */
              aria-live="polite"
              /* Digits and a slash are directionally neutral, so bidi would
                 reorder the run in an RTL paragraph. Pinned. */
              dir="ltr"
            >
              {counterText}
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
});
