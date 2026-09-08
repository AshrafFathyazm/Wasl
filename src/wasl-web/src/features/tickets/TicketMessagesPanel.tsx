import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button/Button';
import { Dropdown } from '../../components/Dropdown/Dropdown';
import { Textarea } from '../../components/Textarea/Textarea';
import { IconAlert, IconCheck } from '../../icons/icons';
import type {
  CommunicationChannel,
  DeliveryStatus,
  InteractionResponse,
} from '../../lib/api-types.provisional';
import { cx } from '../../lib/cx';
import { formatDateTime, type Lang } from '../../lib/formatters';
import { CHANNEL_ICON } from './channelIcons';
import styles from './TicketMessagesPanel.module.css';

/* ============================================================================
 * TicketMessagesPanel — `021`, FE-021-02 … FE-021-06
 * ============================================================================
 * THE THING THAT MAKES A NAMED MODULE SOMETHING A REVIEWER CAN USE. `021` exists
 * because Communication Channels resolves to one enum column today, which reads
 * as missing rather than as scoped — and a seam with no visible surface would
 * have that same problem one layer up: correct, tested, and invisible.
 *
 * WHAT IS NOT HERE, AND EACH IS A DECISION:
 *
 *   NO CHANNEL CONSTANT. The options come from
 *   `GET /api/communications/channels` (AC-22). A client-side list would be the
 *   server's registry stated twice, and the copy that drifts is the one offering
 *   a channel the server refuses with a `400`.
 *
 *   NO RECIPIENT FIELD. The address is resolved server-side from the ticket's
 *   customer and snapshotted. A recipient input would be the one place in this
 *   product a support user could direct data to an arbitrary address.
 *
 *   NO RAW `failureCode`. It is a machine-readable code mapped to a translated
 *   sentence, with a generic fallback for a code this client has never seen —
 *   which a real provider will produce (AC-22).
 *
 *   NO INBOUND MESSAGES, and no empty "waiting for a reply" state pretending
 *   there could be. US-013 is deferred with four live blockers, so a customer
 *   cannot reply through this system at all. A panel implying a conversation is
 *   a fact the product does not have — `027`'s rule about drawing unbacked data.
 *
 *   NO RETRY BUTTON ON A FAILED MESSAGE. There is no retry endpoint, and
 *   re-sending is just sending again — which the composer already does. A
 *   "Retry" that quietly composes a second message would be a second row the
 *   agent did not know they created.
 *
 * FETCHES NOTHING. Data and handlers arrive as props; `TicketDetailPage` owns
 * all three queries (ADR-011 §4), so mounting this panel never introduces a
 * waterfall.
 * ========================================================================= */

export interface TicketMessagesPanelProps {
  /** From `GET /api/communications/channels`. **Empty disables the composer.** */
  sendableChannels: CommunicationChannel[];

  interactions: InteractionResponse[];

  /** `true` while the channel list or the first page is loading. */
  loading: boolean;

  /** The reader may send on this ticket — the server's answer, not a guess. */
  canSend: boolean;

  /** Set while a send is in flight, so submit can be disabled (AC-22). */
  sending: boolean;

  /**
   * A translated sentence for the last refusal, or `undefined`.
   *
   * **Rendered inline beside the composer, never as a toast** — the same rule
   * `016`'s escalate dialog follows: a refusal is about the thing the reader is
   * looking at, with the text they typed still in the field.
   */
  failure?: string | undefined;

  onSend: (channel: CommunicationChannel, body: string) => void;

  lang: Lang;
}

/** Matches `Interaction.BodyMaxLength` and the column. */
export const MESSAGE_MAX = 4000;

export function TicketMessagesPanel({
  sendableChannels,
  interactions,
  loading,
  canSend,
  sending,
  failure,
  onSend,
  lang,
}: TicketMessagesPanelProps) {
  const { t } = useTranslation('tickets');

  /* THE FIRST SENDABLE CHANNEL, not a hard-coded `Email`. If the deployment
     registers only SMS, the composer opens on SMS. `undefined` when nothing is
     registered, which is the state that disables the whole composer. */
  const [channel, setChannel] = useState<CommunicationChannel | ''>('');
  const [body, setBody] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const effectiveChannel = channel === '' ? sendableChannels[0] : channel;
  const trimmed = body.trim();

  const disabled = !canSend || sending || sendableChannels.length === 0;

  function submit() {
    setSubmitted(true);

    if (trimmed === '' || trimmed.length > MESSAGE_MAX) return;
    if (effectiveChannel === undefined) return;

    onSend(effectiveChannel, trimmed);
    setBody('');
    setSubmitted(false);
  }

  return (
    <section className={styles.panel} aria-label={t('messages.panelLabel')}>
      {/* ── the record ─────────────────────────────────────────────────────── */}
      {loading ? (
        <p className={styles.state}>{t('messages.loading')}</p>
      ) : interactions.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t('messages.emptyTitle')}</p>
          <p className={styles.emptyBody}>{t('messages.emptyBody')}</p>
        </div>
      ) : (
        <ol className={styles.list}>
          {interactions.map((interaction) => (
            <li key={interaction.id} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.channel}>
                  {(() => {
                    const Glyph = CHANNEL_ICON[interaction.channel];
                    return Glyph ? <Glyph size={13} /> : null;
                  })()}
                  {t(`channel.${interaction.channel}`)}
                </span>

                {/* THE ADDRESS IT ACTUALLY WENT TO. `dir="ltr"` and never
                    mirrored: an email address and an E.164 number read
                    left-to-right in every locale, and reversing either makes it
                    unusable for the one thing a reader does with it — check it. */}
                <span className={styles.recipient} dir="ltr">
                  {interaction.recipientAddress}
                </span>

                <DeliveryStatusBadge status={interaction.deliveryStatus} />

                <time className={styles.time} dateTime={interaction.createdAtUtc}>
                  {formatDateTime(interaction.createdAtUtc, lang)}
                </time>
              </div>

              {/* `dir="auto"` — the message is the agent's own words and can be
                  Arabic on an English screen, or the reverse. */}
              <p className={styles.body} dir="auto">
                {interaction.body}
              </p>

              {interaction.deliveryStatus === 'Failed' ? (
                <p className={styles.failure} role="status">
                  <IconAlert size={13} aria-hidden="true" />
                  {/* THE CODE IS MAPPED, NEVER RENDERED RAW (AC-22). An
                      unrecognised code — which a real provider will produce —
                      falls back to a generic translated sentence rather than
                      showing the reader `MockConfiguredFailure`. */}
                  {t(`messages.failure.${interaction.failureCode}`, {
                    defaultValue: t('messages.failure.unknown'),
                  })}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {/* ── the composer ───────────────────────────────────────────────────── */}
      {sendableChannels.length === 0 ? (
        /* THE MODULE IS VISIBLY DISABLED, which is the designed alternative to a
           composer that offers nothing and fails on submit. The server returns an
           empty set when no provider is registered. */
        <p className={cx(styles.notice, styles.noticeInfo)}>
          {t('messages.noChannels')}
        </p>
      ) : !canSend ? (
        /* Q-A. An Agent on somebody else's ticket. The server would answer `403`
           and the audit trail would carry a denial — so the composer says why
           instead of inviting the refusal. */
        <p className={cx(styles.notice, styles.noticeInfo)}>
          {t('messages.notPermitted')}
        </p>
      ) : (
        <div className={styles.composer}>
          {failure === undefined ? null : (
            <p className={cx(styles.notice, styles.noticeError)} role="alert">
              <IconAlert size={15} aria-hidden="true" className={styles.noticeIcon} />
              {failure}
            </p>
          )}

          {/* THE OPTIONS COME FROM THE SERVER (AC-22). `Dropdown` and not a
              native select, because it is the primitive this product has — there
              is no `Select`, and adding a ninth primitive needs a written reason
              (ADR-009) that "I wanted a shorter element" is not. */}
          <Dropdown
            label={t('messages.channel')}
            value={effectiveChannel ?? null}
            onChange={(value) => setChannel((value ?? '') as CommunicationChannel | '')}
            options={sendableChannels.map((option) => ({
              value: option,
              label: t(`channel.${option}`),
              icon: (() => {
                const Glyph = CHANNEL_ICON[option];
                return Glyph ? <Glyph size={14} aria-hidden="true" /> : undefined;
              })(),
            }))}
            disabled={sending}
            size="sm"
          />

          <Textarea
            label={t('messages.body')}
            value={body}
            onChange={setBody}
            placeholder={t('messages.bodyPlaceholder')}
            helperText={t('messages.bodyHelp')}
            error={
              submitted && trimmed === '' ? t('messages.bodyRequired') : undefined
            }
            rows={3}
            required
            maxLength={MESSAGE_MAX}
            counterFrom={MESSAGE_MAX - 200}
            disabled={sending}
          />

          <div className={styles.composerFoot}>
            {/* WHERE IT WILL GO, before it goes. The reader is about to send
                something a CUSTOMER receives, and the address is resolved
                server-side — so showing it is the only way they can check it. */}
            <span className={styles.sendHint}>{t('messages.sendHint')}</span>

            <Button
              text={t('messages.send')}
              onClick={submit}
              loading={sending}
              /* Disabled while in flight, which is the honest mitigation for an
                 endpoint that is deliberately not idempotent: two clicks would
                 be two messages, and the server cannot tell them apart from two
                 intents. */
              disabled={disabled || trimmed === ''}
            />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Two enum values over the existing `Badge` geometry. `021`.
 *
 * **No ninth primitive** (ADR-009). This maps a delivery status onto the same
 * chip shape the ticket status badge uses, and "the badge has different words in
 * it" is not a written reason for a new primitive.
 *
 * **Icon plus label, never colour alone.** `Accepted` and `Failed` differ by
 * more than hue, so the state survives a monochrome screen and a reader who
 * cannot separate green from red.
 *
 * **`Accepted` is not "delivered", and the label says so.** What a provider can
 * report synchronously is that it took responsibility; whether it reached a
 * handset arrives later through a callback this product does not have. A label
 * reading "Delivered" would be a claim the system cannot make — and one a
 * support agent would repeat to a customer.
 */
export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  const { t } = useTranslation('tickets');

  return (
    <span
      className={cx(
        styles.badge,
        status === 'Accepted' ? styles.badgeAccepted : styles.badgeFailed,
      )}
    >
      {status === 'Accepted' ? (
        <IconCheck size={12} aria-hidden="true" />
      ) : (
        <IconAlert size={12} aria-hidden="true" />
      )}
      {t(`messages.status.${status}`)}
    </span>
  );
}
