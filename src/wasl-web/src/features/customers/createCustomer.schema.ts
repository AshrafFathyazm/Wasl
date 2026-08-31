import { z } from 'zod';

import type { CreateCustomerRequest } from '../../lib/api-types.provisional';

/* ============================================================================
 * createCustomer.schema.ts — the client mirror
 * ============================================================================
 *
 * A MIRROR, NEVER THE AUTHORITY. Every rule here is enforced server-side too;
 * this exists so the user is told sooner (constitution III). If the two ever
 * disagree, the server is right and this is the defect.
 *
 * ONE SCHEMA drives the form's validation and the request's type (ADR-011 §7).
 *
 * MESSAGES ARE i18n KEYS, not sentences — Zod has no catalogue, and the form
 * resolves each key through `t()` where it renders it. A sentence here would be
 * an untranslated string in a file the lint rule does not scan.
 *
 * WHAT IS DELIBERATELY NOT HERE: any duplicate check. BR-4.4 and BR-4.5 are the
 * server's, enforced by two filtered unique indexes (BR-4.8), and the `409` is
 * how this client learns. A pre-check would be a check-then-create that two
 * concurrent requests both pass — `007` AC-13 is the test that exists because of
 * it — and it would also leak whether an address is on file to anyone who can
 * open the form.
 * ============================================================================ */

/** BR-4.2's own limit. The server trims and lowercases before comparing. */
const EMAIL_MAX = 320;
/** BR-4.3. The server normalises to E.164 and rejects what it cannot parse. */
const PHONE_MAX = 20;

/**
 * A blank optional becomes `null`, and that is the whole reason this exists.
 *
 * The form holds `''` for an untouched field. Sending `""` for `email` is not
 * the same request as omitting it: the server validates the syntax of a present
 * value, so `""` earns a `400` on a field the user never filled in. The contract
 * example sends `null` for an absent optional, and that is what goes on the wire.
 */
const blankToNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export const createCustomerSchema = z
  .object({
    /* `.trim()` BEFORE `.min(1)`. A name of three spaces passes a bare
     * `min(1)`, reaches the server, and comes back a `400` on a field the form
     * had just called valid (the same rule `024` wrote for `subject`). What is
     * measured is what is left, and what is SENT is the trimmed value, which is
     * what the server stores. */
    fullName: z
      .string()
      .trim()
      .min(1, { message: 'customers:new.nameRequired' })
      .max(200, { message: 'customers:new.tooLong' }),

    /* Optional, and validated ONLY when present.
     *
     * The order matters: `transform` first, so an untouched field is `null`
     * before any syntax rule looks at it, then `refine` on the nullable result.
     * `z.string().email().optional()` cannot express this — it would reject the
     * `''` the form actually holds. */
    email: z
      .string()
      .max(EMAIL_MAX, { message: 'customers:new.tooLong' })
      .transform(blankToNull)
      .refine((value) => value === null || z.string().email().safeParse(value).success, {
        message: 'customers:new.emailInvalid',
      }),

    /* A LIGHT CHECK ONLY, and `08-create-customer.md` says so in as many words.
     *
     * The server owns E.164 normalisation (BR-4.3) and accepts forms this
     * pattern would have to enumerate: `+966 50 123 4567`, `0501234567`,
     * `+966501234567`. A strict client pattern would refuse input the API
     * accepts — a client narrowing its own API, which is the one direction it
     * may not narrow it (spec Q-3). So: digits, spaces, dashes, parentheses and
     * a leading `+`, nothing more. An unparseable value is a `400` naming
     * `phone`, never a `409`.
     */
    phone: z
      .string()
      .max(PHONE_MAX, { message: 'customers:new.tooLong' })
      .transform(blankToNull)
      .refine((value) => value === null || /^\+?[\d\s()-]{6,}$/.test(value), {
        message: 'customers:new.phoneInvalid',
      }),

    companyName: z
      .string()
      .max(200, { message: 'customers:new.tooLong' })
      .transform(blankToNull),

    notes: z
      .string()
      .max(2000, { message: 'customers:new.tooLong' })
      .transform(blankToNull),
  })
  /* ---- BR-4.1 — at least one contact method ---------------------------------
   * A CROSS-FIELD REFINEMENT, and it names BOTH fields, because the server does:
   * `007`'s `400` example carries the same message under `email` and under
   * `phone`. Naming one of them would tell the user to fix the field they did
   * not choose.
   *
   * `superRefine` rather than `refine`, so the issue can be attached to a path
   * at all — a bare `refine` on the object produces a form-level error with no
   * field, and React Hook Form has nowhere to render it.
   * ------------------------------------------------------------------------ */
  .superRefine((values, ctx) => {
    if (values.email !== null || values.phone !== null) return;

    for (const path of ['email', 'phone'] as const) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message: 'customers:new.contactRequired',
      });
    }
  });

/** The form holds STRINGS — `''` is how "untouched" is representable. */
export type CreateCustomerFormValues = z.input<typeof createCustomerSchema>;

/** The PARSED shape — trimmed, blanks turned to `null`. */
export type CreateCustomerParsed = z.output<typeof createCustomerSchema>;

/** Every field present and blank. */
export const emptyCreateCustomerForm: CreateCustomerFormValues = {
  fullName: '',
  email: '',
  phone: '',
  companyName: '',
  notes: '',
};

/**
 * Parsed values → the request body.
 *
 * A function rather than passing the parsed object straight through, so the
 * request shape is stated in one place and a field added to the form does not
 * silently become a field on the wire. `007`'s contract records that an unknown
 * field in the body is ignored — which means the mistake would be invisible.
 */
export function toCreateCustomerRequest(
  values: CreateCustomerParsed,
): CreateCustomerRequest {
  return {
    fullName: values.fullName,
    email: values.email,
    phone: values.phone,
    companyName: values.companyName,
    notes: values.notes,
  };
}
