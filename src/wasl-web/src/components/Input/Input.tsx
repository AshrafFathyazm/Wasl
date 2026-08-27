import { forwardRef, useId } from 'react';

import { cx } from '../../lib/cx';
import styles from './Input.module.css';

export type InputSize = 'sm' | 'md' | 'lg';

/* Every optional prop is `?: T | undefined`, not `?: T`.
 *
 * `exactOptionalPropertyTypes` is on, and it distinguishes "absent" from
 * "explicitly undefined". A caller holding `string | undefined` — which is what
 * any conditional produces — cannot pass it to a `?: string`, so the prop ends
 * up being spread conditionally at every call site. Saying `| undefined` once
 * here is the same contract, expressed so it can be used. `Select` and
 * `Textarea` were written this way; this brings `Input` in step. */
export interface InputProps {
  /** Generated with useId() when absent. */
  id?: string | undefined;

  /** REQUIRED, not optional. A placeholder standing in for a label is the most
   *  common form accessibility defect, and it disappears the moment the user
   *  types. Already translated by the caller. */
  label: string;

  /** Hides the label VISUALLY only — it stays in the accessibility tree.
   *  `label` is still required and always will be: the choice this exposes is
   *  about paint, not about whether the field has a name. Making `label`
   *  optional instead is how the first caller who wants a placeholder-only
   *  search field ships a control nobody can identify by ear. */
  labelHidden?: boolean | undefined;

  value: string;
  onChange: (value: string) => void;
  onBlur?: (() => void) | undefined;

  /** Renders the marker. Does NOT validate — this component renders validity and
   *  never decides it. */
  required?: boolean | undefined;

  placeholder?: string | undefined;
  helperText?: string | undefined;

  /** A string, not a boolean. Its presence IS the error state, and it REPLACES
   *  helperText. The caller supplies it on blur — validating as someone types
   *  tells them they are wrong before they have finished being right. */
  error?: string | undefined;

  disabled?: boolean | undefined;
  size?: InputSize | undefined;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric' | undefined;

  /** The native attribute only. Not a validator. */
  maxLength?: number | undefined;

  /** Show a `length / maxLength` counter once the value reaches this length.
   *  Omit for no counter. Requires `maxLength`.
   *
   *  A THRESHOLD, not a flag, and the same one `Textarea` uses. A counter that
   *  is always on is noise on a field nobody is near the limit of, and an
   *  `aria-live` region that is always on is noise in someone's ear. */
  counterFrom?: number | undefined;
}

const sizeClass: Record<InputSize, 'sm' | 'md' | 'lg'> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
};

/* `forwardRef` so React Hook Form can move focus to this control.
 *
 * Not decoration: `shouldFocusError` and `setFocus` both work by calling
 * `.focus()` on the ref a field registered. Without one, a failed submit leaves
 * the caret where it was and the user hunts for the message — measured, and it
 * is what AC-10 and AC-16 are about. The ref points at the CONTROL, never at the
 * wrapper, so `.focus()` lands somewhere focusable. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    value,
    onChange,
    onBlur,
    labelHidden = false,
    required = false,
    placeholder,
    helperText,
    error,
    disabled = false,
    size = 'md',
    inputMode,
    maxLength,
    counterFrom,
  },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const messageId = `${controlId}-message`;

  const hasError = error !== undefined && error !== '';
  const message = hasError ? error : helperText;

  /* `maxLength` on the control makes over-typing impossible, which is exactly
   * why the counter is worth having: input simply STOPS, with nothing on screen
   * saying why. A hard cap without a counter is a field that ignores you.
   *
   * `[...value].length`, not `value.length`: `.length` counts UTF-16 code
   * units, so an emoji counts as two and the counter disagrees with the control
   * it is describing. The browser's own `maxLength` counts code units too — the
   * two are matched here rather than made consistent, because the number shown
   * has to be the number the control is enforcing. */
  const length = value.length;
  const showCounter =
    counterFrom !== undefined && maxLength !== undefined && length >= counterFrom;
  const counterId = `${controlId}-counter`;

  /* Built as an expression rather than left as JSX text. The BR-8.8 lint rule
   * forbids a literal in JSX and is right to — but this is NOT copy. It is two
   * numbers and a separator, identical in both languages, and putting it in a
   * catalogue would invite someone to translate the slash. */
  const counterText = `${length} / ${maxLength ?? ''}`;

  return (
    <div className={styles.field}>
      {/* htmlFor / id, never a placeholder as the label. */}
      <label
        className={cx(styles.label, labelHidden && 'sr-only')}
        htmlFor={controlId}
        data-required={required}
      >
        {label}
      </label>

      <input
        ref={ref}
        id={controlId}
        className={cx(
          styles.control,
          styles[sizeClass[size]],
          hasError && styles.invalid,
        )}
        type="text"
        /* ALWAYS. An Arabic name typed into an English form is normal, and without
         * this the punctuation lands at the wrong end and reads as a typo
         * (ADR-007 §8). */
        dir="auto"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={hasError || undefined}
        /* Points at whichever of helper or error is currently rendered, so a test
         * can query the control by its accessible description rather than by a
         * class name. No aria-live region: the error appears on blur, when the
         * user is already moving to the next field, and a live region would
         * interrupt them mid-field. */
        aria-describedby={
          [message === undefined ? null : messageId, showCounter ? counterId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
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
              {/* BIDI ISOLATION, not dir="auto" on the span itself.
               *
               * The message can arrive in either language independently of the
               * interface: BR-8.12 falls back to English when an Arabic key is
               * missing, so an Arabic user WILL see an English message. With
               * dir="auto" on the span, that message computed `ltr` and hugged the
               * left edge while its own label hugged the right — one field, two
               * edges.
               *
               * <bdi> splits the two concerns: the SPAN keeps the interface
               * direction, so `text-align: start` puts the message under the start of
               * its field; the BDI isolates the text, so its own direction still
               * decides the ordering and where the full stop lands (ADR-007 §8).
               *
               * The control keeps dir="auto" on itself, deliberately — an Arabic name
               * typed into an English form should flip the WHOLE field, not sit as an
               * island inside it. */}
              <bdi>{message}</bdi>
            </span>
          )}

          {showCounter && maxLength !== undefined ? (
            <span
              id={counterId}
              className={cx(styles.counter, length >= maxLength && styles.counterNear)}
              /* polite, never assertive: it must not interrupt someone typing. */
              aria-live="polite"
              /* Digits and a slash are directionally neutral, so bidi reorders
                 the run inside an RTL paragraph. Pinned. */
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
