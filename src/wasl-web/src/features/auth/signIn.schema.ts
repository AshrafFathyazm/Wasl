import { z } from 'zod';

import type { SignInRequest } from '../../lib/api-types.provisional';

/* ============================================================================
 * signIn.schema.ts — the client mirror
 * ============================================================================
 *
 * A MIRROR, NEVER THE AUTHORITY. Every rule here is enforced server-side; this
 * exists so the user is told sooner (constitution III). If the two disagree, the
 * server is right and this is the defect.
 *
 * ONE SCHEMA drives the form's validation and the request's type, so the form
 * cannot allow what the request forbids.
 *
 * MESSAGES ARE i18n KEYS, not sentences. Zod has no catalogue; the form resolves
 * each key through `t()` where it renders it.
 *
 * WHAT IS DELIBERATELY NOT HERE — each of these is the server's, and putting a
 * second implementation in the client is how the two come to disagree:
 *
 *   - `.trim()` on `password`. Whitespace is part of a password.
 *   - `.trim()` or `.toLowerCase()` on `email`. The server normalises before
 *     lookup; the client sends what was typed.
 *   - Anything about whether the account exists, is active, or has a role. Only
 *     the server can answer, and its answer is deliberately indistinguishable
 *     between the three.
 * ============================================================================ */

export const signInSchema = z.object({
  /* `.email()` is the mirror of the contract's "must be a syntactically valid
   * email address, or 400". `.min(1)` FIRST so an empty field says "required"
   * rather than "not a valid address" — the second message is technically true
   * and reads as a rebuke for not having typed yet.
   *
   * NO `.trim()`. The max is 320 to match the contract, measured on what is
   * sent, which is what was typed.
   *
   * The length messages are `auth:` keys with their own sentences rather than
   * the shared `errors.maxLength`. That key is stored FLAT with a dot in its
   * name — `"errors.maxLength": "…"` — while i18next's default key separator is
   * also `.`, so which of the two a lookup resolves is a question this feature
   * should not be answering. It also interpolates `{{max}}`, and `024`'s
   * `message()` helper passes no variables. Raised, not fixed here (spec Q-7). */
  email: z
    .string()
    .min(1, { message: 'auth:validation.emailRequired' })
    .max(320, { message: 'auth:validation.emailTooLong' })
    .email({ message: 'auth:validation.emailInvalid' }),

  password: z
    .string()
    .min(1, { message: 'auth:validation.passwordRequired' })
    .max(256, { message: 'auth:validation.passwordTooLong' }),

  /* PART OF THE FORM, NOT PART OF THE REQUEST.
   *
   * It is in this schema because it is a form field with a value that has to be
   * typed and defaulted somewhere, and `toSignInRequest` is what keeps it off
   * the wire. The contract is explicit that no `rememberMe` field exists: the
   * server issues the same token either way, and this only chooses where the
   * client keeps it.
   *
   * DEFAULT UNCHECKED (spec Q-2, working assumption). It selects `localStorage`
   * over `sessionStorage`, which makes it a security posture rather than a
   * convenience — so it is opted into, not out of. */
  rememberMe: z.boolean(),
});

/** The form holds exactly this. */
export type SignInFormValues = z.input<typeof signInSchema>;

/** The parsed shape. Identical in structure here — nothing is narrowed or
 *  transformed — but derived rather than aliased, so a later `.trim()` or
 *  `.pipe()` cannot silently leave the two disagreeing. */
export type SignInParsed = z.output<typeof signInSchema>;

export const emptySignInForm: SignInFormValues = {
  email: '',
  password: '',
  rememberMe: false,
};

/**
 * Parsed values → the request body.
 *
 * A function rather than a spread, for one reason that is worth asserting on:
 * **`rememberMe` is dropped.** A spread would put it on the wire, where the
 * contract has no field for it — harmless today because the server ignores
 * unknown properties, and exactly the kind of thing that becomes a `400` the
 * day the server starts rejecting them. `TEST-025-02` checks the serialised
 * payload, not the form state; those are two different claims.
 */
export function toSignInRequest(values: SignInParsed): SignInRequest {
  return {
    email: values.email,
    password: values.password,
  };
}
