# ADR-011 — React architecture

**Status:** **Accepted** (2026-08-23) · **Related:** ADR-003, ADR-009, ADR-010

## Context

Six or seven screens, one API, two roles, two locales. The interesting problem is not
rendering; it is server state, and the failure modes are well known.

## Decisions

### 1. No global state store. None.

Not Redux, not Zustand, not Context-as-a-store.

**Roughly ninety percent of what feels like state in a CRM is server state**, and
TanStack Query already owns it — with caching, invalidation, deduplication, refetching,
and loading and error status. Putting server data into a store means maintaining a
second copy of the truth and writing the synchronisation by hand. It is the most common
piece of over-engineering in React applications and it is almost always regretted.

What client state actually exists here, and where each lives:

| State | Home |
|---|---|
| Filters, pagination, search | **The URL** |
| Auth token and current user | One small context, written once at sign-in |
| Active locale | i18next |
| Form values | React Hook Form, local to the form |
| Which modal is open | `useState` in the component that owns it |

That is the complete list. A store would have nothing to hold.

### 2. The URL is the state container for anything shareable

Filters, sort, page, search term. Already required by US-006 AC-14, and it is the right
call for three reasons beyond that: a filtered view becomes a link someone can send, the
back button behaves, and a whole class of "the UI and the query disagree" bugs stops
existing because there is one source.

`useSearchParams` in, typed parse out. The parsed object is also the TanStack Query key,
so caching per filter combination falls out of the design instead of being built.

### 3. Feature folders, colocated

```text
src/
  features/
    tickets/
      api.ts            fetchers, typed from the OpenAPI contract
      queries.ts        query hooks and keys
      schema.ts         Zod schemas, shared with the form
      TicketListPage.tsx
      TicketDetailPage.tsx
      TicketTable.tsx
      StatusActions.tsx
    customers/
    auth/
  components/           the eight primitives, domain-agnostic
  lib/                  api client, formatters, i18n
  routes.tsx
```

Type folders — `components/`, `hooks/`, `services/` — stop working at about three
features, because a change to one feature scatters across all of them.

**Move something to `components/` when the second consumer appears, not when a second
one is imagined.** Premature sharing produces components with parameters that exist for
a caller that never arrived.

### 4. Three kinds of component, and only one of them fetches

| Kind | Fetches? | Knows the domain? |
|---|---|---|
| **Route / page** | Yes | Yes |
| **Feature component** | No — receives data as props | Yes |
| **Primitive** | No | No |

Fetching only at the route level prevents the request waterfall — the pattern where a
page renders, a child mounts, that child fetches, and a grandchild then fetches
something it needed all along. Every dependent request should be known at route level.

### 5. Expected states inline, unexpected states at the boundary

| Situation | Handled |
|---|---|
| Loading | Inline — the component knows what its skeleton looks like |
| Empty result | Inline — it is a valid answer, not a failure |
| `403`, `404`, `409` | Inline — each has a specific message and a specific action |
| Unhandled exception | Route-level `ErrorBoundary` |

The distinction is whether the API told us something meaningful. A `409` from the state
machine is information the user needs; a thrown render error is not.

### 6. Types generated from the contract, never hand-written

The client's API types come from the OpenAPI document (`openapi/README.md`). A contract
change then becomes a **compile error** rather than a runtime surprise in whichever
screen happened to use the field.

Hand-writing types from memory produces the exact bug this eliminates, and produces it
silently.

### 7. Small things that pay

- **No barrel files.** `index.ts` re-exports break tree-shaking and create import
  cycles that are painful to unpick later.
- **Route-level code splitting only.** Anything finer is optimisation without a
  measurement.
- **Zod schema shared between form validation and API types**, so the form cannot allow
  what the API rejects.
- **`strictNullChecks` on**, obviously, and no `any` in a committed file.

## What is deliberately not done

| Not done | Why |
|---|---|
| Redux / Zustand | Nothing to put in it — see decision 1 |
| A custom `useFetch` | TanStack Query is the answer; hand-rolling caching and invalidation is the mistake |
| Atomic design (atoms/molecules/organisms) | The taxonomy generates arguments about which layer a thing belongs to and answers no real question |
| A component library | It would look like that library, not like this product (ADR-009) |
| SSR | No SEO requirement, no first-paint requirement, and it would complicate auth for nothing |
| Storybook | Genuinely useful for a design system, disproportionate for eight primitives in one week |

## Consequences

- The frontend has three real dependencies — TanStack Query, React Hook Form + Zod, and
  React Router — and each is named with its reason.
- Anything that looks like it needs a store is a signal that server state has leaked
  into client state. Find the leak rather than adding the store.
