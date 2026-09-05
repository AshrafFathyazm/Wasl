import type { ReactNode } from 'react';

import { cx } from '../../lib/cx';
import { useDeferredBusy } from '../../lib/useDeferredBusy';
import { Loader } from '../Loader/Loader';
import styles from './Button.module.css';

/**
 * The Type axis, matched from the upstream component contract rather than
 * designed. `danger` does not exist yet — no destructive action is in scope, and
 * adding it later is one CSS block.
 */
/* `danger` added by `030` — `design/feedback-layer.md` §3: "destructive primary
   = solid `--action-danger-bg`". It is a TYPE rather than a colour passed in,
   because the destructive button also carries a rule the caller must not be able
   to opt out of: it is never the default focus target, which `Modal` enforces
   from its own `destructive` prop. */
export type ButtonType = 'primary' | 'secondary-outline' | 'danger';

const VARIANT_CLASS = {
  primary: 'primary',
  'secondary-outline': 'secondaryOutline',
  danger: 'danger',
} as const satisfies Record<ButtonType, string>;

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

  /* A DISCLOSURE BUTTON needs both of these, and this component forwarded
   * neither until `015` needed a Filters toggle. Added rather than worked around
   * with a bare <button>: a design-system button that cannot be a disclosure
   * sends the next caller outside the system for a common shape, and then the
   * toggle looks nothing like the buttons beside it.
   *
   * Optional and absent by default, so nothing that already renders a Button
   * gains an attribute it did not have. */
  'aria-expanded'?: boolean | undefined;
  'aria-controls'?: string | undefined;
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
  'aria-expanded': ariaExpanded,
  'aria-controls': ariaControls,
}: ButtonProps) {
  /* An icon-only button with no accessible name is invisible to a sighted
   * reviewer and to the design. It fails loudly in development instead. */
  if (import.meta.env.DEV && !withText && !ariaLabel) {
    throw new Error(
      'Button: withText={false} makes this an icon-only button, which has no ' +
        'accessible name. Pass aria-label with a string from the catalogue.',
    );
  }

  /* THE GUARD IS IMMEDIATE. THE LOADER IS GATED. They are not the same thing
   * and running them off one flag is the mistake this split exists to avoid:
   * `loading` disables the button on the very first render, so a double-click
   * sends one action, while the indicator waits out the 150ms appear delay.
   *
   * Gating the disable too would leave the button live for 150ms after a
   * submit — a race, introduced by a visual rule. */
  const isDisabled = disabled || loading;

  /* `visible`, not `loading`. A mutation that answers in 90ms now paints
   * nothing at all instead of a three-frame blink (design/loaders.md §3). */
  const { visible: showIndicator } = useDeferredBusy(loading);

  return (
    <button
      type={type}
      /* A LOOKUP, NOT A TERNARY. It was `primary ? primary : secondaryOutline`,
         which silently maps every future type onto the outline — `danger` would
         have rendered as a white bordered button and looked deliberate. */
      className={cx(styles.button, styles[VARIANT_CLASS[buttonType]])}
      disabled={isDisabled}
      /* The accessible name is UNCHANGED while loading. No "Loading…" string is
       * introduced, because a primitive holds no strings. */
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      onClick={onClick}
    >
      <span className={cx(styles.content, showIndicator && styles.contentHidden)}>
        {iconStart ? <span className={styles.icon}>{iconStart}</span> : null}
        {/* No dir="auto": a button label is interface copy from the catalogue, not
            user content. dir="auto" on interface copy is how a mixed-script label
            ends up aligned against the page. */}
        {withText && text ? <span>{text}</span> : null}
        {iconEnd ? <span className={styles.icon}>{iconEnd}</span> : null}
      </span>

      {showIndicator ? (
        <span className={styles.indicator}>
          {/* ORBIT, not converge (`029`). design/loaders.md §2 gives converge to
              a wait WITH TEXT BESIDE IT, 0.5–5s, and orbit to a button. The
              reason is the footprint: converge is 52px of travel, and inside a
              hug-width button whose label is "Save" it is wider than the label
              it replaced. Orbit is 28px square and sits where an icon sits.

              No label: the button keeps its own accessible name while busy, and
              aria-busy on the button is what announces the state. A "Loading…"
              string here would be a string inside a primitive. */}
          <Loader variant="orbit" size="sm" />
        </span>
      ) : null}
    </button>
  );
}
