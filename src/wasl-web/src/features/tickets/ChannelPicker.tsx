import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  IconEmail,
  IconLivechat,
  IconSms,
  IconWebform,
  IconWhatsapp,
} from '../../icons/icons';
import { COMMUNICATION_CHANNELS } from '../../lib/api-types.provisional';
import type { CommunicationChannel } from '../../lib/api-types.provisional';
import styles from './CreateTicket.module.css';
import { RadioGroup } from './RadioGroup';

/* ============================================================================
 * ChannelPicker — `038` §3.3
 * ============================================================================
 * Five buttons, not a dropdown. The channel is the one routing field an agent
 * knows before anything else — they are ON the channel — so it costs a glance
 * rather than an open-read-choose.
 *
 * THE ORDER AND THE MEMBERSHIP COME FROM `COMMUNICATION_CHANNELS`, never from a
 * literal list here. A sixth channel added on the server then appears; a literal
 * would leave the row at five and look complete. The icon map below is
 * exhaustive over the union, so adding a member to the contract type fails the
 * BUILD rather than rendering a hole.
 *
 * ICONS COME FROM THE SET, and `IconWhatsapp` is used exactly as it ships
 * (R-7, reversed 2026-09-06). The supplied mock-up draws its own bubble-with-two-
 * ticks glyph; it is not adopted, `src/icons/` is untouched by this feature, and
 * `037`'s trademark question stays open where `037` left it.
 * ============================================================================ */

/** Exhaustive over the union — a new `CommunicationChannel` is a type error
 *  here, which is the point of writing it as a `Record` rather than a lookup
 *  with a fallback. */
const CHANNEL_ICON: Record<CommunicationChannel, ReactNode> = {
  Email: <IconEmail size={18} aria-hidden="true" />,
  WhatsApp: <IconWhatsapp size={18} aria-hidden="true" />,
  LiveChat: <IconLivechat size={18} aria-hidden="true" />,
  Sms: <IconSms size={18} aria-hidden="true" />,
  WebForm: <IconWebform size={18} aria-hidden="true" />,
};

interface ChannelPickerProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: (() => void) | undefined;
  error?: string | undefined;
}

export function ChannelPicker({ value, onChange, onBlur, error }: ChannelPickerProps) {
  const { t } = useTranslation();

  const options = COMMUNICATION_CHANNELS.map((channel) => ({
    value: channel,
    label: t(`tickets:channel.${channel}`),
    adornment: CHANNEL_ICON[channel],
  }));

  /* THE HINT IS NOT DECORATION. Five icons in a row are five pictures, and the
   * two message shapes — WhatsApp and SMS — are a bubble and a bubble. The line
   * underneath is what makes the current choice READABLE rather than
   * recognisable, and it is why the icon-only row is defensible at all. */
  const chosen = COMMUNICATION_CHANNELS.find((channel) => channel === value);

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>
        {t('tickets:field.channel')}
        <span className={styles.required} aria-hidden="true">
          {'*'}
        </span>
      </span>

      <RadioGroup
        label={t('tickets:field.channel')}
        options={options}
        value={value === '' ? null : value}
        onChange={onChange}
        onBlur={onBlur}
        variant="icon"
        invalid={error !== undefined}
        describedBy="nt-channel-hint"
      />

      <span id="nt-channel-hint" className={styles.hint}>
        {chosen === undefined
          ? t('tickets:new.choose')
          : t('tickets:new.channelHint', { value: t(`tickets:channel.${chosen}`) })}
      </span>

      {error === undefined ? null : (
        <span className={styles.fieldError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
