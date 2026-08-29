import { forwardRef, useId, useState, type KeyboardEvent } from 'react';

import { IconEye, IconEyeOff } from '../../icons/icons-added';
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

  /** Hides the `*` WITHOUT dropping `required`.
   *
   *  The two are separable on purpose. `required` is the native attribute and
   *  the `aria-required` it carries; the marker is a hint to a sighted reader
   *  about which fields they may skip. On a form where EVERY field is required
   *  — sign-in is the one in this product — that hint distinguishes nothing, and
   *  a column of asterisks is decoration that reads as a warning.
   *
   *  Turning `required` off instead would have removed the semantics with the
   *  glyph, which is the trade this prop exists to avoid. */
  requiredMarker?: boolean | undefined;

  placeholder?: string | undefined;
  helperText?: string | undefined;

  /** A string, not a boolean. Its presence IS the error state, and it REPLACES
   *  helperText. The caller supplies it on blur — validating as someone types
   *  tells them they are wrong before they have finished being right. */
  error?: string | undefined;

  /** Invalid, WITH NO MESSAGE OF ITS OWN. Added by `025`.
   *
   *  The sign-in form needs both inputs to carry the danger border while the
   *  only explanation sits in one block above the submit — because the server
   *  returns one `401` for three causes and a per-field message would say which
   *  field was wrong, which is the enumeration that response shape exists to
   *  prevent.
   *
   *  Passing `error=""` was the obvious way to express that and it silently does
   *  nothing: `hasError` tests `!== ''`, so an empty string reads as "no error",
   *  the border stays neutral and `aria-invalid` never appears. Measured in the
   *  browser, not deduced — the form looked correct and announced nothing.
   *
   *  `error` still wins when both are supplied: a real message is more specific
   *  than a bare state. */
  invalid?: boolean | undefined;

  disabled?: boolean | undefined;
  size?: InputSize | undefined;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric' | undefined;

  /* ---- Native attributes, added by 025 --------------------------------------
   * Three attributes and a handler, all of which a text field has always had and
   * none of which had a consumer until the sign-in form. Added rather than
   * worked around: the alternative was a hand-rolled `<input>` on `/login`, and
   * a second implementation of a field is how the two come to disagree about
   * focus, error rendering, and bidi.
   * -------------------------------------------------------------------------- */

  /** `password` is why this exists. It was hard-coded to `text`, which is fine
   *  for every field built so far and wrong for exactly one — and a password
   *  field that renders its value is not a styling defect. */
  type?: 'text' | 'email' | 'password' | undefined;

  /** REQUIRED for a password manager to fill, together with `autoComplete`.
   *  Also what a native form post uses as the field name. */
  name?: string | undefined;

  /** `email` · `current-password` · `new-password` · `off`. AC-26 names the
   *  first two by value: without them every sign-in becomes manual, which is
   *  the largest usability loss available on that screen for two attributes. */
  autoComplete?: string | undefined;

  /** For `getModifierState('CapsLock')` on the password field. A hint, not
   *  validation — the component neither knows nor cares what the caller does. */
  onKeyUp?: ((event: KeyboardEvent<HTMLInputElement>) => void) | undefined;

  /** Show / hide toggle. Only meaningful with `type="password"`. Added by `025`.
   *
   *  It lives in the PRIMITIVE, not on the sign-in screen, because it is a
   *  property of a password field rather than of one form — and the next
   *  password field in the product would otherwise re-implement the toggle,
   *  the icon swap, and the announcement slightly differently.
   *
   *  The accessible name is supplied by the caller: this component holds no
   *  strings (BR-8.8), and a literal here fails the build. */
  revealLabel?: string | undefined;
  hideLabel?: string | undefined;

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
    requiredMarker = true,
    placeholder,
    helperText,
    error,
    invalid = false,
    disabled = false,
    size = 'md',
    inputMode,
    type = 'text',
    name,
    autoComplete,
    onKeyUp,
    revealLabel,
    hideLabel,
    maxLength,
    counterFrom,
  },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const messageId = `${controlId}-message`;

  const [revealed, setRevealed] = useState(false);
  /* Offered only when the caller supplied both names AND the field is a
   * password. A reveal button on an email field is a control with nothing to
   * reveal. */
  const canReveal =
    type === 'password' && revealLabel !== undefined && hideLabel !== undefined;
  /* The RENDERED type. `type` stays the caller's declaration, so `dir` below
   * still resolves from it — a revealed password must not start following
   * `dir="auto"` and jump ends the moment it becomes visible. */
  const renderedType = canReveal && revealed ? 'text' : type;

  const hasMessage = error !== undefined && error !== '';
  /* Either a message or a bare invalid state paints the control as invalid. */
  const hasError = hasMessage || invalid;
  const message = hasMessage ? error : helperText;

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
        data-required={required && requiredMarker}
      >
        {label}
      </label>

      <span className={cx(styles.anchor, canReveal && styles.hasAffix)}>
      <input
        ref={ref}
        id={controlId}
        className={cx(
          styles.control,
          styles[sizeClass[size]],
          hasError && styles.invalid,
        )}
        type={renderedType}
        name={name}
        autoComplete={autoComplete}
        /* ALWAYS — EXCEPT on a password.
         *
         * `dir="auto"` decides direction from the first strong character, and a
         * password field renders dots: there is no strong character to read, so
         * the browser falls back to the paragraph direction and the caret jumps
         * to the other end mid-entry under RTL. A password is also not language
         * content — it is an opaque secret, and it has no direction to detect.
         *
         * Everything else keeps it: an Arabic name typed into an English form is
         * normal, and without it the punctuation lands at the wrong end and reads
         * as a typo (ADR-007 §8). */
        dir={type === 'password' ? 'ltr' : 'auto'}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        inputMode={inputMode}
        onKeyUp={onKeyUp}
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

      {canReveal ? (
        <button
          type="button"
          className={styles.reveal}
          /* `aria-pressed` rather than two different labels for one control:
           * the button IS the same control in both states, and its state is
           * what changed. The label still swaps so the name says what the
           * next press will do. */
          aria-pressed={revealed}
          aria-label={revealed ? hideLabel : revealLabel}
          aria-controls={controlId}
          /* Out of the tab order is WRONG here — a keyboard-only user has no
           * other way to check what they typed. It is reachable, and it is
           * the last stop in the field. */
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed ? <IconEyeOff size={16} /> : <IconEye size={16} />}
        </button>
      ) : null}
      </span>

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
