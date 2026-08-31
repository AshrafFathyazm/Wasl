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
// PROVISIONAL — hand-written against specs/011-assign-ticket/
// contracts/ticket-assignee-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/** The two roles BR-6 knows. Transcribed, not inferred from a sample. */
export type SupportUserRole = 'Agent' | 'Manager';

// PROVISIONAL — hand-written against specs/011-assign-ticket/
// contracts/ticket-assignee-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/** The nested assignee on a ticket DETAIL. Never a bare id: the contract says
 *  the client must not have to look the name up. */
export interface TicketAssignee {
  id: string;
  fullName: string;
  role: SupportUserRole;
}

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
  /* TWO SHAPES FOR ONE FACT, AND THEY ARE NOT TO BE UNIFIED.
   *
   * The DETAIL carries a bare id AND a nested object; the LIST row carries a
   * flat `assigneeId` / `assigneeName` pair. Two contracts, two audiences, both
   * frozen — `009` for the detail, `010` for the row. The backend lane named
   * this explicitly on 2026-08-30 because it looks exactly like an
   * inconsistency somebody should tidy, and tidying it breaks one of the two.
   *
   * The nested object exists so the client never has to look a name up. The
   * flat pair exists because a hundred list rows do not need a role. */
  assignedToUserId: string | null;

  /** The nested form. `null` when unassigned.
   *
   * THE API RETURNS THIS KEY AND THIS TYPE DID NOT DECLARE IT — measured
   * against the running server on 2026-08-30, seventeen keys in the response
   * and sixteen here. Transcribed from `011`'s frozen contract, not from the
   * response, because a response cannot say which fields are nullable.
   *
   * ~~KNOWN DEFECT, BACKEND, `de5ddd6`~~ — **FIXED 2026-08-30, `62af3cc`**, and
   * verified independently on the running server in all four cases: assigned
   * and unassigned, on both the list and the detail. The cause was narrower
   * than either lane first said: `Map` takes `assignee` as a parameter
   * DEFAULTING TO NULL — correct at creation, because `009` AC-2 says a ticket
   * is never assigned then — and the write call passed it while the two reads
   * did not. One mapper, three call sites, one of them right.
   *
   * The note that no workaround was added is why there is nothing to unwind
   * now. A fallback would have survived the fix and outlived it. */
  assignee: TicketAssignee | null;
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

  /** `034`'s read half, added 2026-08-31. **Always an array, never null** — a
   *  ticket with no tags carries `[]`, so nothing writes `tags ?? []`. Ordered by
   *  name in the query, so a client renders a stable order without sorting by the
   *  database collation's idea of Arabic. */
  tags: TagSummary[];

  /** Base64 `rowversion`. Unused by create; `011` and `012` send it back as
   *  `expectedVersion`. Kept because dropping it means refetching to get it. */
  version: string;
}

/* ---- `010`, the ticket list row ------------------------------------------
 * Source: specs/010-ticket-list-and-detail/contracts/tickets-list-api.md —
 * FROZEN. Transcribed from the field table, not from the JSON example: the
 * example shows one populated row and cannot express which fields are nullable.
 * -------------------------------------------------------------------------- */

// PROVISIONAL — hand-written against specs/010-ticket-list-and-detail/
// contracts/tickets-list-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/** A LIST ROW, NOT A TICKET. It is deliberately smaller than `TicketResponse`,
 *  and the contract names what it leaves out and why: `description` (4,000
 *  characters × 100 rows of payload nothing renders), `version` (nothing on the
 *  list mutates) and `allowedTransitions` (nothing on the list acts).
 *
 *  Those absences are a decision, not an oversight. A screen that needs any of
 *  the three is asking for the detail endpoint. */
export interface TicketListItem {
  id: string;

  /** `TCK-yyyy-000000`. Identical in every locale, Latin digits (BR-8.13). */
  ticketNumber: string;

  /** User content, verbatim, and it may be Arabic in an English UI or the
   *  reverse. Isolate it when rendering — `<bdi>` or `unicode-bidi: isolate`,
   *  never `dir="auto"`, which also rewrites the element direction and pushes a
   *  Latin subject to the opposite edge of a column of Arabic ones. */
  subject: string;

  customerId: string;
  customerName: string;

  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  channel: CommunicationChannel;

  /** BOTH null when unassigned, together. The row is still returned — the join
   *  is a left join — so an unassigned ticket is a normal row with an empty
   *  cell, not a missing one. */
  assigneeId: string | null;
  assigneeName: string | null;

  /** The escalation REASON is on the detail only. */
  isEscalated: boolean;

  /** ISO 8601, UTC, `Z`. Also the sort key: `CreatedAtUtc DESC, Id DESC`. */
  createdAtUtc: string;
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

/* ---- `011`, the assignee picker -------------------------------------------
 * Source: specs/011-assign-ticket/contracts/ticket-assignee-api.md — FROZEN
 * 2026-08-23. Transcribed from the field table, not from the JSON example.
 * -------------------------------------------------------------------------- */

// PROVISIONAL — hand-written against specs/011-assign-ticket/
// contracts/ticket-assignee-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/**
 * One row of `GET /api/support-users`.
 *
 * **THE RESPONSE IS A BARE JSON ARRAY OF THESE** — not `PagedResult<T>`, not a
 * `{ value: [...] }` wrapper. The contract says so and an integration test calls
 * `EnumerateArray()` on the root, which would throw on an object. The set is
 * seeded and bounded (ADR-005), so a page control nobody can use is worse than
 * none; if user management ever ships this becomes paged, and that is a breaking
 * change recorded as `011` `spec.md` A-4 rather than designed around.
 *
 * **No email**, deliberately: a picker needs a name and a role.
 *
 * Two things about consuming it, both from the contract's own behaviour table:
 *
 *   1. **Ordering is `FullName` ascending under the DATABASE collation**, which
 *      does not follow `Accept-Language`. A mixed Arabic and English list looks
 *      correctly ordered in English and arbitrary in Arabic, and nothing errors.
 *      Sort with `Intl.Collator` at the render site.
 *   2. **The current assignee may be ABSENT from this list.** A user deactivated
 *      after assignment keeps their tickets and leaves the picker. Render the
 *      current assignee from `TicketResponse.assignee`; looking the id up here
 *      yields nothing and reads as missing data.
 */
export interface SupportUser {
  id: string;
  fullName: string;
  role: SupportUserRole;
}

// PROVISIONAL — hand-written against specs/011-assign-ticket/
// contracts/ticket-assignee-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/** `PUT /api/tickets/{id}/assignee`. Returns `TicketResponse`. */
export interface ChangeTicketAssigneeRequest {
  /** **Nullable, and `null` MEANS UNASSIGN** — it is not "no opinion". Omitting
   *  the property is treated as `null` by the server, so it is always sent
   *  explicitly rather than left off. */
  assigneeId: string | null;

  /** The `version` from the ticket the user was looking at. Required: a missing,
   *  empty, or non-base64 value is `400`, never an unchecked write. */
  expectedVersion: string;
}

/* ---- `012`, the status change ---------------------------------------------
 * Source: specs/012-change-ticket-status/contracts/ticket-status-api.md —
 * FROZEN 2026-08-23.
 * -------------------------------------------------------------------------- */

// PROVISIONAL — hand-written against specs/012-change-ticket-status/
// contracts/ticket-status-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/** `PUT /api/tickets/{id}/status`. Returns `TicketResponse`. */
export interface ChangeTicketStatusRequest {
  /** A value outside the enum is `400` listing the accepted values, **never**
   *  `409`. The client only ever sends a member of `allowedTransitions`. */
  status: TicketStatus;

  /** **REQUIRED when closing from `New` or `Open`** (BR-1.2), and accepted on
   *  any transition — a volunteered reason is useful. Max 500: 501 characters is
   *  `400`, because `TicketHistory.Note` is `nvarchar(500)` and a truncated
   *  reason is worse than a rejected one. */
  note?: string;

  /** Required, not optional. Treating a missing token as "no opinion" would make
   *  the concurrency check opt-in, and the client that forgets it is exactly the
   *  one that overwrites someone else's work. */
  expectedVersion: string;
}

/* ---- `013`, comments ------------------------------------------------------
 * Source: specs/013-ticket-timeline-and-comments/contracts/ticket-timeline-api.md
 * — FROZEN 2026-08-23. The COMMENTS half of that contract matches what the
 * server implements. The TIMELINE half does not — see the block at the foot of
 * this file, and do not transcribe it until that is resolved.
 * -------------------------------------------------------------------------- */

// PROVISIONAL — hand-written against specs/013-ticket-timeline-and-comments/
// contracts/ticket-timeline-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/** `POST /api/tickets/{id}/comments`. Append-only: there is no `PUT`, `PATCH`
 *  or `DELETE` on a comment, in this contract or any future one (BR-5.3). */
export interface AddTicketCommentRequest {
  /** 1..4000, not whitespace-only. Length is counted in **UTF-16 code units** —
   *  the same count `String.length` gives here and `string.Length` gives in
   *  .NET, and the same one `nvarchar(4000)` stores. So a client counter agrees
   *  with the server; counting graphemes instead would read 3998 while the
   *  server read 4001. */
  body: string;

  /** BR-5.4. **Marks** the comment. It is NOT a visibility filter: the server
   *  returns internal comments in full to every support user, and the client
   *  does not hide them either. The flag exists so a future customer-facing view
   *  can exclude them without a data migration. */
  isInternal?: boolean;

  /** Absent when the comment was typed here rather than received (FR-3.3). */
  channel?: CommunicationChannel;
}

// PROVISIONAL — hand-written against specs/013-ticket-timeline-and-comments/
// contracts/ticket-timeline-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/** The `201` body. **There is no `Location` header** — a deliberate deviation
 *  recorded in `013` `plan.md`: BR-5.3 gives a comment no addressable identity,
 *  there is no `GET .../comments/{id}` and there will not be one, and a
 *  `Location` pointing at a route that answers `404` is worse than no header. */
export interface TicketCommentResponse {
  id: string;
  ticketId: string;
  /** The author is taken from the token. There is no `authorUserId` on the
   *  REQUEST; sending one is ignored rather than an error. */
  authorUserId: string;
  authorName: string;
  body: string;
  isInternal: boolean;
  channel: CommunicationChannel | null;
  createdAtUtc: string;
}

/* ============================================================================
 * `013` + `034` TIMELINE — TRANSCRIBED 2026-08-31, once the disagreement was ruled
 * ============================================================================
 * This block said NOT TRANSCRIBED. BLOCKED, and the refusal was right: the frozen
 * contract described `?page=&pageSize=` with the BR-7 envelope, the server has
 * always answered a cursor, and neither shape could be written here. The
 * contract's shape ships a timeline that silently refuses to scroll back — both
 * parameters ignored, the newest page returned every time, nothing red. The
 * implementation's shape would have ratified an unrecorded contract change from
 * the client side, which `CLAUDE.md` forbids by name.
 *
 * THE BACKEND LANE RULED ON 2026-08-31: the implementation is the truth and the
 * frozen file was stale. `CLAUDE.md`'s API section already named the cursor for
 * this exact endpoint, and `013`'s own `summary.md` records it as a chosen design
 * at its `spec.md` Q-B — the decision was taken, written in two places, and never
 * carried back. **The defect was the omission, not the code.** Recorded as a
 * Contract change at the foot of `013/contracts/ticket-timeline-api.md`, and the
 * superseded paging recipe in its `FRONTEND-API-GUIDE.md` now carries a warning at
 * the top of the file.
 *
 * The shapes below are transcribed from a MEASUREMENT of a running instance, not
 * from either document — the whole point of the block that used to be here.
 * ========================================================================== */

/**
 * One entry. **Flat, with a `type` discriminator and the inapplicable fields
 * null**, which is what the server sends.
 *
 * The frozen contract gave every entry two nullable sub-objects —
 * `comment: {…} | null` and `history: {…} | null` — exactly one of which is ever
 * populated, so every consumer would write
 * `entry.comment?.body ?? entry.history?.newValue` and the type system could not
 * tell it which to expect.
 */
export interface TimelineEntry {
  /** Seven values. `Comment` is SINGULAR here — see `TimelineFilter`. */
  type:
    | 'Created'
    | 'StatusChanged'
    | 'Assigned'
    | 'Unassigned'
    | 'Escalated'
    | 'CommentAdded'
    | 'Comment';
  id: string;
  occurredAtUtc: string;

  /**
   * **NEVER null.** The server's DTO is `TimelineActor Actor` — non-nullable —
   * while `RecordedBy` beside it is `TimelineActor?`. The first version of this
   * type had `| null` here out of caution rather than measurement, and the
   * preview's own `Entry` component went red on eight `actor is possibly null`
   * errors for a state the wire cannot produce.
   *
   * The ACTOR'S OWN `id` is nullable, though — `TimelineActor(Guid? Id, string
   * FullName, string? Role)`. `011` fixed `PerformedByUserId` being NULL on every
   * history row ever written, and a row from before that fix still has no id
   * while still having a name.
   */
  actor: { id: string | null; fullName: string; role: string | null };

  /** Opaque. Pass the PAGE's `nextCursor` to `?before=`, never this one parsed. */
  cursor: string;

  /* Null on the rows they do not apply to. */
  body: string | null;
  isInternal: boolean | null;
  /** The enum, not a bare string — the server sends `CommunicationChannel?`. */
  channel: CommunicationChannel | null;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;

  /** `034`. Null on a history row and on an agent's own comment. */
  authorKind: string | null;
  /** `034`. The support user who recorded a customer's message. */
  recordedBy: { id: string | null; fullName: string; role: string | null } | null;
}

/**
 * A cursor page. **There is no `totalCount` and no `totalPages`**, so there is no
 * last page to count back from and no page number to put in a cache key.
 */
export interface TimelinePage {
  /** Newest first. */
  items: TimelineEntry[];
  hasMore: boolean;
  /** Feed to `?before=` for the next (older) page. Null when `hasMore` is false. */
  nextCursor: string | null;
  /** `034` AC-7 — the two tab counts, disjoint, both reported. */
  commentCount: number;
  historyCount: number;
}

/**
 * `?type=` — **PLURAL, and this is the trap.**
 *
 * The entries' own `type` field says `Comment` singular, so `?type=Comment` is
 * the natural guess and it is a `400`. Measured.
 */
export type TimelineFilter = 'Comments' | 'History';

/* ============================================================================
 * `034` — TAGS AND CANNED REPLIES. Transcribed 2026-08-31 from a MEASUREMENT.
 * ============================================================================
 * `034` shipped the two writes and neither read. The backend lane added
 * `GET /api/tags` and `tags` on the ticket the same day, recorded as a Contract
 * change at the foot of `034/contracts/ticket-detail-api.md`.
 *
 * These shapes are read off a running instance rather than off the contract,
 * because the contract's amendment and the code landed together and a
 * measurement is the thing that cannot be aspirational:
 *
 *   GET /api/tags            -> [ { id, name } ]              5 rows, Arabic
 *   GET /api/canned-replies  -> [ { id, title, body, category } ]
 *   ?category=Billing        -> 4 of the 5
 * ========================================================================== */

/** A tag, by id and name. The name is Arabic user content — never localized. */
export interface TagSummary {
  id: string;
  name: string;
}

/**
 * A reply template. `034` Q-3's managed set, seeded, with no admin UI.
 *
 * `category` is nullable: a template with no category applies to every ticket,
 * and `?category=` returns those PLUS the matching ones — measured, 4 of 5 for
 * `Billing`, so the general ones are included rather than filtered out.
 */
export interface CannedReplySummary {
  id: string;
  title: string;
  body: string;
  category: TicketCategory | null;
}

/* ==========================================================================
 * `032` — the customer profile and the customer create
 * ==========================================================================
 * TRANSCRIBED FROM TWO FROZEN CONTRACTS, not from one:
 *   specs/008-customer-list-and-profile/contracts/customers-read-api.md  (read)
 *   specs/007-create-customer/contracts/customers-api.md                (write)
 * `008`'s own header says the write side "is not reopened here", so a single
 * type covering both would be a shape neither document describes.
 *
 * BOTH ENDPOINTS ARE BUILT. This is the first customer shape in this file whose
 * transport is real rather than stubbed, and that is why the divergences below
 * were findable at all: `CustomerListItem` above was written against a contract
 * and never met a server.
 * ========================================================================== */

// PROVISIONAL — hand-written against specs/008-customer-list-and-profile/
// contracts/customers-read-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/**
 * `GET /api/customers/{id}` — `CustomerDetailResponse` in the contract, and a
 * distinct type from `007`'s `201` body rather than a superset of it.
 *
 * **`isActive` IS HERE AND THE CONTRACT SAYS IT IS NOT.** The contract states it
 * plainly: *"`IsActive` is not in the response. Nothing sets it in release 1 …
 * It arrives with `017`."* The built DTO
 * (`Wasl.Application/Features/Customers/GetCustomerById/GetCustomerByIdQuery.cs`)
 * declares `bool IsActive`, and `The_profile_shows_an_inactive_customer_and_the_list_hides_it`
 * asserts a deactivated customer answers `200` with `isActive: false` — so the
 * field is not merely present, its false case is a supported response.
 *
 * Declared, because the wire carries it and a client that omits a field it
 * receives cannot render the one state that field exists to describe (`032`
 * Q-5). Recorded as a contract-vs-build difference in `032`'s `tests.md` and
 * raised, not normalised: `CLAUDE.md` makes it a defect in one of the two
 * documents, and which one is the backend lane's ruling.
 */
export interface CustomerDetail {
  id: string;
  /** Verbatim as stored, never translated (BR-8.10). `dir="auto"` at render. */
  fullName: string;
  /** Normalised — lowercased and trimmed by the server (BR-4.2). */
  email: string | null;
  /** E.164. `null` when the customer has only an email. */
  phone: string | null;
  companyName: string | null;
  /** Up to 2000 characters, line breaks preserved. */
  notes: string | null;

  /** See the note above. Present on the wire, absent from the contract. */
  isActive: boolean;

  createdAtUtc: string;
  /** **Equal to `createdAtUtc` until `017` ships an update path.** Rendered
   *  anyway: the field is real and the equality is a fact about this release,
   *  not about the screen. */
  updatedAtUtc: string;
  /** Base64 `rowversion`. Returned by a read that does not consume it, so `017`
   *  does not have to change this shape later. Nothing in `032` sends it. */
  version: string;
}

// PROVISIONAL — hand-written against specs/007-create-customer/
// contracts/customers-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
/**
 * `POST /api/customers`.
 *
 * `email` and `phone` are each optional and **at least one must be present**
 * (BR-4.1). That rule cannot be expressed in this interface — a union of two
 * variants could express it and would then need a discriminator the wire does
 * not carry — so it lives in the Zod schema as a cross-field refinement, and on
 * the server, which is the authority.
 *
 * `null` rather than `undefined` for an absent optional: the contract's own
 * example sends `"companyName": null`, and the endpoint binds what it declares.
 */
export interface CreateCustomerRequest {
  fullName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  notes: string | null;
}

// PROVISIONAL — hand-written against specs/007-create-customer/
// contracts/customers-api.md (frozen) AND the built action, which disagree.
// Delete when OpenAPI generation lands. ADR-011 §6.
/**
 * The `201` body — **the SAME shape as the read, and the contracts say it is
 * not.** This is an alias on purpose, not a convenience.
 *
 * WHAT THE TWO CONTRACTS SAY. `007`'s `201` example carries seven fields and
 * neither `updatedAtUtc` nor `isActive`. `008` goes further and states the
 * relationship: *"This shape is a **superset** of `007`'s `201` body: it adds
 * `updatedAtUtc`. It is a distinct type, `CustomerDetailResponse`, and not the
 * same one reused."*
 *
 * WHAT THE BUILD DOES. `CreateCustomerCommand : IAuditableCommand<CustomerProfile>`
 * and `[ProducesResponseType(typeof(CustomerProfile), 201)]` — one DTO, returned
 * by both actions. There is no `CustomerDetailResponse` type in the solution.
 * `CreateCustomerTests` asserts `isActive` on the `201` body, so the extra
 * fields are not an accident of serialisation; one of them is covered by a test.
 *
 * WHY AN ALIAS RATHER THAN A SECOND INTERFACE. Declaring the contract's narrower
 * shape would make `updatedAtUtc` and `isActive` unreachable from a `201` the
 * server demonstrably sends, and the first person to need them would widen the
 * type without finding this note. Declaring a structurally identical twin would
 * put two names on one wire shape and invite them to drift — which is precisely
 * what `008`'s sentence was trying to prevent by making them different.
 *
 * IT DOES NOT SANCTION READING A CUSTOMER FROM THE WRITE RESPONSE. AC-1 forbids
 * that regardless of shape: `032` navigates to the profile by the `Location`
 * header and the profile fetches its own. The types being identical removes the
 * compiler's objection, so the rule is carried by the test rather than by the
 * type — recorded here because that is a weakening, and an unrecorded weakening
 * is how the rule dies.
 *
 * Raised as a contract-vs-build difference in `032`'s `tests.md`, Q-7.
 */
export type CreateCustomerResponse = CustomerDetail;
