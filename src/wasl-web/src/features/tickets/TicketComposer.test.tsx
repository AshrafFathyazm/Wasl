import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '../../lib/i18n';
import { TicketComposer, type TicketComposerProps } from './TicketComposer';
import { MESSAGE_MAX } from './TicketMessagesPanel';

/* ============================================================================
 * TicketComposer — `040` items 7 and 8
 * ============================================================================
 * What is worth asserting is where each mode's text GOES and that one mode's text
 * can never reach the other's endpoint: a half-written internal note must not
 * become a customer message by flipping a switch.
 * ========================================================================= */

const label = (key: string) => i18n.t(key, { ns: 'tickets' });

const onSendNote = vi.fn();
const onSendReply = vi.fn();

function mount(over: Partial<TicketComposerProps> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TicketComposer
        categoryLabel="Billing"
        templates={[]}
        sendableChannels={['Email', 'WhatsApp', 'Sms']}
        canReply
        notePending={false}
        noteFailed={false}
        replyPending={false}
        onSendNote={onSendNote}
        onSendReply={onSendReply}
        {...over}
      />
    </I18nextProvider>,
  );
}

const field = () => screen.getByRole('textbox');
const modeButton = (key: string) => screen.getByRole('button', { name: label(key) });
const sendButtons = () =>
  screen.queryAllByRole('button', {
    name: new RegExp(`^(${label('detail.sendReply')}|${label('detail.sendNote')})$`),
  });

beforeEach(() => {
  onSendNote.mockReset();
  onSendReply.mockReset();
});

describe('one composer, exactly one Send (AC-5)', () => {
  it('renders a single Send control whichever mode is on', async () => {
    mount();

    expect(sendButtons()).toHaveLength(1);

    await userEvent.click(modeButton('detail.modeInternal'));

    expect(sendButtons()).toHaveLength(1);
  });

  it('the mode changes the Send label, the helper and the placeholder', async () => {
    mount();

    expect(screen.getByRole('button', { name: label('detail.sendReply') })).toBeInTheDocument();
    expect(screen.getByText(label('messages.sendHint'))).toBeInTheDocument();
    expect(field()).toHaveAttribute('placeholder', label('messages.bodyPlaceholder'));

    await userEvent.click(modeButton('detail.modeInternal'));

    expect(screen.getByRole('button', { name: label('detail.sendNote') })).toBeInTheDocument();
    expect(screen.getByText(label('detail.internalHintOn'))).toBeInTheDocument();
    expect(screen.queryByText(label('messages.sendHint'))).not.toBeInTheDocument();
    expect(field()).toHaveAttribute('placeholder', label('detail.internalPlaceholder'));
  });
});

describe('where each mode sends', () => {
  it('Reply sends a message on the first sendable channel, trimmed', async () => {
    mount({ sendableChannels: ['Sms', 'Email'] });

    await userEvent.type(field(), '   Corrected.   ');
    await userEvent.click(screen.getByRole('button', { name: label('detail.sendReply') }));

    expect(onSendReply).toHaveBeenCalledWith('Sms', 'Corrected.', expect.any(Function));
    expect(onSendNote).not.toHaveBeenCalled();
  });

  it('Internal note sends a comment and never a message', async () => {
    mount();

    await userEvent.click(modeButton('detail.modeInternal'));
    await userEvent.type(field(), 'Customer called twice.');
    await userEvent.click(screen.getByRole('button', { name: label('detail.sendNote') }));

    expect(onSendNote).toHaveBeenCalledWith('Customer called twice.', expect.any(Function));
    expect(onSendReply).not.toHaveBeenCalled();
  });

  it('clears the draft only when the page says the write landed', async () => {
    mount();
    await userEvent.type(field(), 'Hello.');
    await userEvent.click(screen.getByRole('button', { name: label('detail.sendReply') }));

    /* Still there: nothing has called onDone, which is what a failed write looks like. */
    expect(field()).toHaveValue('Hello.');

    const onDone = onSendReply.mock.calls[0]?.[2] as () => void;
    act(() => onDone());

    expect(field()).toHaveValue('');
  });
});

describe('the two drafts never mix', () => {
  it('keeps an internal note out of the reply box and back again', async () => {
    mount();

    await userEvent.type(field(), 'To the customer');
    await userEvent.click(modeButton('detail.modeInternal'));

    expect(field()).toHaveValue('');
    await userEvent.type(field(), 'Private remark');

    await userEvent.click(modeButton('detail.modeReply'));
    expect(field()).toHaveValue('To the customer');

    await userEvent.click(modeButton('detail.modeInternal'));
    expect(field()).toHaveValue('Private remark');
  });
});

describe('the default mode', () => {
  it('opens on Reply when a reply is possible', () => {
    mount();
    expect(modeButton('detail.modeReply')).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens on Internal note, with the reason under Reply, when no channel is registered', async () => {
    mount({ sendableChannels: [] });

    expect(modeButton('detail.modeInternal')).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(modeButton('detail.modeReply'));
    expect(screen.getByText(label('messages.noChannels'))).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: label('detail.sendReply') }),
    ).not.toBeInTheDocument();
  });

  it('explains rather than offering a reply the server would refuse', async () => {
    mount({ canReply: false });

    expect(modeButton('detail.modeInternal')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(modeButton('detail.modeReply'));
    expect(screen.getByText(label('messages.notPermitted'))).toBeInTheDocument();
  });

  it('a reader own choice beats the default', async () => {
    mount();
    await userEvent.click(modeButton('detail.modeInternal'));
    expect(modeButton('detail.modeInternal')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('the reply boundaries', () => {
  it('will not send an empty or whitespace-only reply', async () => {
    mount();

    const send = screen.getByRole('button', { name: label('detail.sendReply') });
    expect(send).toBeDisabled();
    await userEvent.type(field(), '   ');
    expect(send).toBeDisabled();
    await userEvent.type(field(), 'x');
    expect(send).toBeEnabled();
  });

  it('caps the reply at the column length', () => {
    mount();
    expect(field()).toHaveAttribute('maxlength', String(MESSAGE_MAX));
  });

  it('offers only the channels the server reported', async () => {
    mount({ sendableChannels: ['Sms'] });

    await userEvent.click(screen.getByRole('combobox', { name: label('messages.channel') }));
    expect(screen.getByRole('option', { name: label('channel.Sms') })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: label('channel.Email') }),
    ).not.toBeInTheDocument();
  });

  it('disables Send while a reply is in flight', () => {
    mount({ replyPending: true });
    expect(screen.getByRole('button', { name: label('detail.sendReply') })).toBeDisabled();
  });

  it('shows a refused reply inline, as an alert', () => {
    mount({ replyFailure: 'This ticket is closed.' });
    expect(screen.getByRole('alert')).toHaveTextContent('This ticket is closed.');
  });
});

describe('a failed note keeps its text and says so', () => {
  it('shows the failure banner in internal mode only', async () => {
    mount({ noteFailed: true });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await userEvent.click(modeButton('detail.modeInternal'));
    expect(screen.getByRole('alert')).toHaveTextContent(label('detail.sendFailedTitle'));
  });
});
