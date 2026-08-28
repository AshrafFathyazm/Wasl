import { forwardRef, useEffect, useId, useRef } from 'react';

import styles from './Checkbox.module.css';

/* ============================================================================
 * Checkbox — the eighth primitive
 * ============================================================================
 *
 * ADR-009 caps the primitives at eight and names them: Button, Input, Select,
 * Checkbox, Badge, Table, Modal, Toast. This is on that list, so it needs no
 * written justification for existing — only for arriving here, and the answer is
 * *remember me* on the sign-in form, its first consumer in the product.
 *
 * A REAL `input[type=checkbox]`, styled — not a div with `role="checkbox"`.
 * The native control brings the space-bar toggle, the label click target, the
 * form participation, and the announcement, none of which a div gets without
 * re-implementing all four. What is taken away is only its painting, via
 * `appearance: none`.
 *
 * NO `error` PROP, deliberately, and unlike `Input` and `Select`.
 * A checkbox has two states and both are valid; the invalid case is "required
 * and unchecked", which is a FORM-level message ("you must accept the terms"),
 * not a field-level one. Giving this component a red border would invite it to
 * be used for a rule the form owns. The first screen that genuinely needs one
 * can add it with a reason.
 *
 * `indeterminate` IS SUPPORTED AND HAS NO CONSUMER YET.
 * `design/component-inventory.md` names it as one of this primitive's five
 * required states, and the primitive is being built exactly once. Its first real
 * consumer is the select-all row in `015`'s filters. It is six lines and a ref;
 * leaving it out would mean reopening the file rather than using it.
 * ============================================================================ */

export interface CheckboxProps {
  id?: string | undefined;

  /** REQUIRED, already translated by the caller. A checkbox with no label is a
   *  control nobody can identify by ear, and unlike a text field it has no
   *  placeholder to borrow one from. */
  label: string;

  checked: boolean;
  onChange: (checked: boolean) => void;
  onBlur?: (() => void) | undefined;

  /** Visual and announced only — `checked` is still the value. A control that is
   *  `indeterminate` reports `mixed` to assistive technology. */
  indeterminate?: boolean | undefined;

  disabled?: boolean | undefined;

  /** Rendered under the row. Not an error — see the header. */
  helperText?: string | undefined;

  /** Native attribute, for a form post and for a password manager. */
  name?: string | undefined;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    id,
    label,
    checked,
    onChange,
    onBlur,
    indeterminate = false,
    disabled = false,
    helperText,
    name,
  },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const messageId = `${controlId}-message`;

  /* `indeterminate` is a PROPERTY, not an attribute — there is no
   * `indeterminate=""` in HTML, so React cannot set it declaratively and a JSX
   * prop of that name is silently dropped. It has to be written to the DOM node.
   *
   * A local ref merged with the forwarded one, because the caller's ref is what
   * React Hook Form focuses and this component still needs its own handle. */
  const localRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (localRef.current !== null) {
      localRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <div className={styles.field}>
      <div className={styles.row}>
        <input
          ref={(node) => {
            localRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref !== null) ref.current = node;
          }}
          id={controlId}
          name={name}
          className={styles.control}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          /* `mixed` only while indeterminate; otherwise the native `checked`
           * state is what is announced and this must stay out of the way. */
          aria-checked={indeterminate ? 'mixed' : undefined}
          aria-describedby={helperText === undefined ? undefined : messageId}
          onChange={(event) => onChange(event.target.checked)}
          onBlur={onBlur}
        />

        {/* The label is the second click target. `htmlFor` rather than wrapping,
            so the control keeps its own place in the tab order and the row can
            wrap without the box moving. */}
        <label className={styles.label} htmlFor={controlId}>
          {label}
        </label>
      </div>

      {helperText === undefined ? null : (
        <span id={messageId} className={styles.message}>
          {/* Bidi isolation, same contract as Input: the container follows the
              interface, the text follows itself (ADR-007 §8). */}
          <bdi>{helperText}</bdi>
        </span>
      )}
    </div>
  );
});
