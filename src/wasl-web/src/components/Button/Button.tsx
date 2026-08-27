import type { ReactNode } from 'react';

import { cx } from '../../lib/cx';
import { Loader } from '../Loader/Loader';
import styles from './Button.module.css';

/**
 * The Type axis, matched from the upstream component contract rather than
 * designed. `danger` does not exist yet — no destructive action is in scope, and
 * adding it later is one CSS block.
 */
export type ButtonType = 'primary' | 'secondary-outline';

export interface ButtonProps {
  /** Default 'primary'. Named `buttonType` because the native <button> element
   *  already owns `type`, and a prop shadowing a native attribute of the same
   *  element is a collision someone eventually resolves the wrong way. */
  buttonType?: ButtonType;

  /** The label. ALREADY TRANSLATED by the caller — this component holds no
   *  strings, and a literal one in here fails the build (BR-8.8). */
  text?: string;

  /** Upstream's `With Text`, kept as a separate boolean from `text`. It is how an
   *  icon-only button is expressed without a second component, and it is the hook
   *  that lets the component REQUIRE an aria-label when the text is gone — a rule
   *  the design cannot enforce and the component can. */
  withText?: boolean;

  /** Logical, not physical. Under dir="rtl" `iconStart` renders on the right with
   *  no CSS change — the flex order does the work. A prop called `leftIcon` that
   *  renders on the right is a name that lies, and someone eventually "fixes" it
   *  by flipping the CSS. */
  iconStart?: ReactNode;
  iconEnd?: ReactNode;

  /** The Status axis, kept orthogonal to Type exactly as upstream keeps it.
   *  Disabled and loading are STATES of this component, never separate
   *  components — a LoadingButton guarantees the two drift apart. */
  disabled?: boolean;
  /** Implies `disabled`, so a double-click sends one action. */
  loading?: boolean;

  type?: 'button' | 'submit';
  onClick?: () => void;

  /** REQUIRED when `withText` is false. */
  'aria-label'?: string;
}

export function Button({
  buttonType = 'primary',
  text,
  withText = true,
  iconStart,
  iconEnd,
  disabled = false,
  loading = false,
  type = 'button',
  onClick,
  'aria-label': ariaLabel,
}: ButtonProps) {
  /* An icon-only button with no accessible name is invisible to a sighted
   * reviewer and to the design. It fails loudly in development instead. */
  if (import.meta.env.DEV && !withText && !ariaLabel) {
    throw new Error(
      'Button: withText={false} makes this an icon-only button, which has no ' +
        'accessible name. Pass aria-label with a string from the catalogue.',
    );
  }

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={cx(
        styles.button,
        buttonType === 'primary' ? styles.primary : styles.secondaryOutline,
      )}
      disabled={isDisabled}
      /* The accessible name is UNCHANGED while loading. No "Loading…" string is
       * introduced, because a primitive holds no strings. */
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <span className={cx(styles.content, loading && styles.contentHidden)}>
        {iconStart ? <span className={styles.icon}>{iconStart}</span> : null}
        {/* No dir="auto": a button label is interface copy from the catalogue, not
            user content. dir="auto" on interface copy is how a mixed-script label
            ends up aligned against the page. */}
        {withText && text ? <span>{text}</span> : null}
        {iconEnd ? <span className={styles.icon}>{iconEnd}</span> : null}
      </span>

      {loading ? (
        <span className={styles.indicator}>
          {/* No label: the button keeps its own accessible name while busy, and
              aria-busy on the button is what announces the state. A "Loading…"
              string here would be a string inside a primitive. */}
          <Loader size="sm" />
        </span>
      ) : null}
    </button>
  );
}
