# ADR-003 — Frontend stack

**Status:** Accepted and **confirmed** · **Related:** ADR-009

## Context

The client needs a handful of screens: a customer form, a customer profile, a ticket
form, a filterable ticket list, and a ticket detail view with a timeline and actions.
The interesting problems are server state, loading and error states, and form
validation — not routing or rendering.

The program's target technologies include Angular, React, and Vue. The Week 3 exercise
names Angular or Vue; the final assignment does not constrain the framework.

## Decision

**React + TypeScript**, with:

| Concern | Choice | Reason |
|---|---|---|
| Server state | TanStack Query | Caching, invalidation, loading and error states are the actual problem in this app, and hand-rolling them is where these builds usually go wrong |
| Forms | React Hook Form + Zod | One schema drives both TypeScript types and runtime validation, so the form cannot drift from the type |
| Routing | React Router | Sufficient; no framework-level routing needs |
| Styling | Tokens from the existing design system, plus utility CSS | **Superseded by ADR-009.** The original reasoning — "not a design exercise" — no longer holds now that an existing design system is available to inherit from |

## Reasoning

- The screens are simple; the state management is not. Choosing a library that solves
  server state directly puts the effort where the difficulty actually is.
- Zod schemas are shared between the form and the API client types, which eliminates
  a whole class of "the form allows what the API rejects" bugs.
- React is in the program's target technology list, so it is not off-menu.

## Alternatives considered

### Angular

The strongest alternative, and the better choice under two conditions: if the
reviewer expects the Week 3 constraint to carry into the final assignment, or if
demonstrating depth matters more than demonstrating breadth. Angular's built-in
reactive forms and DI would remove two dependencies from the list above.

It was not chosen because React with TanStack Query reaches a working, correctly
state-managed set of screens with less setup, and the assessment weights end-to-end
flow rather than framework depth.

### Resolved: React confirmed

**React is the decision.** Q-4 and Q-12 are closed.

ADR-009 raised a real argument for Angular: if the house design system existed as
implemented Angular components, Angular would mean inheriting them rather than
rebuilding them. That argument is understood and the trade is accepted knowingly.

**What is being given up:** if an Angular component library does exist, none of it can
be reused. Every one of the eight primitives is rebuilt in React from the Figma
reference — states, accessibility, and right-to-left behaviour included. That is real
work, and it is the cost of this decision rather than a detail of it.

**What is gained:** React is in the program's target technology list, the stack is a
deliberate step outside the day-job Angular, and the design system is inherited at
token level either way (ADR-009), which is where most of the visual resemblance lives.

Recorded here so that the trade is visible at review rather than looking like the
question was never asked.

### Vue

Comparable to React for this scope. Rejected only because the React ecosystem answer
for server state is more settled, and the decision needed a tie-breaker.

### Server-rendered Razor pages

Rejected. It would be faster to build, but the assessment explicitly evaluates
frontend and end-to-end flow as a distinct capability, and a server-rendered UI does
not demonstrate API integration, client-side state, or client validation.

## Consequences

- Three client dependencies to justify rather than one framework. Each is named above
  with its reason.
- The frontend mirrors backend rules for usability — disabled buttons for
  transitions the state machine forbids — which creates a duplication risk. It is
  contained by having the API return the allowed transitions with the ticket rather
  than encoding the state machine twice.
