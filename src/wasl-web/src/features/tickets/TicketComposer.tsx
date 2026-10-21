import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button/Button';
import { Dropdown } from '../../components/Dropdown/Dropdown';
import { Textarea } from '../../components/Textarea/Textarea';
import { IconAlert, IconComment } from '../../icons/icons';
import type {
  CannedReplySummary,
  CommunicationChannel,
} from '../../lib/api-types.provisional';
import { cx } from '../../lib/cx';
import { CHANNEL_ICON } from './channelIcons';
import styles from './TicketDetail.module.css';
import { MESSAGE_MAX } from './TicketMessagesPanel';

/* ============================================================================
 * TicketComposer — `040` items 7 and 8
 * ============================================================================
 * ONE composer, one Send. Before it, the ticket page carried two: a comment box
 * above the tabs with an "Internal comment" switch, and — on the Messages tab — a
 * second box with its own channel list, counter and Send. Two Send buttons for
 * "tell somebody something" is a choice the reader had to understand before they
 * could write a word.
 *
 * TWO MODES, and the mode decides which endpoint the text goes to:
 *
 *   reply     → `021`'s outbound message through the channel provider. The channel
 *               list comes from the server (`GET /api/communications/channels`),
 *               the counter is the column's 4000, and what is sent is what the
 *               customer receives. Ruled by the product owner 2026-10-15: a reply
 *               to the customer is a MESSAGE, not a public comment — the old
 *               non-internal comment is no longer written from this screen.
 *   internal  → `013`'s comment with `isInternal: true` (BR-5.4). Amber, because
 *               the colour is the only thing that says "the customer will not
 *               see this" at the moment the button is pressed.
 *
 * THE TWO DRAFTS ARE SEPARATE, ON PURPOSE. One shared text box would let a
 * half-written internal note ("she is being difficult") become a customer-facing
 * message by flipping the switch and pressing Send. Each mode keeps what was typed
 * in it, and neither can leak into the other.
 *
 * THE MODE DEFAULTS TO REPLY WHEN A REPLY IS POSSIBLE, internal otherwise — a
 * deployment with no outbound channel, or an Agent on somebody else's ticket,
 * opens on the only thing they can do rather than on a disabled form. The reader's
 * own choice, once made, wins.
 *
 * FETCHES NOTHING. Mutations and queries stay on the page (ADR-011 §4); this is
 * the form and its local state.
 * ========================================================================= */

export type ComposerMode = 'reply' | 'internal';

export interface TicketComposerProps {
  /** For the template menu's heading. */
  categoryLabel: string;
  templates: CannedReplySummary[];

  /** From `GET /api/communications/channels`. Empty makes reply unavailable. */
  sendableChannels: CommunicationChannel[];
  /** Q-A's rule, mirrored for UX — the server enforces it and audits a denial. */
  canReply: boolean;

  notePending: boolean;
  /** A note was refused or lost; its text is still in the box. */
  noteFailed: boolean;
  replyPending: boolean;
  /** A translated sentence for the last refused reply. */
  replyFailure?: string | undefined;

  /** `onDone` clears the draft; the page calls it from the mutation's success. */
  onSendNote: (body: string, onDone: () => void) => void;
  onSendReply: (channel: CommunicationChannel, body: string, onDone: () => void) => void;
}

export function TicketComposer({
  categoryLabel,
  templates,
  sendableChannels,
  canReply,
  notePending,
  noteFailed,
  replyPending,
  replyFailure,
  onSendNote,
  onSendReply,
}: TicketComposerProps) {
  const { t } = useTranslation('tickets');

  const replyAvailable = canReply && sendableChannels.length > 0;

  const [chosen, setChosen] = useState<ComposerMode | null>(null);
  const mode: ComposerMode = chosen ?? (replyAvailable ? 'reply' : 'internal');
  const internal = mode === 'internal';

  const [noteDraft, setNoteDraft] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [channel, setChannel] = useState<CommunicationChannel | ''>('');
  const effectiveChannel = channel === '' ? sendableChannels[0] : channel;

  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!templatesOpen) return undefined;

    const close = (event: MouseEvent) => {
      if (templateRef.current?.contains(event.target as Node)) return;
      setTemplatesOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTemplatesOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [templatesOpen]);

  const draft = internal ? noteDraft : replyDraft;
  const setDraft = internal ? setNoteDraft : setReplyDraft;
  const trimmed = draft.trim();
  const pending = internal ? notePending : replyPending;

  const canSubmit =
    trimmed !== '' &&
    !pending &&
    (internal || (replyAvailable && trimmed.length <= MESSAGE_MAX));

  function submit() {
    if (!canSubmit) return;
    if (internal) {
      onSendNote(trimmed, () => setNoteDraft(''));
      return;
    }
    if (effectiveChannel === undefined) return;
    onSendReply(effectiveChannel, trimmed, () => setReplyDraft(''));
  }

  const modes: Array<{ value: ComposerMode; label: string }> = [
    { value: 'reply', label: t('detail.modeReply') },
    { value: 'internal', label: t('detail.modeInternal') },
  ];

  return (
    <div className={styles.composeBox}>
      {/* The mode switch. Buttons with `aria-pressed` in a labelled group: it is a
          choice of what the NEXT text is, not a field being submitted. */}
      <div
        className={styles.modeSwitch}
        role="group"
        aria-label={t('detail.composerMode')}
      >
        {modes.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            className={cx(
              styles.modeButton,
              mode === option.value && styles.modeButtonOn,
              mode === option.value &&
                option.value === 'internal' &&
                styles.modeButtonInternal,
            )}
            onClick={() => setChosen(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {internal && noteFailed ? (
        <div className={styles.sendError} role="alert">
          <strong>{t('detail.sendFailedTitle')}</strong>
          <span>{t('detail.sendFailedBody')}</span>
        </div>
      ) : null}

      {!internal && replyFailure !== undefined ? (
        <div className={styles.sendError} role="alert">
          <IconAlert size={15} aria-hidden="true" />
          <span>{replyFailure}</span>
        </div>
      ) : null}

      {!internal && !replyAvailable ? (
        /* THE REASON, rather than a composer that offers nothing and fails on
           submit. Same two sentences `021` wrote for the panel this replaces. */
        <p className={styles.internalNote}>
          {t(
            sendableChannels.length === 0
              ? 'messages.noChannels'
              : 'messages.notPermitted',
          )}
        </p>
      ) : (
        <div
          className={cx(
            styles.composeShell,
            internal && styles.composeShellInternal,
            ((internal && noteFailed) || (!internal && replyFailure !== undefined)) &&
              styles.composeShellBad,
          )}
        >
          <Textarea
            label={t(internal ? 'detail.modeInternal' : 'detail.modeReply')}
            labelHidden
            placeholder={t(
              internal ? 'detail.internalPlaceholder' : 'messages.bodyPlaceholder',
            )}
            value={draft}
            onChange={setDraft}
            rows={3}
            {...(internal
              ? {}
              : { maxLength: MESSAGE_MAX, counterFrom: MESSAGE_MAX - 200 })}
          />

          <div className={styles.composeBar}>
            {templates.length > 0 ? (
              <div className={styles.popWrap} ref={templateRef}>
                {/* `034`'s templates INSERT into the draft rather than sending: a
                    template is a starting point, and a picker that sent would
                    post an unedited form letter with one click. */}
                <button
                  type="button"
                  className={styles.composeTool}
                  aria-expanded={templatesOpen}
                  onClick={() => setTemplatesOpen((open) => !open)}
                >
                  <IconComment size={14} aria-hidden="true" />
                  {t('detail.useTemplate')}
                </button>
                {templatesOpen ? (
                  <div className={styles.templateMenu} role="menu">
                    <span className={styles.popHead}>
                      {`${t('detail.cannedReplies')} · ${categoryLabel}`}
                    </span>
                    {templates.map((reply) => (
                      <button
                        key={reply.id}
                        type="button"
                        role="menuitem"
                        className={styles.templateItem}
                        onClick={() => {
                          setDraft(reply.body);
                          setTemplatesOpen(false);
                        }}
                      >
                        <span className={styles.templateTitle} dir="auto">
                          {reply.title}
                        </span>
                        <span className={styles.templatePreview} dir="auto">
                          {reply.body}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* The channel belongs to a REPLY only — an internal note goes nowhere.
                Options come from the server; there is no client list to drift. */}
            {internal ? null : (
              <div className={styles.channelPick}>
                <Dropdown
                  label={t('messages.channel')}
                  value={effectiveChannel ?? null}
                  onChange={(value) =>
                    setChannel((value ?? '') as CommunicationChannel | '')
                  }
                  options={sendableChannels.map((option) => ({
                    value: option,
                    label: t(`channel.${option}`),
                    icon: (() => {
                      const Glyph = CHANNEL_ICON[option];
                      return Glyph ? <Glyph size={14} aria-hidden="true" /> : undefined;
                    })(),
                  }))}
                  disabled={replyPending}
                  size="sm"
                />
              </div>
            )}

            <span
              /* AMBER WHEN INTERNAL, and the label says which kind it sends. */
              className={cx(styles.composeSend, internal && styles.composeSendInternal)}
            >
              <Button
                text={t(internal ? 'detail.sendNote' : 'detail.sendReply')}
                loading={pending}
                /* Disabled while in flight: neither endpoint is idempotent, so two
                   clicks would be two rows the reader did not know they made. */
                disabled={!canSubmit}
                onClick={submit}
              />
            </span>
          </div>

          {/* ITEM 8 — the helper follows the mode: who sees this, and where it goes. */}
          <span className={cx(styles.internalNote, internal && styles.internalNoteOn)}>
            {t(internal ? 'detail.internalHintOn' : 'messages.sendHint')}
          </span>
        </div>
      )}
    </div>
  );
}
