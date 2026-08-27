import { z } from 'zod';

import {
  COMMUNICATION_CHANNELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type CreateTicketRequest,
} from '../../lib/api-types.provisional';

/* ============================================================================
 * createTicket.schema.ts — the client mirror
 * ============================================================================
 *
 * A MIRROR, NEVER THE AUTHORITY. Every rule here is also enforced server-side;
 * this exists so the user is told sooner (constitution III). If the two ever
 * disagree, the server is right and this is the defect.
 *
 * ONE SCHEMA drives the form's validation and the request's type (ADR-011 §7),
 * so the form cannot allow what the request forbids.
 *
 * THE ENUM LISTS COME FROM THE PROVISIONAL TYPES, never from literals here. A
 * hand-typed `'SMS'` in this file produces a `400` that reads as a BACKEND bug,
 * and the backend lane investigates its own code while the dropdown looks
 * complete.
 *
 * MESSAGES ARE i18n KEYS, not sentences. Zod is not a rendering layer and has no
 * catalogue; the form resolves each key through `t()` where it renders it.
 * ============================================================================ */

/**
 * A string in, the narrowed enum out.
 *
 * `z.string().pipe(z.enum(…))` rather than `z.enum(…)` alone, and the reason is
 * the resolver rather than taste: `z.enum`'s INPUT type is the enum itself, so a
 * form holding `''` for an untouched select cannot be typed against it, and the
 * usual escape is to cast the resolver. The pipe makes the schema honestly
 * accept a string and narrow it — same validation, same messages, and no cast
 * anywhere.
 *
 * Zod wants a non-empty tuple; the runtime lists are `readonly T[]`. That is the
 * one place the two shapes meet.
 */
const asEnum = <T extends string>(values: readonly T[], message: string) =>
  z.string().pipe(z.enum(values as unknown as [T, ...T[]], { message }));

export const createTicketSchema = z.object({
  /* AC-14: a customer is selected, or the form cannot submit. `customerId` IS
   * the selection — there is no parallel `selectedCustomer` object, because a
   * second copy of the truth can disagree with the form. */
  customerId: z.string().uuid({ message: 'tickets:new.customerRequired' }),

  /* `.trim()` BEFORE `.min(1)`, and this is the whole point of the rule.
   *
   * A subject of three spaces passes a bare `min(1)`, reaches the server, and
   * comes back a `400` on a field the form had just told the user was fine
   * (`009` AC-6, AC-7). `.trim()` transforms, so what is measured is what is
   * left — and what is SENT is the trimmed value, which is what the server
   * stores. `.max` is measured after the trim for the same reason. */
  subject: z
    .string()
    .trim()
    .min(1, { message: 'tickets:new.subjectRequired' })
    .max(200, { message: 'errors.maxLength' }),

  description: z
    .string()
    .trim()
    .min(1, { message: 'tickets:new.descriptionRequired' })
    .max(4000, { message: 'errors.maxLength' }),

  category: asEnum(TICKET_CATEGORIES, 'tickets:new.categoryRequired'),

  /* Optional all the way to the wire. The contract defaults an absent or null
   * `priority` to `Normal` and returns `400` for an empty string, so the
   * untouched `''` is dropped rather than sent.
   *
   * A `z.default('Normal')` here would send the value the server would have
   * chosen anyway — harmless until the server's default changes and the client
   * keeps pinning the old one. */
  priority: z
    .union([asEnum(TICKET_PRIORITIES, 'tickets:new.priorityInvalid'), z.literal('')])
    .optional(),

  channel: asEnum(COMMUNICATION_CHANNELS, 'tickets:new.channelRequired'),
});

/**
 * THE FORM HOLDS STRINGS, and the selects start at `''`.
 *
 * DERIVED from the schema rather than hand-written. Writing it out separately
 * put `priority: string` beside a schema that says `priority?: string`, and under
 * `exactOptionalPropertyTypes` those are two different types — so the resolver
 * would not typecheck against the form. Two declarations of one shape is two
 * things to keep in step, and this is what happens when they drift by one
 * question mark.
 *
 * The blank state matters and is why the INPUT side is strings at all: a
 * required select has three states — untouched, chosen, invalid — and `''` is
 * how the first is representable. Typing the form as the parsed enum makes it
 * unexpressible, and the usual workaround is to seed it with the first real
 * option: a ticket then carries a category nobody chose, and it validates.
 */
export type CreateTicketFormValues = z.input<typeof createTicketSchema>;

/** The PARSED shape — enums narrowed, strings trimmed. */
export type CreateTicketParsed = z.output<typeof createTicketSchema>;

/** Every field present and blank. `priority: ''` means untouched; the server
 *  defaults an absent value to `Normal`. */
export const emptyCreateTicketForm: CreateTicketFormValues = {
  customerId: '',
  subject: '',
  description: '',
  category: '',
  priority: '',
  channel: '',
};

/**
 * Parsed values → the request body.
 *
 * One transformation, and it is a function rather than a spread so that it can
 * be asserted on: `priority` is **omitted** when untouched. `TEST-024-02`
 * checks the serialised payload, not form state — those are two different
 * claims, and only the first one is what the server sees.
 */
export function toCreateTicketRequest(values: CreateTicketParsed): CreateTicketRequest {
  const body: CreateTicketRequest = {
    customerId: values.customerId,
    subject: values.subject,
    description: values.description,
    category: values.category,
    channel: values.channel,
  };

  if (values.priority !== undefined && values.priority !== '') {
    body.priority = values.priority;
  }

  return body;
}
