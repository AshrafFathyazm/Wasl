import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../../lib/api';
import type { InteractionResponse } from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';
import { TicketMessagesPanel } from './TicketMessagesPanel';
import { refusalToSend } from './TicketDetailPage';

/* ============================================================================
 * TicketMessagesPanel — `021` AC-22, AC-23
 * ============================================================================
 * The panel fetches nothing, so every case here is a prop combination. What is
 * worth asserting is the set of things the panel must NOT do: render a raw failure
 * code or imply a conversation the product cannot have. The composer tests moved
 * to `TicketComposer.test.tsx` with the composer (`040` item 7).
 * ========================================================================= */

const label = (key: string) => i18n.t(key, { ns: 'tickets' });

const interaction = (over: Partial<InteractionResponse> = {}): InteractionResponse => ({
  id: 'i-1',
  ticketId: 't-1',
  direction: 'Outbound',
  channel: 'Email',
  recipientAddress: 'ali@example.com',
  body: 'Your invoice has been corrected.',
  providerName: 'Mock',
  providerMessageId: 'mock-abc',
  deliveryStatus: 'Accepted',
  failureCode: null,
  sentByUserId: 'u-1',
  createdAtUtc: '2026-09-08T12:00:00Z',
  ...over,
});

function mount(over: Partial<Parameters<typeof TicketMessagesPanel>[0]> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TicketMessagesPanel
        interactions={[]}
        lang="en"
        {...over}
      />
    </I18nextProvider>,
  );
}

describe('TicketMessagesPanel', () => {
  // ── AC-22. A failure code is mapped, never rendered raw ────────────────────

  it('renders a known failure code as a translated sentence', () => {
    mount({
      interactions: [
        interaction({
          deliveryStatus: 'Failed',
          failureCode: 'MockConfiguredFailure',
          providerMessageId: null,
        }),
      ],
    });

    expect(
      screen.getByText(label('messages.failure.MockConfiguredFailure')),
    ).toBeInTheDocument();

    expect(screen.queryByText('MockConfiguredFailure')).not.toBeInTheDocument();
  });

  /**
   * An UNRECOGNISED code falls back to a sentence, and never shows the code.
   *
   * **A real provider will produce codes this client has never heard of**, which
   * is the whole reason `failureCode` is machine-readable rather than a
   * sentence — and the reason the fallback matters more than the known case.
   */
  it('renders an unknown failure code as a generic sentence, never raw', () => {
    mount({
      interactions: [
        interaction({
          deliveryStatus: 'Failed',
          failureCode: 'CarrierRejectedShortCode42',
          providerMessageId: null,
        }),
      ],
    });

    expect(screen.getByText(label('messages.failure.unknown'))).toBeInTheDocument();
    expect(screen.queryByText(/CarrierRejectedShortCode42/)).not.toBeInTheDocument();
  });

  // ── The delivery badge ─────────────────────────────────────────────────────

  /**
   * `Accepted` is not labelled "Delivered", and that is a correctness claim.
   *
   * What a provider reports synchronously is that it took responsibility; whether
   * the message reached a handset arrives later through a callback this product
   * does not have. "Delivered" would be a claim the system cannot make — and one
   * a support agent would repeat to a customer.
   */
  it('labels an accepted delivery as accepted and never as delivered', () => {
    mount({ interactions: [interaction()] });

    expect(screen.getByText(label('messages.status.Accepted'))).toBeInTheDocument();

    for (const overclaim of [/delivered/i, /تم التسليم/, /وصلت/]) {
      expect(screen.queryByText(overclaim)).not.toBeInTheDocument();
    }
  });

  it('shows a failed delivery as failed', () => {
    mount({
      interactions: [
        interaction({
          deliveryStatus: 'Failed',
          failureCode: 'MockConfiguredFailure',
          providerMessageId: null,
        }),
      ],
    });

    expect(screen.getByText(label('messages.status.Failed'))).toBeInTheDocument();
  });

  // ── The record's shape ─────────────────────────────────────────────────────

  /**
   * The recipient is rendered `dir="ltr"`, in both languages.
   *
   * An email address and an E.164 number read left to right everywhere, and
   * reversing either makes it unusable for the one thing a reader does with
   * it — check it before believing a message went to the right person.
   */
  it('renders the recipient address left-to-right', () => {
    mount({ interactions: [interaction()] });

    expect(screen.getByText('ali@example.com')).toHaveAttribute('dir', 'ltr');
  });

  /**
   * The body is `dir="auto"` — it can be Arabic on an English screen.
   */
  it('renders the message body with automatic direction', () => {
    const arabic = 'تم تصحيح فاتورتك.';

    mount({ interactions: [interaction({ body: arabic })] });

    expect(screen.getByText(arabic)).toHaveAttribute('dir', 'auto');
  });

  /**
   * The empty state does not imply a conversation.
   *
   * **US-013 is deferred with four live blockers, so a customer cannot reply
   * through this system at all.** A panel saying "no replies yet" or "waiting for
   * the customer" would be a fact the product does not have — `027`'s rule about
   * drawing unbacked data, applied to a sentence.
   */
  it('the empty state does not promise inbound messages', () => {
    mount();

    expect(screen.getByText(label('messages.emptyTitle'))).toBeInTheDocument();

    const panel = screen.getByRole('region', { name: label('messages.panelLabel') });

    for (const implied of [/repl(y|ies)/i, /inbound/i, /awaiting the customer/i]) {
      expect(panel.textContent ?? '').not.toMatch(implied);
    }
  });

  /**
   * There is no retry button on a failed message.
   *
   * There is no retry endpoint, and re-sending is just sending — which the
   * composer already does. A "Retry" that quietly composed a second message
   * would be a second row the agent did not know they created.
   */
  it('offers no retry on a failed message', () => {
    mount({
      interactions: [
        interaction({
          deliveryStatus: 'Failed',
          failureCode: 'MockConfiguredFailure',
          providerMessageId: null,
        }),
      ],
    });

    expect(screen.queryByRole('button', { name: /retry|إعادة/i })).not.toBeInTheDocument();
  });
});

describe('refusalToSend', () => {
  const t = (key: string) => key;

  const refusal = (status: number, type = 'internal') =>
    new ApiError(
      {
        type: `https://wasl.local/errors/${type}`,
        title: 'Refused',
        status,
        traceId: 't-1',
      },
      'en',
    );

  it.each([
    [409, 'ticket-closed', 'messages.error.closed'],
    [409, 'no-contact-for-channel', 'messages.error.noContact'],
    [403, 'forbidden', 'messages.error.forbidden'],
    [404, 'not-found', 'messages.error.notFound'],
    [503, 'transient-conflict', 'messages.error.transient'],
    [400, 'validation', 'messages.error.invalid'],
    [500, 'internal', 'messages.error.unknown'],
  ])('maps %d %s to %s', (status, type, expected) => {
    expect(refusalToSend(refusal(status, type), t)).toBe(expected);
  });

  /**
   * Branching on the last path segment, never the full URI — `002` AC-25.
   *
   * It is what makes `ProblemTypes.TypeBase` safe to change, and this asserts it
   * directly: a different base with the same segment gives the same message.
   */
  it('branches on the type segment and not the base URI', () => {
    for (const base of ['https://wasl.local/errors/', 'https://example.test/x/']) {
      expect(
        refusalToSend(
          new ApiError(
            { type: `${base}ticket-closed`, title: 't', status: 409 },
            'en',
          ),
          t,
        ),
      ).toBe('messages.error.closed');
    }
  });

  it('treats a non-ApiError as unknown', () => {
    expect(refusalToSend(new Error('network down'), t)).toBe('messages.error.unknown');
  });
});
