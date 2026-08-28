import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import i18n from '../../lib/i18n';
import { LoginForm } from './LoginForm';

/* ============================================================================
 * The sign-in form — D-1, D-4, and the submit gate
 * ============================================================================
 *
 * Every claim here was a DEFECT first, found in a browser and not in the source.
 * Each one had correct-looking code: the prop was passed, the option was set,
 * the state was computed. None of them worked.
 * ============================================================================ */

function renderForm(props: Partial<Parameters<typeof LoginForm>[0]> = {}) {
  const onSubmit = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <LoginForm onSubmit={onSubmit} submitting={false} {...props} />
    </I18nextProvider>,
  );
  return { onSubmit };
}

const email = () => screen.getByRole('textbox', { name: /email/i });
const password = () => document.querySelector('input[name="password"]') as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /sign in/i });

describe('D-1 — focus returns to the email field after a rejected credential', () => {
  it('moves focus to email when the error block appears', async () => {
    /* THE DEFECT. `shouldFocusError: true` was set and inert, because
     * `field.ref` was never forwarded from `Controller` to `Input`. Worse, the
     * inputs are disabled while the request is in flight, and disabling the
     * focused element moves focus to <body> — so after a 401 the caret was
     * nowhere and the next Tab started from the top of the page.
     *
     * A rejected credential is NOT a validation error, so RHF cannot do this
     * one: the schema passed and the server said no. */
    const user = userEvent.setup();
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <LoginForm onSubmit={vi.fn()} submitting={false} />
      </I18nextProvider>,
    );

    /* The realistic sequence: both fields filled, so the submit is enabled and
     * can hold focus — which is where focus actually is when someone presses it. */
    await user.type(email(), 'agent2@wasl.local');
    await user.type(password(), 'wrong-password');
    submit().focus();
    expect(document.activeElement).toBe(submit());

    /* The 401 comes back and the parent hands down the error block. */
    rerender(
      <I18nextProvider i18n={i18n}>
        <LoginForm
          onSubmit={vi.fn()}
          submitting={false}
          errorMessage="Email or password is incorrect"
        />
      </I18nextProvider>,
    );

    await waitFor(() => expect(document.activeElement).toBe(email()));
  });
});

describe('D-4 — a rejected credential marks both fields WITHOUT naming one', () => {
  it('sets aria-invalid on both inputs and attaches no field message', () => {
    /* THE DEFECT. `error=""` was used to mean "invalid, no message", and
     * `Input`'s `hasError` tests `!== ''` — so an empty string read as NO error.
     * Neither field took the danger border, `aria-invalid` never appeared, and
     * the form looked correct while announcing nothing. */
    renderForm({ errorMessage: 'Email or password is incorrect' });

    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(password()).toHaveAttribute('aria-invalid', 'true');

    /* The server returns ONE body for three causes. A per-field message would
     * say which field was wrong, which is the enumeration that shape prevents. */
    expect(email()).not.toHaveAccessibleDescription();
    expect(password()).not.toHaveAccessibleDescription();
  });

  it('puts the failure in a single assertive alert', () => {
    renderForm({ errorMessage: 'Email or password is incorrect' });

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Email or password is incorrect');
  });

  it('marks neither field when there is no failure', () => {
    renderForm();

    expect(email()).not.toHaveAttribute('aria-invalid');
    expect(password()).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('AC-26 — the attributes a password manager needs', () => {
  it('carries name and autocomplete on both fields', () => {
    /* Two attributes. Without them every sign-in becomes manual, nothing errors,
     * and nobody files it. */
    renderForm();

    expect(email()).toHaveAttribute('name', 'email');
    expect(email()).toHaveAttribute('autocomplete', 'email');
    expect(password()).toHaveAttribute('name', 'password');
    expect(password()).toHaveAttribute('autocomplete', 'current-password');
  });

  it('renders the password as a password field', () => {
    renderForm();
    expect(password()).toHaveAttribute('type', 'password');
  });
});

describe('the submit is gated on both fields being non-empty', () => {
  it('is disabled with an empty form', () => {
    renderForm();
    expect(submit()).toBeDisabled();
  });

  it('is still disabled with only an email', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(email(), 'agent2@wasl.local');

    expect(submit()).toBeDisabled();
  });

  it('enables once both hold content', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(email(), 'agent2@wasl.local');
    await user.type(password(), 'x');

    expect(submit()).toBeEnabled();
  });

  it('enables for a password of only whitespace', async () => {
    /* PRESENCE, NOT VALIDITY — and the password is never trimmed. A password of
     * three spaces is a password, and trimming here would leave the button dead
     * for exactly the person whose password that is. */
    const user = userEvent.setup();
    renderForm();

    await user.type(email(), 'agent2@wasl.local');
    await user.type(password(), '   ');

    expect(submit()).toBeEnabled();
  });

  it('does not wait for the email to be VALID', async () => {
    /* A button that stays dead while someone types a plausible address gives
     * them no way to learn what is wrong with it. Zod's message on blur does
     * that, and it can only run if the form is submittable. */
    const user = userEvent.setup();
    renderForm();

    await user.type(email(), 'not-an-email');
    await user.type(password(), 'x');

    expect(submit()).toBeEnabled();
  });
});

describe('the password reveal toggle', () => {
  it('flips the field between password and text, and says which', async () => {
    const user = userEvent.setup();
    renderForm();

    const toggle = screen.getByRole('button', { name: /show password/i });
    expect(password()).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);

    expect(password()).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide password/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps the field dir="ltr" while revealed', async () => {
    /* `dir="auto"` reads direction from the first strong character. A revealed
     * password must not start following it and jump ends mid-entry under RTL. */
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: /show password/i }));

    expect(password()).toHaveAttribute('dir', 'ltr');
  });
});
