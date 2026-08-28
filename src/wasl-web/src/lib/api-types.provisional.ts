/* ============================================================================
 * api-types.provisional.ts
 * ============================================================================
 *
 * THE ONLY FILE IN `src/` THAT MAY DECLARE A DOMAIN TYPE.
 *
 * Written permission was given on 2026-08-26 to hand-write these against
 * ADR-011 §6, which requires them to be GENERATED from the OpenAPI document.
 * The permission was conditional on the containment, and the containment is the
 * point: when generation lands this file is DELETED, not edited, and anything
 * that had been copied out of it would silently survive the swap and disagree
 * with the generated type from then on.
 *
 * `scripts/check-no-domain-types.mjs` is what makes that a rule rather than a
 * hope (FE-024-15).
 *
 * TRANSCRIBED FROM THE CONTRACT, NOT FROM THE GUIDE AND NOT FROM AN EXAMPLE.
 * Source: specs/009-create-ticket/contracts/tickets-api.md — FROZEN 2026-08-23,
 * section "Enums — the exact value lists".
 *
 *   `Sms` is spelled `Sms`, not `SMS`. `WhatsApp` has a capital A.
 *
 * That is the contract's own warning, and it is worth repeating here because
 * the failure is invisible from this side: a wrong character produces a `400`
 * that reads as a BACKEND bug, and the backend lane investigates its own code
 * while the dropdown looks complete. `design/icons/` also keys one asset per
 * channel by name, so a rename presents as a missing icon rather than as a type
 * error.
 * ============================================================================ */

// PROVISIONAL — hand-written against specs/009-create-ticket/
// contracts/tickets-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
export type TicketCategory = 'Billing' | 'Technical' | 'Account' | 'General';

// PROVISIONAL — hand-written against specs/009-create-ticket/
// contracts/tickets-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/** Ordered, low to high. The order is the contract's, and it is the order the
 *  options render in — a priority list sorted alphabetically is a priority list
 *  nobody can read. */
export type TicketPriority = 'Low' | 'Normal' | 'High' | 'Critical';

// PROVISIONAL — hand-written against specs/009-create-ticket/
// contracts/tickets-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
export type CommunicationChannel = 'Email' | 'WhatsApp' | 'LiveChat' | 'Sms' | 'WebForm';

// PROVISIONAL — hand-written against specs/009-create-ticket/
// contracts/tickets-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
export type TicketStatus =
  'New' | 'Open' | 'InProgress' | 'PendingCustomer' | 'Resolved' | 'Closed';

/* ---- The runtime lists ----------------------------------------------------
 * Every option list in the product is built from these. A hand-typed list in a
 * component is the defect this file exists to prevent, and it is the one the
 * lint gate looks for.
 *
 * `satisfies` rather than a type annotation: the array keeps its literal tuple
 * type, so a value that is not in the union is a compile error AND the array
 * still narrows for callers.
 * -------------------------------------------------------------------------- */

// PROVISIONAL — hand-written against specs/009-create-ticket/
// contracts/tickets-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
export const TICKET_CATEGORIES = [
  'Billing',
  'Technical',
  'Account',
  'General',
] as const satisfies readonly TicketCategory[];

// PROVISIONAL — hand-written against specs/009-create-ticket/
// contracts/tickets-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
export const TICKET_PRIORITIES = [
  'Low',
  'Normal',
  'High',
  'Critical',
] as const satisfies readonly TicketPriority[];

// PROVISIONAL — hand-written against specs/009-create-ticket/
// contracts/tickets-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
export const COMMUNICATION_CHANNELS = [
  'Email',
  'WhatsApp',
  'LiveChat',
  'Sms',
  'WebForm',
] as const satisfies readonly CommunicationChannel[];

/* ---- Requests and responses ---------------------------------------------- */

// PROVISIONAL — hand-written against specs/009-create-ticket/
// contracts/tickets-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
export interface CreateTicketRequest {
  customerId: string;
  subject: string;
  description: string;
  category: TicketCategory;

  /** OMITTED, not `null` and never `""`, when the user did not choose one — the
   *  server stores `Normal` for an absent or null value and returns `400` for an
   *  empty string. */
  priority?: TicketPriority;

  channel: CommunicationChannel;
}

// PROVISIONAL — hand-written against specs/009-create-ticket/
// contracts/tickets-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/** A summary, deliberately not the whole customer. The profile is `008`, and a
 *  create response that embeds a full customer is a second read shape to keep in
 *  step. */
export interface TicketCustomerSummary {
  id: string;
  fullName: string;
  email: string | null;
}

// PROVISIONAL — hand-written against specs/009-create-ticket/
// contracts/tickets-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
export interface TicketResponse {
  id: string;

  /** `TCK-{yyyy}-{000000}`. Latin digits in every locale (BR-8.13) — quoted
   *  aloud and pasted between systems. Never localized, never reformatted,
   *  never passed through a locale-aware number formatter: it is a string. */
  ticketNumber: string;

  customer: TicketCustomerSummary;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  channel: CommunicationChannel;
  status: TicketStatus;
  assignedToUserId: string | null;
  isEscalated: boolean;

  /** NULLABLE, NOT OPTIONAL. `009` ships before `004`, so the server has no
   *  authenticated user and returns `null` here today. The field stays in the
   *  shape so that `004` filling it in is not a breaking change — removing and
   *  re-adding it would be. Any UI showing a creator handles `null` from the
   *  start. */
  createdByUserId: string | null;

  /** ISO 8601, UTC, `Z`. Formatting for display is the client's job. */
  createdAtUtc: string;
  updatedAtUtc: string;

  /** SERVER-COMPUTED. Rendered, never derived, never recomputed, never filtered
   *  client-side. The state machine lives in the domain, once (ADR-004), and a
   *  second implementation in TypeScript is correct until the day BR-1 changes
   *  — then wrong in exactly one place. */
  allowedTransitions: TicketStatus[];

  /** Base64 `rowversion`. Unused by create; `011` and `012` send it back as
   *  `expectedVersion`. Kept because dropping it means refetching to get it. */
  version: string;
}

/* ---- `008`, for the customer picker ---------------------------------------
 * Source: specs/008-customer-list-and-profile/contracts/customers-read-api.md —
 * frozen. THE ENDPOINT IS NOT BUILT (spec Q-1); the picker's fetcher is stubbed
 * against this shape and swapped by deleting the stub.
 * -------------------------------------------------------------------------- */

// PROVISIONAL — hand-written against specs/009-create-ticket/
// contracts/tickets-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
export interface CustomerListItem {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  createdAtUtc: string;
}

// PROVISIONAL — hand-written against specs/009-create-ticket/
// contracts/tickets-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/** The shared envelope from `docs/sdd/05-api-conventions.md`. `page` and
 *  `pageSize` are the EFFECTIVE values after the server's clamping, not what was
 *  sent — BR-7.2 clamps rather than rejecting. */
export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/* ---- Auth — 025 ------------------------------------------------------------
 * TRANSCRIBED FROM specs/004-auth-and-roles/contracts/auth-api.md — FROZEN
 * 2026-08-23. Not from the guide and not from the example body.
 *
 * `accessToken` IS OPAQUE. The contract says so by name: everything the UI needs
 * is in `expiresAtUtc` and `user`. A client that decodes the JWT to read `role`
 * starts depending on claim names, which are a server-side detail, and gains a
 * JSON parser pointed at attacker-influenced input for no benefit. There is
 * deliberately no `JwtClaims` type in this file — the shape it would describe is
 * one nothing here is allowed to read.
 * -------------------------------------------------------------------------- */

// PROVISIONAL — hand-written against specs/004-auth-and-roles/
// contracts/auth-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/** CASED AS THE SERVER CASES THEM. `023` recorded that the ADR-011 §6 gate
 *  caught this lowercase in `shell/currentUser.ts`, and that the compiler could
 *  not have: `'manager'` type-checks against `'manager'` everywhere in the app,
 *  right up to the first request that sends it. */
export type SupportRole = 'Agent' | 'Manager';

// PROVISIONAL — hand-written against specs/004-auth-and-roles/
// contracts/auth-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/** `preferredLanguage` is an ENUM VALUE, never translated (BR-8.7). It is
 *  applied to the client immediately on sign-in (AC-30). */
export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  role: SupportRole;
  preferredLanguage: 'en' | 'ar';
}

// PROVISIONAL — hand-written against specs/004-auth-and-roles/
// contracts/auth-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/** There is NO `rememberMe` field, deliberately. *Remember me* on the screen
 *  chooses where the CLIENT keeps the token; the server issues the same token
 *  either way, with the same lifetime. */
export interface SignInRequest {
  email: string;
  password: string;
}

// PROVISIONAL — hand-written against specs/004-auth-and-roles/
// contracts/auth-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
export interface SignInResponse {
  accessToken: string;
  /** Constant `"Bearer"`. Present so the client composes
   *  `${tokenType} ${accessToken}` rather than hard-coding the scheme. */
  tokenType: string;
  /** Equals the token's `exp`. Issued so the client never decodes the JWT. */
  expiresAtUtc: string;
  user: AuthenticatedUser;
}
