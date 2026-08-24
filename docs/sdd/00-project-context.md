# Project Context

## Product

A Customer Support CRM that lets a support team manage customers, tickets, and
customer interactions across multiple communication channels.

## Core scope

1. **Customer Management** — profiles, contact details, interaction history, notes.
2. **Ticket Management** — creation, categories, priorities, assignment, status
   lifecycle, escalation, history.
3. **Communication Channels** — channel is recorded as the origin/medium of a ticket
   or an interaction (Email, WhatsApp, LiveChat, SMS, WebForm).
4. **Authentication and Authorization** — minimal but real: two roles, enforced on
   the server.
5. **Localization** — the full interface and every server-authored message available
   in English and Arabic, with correct right-to-left layout for Arabic.

## Must-have end-to-end flow

```text
Create Customer
  → View Customer
    → Create Ticket
      → Assign Agent
        → Change Status
          → Add Comment
            → View Ticket History
```

If time runs short, this flow is completed at full quality before anything else is
started. A smaller scope delivered completely is worth more than a wide scope
delivered partially.

## Explicitly out of scope

| Out of scope | Reason |
|---|---|
| Real WhatsApp / SMS / email delivery integration | Requires provider accounts and credentials; the channel abstraction is modelled without a live provider |
| File attachments on customers or tickets | Storage, virus scanning, and size limits are a separate concern; notes and comments cover the demo flow |
| Automatic SLA engine and time-based escalation | Escalation is a manual, explicit action in the MVP |
| Analytics, reporting, and dashboards | No requirement in the core flow |
| Microservices, event bus, message broker | See `decisions/ADR-002-architecture-style.md` |
| Customer-facing portal or self-service | Every actor in scope is an internal support user |
| Reopening a closed ticket | `Closed` is terminal; see `04-business-rules.md` |
| Multi-tenancy | Single support organisation |
| Translation of user-entered content | Customer names, ticket subjects, descriptions, and comments are stored and displayed exactly as entered. Machine translation of free text is a different product |
| Locales beyond English and Arabic | Two locales prove the mechanism; a third is configuration, not design |

### Named in the product scope document, and excluded

The supplied scope document (`azm_squad_customer_support_crm.pdf`) is the source for the
product's twelve sections. It lists features the rows above did not name individually, so
each is recorded here with its reason. Full traceability, section by section, is in
`15-scope-coverage.md`.

| Out of scope | Reason |
|---|---|
| SLA engine — response and resolution targets, automatic assignment, alerts | Background scheduling, business-calendar arithmetic, a pause-and-resume model for customer waiting time, and a notification pipeline. An SLA clock that is wrong is worse than none, because it reports compliance that did not happen. Escalation ships instead as a deliberate manual action (BR-3) |
| Knowledge base — FAQs, articles, guides, search | A content product: authoring, draft and published states, versioning, publish permissions, and bilingual search. It has no dependency on the ticket flow and the ticket flow has none on it |
| AI features — summaries, suggested replies, auto-categorisation, chatbot | Requires a model provider, prompt versioning, latency and failure handling on a user-facing path, and an evaluation approach. Note the distinction: the assessment measures AI-*assisted engineering*, which is covered by `prompts/` and each story's `ai-notes.md` |
| Customer portal — self-service ticket submission and tracking | Needs customer authentication and a second authorisation model. A portal that leaks one internal comment to one customer is worse than no portal, and the failure is a single missing filter (BR-5.4 anticipates the view without building it) |
| Customer-facing reports — SLA performance, satisfaction, agent performance | SLA performance has nothing to measure without the engine above; satisfaction data is not collected, and reporting a metric from no data is fabrication; agent leaderboards are excluded **on principle** — ranking agents by tickets closed rewards closing over resolving (`US-016`) |
| External integrations — ERP, provider APIs, external systems | No live provider or ERP is in scope, so an abstraction would have one implementation and no second in prospect. The same test `epics/EPIC-003-communication-channels.md` applied to `US-012`. The API itself remains the integration surface, documented as OpenAPI |
| Multi-department | An organisational hierarchy changes the authorisation model and adds a filter to every query in the system. Same class of change as multi-tenancy above, and for the same reason |
| Multi-branch | The same change on a second axis, and the two compose |
| Custom branding — the settings screen | `decisions/ADR-012-tenant-theming.md` is accepted **in part**: the token architecture is built, the settings screen is deferred. The capability is demonstrable by changing three CSS variables, which proves the architecture better than a settings page would |
| Quick replies | A template library — authoring, categorising, variable substitution, and permissions on shared templates. The knowledge base in miniature |
| Tasks and reminders | A second work item with its own lifecycle, assignment, and notification path. A to-do product beside a ticket product; nothing in the support flow needs it |
| Team collaboration — mentions, presence, handoff threads | Internal comments already are the collaboration the flow needs (BR-5.4). Mentions and presence are a messaging product |

Every reason above would still hold with four times the budget. That is the test applied:
a reason that evaporates when the deadline moves is not a reason.

## Quality rules

- Domain logic lives in the domain and application layers, never in controllers or
  React components.
- Validation happens at the boundary; invariants are enforced in the domain.
- Error handling is uniform and returns a single documented error shape.
- API contracts are explicit; DTOs are never domain entities.
- No secrets, connection strings, or tokens in source control.
- Every business rule that can be stated in one sentence has at least one test.
- Every commit is small, buildable, and has a message that explains intent.

## Working language

All artifacts, code, comments, commit messages, and documentation are written in
English so the repository is readable by any reviewer.

This is separate from the product's languages. The **repository** is English-only; the
**product** is English and Arabic. Translated strings live in resource files, never in
code, comments, or documentation.
